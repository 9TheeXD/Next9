import path from "path"
import http from "http"
import fs from "fs"
import { fileURLToPath } from "url"
import { exec, execFile, spawn } from "child_process"
import https from "https"
import crypto from "crypto"
import os from "os"
import Database from "better-sqlite3"
import sharp from "sharp"
import archiver from "archiver"
import { readSheet, appendSheet, formatAppendedRows, getCachedToken, httpRequest } from "./lib/google-sheets.js"

// ===== Upload-First Architecture =====
sharp.concurrency(1);
sharp.cache(false);
let activeUploads = 0;
// Session:block -> { t, base } for X-Upload-Order (see orderedCreatedAt).
const uploadOrderAnchors = new Map();
// Session:block -> { ids: Set of rows stored for that upload batch, cancelled: null | "stop" | "remove",
// at } (see POST /api/photos/upload-cancel). Kept for an hour.
const uploadRuns = new Map();
function uploadRunFor(header) {
    const m = /^([A-Za-z0-9_-]{4,40}):(\d{1,9}):\d{1,9}$/.exec(String(header || ""))
    if (!m) return null
    const key = `${m[1]}:${m[2]}`, now = Date.now()
    let run = uploadRuns.get(key)
    if (!run) {
        run = { ids: new Set(), cancelled: null, at: now }
        uploadRuns.set(key, run)
        for (const [k, r] of uploadRuns) if (now - r.at > 3600 * 1000) uploadRuns.delete(k)
    }
    return run
}

// Session:block:seq -> the reply for that one picked file, so sending it again is not a second photo.
// The triple in X-Upload-Order names one file the visitor picked for as long as their page is open.
// A phone that drops its connection kills the request it is in the middle of, and the reply to a
// request this server had already finished goes with it: the photo is stored, the page is told the
// upload failed, and pressing "ลองอีกครั้ง" used to store it all over again as "name (1)". Now the
// repeat waits for the first attempt (if it is still running) and is answered with what that stored.
// Kept for six hours, the same window as the order anchors above.
const uploadIdem = new Map();
function uploadIdemKey(header) {
    const m = /^([A-Za-z0-9_-]{4,40}:\d{1,9}:\d{1,9})$/.exec(String(header || ""))
    return m ? m[1] : null
}

// Soft delete (the trash), as the delete button does; album counts and covers follow.
function softDeleteImages(ids) {
    const albums = new Set()
    let n = 0
    const get = photosDb.prepare("SELECT album_id FROM images WHERE id = ?")
    const del = photosDb.prepare("UPDATE images SET original_name = '[DELETED] ' || original_name, deleted_at = ?, trash_root_id = NULL WHERE id = ? AND original_name NOT LIKE '[DELETED] %'")
    for (const id of ids) {
        const img = get.get(id)
        if (!img) continue
        n += del.run(Date.now(), id).changes
        albums.add(img.album_id)
    }
    for (const aId of albums) {
        const newCount = photosDb.prepare("SELECT COUNT(*) as cnt FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'").get(aId).cnt
        const latestImg = photosDb.prepare("SELECT id FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at DESC LIMIT 1").get(aId)
        photosDb.prepare("UPDATE albums SET photo_count = ?, cover_image_id = ?, updated_at = ? WHERE id = ?").run(newCount, latestImg ? latestImg.id : null, Date.now(), aId)
    }
    return n
}
let lastUploadAt = 0;
const MAX_BG_CONCURRENCY = 1;
const MAX_BG_RETRIES = 3;
let bgActive = 0;
// A job that runs longer than this is treated as hung: its row is put back to 'pending' (or 'failed'
// once out of retries) and its worker slot is freed. Before this, one sharp/ffmpeg call that never
// returned kept its row on 'processing' and, with a concurrency of 1, stopped every job after it.
const BG_TIMEOUT_MS = { image: 3 * 60 * 1000, video: 15 * 60 * 1000 };
// While uploads are in progress, videos (ffmpeg, a full download to /tmp) wait so they don't compete
// with the upload for memory, but never longer than this. Images always run (one at a time).
const VIDEO_UPLOAD_DEFER_MS = 2 * 60 * 1000;

// In-memory processing queue for instant dispatch (DB as crash-recovery fallback)
const processingQueue = [];
const videoProcessingQueue = [];
function enqueueProcessing(task) {
    if (task.file_type === 'video') videoProcessingQueue.push(task);
    else processingQueue.push(task);
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SERVER_START_TIME = Date.now();

const startTimePath = path.join(__dirname, "server_start_time.json");
try {
    fs.writeFileSync(startTimePath, JSON.stringify({ version: SERVER_START_TIME }, null, 2));
} catch (e) {
    console.error("Failed to update server_start_time.json", e);
}

// const filePath = path.join(__dirname, "assets/members/members.json")
const envPath = path.join(__dirname, ".env")

// Simple .env reader
let config = {}
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8")
    envContent.split("\n").forEach(line => {
        const [key, value] = line.split("=")
        if (key && value) config[key.trim()] = value.trim()
    })
}

const EDITOR_PASSWORD = config.EDITOR_PASSWORD || "admin123"
const CF_ACCOUNT_ID = config.CF_ACCOUNT_ID
const R2_ACCESS_KEY = config.R2_ACCESS_KEY
const R2_SECRET_KEY = config.R2_SECRET_KEY
const R2_BUCKET = config.R2_BUCKET || "assets"
const TOILET_PASSWORD = config.TOILET_PASSWORD || "next9"
const PHOTOS_PASSWORD = config.PHOTOS_PASSWORD || "next9"
const ALBUM_TOKEN_SECRET = config.ALBUM_TOKEN_SECRET || crypto.randomBytes(32).toString('hex')
const toiletConfigPath = path.join(__dirname, "toilet_config.json")
const toiletSubmissionsPath = path.join(__dirname, "toilet_submissions.json")
// ===== Data directory =====
// Every SQLite database (photos, building, pinkbook) and the JSON state files live here, as plain files
// on disk (better-sqlite3, WAL mode). Production uses ./data, the folder its container mounts.
// NEXT9_DATA_DIR points a process somewhere else; local dev uses ./data-dev (web/scripts/dev-all.mjs).
//
// The project folder is synced with the VPS by Syncthing, so ./data on this machine IS the production
// data. A dev server writing there sent its rows (for uploads that exist only in .dev-r2, or thumbnails
// never stored in the real bucket) to production, and two SQLite processes writing one database through
// a file sync is how WAL files get torn and sync-conflict copies appear. A dev server therefore refuses
// to start on ./data unless NEXT9_ALLOW_PROD_DATA=1 says that is really intended.
const DEFAULT_DATA_DIR = path.join(__dirname, "data")
const dataDir = process.env.NEXT9_DATA_DIR ? path.resolve(__dirname, process.env.NEXT9_DATA_DIR) : DEFAULT_DATA_DIR
if (process.env.NEXT9_DEV_READONLY === "1" && dataDir === DEFAULT_DATA_DIR && process.env.NEXT9_ALLOW_PROD_DATA !== "1") {
    console.error("[DATA] Refusing to start: a dev server (NEXT9_DEV_READONLY=1) must not write ./data, the production data synced with the VPS.")
    console.error("[DATA] Use NEXT9_DATA_DIR=data-dev (npm run dev does this; seed it with: node scripts/db-seed-dev.mjs).")
    process.exit(1)
}
// Outside Docker (the VPS runs server.js only in its container), a server without the dev flag would
// use the real R2 keys from .env: it could write to and delete from the real bucket while reading a
// stale local ./data. That only ever happens by accident (e.g. "node server.js" typed on the laptop), so
// it refuses to start. The dev stack sets NEXT9_DEV_READONLY=1; NEXT9_ALLOW_PROD=1 overrides on purpose.
if (process.env.NEXT9_DEV_READONLY !== "1" && !fs.existsSync("/.dockerenv") && process.env.NEXT9_ALLOW_PROD !== "1") {
    console.error("[DATA] Refusing to start: this is not the production container, and NEXT9_DEV_READONLY=1 is not set.")
    console.error("[DATA] Outside Docker this server would write to and delete from the real R2 bucket.")
    console.error("[DATA] For local work use the dev stack: cd web && npm run dev  (API on data-dev, R2 writes kept local).")
    process.exit(1)
}
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
console.log(`[DATA] ${dataDir}`)

// Auto-migrate pinkbook.db schema if exists on server startup
try {
    const pinkbookDbPath = path.join(dataDir, "pinkbook.db");
    if (fs.existsSync(pinkbookDbPath)) {
        const pDb = new Database(pinkbookDbPath);
        const cols = pDb.prepare(`PRAGMA table_info(pinkbook_records)`).all().map(c => c.name);
        if (cols.length > 0 && !cols.includes("term")) {
            console.log("[PINKBOOK] Auto-migrating pinkbook_records: adding term column");
            pDb.prepare(`ALTER TABLE pinkbook_records ADD COLUMN term TEXT DEFAULT '1/2569'`).run();
            pDb.prepare(`UPDATE pinkbook_records SET term = '1/2569' WHERE term IS NULL`).run();
            pDb.prepare(`CREATE INDEX IF NOT EXISTS idx_records_term_week ON pinkbook_records (term, inspected_week)`).run();
        }
        const logCols = pDb.prepare(`PRAGMA table_info(pinkbook_logs)`).all().map(c => c.name);
        if (logCols.length > 0 && !logCols.includes("term")) {
            console.log("[PINKBOOK] Auto-migrating pinkbook_logs: adding term column");
            pDb.prepare(`ALTER TABLE pinkbook_logs ADD COLUMN term TEXT DEFAULT '1/2569'`).run();
            pDb.prepare(`UPDATE pinkbook_logs SET term = '1/2569' WHERE term IS NULL`).run();
            pDb.prepare(`CREATE INDEX IF NOT EXISTS idx_logs_term ON pinkbook_logs (term)`).run();
        }
        pDb.close();
    }
} catch (e) {
    console.error("[PINKBOOK] Auto-migration error:", e.message);
}

// Auto-migrate pinkbook_config.json for Term 2 on startup
try {
    const pbConfigPath = path.join(dataDir, "pinkbook_config.json");
    if (fs.existsSync(pbConfigPath)) {
        const pbCfg = JSON.parse(fs.readFileSync(pbConfigPath, "utf-8"));
        let updated = false;
        if (!pbCfg.week_1_start || pbCfg.week_1_start < "2026-10-01") {
            pbCfg.week_1_start = "2026-10-26";
            updated = true;
        }
        if (pbCfg.current_term !== "2/2569") {
            pbCfg.current_term = "2/2569";
            updated = true;
        }
        if (!Array.isArray(pbCfg.terms) || !pbCfg.terms.includes("2/2569")) {
            pbCfg.terms = ["2/2569", "1/2569"];
            updated = true;
        }
        if (updated) {
            fs.writeFileSync(pbConfigPath, JSON.stringify(pbCfg, null, 2), "utf-8");
            console.log("[PINKBOOK] Auto-migrated pinkbook_config.json for Term 2/2569");
        }
    }
} catch (e) {
    console.error("[PINKBOOK] Auto-migration config error:", e.message);
}

const inertConfigPath = path.join(dataDir, "inert_config.json")

// ===== Inert Form: Google Sheets Config =====
const INERT_SHEET_ID = config.INERT_SHEET_ID || ''
const INERT_SHEET_RANGE = config.INERT_SHEET_RANGE || 'Sheet1'
const INERT_LOOKUP_SHEET_RANGE = config.INERT_LOOKUP_SHEET_RANGE || 'Sheet1'
const INERT_SHEET_JUNIOR_RANGE = config.INERT_SHEET_JUNIOR_RANGE || 'ม.ต้น'
const INERT_SHEET_HIGH_RANGE = config.INERT_SHEET_HIGH_RANGE || 'ม.ปลาย'

// ===== Building Inspection Form: Google Sheets Config =====
const BUILDING_SHEET_ID = config.BUILDING_SHEET_ID || '1EKh6YRmxjBRY6Nw12selyNEJ4RQjY5D5BDZXBGemksw'
const BUILDING_VALID_NUMBERS = ['3', '5', '6', '9', '10', '11', '15']

function getBuildingSheetConfig(buildingNumber) {
    return {
        email: SERVICE_ACCOUNT ? SERVICE_ACCOUNT.client_email : '',
        privateKey: SERVICE_ACCOUNT ? SERVICE_ACCOUNT.private_key : '',
        spreadsheetId: BUILDING_SHEET_ID,
        range: `อาคาร ${buildingNumber}`
    }
}

// อ่าน Service Account จากไฟล์ JSON โดยตรง
const serviceAccountPath = path.join(__dirname, 'service-account.json')
let SERVICE_ACCOUNT = null
try {
    if (fs.existsSync(serviceAccountPath)) {
        SERVICE_ACCOUNT = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'))
        console.log('[INERT] Loaded service account:', SERVICE_ACCOUNT.client_email)
    }
} catch (e) {
    console.error('[INERT] Failed to load service-account.json:', e.message)
}

function getInertConfigSync() {
    try {
        if (fs.existsSync(inertConfigPath)) {
            return JSON.parse(fs.readFileSync(inertConfigPath, "utf-8"));
        }
    } catch (e) {}
    return {};
}

function getEffectiveInertSheetId(term) {
    const cfg = getInertConfigSync();
    if (term && cfg.terms && cfg.terms[term] && cfg.terms[term].SHEET_ID) {
        return cfg.terms[term].SHEET_ID.trim();
    }
    return (cfg.SHEET_ID && cfg.SHEET_ID.trim()) || INERT_SHEET_ID;
}

function getEffectiveInertRanges(term) {
    const cfg = getInertConfigSync();
    const tCfg = (term && cfg.terms && cfg.terms[term]) ? cfg.terms[term] : {};
    return {
        all: (tCfg.SHEET_RANGE && tCfg.SHEET_RANGE.trim()) || (cfg.SHEET_RANGE && cfg.SHEET_RANGE.trim()) || INERT_SHEET_RANGE,
        lookup: (tCfg.SHEET_RANGE && tCfg.SHEET_RANGE.trim()) || (cfg.SHEET_RANGE && cfg.SHEET_RANGE.trim()) || INERT_LOOKUP_SHEET_RANGE,
        junior: (tCfg.SHEET_JUNIOR_RANGE && tCfg.SHEET_JUNIOR_RANGE.trim()) || (cfg.SHEET_JUNIOR_RANGE && cfg.SHEET_JUNIOR_RANGE.trim()) || INERT_SHEET_JUNIOR_RANGE,
        high: (tCfg.SHEET_HIGH_RANGE && tCfg.SHEET_HIGH_RANGE.trim()) || (cfg.SHEET_HIGH_RANGE && cfg.SHEET_HIGH_RANGE.trim()) || INERT_SHEET_HIGH_RANGE,
    };
}

function getInertSheetConfig(range, term) {
    const ranges = getEffectiveInertRanges(term);
    return {
        email: SERVICE_ACCOUNT ? SERVICE_ACCOUNT.client_email : '',
        privateKey: SERVICE_ACCOUNT ? SERVICE_ACCOUNT.private_key : '',
        spreadsheetId: getEffectiveInertSheetId(term),
        range: range || ranges.all
    }
}

// ===== Building Inspection: Format Appended Rows =====
async function formatBuildingRows(config, appendResult) {
    if (!appendResult || !appendResult.updates || !appendResult.updates.updatedRange) return null;
    const updatedRange = appendResult.updates.updatedRange;
    const match = updatedRange.match(/^(?:'([^']+)'|([^!]+))![A-Z]+(\d+)(?::[A-Z]+(\d+))?$/);
    if (!match) return null;

    const sheetName = match[1] || match[2];
    const startRow = parseInt(match[3]) - 1;
    const endRow = match[4] ? parseInt(match[4]) : parseInt(match[3]);

    const { email, privateKey, spreadsheetId } = config;
    const token = await getCachedToken(email, privateKey);

    const getRes = await httpRequest('GET', 'sheets.googleapis.com', `/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title),conditionalFormats)`, null, {
        'Authorization': `Bearer ${token}`
    });
    const sheetData = JSON.parse(getRes);
    const sheet = sheetData.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) return null;
    const sheetId = sheet.properties.sheetId;

    const requests = [
        {
            repeatCell: {
                range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: 12 },
                cell: {
                    userEnteredFormat: {
                        horizontalAlignment: 'CENTER',
                        backgroundColor: { red: 1, green: 1, blue: 1 },
                        borders: {
                            top: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                            bottom: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                            left: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } },
                            right: { style: 'SOLID', width: 1, color: { red: 0, green: 0, blue: 0 } }
                        }
                    }
                },
                fields: 'userEnteredFormat(horizontalAlignment,backgroundColor,borders)'
            }
        },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: 2, endColumnIndex: 3 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } },
                fields: 'userEnteredFormat.horizontalAlignment'
            }
        },
        {
            repeatCell: {
                range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: 11, endColumnIndex: 12 },
                cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } },
                fields: 'userEnteredFormat.horizontalAlignment'
            }
        }
    ];

    // If there are conditional formatting rules, update their ranges to cover the newly appended rows.
    if (sheet.conditionalFormats && sheet.conditionalFormats.length >= 3) {
        requests.push(
            {
                updateConditionalFormatRule: {
                    index: 0,
                    rule: {
                        ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 10 }],
                        booleanRule: {
                            condition: { type: "NUMBER_EQ", values: [{ userEnteredValue: "0" }] },
                            format: { backgroundColor: { red: 0.98, green: 0.8, blue: 0.8 }, textFormat: { foregroundColor: { red: 0.7, green: 0, blue: 0 } } }
                        }
                    }
                }
            },
            {
                updateConditionalFormatRule: {
                    index: 1,
                    rule: {
                        ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 10 }],
                        booleanRule: {
                            condition: { type: "NUMBER_EQ", values: [{ userEnteredValue: "1" }] },
                            format: { backgroundColor: { red: 1.0, green: 0.88, blue: 0.76 }, textFormat: { foregroundColor: { red: 0.8, green: 0.3, blue: 0 } } }
                        }
                    }
                }
            },
            {
                updateConditionalFormatRule: {
                    index: 2,
                    rule: {
                        ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 10 }],
                        booleanRule: {
                            condition: { type: "NUMBER_EQ", values: [{ userEnteredValue: "2" }] },
                            format: { backgroundColor: { red: 1.0, green: 0.96, blue: 0.8 }, textFormat: { foregroundColor: { red: 0.7, green: 0.5, blue: 0 } } }
                        }
                    }
                }
            }
        );
    }

    const body = JSON.stringify({ requests });
    const response = await httpRequest('POST', 'sheets.googleapis.com', `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, body, {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    });
    return JSON.parse(response);
}

async function setupBuildingSheetFormatting(config) {
    try {
        const { email, privateKey, spreadsheetId, range } = config;
        const sheetName = range.replace(/'/g, '');
        const token = await getCachedToken(email, privateKey);

        const getRes = await httpRequest('GET', 'sheets.googleapis.com', `/v4/spreadsheets/${spreadsheetId}`, null, {
            'Authorization': `Bearer ${token}`
        });
        const sheetData = JSON.parse(getRes);
        const sheet = sheetData.sheets.find(s => s.properties.title === sheetName);
        if (!sheet) return;
        const sheetId = sheet.properties.sheetId;

        const requests = [
            {
                addConditionalFormatRule: {
                    rule: {
                        ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 10 }],
                        booleanRule: {
                            condition: { type: "NUMBER_EQ", values: [{ userEnteredValue: "0" }] },
                            format: { backgroundColor: { red: 0.98, green: 0.8, blue: 0.8 }, textFormat: { foregroundColor: { red: 0.7, green: 0, blue: 0 } } }
                        }
                    },
                    index: 0
                }
            },
            {
                addConditionalFormatRule: {
                    rule: {
                        ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 10 }],
                        booleanRule: {
                            condition: { type: "NUMBER_EQ", values: [{ userEnteredValue: "1" }] },
                            format: { backgroundColor: { red: 1.0, green: 0.88, blue: 0.76 }, textFormat: { foregroundColor: { red: 0.8, green: 0.3, blue: 0 } } }
                        }
                    },
                    index: 1
                }
            },
            {
                addConditionalFormatRule: {
                    rule: {
                        ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 10 }],
                        booleanRule: {
                            condition: { type: "NUMBER_EQ", values: [{ userEnteredValue: "2" }] },
                            format: { backgroundColor: { red: 1.0, green: 0.96, blue: 0.8 }, textFormat: { foregroundColor: { red: 0.7, green: 0.5, blue: 0 } } }
                        }
                    },
                    index: 2
                }
            }
        ];

        const body = JSON.stringify({ requests });
        await httpRequest('POST', 'sheets.googleapis.com', `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, body, {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        });
        console.log(`[BUILDING] Setup conditional formatting for ${sheetName}`);
    } catch (e) {
        console.error("[BUILDING] Setup formatting error:", e.message);
    }
}


// ===== Album Security: Password Hashing (scrypt) =====
function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex')
        crypto.scrypt(password, salt, 64, (err, key) => {
            if (err) reject(err)
            else resolve(salt + ':' + key.toString('hex'))
        })
    })
}
function verifyPassword(password, hash) {
    return new Promise((resolve, reject) => {
        const [salt, key] = hash.split(':')
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) reject(err)
            else resolve(derivedKey.toString('hex') === key)
        })
    })
}

// ===== Album Access Tokens (HMAC-signed, 24h) =====
function generateAlbumToken(albumId) {
    const exp = Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    const payload = `${albumId}:${exp}`
    const sig = crypto.createHmac('sha256', ALBUM_TOKEN_SECRET).update(payload).digest('hex')
    return `${payload}:${sig}`
}
function verifyAlbumToken(albumId, token) {
    if (!token) return false
    try {
        const parts = token.split(':')
        if (parts.length !== 3) return false
        const [tAlbumId, exp, sig] = parts
        if (tAlbumId !== albumId) return false
        if (Date.now() > parseInt(exp)) return false
        const expected = crypto.createHmac('sha256', ALBUM_TOKEN_SECRET).update(`${tAlbumId}:${exp}`).digest('hex')
        return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
    } catch (e) { return false }
}

// ===== Brute Force Protection (5 attempts/min/IP) =====
const bruteForceMap = new Map() // IP -> { count, resetAt }
function checkBruteForce(ip) {
    const now = Date.now()
    const entry = bruteForceMap.get(ip)
    if (!entry || now > entry.resetAt) {
        bruteForceMap.set(ip, { count: 1, resetAt: now + 60000 })
        return true
    }
    entry.count++
    return entry.count <= 5
}
// Cleanup stale entries every 5 minutes
setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of bruteForceMap) {
        if (now > entry.resetAt) bruteForceMap.delete(ip)
    }
    for (const [ip, entry] of dutyRateMap) {
        if (now > entry.resetAt) dutyRateMap.delete(ip)
    }
}, 300000)

// ===== Duty check-in photos (POST /api/photos/duty-upload) =====
const DUTY_ROOT_ALBUM = "เวรประจำวัน"
const DUTY_IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]
const DUTY_MAX_FILES = 20
const DUTY_MAX_BODY = 200 * 1024 * 1024
const DUTY_MAX_AGE_MS = 120 * 24 * 3600 * 1000 // how far back a late check-in may still add photos
const DUTY_RATE_FILES = 120 // photos per IP per 10 minutes; a whole school on one Wi-Fi shares an IP
const dutyRateMap = new Map() // IP -> { count, resetAt }
function dutyRateOk(ip, n) {
    const now = Date.now()
    const entry = dutyRateMap.get(ip)
    if (!entry || now > entry.resetAt) { dutyRateMap.set(ip, { count: n, resetAt: now + 600000 }); return true }
    if (entry.count + n > DUTY_RATE_FILES) return false
    entry.count += n
    return true
}

// ===== Album Access Validation =====
// Albums nest through albums.parent_id. A lock protects the album and everything nested inside it,
// and the credential for a locked album unlocks its whole subtree — so the lock that decides access
// to any album is the top-most locked album on its path from the root.
function hasAlbumCredential(req, album) {
    if (!req || !album) return false
    const token = req.headers['x-album-token'] || ''
    if (token && verifyAlbumToken(album.id, token)) return true
    if (req.headers.cookie) {
        const cookies = req.headers.cookie.split(';').reduce((acc, c) => {
            const [k, v] = c.trim().split('=')
            if (k) acc[k] = decodeURIComponent(v || '')
            return acc
        }, {})
        const cookieToken = cookies[`album_token_${album.id}`]
        if (cookieToken && verifyAlbumToken(album.id, cookieToken)) return true
        const cookiePass = cookies[`album_pass_${album.id}`]
        if (cookiePass && album.password_hash) {
            try {
                const parts = album.password_hash.split(':')
                if (parts.length === 2) {
                    const derived = crypto.scryptSync(cookiePass, parts[0], 64)
                    if (parts[1] === derived.toString('hex')) return true
                }
            } catch(e) {}
        }
    }
    return false
}

function getAlbumChain(album, byId) {
    const chain = []
    const seen = new Set()
    let cur = album
    while (cur && !seen.has(cur.id) && chain.length < 64) {
        chain.push(cur)
        seen.add(cur.id)
        if (!cur.parent_id) break
        cur = byId ? byId.get(cur.parent_id) : photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(cur.parent_id)
    }
    return chain
}

// The locked album standing between this request and `album`; null when the album can be opened.
function findLockGate(req, album, byId) {
    if (!album) return null
    const chain = getAlbumChain(album, byId)
    for (let i = chain.length - 1; i >= 0; i--) {
        if (chain[i].is_locked) return hasAlbumCredential(req, chain[i]) ? null : chain[i]
    }
    return null
}

function validateAlbumAccess(req, album) {
    return !findLockGate(req, album)
}

// ===== Editor share links =====
// A request may carry X-Share-Token instead of the site password. It counts only for a live (not
// revoked, not expired) album link with role 'editor', and only for albums inside what that link shows:
// the shared album itself, plus its sub-albums when the link includes them, never past a locked one.
// Everything else (other albums, album cover and date, locks, moving between albums, deleting albums,
// making links) still needs the site password.
function shareEditorFor(req) {
    const token = String(req.headers["x-share-token"] || "")
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null
    const share = photosDb.prepare("SELECT * FROM shares WHERE id = ?").get(token)
    if (!share || share.revoked_at || (share.expires_at && share.expires_at < Date.now())) return null
    if (share.kind !== "album" || share.role !== "editor") return null
    return share
}
function shareEditorCovers(req, albumId) {
    const share = shareEditorFor(req)
    if (!share || !albumId) return false
    const byId = loadAlbumMap()
    const album = byId.get(albumId)
    if (!album || album.name.startsWith("[DELETED] ")) return false
    if (albumId === share.target_id) return true
    if (!share.include_subfolders) return false
    const chain = getAlbumChain(album, byId)
    const idx = chain.findIndex(a => a.id === share.target_id)
    return idx > 0 && chain.slice(0, idx).every(a => !a.name.startsWith("[DELETED] ") && !a.is_locked)
}
const isAdminReq = (req) => req.headers.authorization === PHOTOS_PASSWORD

function isAlbumPathLocked(album, byId) {
    return getAlbumChain(album, byId).some(a => a.is_locked)
}

// Access to a move/copy destination: an existing credential, or the gate album's password in the body.
async function passesLockGate(req, album, password) {
    const gate = findLockGate(req, album)
    if (!gate) return true
    return !!password && await verifyPassword(password, gate.password_hash)
}

// ===== Share link previews (Open Graph) =====
// Resolves a share token to what a link preview shows. Same validity rules as the public share API
// (revoked, expired, deleted target), but never counts a view.
function shareLinkMeta(token) {
    const share = photosDb.prepare("SELECT * FROM shares WHERE id = ?").get(token)
    if (!share || share.revoked_at) return { ok: false, reason: "invalid" }
    if (share.expires_at && share.expires_at < Date.now()) return { ok: false, reason: "expired" }
    const live = "original_name NOT LIKE '[DELETED] %' AND processing_status = 'done'"
    if (share.kind === "image") {
        const img = photosDb.prepare(`SELECT id, album_id, original_name, file_type, width, height FROM images WHERE id = ? AND ${live}`).get(share.target_id)
        if (!img) return { ok: false, reason: "gone" }
        const album = photosDb.prepare("SELECT name FROM albums WHERE id = ?").get(img.album_id)
        return {
            ok: true, kind: "image", fileType: img.file_type === "video" ? "video" : "image",
            title: img.original_name.replace(/\.[^.]+$/, "") || img.original_name,
            albumName: album && !album.name.startsWith("[DELETED] ") ? album.name : null,
            imageId: img.id, width: img.width, height: img.height, expiresAt: share.expires_at,
        }
    }
    const album = photosDb.prepare("SELECT id, name, event_date, created_at, custom_cover_id FROM albums WHERE id = ?").get(share.target_id)
    if (!album || album.name.startsWith("[DELETED] ")) return { ok: false, reason: "gone" }
    const counts = photosDb.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN file_type = 'video' THEN 1 ELSE 0 END) AS videos FROM images WHERE album_id = ? AND ${live}`).get(album.id)
    const subfolders = share.include_subfolders
        ? photosDb.prepare("SELECT COUNT(*) AS n FROM albums WHERE parent_id = ? AND name NOT LIKE '[DELETED] %' AND (is_locked IS NULL OR is_locked = 0)").get(album.id).n
        : 0
    // The album's chosen cover, else its newest photo.
    const cover = photosDb.prepare(`SELECT id FROM images WHERE album_id = ? AND ${live} ORDER BY (id = ?) DESC, created_at DESC LIMIT 1`).get(album.id, album.custom_cover_id || "")
    return {
        ok: true, kind: "album", title: album.name,
        photos: (counts.n || 0) - (counts.videos || 0), videos: counts.videos || 0, subfolders,
        date: album.event_date || album.created_at, imageId: cover ? cover.id : null, expiresAt: share.expires_at,
    }
}

// 1200x630 JPEG of a photo for link previews: the photo whole (never cropped) over a blurred, darkened
// fill of itself, so portrait and landscape photos both read well in a wide preview card. Built from
// the medium tier (already downscaled) and kept in a small in-memory cache, because every paste of a
// link into a chat makes the app's crawler fetch it again.
const OG_W = 1200, OG_H = 630
const ogCache = new Map()
const OG_CACHE_MAX = 64
async function shareOgImage(imageId) {
    if (ogCache.has(imageId)) {
        const hit = ogCache.get(imageId)
        ogCache.delete(imageId); ogCache.set(imageId, hit) // most recently used goes last
        return hit
    }
    const img = photosDb.prepare("SELECT r2_key_medium, r2_key_sd, r2_key_preview FROM images WHERE id = ?").get(imageId)
    const key = img && (img.r2_key_medium || img.r2_key_sd || img.r2_key_preview)
    if (!key) return null
    const src = await getFromR2(key)
    const base = sharp(src, { failOn: "none" }).rotate()
    const [bg, fg] = await Promise.all([
        base.clone().resize(OG_W, OG_H, { fit: "cover" }).blur(28).modulate({ brightness: 0.55 }).toBuffer(),
        base.clone().resize(OG_W, OG_H, { fit: "inside", withoutEnlargement: false }).toBuffer(),
    ])
    const jpg = await sharp(bg).composite([{ input: fg, gravity: "center" }]).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    ogCache.set(imageId, jpg)
    while (ogCache.size > OG_CACHE_MAX) ogCache.delete(ogCache.keys().next().value)
    return jpg
}

function loadAlbumMap() {
    return new Map(photosDb.prepare("SELECT * FROM albums").all().map(a => [a.id, a]))
}

// `rootId` followed by every non-deleted album nested under it, parents always before their children.
function collectSubtreeIds(rootId, byId) {
    const childrenOf = new Map()
    for (const a of byId.values()) {
        if (!a.parent_id || a.name.startsWith('[DELETED] ')) continue
        if (!childrenOf.has(a.parent_id)) childrenOf.set(a.parent_id, [])
        childrenOf.get(a.parent_id).push(a.id)
    }
    const ids = [rootId]
    const seen = new Set(ids)
    for (let i = 0; i < ids.length; i++) {
        for (const child of childrenOf.get(ids[i]) || []) {
            if (!seen.has(child)) { seen.add(child); ids.push(child) }
        }
    }
    return ids
}

// Card data for album listings (list page, sub-folder sections, folder picker). Albums nested inside a
// locked album the request can't open are left out; a locked album itself stays listed, minus covers.
function serializeAlbums(req, albums, byId) {
    if (!albums.length) return []
    const ids = albums.map(a => a.id)
    const counts = new Map(photosDb.prepare(`
        SELECT album_id,
               SUM(CASE WHEN file_type = 'video' THEN 1 ELSE 0 END) AS videos,
               SUM(CASE WHEN file_type IS NULL OR file_type != 'video' THEN 1 ELSE 0 END) AS photos
        FROM images WHERE album_id IN (${ids.map(() => "?").join(",")}) AND original_name NOT LIKE '[DELETED] %'
        GROUP BY album_id
    `).all(...ids).map(r => [r.album_id, r]))
    const childrenOf = new Map()
    for (const a of byId.values()) {
        if (!a.parent_id || a.name.startsWith('[DELETED] ')) continue
        if (!childrenOf.has(a.parent_id)) childrenOf.set(a.parent_id, [])
        childrenOf.get(a.parent_id).push(a)
    }
    // Totals over a folder and every sub-folder below it. Folders behind a lock the request can't open
    // still count as a folder, but their contents don't.
    let allCounts = null
    const totalsMemo = new Map()
    const totalsOf = album => {
        if (totalsMemo.has(album.id)) return totalsMemo.get(album.id)
        if (!allCounts) allCounts = new Map(photosDb.prepare(`
            SELECT album_id,
                   SUM(CASE WHEN file_type = 'video' THEN 1 ELSE 0 END) AS videos,
                   SUM(CASE WHEN file_type IS NULL OR file_type != 'video' THEN 1 ELSE 0 END) AS photos
            FROM images WHERE original_name NOT LIKE '[DELETED] %'
            GROUP BY album_id
        `).all().map(r => [r.album_id, r]))
        const own = allCounts.get(album.id)
        const t = { folders: 0, photos: own ? own.photos : 0, videos: own ? own.videos : 0 }
        totalsMemo.set(album.id, t)
        for (const child of childrenOf.get(album.id) || []) {
            t.folders++
            if (findLockGate(req, child, byId)) continue
            const ct = totalsOf(child)
            t.folders += ct.folders
            t.photos += ct.photos
            t.videos += ct.videos
        }
        return t
    }
    const coverStmt = photosDb.prepare("SELECT id, preview_b64, file_type FROM images WHERE album_id = ? AND processing_status = 'done' AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at DESC LIMIT 3")
    const customStmt = photosDb.prepare("SELECT id, preview_b64, file_type FROM images WHERE id = ? AND album_id = ? AND processing_status = 'done' AND original_name NOT LIKE '[DELETED] %'")
    const coversOf = album => {
        let covers = coverStmt.all(album.id)
        if (album.custom_cover_id) {
            const custom = customStmt.get(album.custom_cover_id, album.id)
            if (custom) covers = [custom, ...covers.filter(c => c.id !== custom.id)].slice(0, 3)
        }
        return covers
    }
    // A folder that only holds sub-folders borrows the cover of the first sub-folder with photos.
    const borrowedCovers = album => {
        const queue = [...(childrenOf.get(album.id) || [])]
        for (let visited = 0; queue.length && visited < 40; visited++) {
            const child = queue.shift()
            if (findLockGate(req, child, byId)) continue
            const covers = coversOf(child)
            if (covers.length) return covers
            queue.push(...(childrenOf.get(child.id) || []))
        }
        return []
    }
    const out = []
    for (const a of albums) {
        if (a.parent_id) {
            const parent = byId.get(a.parent_id)
            if (!parent || parent.name.startsWith('[DELETED] ') || findLockGate(req, parent, byId)) continue
        }
        const gate = findLockGate(req, a, byId)
        const c = counts.get(a.id)
        const totals = gate ? { folders: 0, photos: c ? c.photos : 0, videos: c ? c.videos : 0 } : totalsOf(a)
        let covers = []
        if (!gate) {
            covers = coversOf(a)
            if (!covers.length) covers = borrowedCovers(a)
        }
        out.push({
            id: a.id,
            name: a.name,
            parent_id: a.parent_id || null,
            created_at: a.created_at,
            updated_at: a.updated_at,
            event_date: a.event_date || a.created_at,
            is_locked: !!a.is_locked,
            pinned_at: a.pinned_at || null,
            photo_count: c ? c.photos : 0,
            video_count: c ? c.videos : 0,
            child_count: gate ? 0 : (childrenOf.get(a.id) || []).length,
            total_folders: totals.folders,
            total_photos: totals.photos,
            total_videos: totals.videos,
            has_access: !gate,
            lock_gate_id: gate ? gate.id : null,
            custom_cover_id: gate ? null : (a.custom_cover_id || null),
            cover_image_id: covers[0] ? covers[0].id : null,
            cover_preview: covers[0] ? covers[0].preview_b64 : null,
            cover_images: covers.map(x => ({ id: x.id, preview_b64: x.preview_b64, file_type: x.file_type }))
        })
    }
    return out
}


// Optimize Sharp
sharp.cache(false);
sharp.concurrency(1); // Set to 1 because we use TaskQueue to parallelize at the Node level


// PORT: only for running a second, throwaway server next to the dev one (tests); normally 8089.
const port = Number(process.env.PORT) || 8089

// ===== Photos Database =====

// ===== Building Inspections Database =====
const buildingDb = new Database(path.join(dataDir, "building.db"))
buildingDb.pragma("journal_mode = WAL")
buildingDb.pragma("foreign_keys = ON")
buildingDb.exec(`
    CREATE TABLE IF NOT EXISTS building_inspections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        date TEXT,
        inspector TEXT,
        building TEXT,
        room TEXT,
        item1 INTEGER,
        item2 INTEGER,
        item3 INTEGER,
        item4 INTEGER,
        item5 INTEGER,
        total INTEGER,
        note TEXT,
        images TEXT
    )
`)

buildingDb.exec(`
    CREATE TABLE IF NOT EXISTS building_inspections_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        date TEXT,
        inspector1 TEXT,
        inspector2 TEXT,
        inspector3 TEXT,
        building TEXT,
        floor TEXT,
        room TEXT,
        status TEXT,
        overall_image_url TEXT
    )
`)

buildingDb.exec(`
    CREATE TABLE IF NOT EXISTS building_issues_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inspection_id INTEGER,
        issue_name TEXT,
        image_url TEXT,
        is_cancelled INTEGER DEFAULT 0,
        FOREIGN KEY(inspection_id) REFERENCES building_inspections_v2(id) ON DELETE CASCADE
    )
`)
const photosDb = new Database(path.join(dataDir, "photos.db"))
photosDb.pragma("journal_mode = WAL")
photosDb.pragma("foreign_keys = ON")
photosDb.exec(`
    CREATE TABLE IF NOT EXISTS albums (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cover_image_id TEXT,
        photo_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )
`)
photosDb.exec(`
    CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        album_id TEXT NOT NULL,
        original_name TEXT,
        width INTEGER,
        height INTEGER,
        size_bytes INTEGER,
        preview_b64 TEXT,
        r2_key_preview TEXT,
        r2_key_thumb TEXT,
        r2_key_medium TEXT,
        r2_key_original TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
    )
`)
photosDb.exec(`CREATE INDEX IF NOT EXISTS idx_images_album ON images(album_id, created_at)`)
// Migration: add processing columns
try { photosDb.exec(`ALTER TABLE images ADD COLUMN processing_status TEXT DEFAULT 'done'`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE images ADD COLUMN retry_count INTEGER DEFAULT 0`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE images ADD COLUMN last_error TEXT`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE images ADD COLUMN processed_at INTEGER`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE images ADD COLUMN processing_started_at INTEGER`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE images ADD COLUMN folder_id TEXT`) } catch(e) {}
photosDb.exec(`CREATE INDEX IF NOT EXISTS idx_images_status ON images(album_id, processing_status)`)
photosDb.exec(`CREATE INDEX IF NOT EXISTS idx_images_pending ON images(processing_status, created_at)`)
try { photosDb.exec(`ALTER TABLE images ADD COLUMN file_type TEXT DEFAULT 'image'`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE images ADD COLUMN r2_key_sd TEXT`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE images ADD COLUMN convert_format TEXT`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE images ADD COLUMN r2_key_4k TEXT`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE images ADD COLUMN idle_4k_fails INTEGER DEFAULT 0`) } catch(e) {}
// Video renditions (the quality ladder, see "Video renditions" below). Keyed by the original's R2 key,
// not the image id: a copied video shares its original, so it shares the renditions too.
photosDb.exec(`
    CREATE TABLE IF NOT EXISTS video_sources (
        source_key TEXT PRIMARY KEY,
        width INTEGER, height INTEGER, fps REAL, duration REAL, has_audio INTEGER,
        probed_at INTEGER, probe_error TEXT, probe_fails INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS video_renditions (
        source_key TEXT NOT NULL,
        height INTEGER NOT NULL,
        fps INTEGER,
        status TEXT NOT NULL DEFAULT 'queued',
        r2_key TEXT, size_bytes INTEGER,
        fails INTEGER DEFAULT 0, last_error TEXT, updated_at INTEGER,
        PRIMARY KEY (source_key, height)
    );
    CREATE INDEX IF NOT EXISTS idx_video_renditions_status ON video_renditions(status);
`)
try { photosDb.exec(`ALTER TABLE albums ADD COLUMN pinned_at INTEGER`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE albums ADD COLUMN parent_id TEXT`) } catch(e) {}
try { photosDb.exec(`CREATE INDEX IF NOT EXISTS idx_albums_parent ON albums(parent_id)`) } catch(e) {}
// Trash: deleted_at starts the 30-day clock; trash_root_id groups everything removed by one album delete.
try { photosDb.exec(`ALTER TABLE albums ADD COLUMN deleted_at INTEGER`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE albums ADD COLUMN trash_root_id TEXT`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE albums ADD COLUMN custom_cover_id TEXT`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE images ADD COLUMN deleted_at INTEGER`) } catch(e) {}
// When the photo was taken (EXIF DateTimeOriginal, or a date found in the file name), as opposed to
// created_at, which is when it was uploaded. NULL means unknown — every query falls back to created_at.
try { photosDb.exec(`ALTER TABLE images ADD COLUMN taken_at INTEGER`) } catch(e) {}
try { photosDb.exec(`CREATE INDEX IF NOT EXISTS idx_images_taken_at ON images(taken_at)`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE images ADD COLUMN trash_root_id TEXT`) } catch(e) {}
photosDb.exec(`CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    target_id TEXT NOT NULL,
    include_subfolders INTEGER DEFAULT 1,
    allow_download INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    revoked_at INTEGER,
    view_count INTEGER DEFAULT 0,
    last_viewed_at INTEGER
)`)
photosDb.exec(`CREATE INDEX IF NOT EXISTS idx_shares_target ON shares(target_id)`)
// Share role: 'viewer' (look and download) or 'editor' (also upload, delete to trash, rename and add
// folders, inside what the link shares; see shareEditorCovers). Album-level settings (cover, date)
// stay with the site password. Downloads are always allowed now, so
// links made while "allow download" was a switch all become downloadable.
try { photosDb.exec(`ALTER TABLE shares ADD COLUMN role TEXT DEFAULT 'viewer'`) } catch(e) {}
photosDb.prepare("UPDATE shares SET allow_download = 1 WHERE allow_download IS NULL OR allow_download = 0").run()
// Items soft-deleted before the trash existed: each deleted album is its own trash entry (taking its
// images with it), and the 30-day window starts now rather than purging them on the first run.
{
    const backfillAt = Date.now()
    photosDb.prepare("UPDATE albums SET trash_root_id = id WHERE name LIKE '[DELETED] %' AND trash_root_id IS NULL").run()
    photosDb.prepare("UPDATE albums SET deleted_at = ? WHERE name LIKE '[DELETED] %' AND deleted_at IS NULL").run(backfillAt)
    photosDb.prepare(`UPDATE images SET trash_root_id = (SELECT a.trash_root_id FROM albums a WHERE a.id = images.album_id)
        WHERE original_name LIKE '[DELETED] %' AND trash_root_id IS NULL
          AND album_id IN (SELECT id FROM albums WHERE name LIKE '[DELETED] %')`).run()
    photosDb.prepare("UPDATE images SET deleted_at = ? WHERE original_name LIKE '[DELETED] %' AND deleted_at IS NULL").run(backfillAt)
}
// Folders table
photosDb.exec(`CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    album_id TEXT NOT NULL,
    parent_folder_id TEXT,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
)`)
photosDb.exec(`CREATE INDEX IF NOT EXISTS idx_folders_album ON folders(album_id, parent_folder_id)`)
// Album security columns
try { photosDb.exec(`ALTER TABLE albums ADD COLUMN is_locked INTEGER DEFAULT 0`) } catch(e) {}
try { photosDb.exec(`ALTER TABLE albums ADD COLUMN password_hash TEXT`) } catch(e) {}

function downloadMembers() {
  return new Promise((resolve, reject) => {
    https.get("https://cdn.yumistack.net/next9/members/members.json?" + Date.now(), res => {
      let data = "";
      res.setEncoding("utf8"); res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Invalid JSON from CDN"));
        }
      });
    }).on("error", reject);
  });
}
// Local development uses the production R2 credentials so images can be signed and viewed.
// NEXT9_DEV_READONLY=1 turns every R2 write and delete into a logged no-op, so nothing a dev
// session does (uploads, deletes, trash purges, 4K generation) can touch the real bucket.
const DEV_READONLY = process.env.NEXT9_DEV_READONLY === "1"
if (DEV_READONLY) console.warn("[DEV READONLY] R2 writes/deletes go to .dev-r2/ and Google Sheets writes are disabled")

// Skipping writes outright left every dev upload "failed": the worker then read back an object that
// was never stored. Instead, dev writes land in a local overlay folder, and every R2 read (fetch,
// stream, signed URL) checks the overlay first. Objects that already exist in the real bucket are
// still read from it; nothing is ever written to or deleted from the real bucket.
const DEV_OVERLAY_DIR = path.join(__dirname, ".dev-r2")
function devOverlayPath(key) {
    if (!DEV_READONLY || typeof key !== "string" || !key) return null
    const file = path.resolve(DEV_OVERLAY_DIR, key)
    return file.startsWith(DEV_OVERLAY_DIR + path.sep) ? file : null
}
function devOverlayHas(key) {
    const file = devOverlayPath(key)
    return !!file && fs.existsSync(file)
}
async function devOverlayWrite(key, body) {
    const file = devOverlayPath(key)
    if (!file) throw new Error("invalid overlay key")
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await fs.promises.writeFile(file, body)
    return { overlay: true }
}

function uploadToR2(key, body) {
    if (DEV_READONLY) return devOverlayWrite(key, body)
    return new Promise((resolve, reject) => {
        const host = `${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`
        const method = "PUT"
        const region = "auto"
        const service = "s3"

        const now = new Date()
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
        const dateStamp = amzDate.slice(0, 8)

        const canonicalUri = `/${R2_BUCKET}/${key}`
        const payloadHash = crypto
            .createHash("sha256")
            .update(body, "utf8")
            .digest("hex");

        const canonicalHeaders =
            `host:${host}\n` +
            `x-amz-content-sha256:${payloadHash}\n` +
            `x-amz-date:${amzDate}\n`

        const signedHeaders = "host;x-amz-content-sha256;x-amz-date"

        const canonicalRequest = [
            method,
            canonicalUri,
            "",
            canonicalHeaders,
            signedHeaders,
            payloadHash,
        ].join("\n")

        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
        const stringToSign = [
            "AWS4-HMAC-SHA256",
            amzDate,
            credentialScope,
            crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
        ].join("\n")

        function sign(key, msg) {
            return crypto.createHmac("sha256", key).update(msg).digest()
        }

        const kDate = sign(Buffer.from("AWS4" + R2_SECRET_KEY), dateStamp)
        const kRegion = sign(kDate, region)
        const kService = sign(kRegion, service)
        const kSigning = sign(kService, "aws4_request")
        const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex")

        const authorization =
            `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credentialScope}, ` +
            `SignedHeaders=${signedHeaders}, Signature=${signature}`

        const req = https.request(
            {
                host,
                path: canonicalUri,
                method,
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    "Content-Length": Buffer.byteLength(body, "utf8"),
                    "x-amz-content-sha256": payloadHash,
                    "x-amz-date": amzDate,
                    Authorization: authorization,
                },
            },
            (res) => {
                let data = ""
                res.setEncoding("utf8"); res.on("data", chunk => data += chunk)

                res.on("end", () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(true)
                    } else {
                        reject(new Error("R2 upload failed: " + res.statusCode))
                    }
                })
            }
        )

        req.on("error", reject)
        req.write(body, "utf8");
        req.end()
    })
}
function runGenerate() {
    return new Promise((resolve, reject) => {
        exec("python3 generate_site.py", (error, stdout, stderr) => {
            if (error) return reject(error)
            resolve(stdout)
        })
    })
}

function readJSON(filePath, defaultVal) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, "utf-8"))
        }
    } catch (e) { /* ignore */ }
    return defaultVal
}

function generateId() {
    return crypto.randomBytes(6).toString("base64url")
}

function uploadBufferToR2(key, buffer, contentType) {
    if (DEV_READONLY) return devOverlayWrite(key, buffer)
    return new Promise((resolve, reject) => {
        const host = `${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`
        const method = "PUT"
        const region = "auto"
        const service = "s3"
        const now = new Date()
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
        const dateStamp = amzDate.slice(0, 8)
        const canonicalUri = `/${R2_BUCKET}/${key}`
        const payloadHash = crypto.createHash("sha256").update(buffer).digest("hex")
        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
        const signedHeaders = "host;x-amz-content-sha256;x-amz-date"
        const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n")
        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
        const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, crypto.createHash("sha256").update(canonicalRequest).digest("hex")].join("\n")
        function sign(k, m) { return crypto.createHmac("sha256", k).update(m).digest() }
        const kDate = sign(Buffer.from("AWS4" + R2_SECRET_KEY), dateStamp)
        const kRegion = sign(kDate, region)
        const kService = sign(kRegion, service)
        const kSigning = sign(kService, "aws4_request")
        const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex")
        const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
        const req = https.request({ host, path: canonicalUri, method, headers: {
            "Content-Type": contentType,
            "Content-Length": buffer.length,
            "x-amz-content-sha256": payloadHash,
            "x-amz-date": amzDate,
            Authorization: authorization,
        }}, (res) => {
            let data = ""
            res.setEncoding("utf8"); res.on("data", chunk => data += chunk)
            res.on("end", () => {
                if (res.statusCode >= 200 && res.statusCode < 300) resolve(true)
                else reject(new Error("R2 upload failed: " + res.statusCode))
            })
        })
        req.on("error", reject)
        req.write(buffer)
        req.end()
    })
}

function deleteFromR2(key) {
    if (DEV_READONLY) {
        // Only ever removes a dev-created overlay object; the real bucket is never touched.
        const file = devOverlayPath(key)
        return file ? fs.promises.rm(file, { force: true }).then(() => ({ overlay: true })) : Promise.resolve({ skipped: true })
    }
    return new Promise((resolve, reject) => {
        const host = `${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`
        const method = "DELETE"
        const region = "auto"
        const service = "s3"
        const now = new Date()
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
        const dateStamp = amzDate.slice(0, 8)
        const canonicalUri = `/${R2_BUCKET}/${key}`
        const payloadHash = crypto.createHash("sha256").update("").digest("hex")
        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
        const signedHeaders = "host;x-amz-content-sha256;x-amz-date"
        const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n")
        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
        const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, crypto.createHash("sha256").update(canonicalRequest).digest("hex")].join("\n")
        function sign(k, m) { return crypto.createHmac("sha256", k).update(m).digest() }
        const kDate = sign(Buffer.from("AWS4" + R2_SECRET_KEY), dateStamp)
        const kRegion = sign(kDate, region)
        const kService = sign(kRegion, service)
        const kSigning = sign(kService, "aws4_request")
        const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex")
        const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
        const req = https.request({ host, path: canonicalUri, method, headers: {
            "x-amz-content-sha256": payloadHash,
            "x-amz-date": amzDate,
            Authorization: authorization,
        }}, (res) => {
            let data = ""
            res.setEncoding("utf8"); res.on("data", chunk => data += chunk)
            res.on("end", () => resolve(true))
        })
        req.on("error", reject)
        req.end()
    })
}

// SigV4 query encoding is RFC 3986 — encodeURIComponent leaves !'()* unescaped, which breaks the
// signature for values like filename*=UTF-8''... in response-content-disposition.
const rfc3986 = s => encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())

// Signed R2 GET URL. The signing time is floored to a fixed window, so one object keeps the SAME URL
// for the whole window and the browser's HTTP cache actually gets hits (a fresh signature per request
// would make every URL unique). Worst-case remaining validity = EXPIRES - WINDOW = 18h, which is why
// R2_SIGNED_MAX_AGE_S (the browser cache lifetime we ask R2 to send) is 18h: a cached copy never
// outlives its URL.
const R2_SIGN_WINDOW_MS = 6 * 3600 * 1000
const R2_SIGN_EXPIRES_S = 24 * 3600
const R2_SIGNED_MAX_AGE_S = R2_SIGN_EXPIRES_S - R2_SIGN_WINDOW_MS / 1000
function presignR2Get(key, { contentDisposition, cacheControl } = {}) {
    if (devOverlayHas(key)) {
        const q = contentDisposition ? `?disposition=${encodeURIComponent(contentDisposition)}` : ""
        return `/api/dev-r2/${key.split("/").map(encodeURIComponent).join("/")}${q}`
    }
    const host = `${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`
    const signedAt = new Date(Math.floor(Date.now() / R2_SIGN_WINDOW_MS) * R2_SIGN_WINDOW_MS)
    const amzDate = signedAt.toISOString().replace(/[:-]|\.\d{3}/g, "")
    const dateStamp = amzDate.slice(0, 8)
    const credentialScope = `${dateStamp}/auto/s3/aws4_request`
    const canonicalUri = `/${R2_BUCKET}/${key.split("/").map(rfc3986).join("/")}`
    const params = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": `${R2_ACCESS_KEY}/${credentialScope}`,
        "X-Amz-Date": amzDate,
        "X-Amz-Expires": String(R2_SIGN_EXPIRES_S),
        "X-Amz-SignedHeaders": "host",
    }
    if (cacheControl) params["response-cache-control"] = cacheControl
    if (contentDisposition) params["response-content-disposition"] = contentDisposition
    const query = Object.keys(params).sort().map(k => `${rfc3986(k)}=${rfc3986(params[k])}`).join("&")
    const canonicalRequest = ["GET", canonicalUri, query, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n")
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, crypto.createHash("sha256").update(canonicalRequest).digest("hex")].join("\n")
    const sign = (k, m) => crypto.createHmac("sha256", k).update(m).digest()
    const kSigning = sign(sign(sign(sign(Buffer.from("AWS4" + R2_SECRET_KEY), dateStamp), "auto"), "s3"), "aws4_request")
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex")
    return `https://${host}${canonicalUri}?${query}&X-Amz-Signature=${signature}`
}

function getFromR2(key) {
    if (devOverlayHas(key)) return fs.promises.readFile(devOverlayPath(key))
    return new Promise((resolve, reject) => {
        const host = `${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`
        const method = "GET"
        const region = "auto"
        const service = "s3"
        const now = new Date()
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
        const dateStamp = amzDate.slice(0, 8)
        const canonicalUri = `/${R2_BUCKET}/${key}`
        const payloadHash = crypto.createHash("sha256").update("").digest("hex")
        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
        const signedHeaders = "host;x-amz-content-sha256;x-amz-date"
        const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n")
        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
        const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, crypto.createHash("sha256").update(canonicalRequest).digest("hex")].join("\n")
        function sign(k, m) { return crypto.createHmac("sha256", k).update(m).digest() }
        const kDate = sign(Buffer.from("AWS4" + R2_SECRET_KEY), dateStamp)
        const kRegion = sign(kDate, region)
        const kService = sign(kRegion, service)
        const kSigning = sign(kService, "aws4_request")
        const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex")
        const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
        const req = https.request({ host, path: canonicalUri, method, headers: {
            "x-amz-content-sha256": payloadHash,
            "x-amz-date": amzDate,
            Authorization: authorization,
        }}, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const chunks = []
                res.on("data", chunk => chunks.push(chunk))
                res.on("end", () => resolve(Buffer.concat(chunks)))
            } else {
                reject(new Error(`R2 get failed: ${res.statusCode}`))
            }
        })
        req.on("error", reject)
        req.end()
    })
}

function getR2ReadStream(key) {
    if (devOverlayHas(key)) return Promise.resolve(fs.createReadStream(devOverlayPath(key)))
    return new Promise((resolve, reject) => {
        const host = `${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`
        const now = new Date()
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
        const dateStamp = amzDate.slice(0, 8)
        const canonicalUri = `/${R2_BUCKET}/${key}`
        const payloadHash = crypto.createHash("sha256").update("").digest("hex")
        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
        const signedHeaders = "host;x-amz-content-sha256;x-amz-date"
        const canonicalRequest = ["GET", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n")
        const credentialScope = `${dateStamp}/auto/s3/aws4_request`
        const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, crypto.createHash("sha256").update(canonicalRequest).digest("hex")].join("\n")
        function sign(k, m) { return crypto.createHmac("sha256", k).update(m).digest() }
        const kSigning = sign(sign(sign(sign(Buffer.from("AWS4" + R2_SECRET_KEY), dateStamp), "auto"), "s3"), "aws4_request")
        const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex")
        const authorization = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
        const req = https.request({ host, path: canonicalUri, method: "GET", headers: {
            "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, Authorization: authorization,
        }}, (r2Res) => {
            if (r2Res.statusCode >= 200 && r2Res.statusCode < 300) resolve(r2Res)
            else { r2Res.resume(); reject(new Error("R2 " + r2Res.statusCode)) }
        })
        req.on("error", reject)
        req.end()
    })
}

function collectBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = []
        req.on("data", chunk => chunks.push(chunk))
        let ended = false
        req.on("end", () => { ended = true; resolve(Buffer.concat(chunks)) })
        req.on("error", reject)
        // A client that drops the connection mid-upload may give neither 'end' nor 'error'. The upload
        // handler's finally (activeUploads--) then never ran, and the worker, which yields to uploads,
        // waited on a phantom upload forever: every later photo sat on 'processing'.
        req.on("close", () => { if (!ended) reject(new Error("request closed before end")) })
    })
}

function parseMultipart(buffer, boundary) {
    const files = []
    const boundaryBuf = Buffer.from("--" + boundary)
    const crlfcrlf = Buffer.from("\r\n\r\n")
    let pos = buffer.indexOf(boundaryBuf)
    if (pos === -1) return files
    while (pos < buffer.length) {
        pos += boundaryBuf.length
        if (buffer[pos] === 0x2D && buffer[pos + 1] === 0x2D) break
        pos += 2
        const headersEnd = buffer.indexOf(crlfcrlf, pos)
        if (headersEnd === -1) break
        const headersStr = buffer.slice(pos, headersEnd).toString("utf-8")
        pos = headersEnd + 4
        const nextBoundary = buffer.indexOf(boundaryBuf, pos)
        if (nextBoundary === -1) break
        const data = buffer.slice(pos, nextBoundary - 2)
        pos = nextBoundary
        
        const nameMatch = headersStr.match(/name="([^"]*)"/) || headersStr.match(/name=([^;\r\n]+)/)
        const filenameMatch = headersStr.match(/filename="([^"]*)"/) || headersStr.match(/filename=([^;\r\n]+)/)
        const ctMatch = headersStr.match(/Content-Type:\s*(.+)/i)
        
        if (nameMatch) {
            files.push({
                name: nameMatch[1],
                filename: filenameMatch ? filenameMatch[1] : undefined,
                contentType: ctMatch ? ctMatch[1].trim() : (filenameMatch ? "application/octet-stream" : undefined),
                data
            })
        }
    }
    return files
}

async function uploadWithRetry(key, buffer, contentType, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try { return await uploadBufferToR2(key, buffer, contentType) }
        catch (e) {
            if (i === retries - 1) throw e
            const delay = Math.min(1000 * Math.pow(2, i), 8000)
            console.log(`R2 upload retry ${i + 1}/${retries} for ${key} in ${delay}ms`)
            await new Promise(r => setTimeout(r, delay))
        }
    }
}

// ===== Image Validation =====
const MAX_IMAGE_DIMENSION = 32768;
const MAX_IMAGE_MEGAPIXELS = 80;

function validateImageMeta(meta) {
    const w = meta.width || 0, h = meta.height || 0;
    if (w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION) {
        throw new Error(`Image too large: ${w}x${h} exceeds ${MAX_IMAGE_DIMENSION}px limit`);
    }
    const mp = (w * h) / 1000000;
    if (mp > MAX_IMAGE_MEGAPIXELS) {
        throw new Error(`Image too large: ${mp.toFixed(1)}MP exceeds ${MAX_IMAGE_MEGAPIXELS}MP limit`);
    }
    return { width: w, height: h };
}

// Avoid filename collisions inside an album: "photo.jpg" -> "photo (1).jpg" -> "photo (2).jpg" ...
function dedupeName(albumId, name) {
    const existing = new Set(
        photosDb.prepare("SELECT original_name FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'").all(albumId)
            .map(r => r.original_name)
    )
    if (!existing.has(name)) return name
    const dot = name.lastIndexOf('.')
    const base = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    let n = 1
    let candidate = `${base} (${n})${ext}`
    while (existing.has(candidate)) { n++; candidate = `${base} (${n})${ext}` }
    return candidate
}

// Copied images share R2 objects with their source row — never delete an object another row still uses.
function r2KeyReferencedElsewhere(key, exceptId) {
    return !!photosDb.prepare(
        "SELECT 1 FROM images WHERE id != ? AND (r2_key_original = ? OR r2_key_medium = ? OR r2_key_sd = ? OR r2_key_thumb = ? OR r2_key_preview = ? OR r2_key_4k = ?) LIMIT 1"
    ).get(exceptId, key, key, key, key, key, key)
}

// ===== 4K download tier =====
// Built only for sources meaningfully larger than 4K; for anything smaller a "4K" request just serves
// the original (no upscaling, and a re-encode would barely save bytes). Generated on demand the first
// time someone asks, and pre-warmed by the idle worker below when the server has nothing else to do.
const TIER_4K_EDGE = 3840
const TIER_4K_MIN_SOURCE_EDGE = 4800
const FOURK_MAX_CONCURRENT = 2 // an 8K decode peaks around ~100 MB RAM
let fourKActive = 0
const fourKWaiters = []
const fourKInFlight = new Map()

function has4kTier(img) {
    return img.file_type !== 'video' && Math.max(img.width || 0, img.height || 0) > TIER_4K_MIN_SOURCE_EDGE
}

async function withFourKSlot(fn) {
    while (fourKActive >= FOURK_MAX_CONCURRENT) await new Promise(r => fourKWaiters.push(r))
    fourKActive++
    try { return await fn() } finally {
        fourKActive--
        const next = fourKWaiters.shift()
        if (next) next()
    }
}

// De-duplicated by the ORIGINAL's R2 key, not the image id: a copy (see /images/copy) shares its
// source's original, so concurrent requests for either row must share one render.
function generate4k(imgId) {
    const row = photosDb.prepare("SELECT r2_key_original, r2_key_4k FROM images WHERE id = ?").get(imgId)
    if (!row || !row.r2_key_original) return Promise.reject(new Error("original not available"))
    if (row.r2_key_4k) return Promise.resolve(row.r2_key_4k)
    const originalKey = row.r2_key_original
    if (fourKInFlight.has(originalKey)) return fourKInFlight.get(originalKey)
    const job = withFourKSlot(async () => {
        const shared = photosDb.prepare("SELECT r2_key_4k FROM images WHERE r2_key_original = ? AND r2_key_4k IS NOT NULL LIMIT 1").get(originalKey)
        if (shared) {
            photosDb.prepare("UPDATE images SET r2_key_4k = ? WHERE r2_key_original = ? AND r2_key_4k IS NULL").run(shared.r2_key_4k, originalKey)
            return shared.r2_key_4k
        }
        const t0 = Date.now()
        const original = await getFromR2(originalKey)
        const buf = await sharp(original)
            .rotate()
            .resize(TIER_4K_EDGE, TIER_4K_EDGE, { fit: "inside", withoutEnlargement: true })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 88 })
            .toBuffer()
        // Unique per render: a conversion deletes the previous 4K in the background, and that delete
        // must never be able to hit a freshly rebuilt object at the same path.
        const key = originalKey.replace(/_original\.[^./]+$/, "") + `_4k_${Date.now().toString(36)}.jpg`
        await uploadWithRetry(key, buf, "image/jpeg")
        // Keyed on the original it was built from: if a format conversion swapped the original while
        // this ran, the converted row no longer matches and never gets a stale 4K attached.
        photosDb.prepare("UPDATE images SET r2_key_4k = ? WHERE r2_key_original = ?").run(key, originalKey)
        console.log(`[4K] ${imgId} ${(original.length / 1048576).toFixed(1)}MB -> ${(buf.length / 1048576).toFixed(1)}MB in ${Date.now() - t0}ms`)
        return key
    }).finally(() => fourKInFlight.delete(originalKey))
    fourKInFlight.set(originalKey, job)
    return job
}

// ===== Idle 4K pre-warm worker =====
// Lowest priority: never touches processing_status (the UI stays "done"), does one image at a time,
// and only when uploads, the processing queues, on-demand 4K jobs and CPU load are all quiet.
const IDLE_4K_QUIET_AFTER_UPLOAD_MS = 2 * 60 * 1000
const IDLE_4K_MAX_FAILS = 3

function isServerIdleFor4k() {
    if (activeUploads > 0 || bgActive > 0 || processingQueue.length || videoProcessingQueue.length || fourKActive > 0) return false
    if (Date.now() - lastUploadAt < IDLE_4K_QUIET_AFTER_UPLOAD_MS) return false
    if (os.loadavg()[0] >= (os.cpus().length || 1) * 0.5) return false
    return !photosDb.prepare("SELECT 1 FROM images WHERE processing_status IN ('pending', 'processing') LIMIT 1").get()
}

async function idle4kTick() {
    let delay = 30 * 1000
    try {
        if (isServerIdleFor4k()) {
            const img = photosDb.prepare(`
                SELECT id FROM images
                WHERE processing_status = 'done' AND file_type != 'video' AND r2_key_4k IS NULL AND r2_key_original IS NOT NULL
                  AND MAX(COALESCE(width, 0), COALESCE(height, 0)) > ? AND COALESCE(idle_4k_fails, 0) < ?
                  AND original_name NOT LIKE '[DELETED] %'
                ORDER BY created_at DESC LIMIT 1
            `).get(TIER_4K_MIN_SOURCE_EDGE, IDLE_4K_MAX_FAILS)
            if (!img) {
                delay = 10 * 60 * 1000
            } else {
                try {
                    await generate4k(img.id)
                } catch (e) {
                    console.error("[4K idle]", img.id, e.message)
                    photosDb.prepare("UPDATE images SET idle_4k_fails = COALESCE(idle_4k_fails, 0) + 1 WHERE id = ?").run(img.id)
                }
                delay = 5 * 1000 // breathe between images so a burst of requests can always get in first
            }
        }
    } catch (e) {
        console.error("[4K idle] tick failed:", e.message)
        delay = 60 * 1000
    }
    setTimeout(idle4kTick, delay)
}
setTimeout(idle4kTick, 90 * 1000)

// ===== Video renditions (quality ladder) =====
// A video is playable as soon as its thumbnail exists: the original file is served as-is. Smaller
// versions for the player's quality menu are made afterwards, one at a time, and only while the server
// has nothing else to do. They never change processing_status, so a video never shows as "processing"
// for them.
//
// Ladder: 144p, 360p, 720p, 1080p, 1440p (2K), 2160p (4K), 4320p (8K), every rung below the video's own
// size (the original itself is the top rung, whatever its size: 3K, 5K, ...). "p" is the shorter side,
// so a portrait 1080x1920 clip is 1080p like its landscape twin. Frame rate: 720p and up keep the
// source's (up to 60); 360p and 144p are capped at 30. H.264 + AAC in MP4 with the index at the front,
// which every browser plays and can start before the whole file has arrived.
//
// CPU: ffmpeg runs at the lowest priority (nice 19), pinned to the last 2 cores (taskset), and is
// paused outright (SIGSTOP) the moment an upload or any photo/video processing starts, resuming
// (SIGCONT) once quiet again. "-threads 2" alone was not a limit: x264's lookahead, the decoder and the
// scaler each start their own threads, and one encode took ~3.7 of the VPS's 6 cores (an SSH session
// timed out during it). Pinning is what holds it to 2; the thread options only keep the count down.
const VIDEO_LADDER = [144, 360, 720, 1080, 1440, 2160, 4320]
// Order in which rungs are made: the ones most viewers need first.
const VIDEO_RUNG_PRIORITY = [360, 720, 1080, 144, 1440, 2160, 4320]
const VIDEO_RUNG_CRF = { 144: 30, 360: 27, 720: 24, 1080: 23, 1440: 23, 2160: 24, 4320: 25 }
const VIDEO_RUNG_MAX_FAILS = 3
const VIDEO_QUIET_AFTER_UPLOAD_MS = 2 * 60 * 1000
// Cores the encoder may use: the last two, leaving the first ones to the site. Without taskset (or on a
// machine with fewer than 4 cores) it runs unpinned, still at nice 19.
const VIDEO_CPU_LIST = (() => {
    const n = os.cpus().length || 1
    if (n < 4 || !fs.existsSync("/usr/bin/taskset")) return null
    return `${n - 2},${n - 1}`
})()

function videoRungFps(height, sourceFps) {
    const f = sourceFps > 0 ? sourceFps : 30
    return height >= 720 ? Math.min(60, Math.round(f)) : Math.min(30, Math.round(f))
}
function videoQualityBadge(height) {
    if (height >= 4320) return "8K"
    if (height >= 2160) return "4K"
    if (height >= 1620) return "3K"
    if (height >= 1440) return "2K"
    if (height >= 720) return "HD"
    return null
}
function videoQualityLabel(height, fps) {
    return `${height}p${fps >= 50 ? Math.round(fps) : ""}`
}

async function probeVideo(input) {
    const out = await runFile("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", input], 60000)
    const j = JSON.parse(out)
    const v = (j.streams || []).find(st => st.codec_type === "video")
    if (!v) throw new Error("no video stream")
    let w = v.width | 0, h = v.height | 0
    // Phones store portrait video as landscape plus a rotation; ffmpeg applies it when decoding.
    const rot = Math.abs(Number((v.side_data_list || []).find(d => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0)) % 180
    if (rot === 90) [w, h] = [h, w]
    const rate = (r) => { const [a, b] = String(r || "0/1").split("/").map(Number); return b ? a / b : 0 }
    const fps = rate(v.avg_frame_rate) || rate(v.r_frame_rate)
    return {
        width: w, height: h, fps: fps > 0 && fps < 500 ? fps : 30,
        duration: parseFloat(j.format?.duration) || parseFloat(v.duration) || 0,
        hasAudio: (j.streams || []).some(st => st.codec_type === "audio"),
    }
}

// Records the source's size and queues every rung below it (once; later calls change nothing).
function queueVideoLadder(sourceKey, info) {
    const short = Math.min(info.width, info.height)
    photosDb.prepare(`INSERT INTO video_sources (source_key, width, height, fps, duration, has_audio, probed_at, probe_error)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(source_key) DO UPDATE SET width = excluded.width, height = excluded.height, fps = excluded.fps,
            duration = excluded.duration, has_audio = excluded.has_audio, probed_at = excluded.probed_at, probe_error = NULL`)
        .run(sourceKey, info.width, info.height, info.fps, info.duration, info.hasAudio ? 1 : 0, Date.now())
    const ins = photosDb.prepare("INSERT OR IGNORE INTO video_renditions (source_key, height, fps, status, updated_at) VALUES (?, ?, ?, 'queued', ?)")
    // A rung within ~5% of the source would be a near-copy of the original: skip it.
    for (const h of VIDEO_LADDER) if (h < short * 0.95) ins.run(sourceKey, h, videoRungFps(h, info.fps), Date.now())
}

function isServerIdleForVideo() {
    if (activeUploads > 0 || bgActive > 0 || processingQueue.length || videoProcessingQueue.length || fourKActive > 0) return false
    if (Date.now() - lastUploadAt < VIDEO_QUIET_AFTER_UPLOAD_MS) return false
    return !photosDb.prepare("SELECT 1 FROM images WHERE processing_status IN ('pending', 'processing') LIMIT 1").get()
}
// Something needs the CPU right now: an in-progress encode is paused until this is false again.
const videoWorkWanted = () => activeUploads > 0 || bgActive > 0 || processingQueue.length > 0 || videoProcessingQueue.length > 0 || fourKActive > 0

// The original of the video being worked on, kept between its rungs so it is downloaded once.
let videoTmp = null // { sourceKey, path, at }
function dropVideoTmp() {
    if (videoTmp) { try { fs.unlinkSync(videoTmp.path) } catch (e) {} }
    videoTmp = null
}

function encodeRendition(input, output, rung, src) {
    const portrait = src.height > src.width
    const vf = [portrait ? `scale=${rung}:-2` : `scale=-2:${rung}`]
    if (src.fps > rung_fps(rung, src) + 1) vf.push(`fps=${rung_fps(rung, src)}`)
    const crf = VIDEO_RUNG_CRF[rung] ?? 24
    // Peak bitrate cap per rung (kbit/s at 30 fps; 60 fps rungs get 1.5x).
    const capK = { 144: 200, 360: 900, 720: 3000, 1080: 6000, 1440: 12000, 2160: 25000, 4320: 60000 }[rung] * (rung_fps(rung, src) > 31 ? 1.5 : 1)
    const args = ["-n", "19", ...(VIDEO_CPU_LIST ? ["taskset", "-c", VIDEO_CPU_LIST] : []), "ffmpeg", "-y", "-v", "error", "-threads", "1", "-i", input,
        "-map", "0:v:0", "-map", "0:a:0?", "-vf", vf.join(","),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-maxrate", `${Math.round(capK)}k`, "-bufsize", `${Math.round(capK * 2)}k`,
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-filter_threads", "1", "-threads", "2", "-x264-params", "lookahead-threads=1",
        "-c:a", "aac", "-b:a", rung <= 360 ? "96k" : "128k", "-ac", "2",
        "-movflags", "+faststart", output]
    return new Promise((resolve, reject) => {
        const proc = spawn("nice", args, { stdio: ["ignore", "ignore", "pipe"] })
        let stderr = "", paused = false, runMs = 0, last = Date.now()
        // Long, but not endless: working time only (paused time does not count).
        const budgetMs = Math.max(20 * 60 * 1000, (src.duration || 60) * 1000 * (rung >= 2160 ? 40 : 15))
        proc.stderr.on("data", d => { stderr = (stderr + d).slice(-2000) })
        const watch = setInterval(() => {
            const now = Date.now()
            if (!paused) runMs += now - last
            last = now
            if (!paused && videoWorkWanted()) { paused = true; proc.kill("SIGSTOP"); console.log(`[VIDEO] ${rung}p paused: server busy`) }
            else if (paused && !videoWorkWanted()) { paused = false; proc.kill("SIGCONT"); console.log(`[VIDEO] ${rung}p resumed`) }
            if (runMs > budgetMs) { proc.kill("SIGCONT"); proc.kill("SIGKILL") }
        }, 2000)
        proc.on("error", e => { clearInterval(watch); reject(e) })
        proc.on("close", code => {
            clearInterval(watch)
            if (code === 0) resolve()
            else reject(new Error(runMs > budgetMs ? "encode took too long" : (stderr.trim().split("\n").pop() || `ffmpeg exited ${code}`)))
        })
    })
}
function rung_fps(rung, src) { return videoRungFps(rung, src.fps) }

async function videoTick() {
    let delay = 30 * 1000
    try {
        if (isServerIdleForVideo()) {
            // 1. Videos not yet measured (uploaded before this existed, or probe failed): measure one.
            //    ffprobe reads the start of the file straight from R2, no download.
            const unprobed = photosDb.prepare(`
                SELECT i.r2_key_original AS k FROM images i
                LEFT JOIN video_sources s ON s.source_key = i.r2_key_original
                WHERE i.file_type = 'video' AND i.processing_status = 'done' AND i.r2_key_original IS NOT NULL
                  AND i.original_name NOT LIKE '[DELETED] %'
                  AND (s.source_key IS NULL OR (s.probed_at IS NULL AND COALESCE(s.probe_fails, 0) < 3))
                ORDER BY i.created_at DESC LIMIT 1`).get()
            if (unprobed) {
                try {
                    // Dev: objects in the local overlay are plain files, not URLs ffprobe could open.
                    const url = presignR2Get(unprobed.k)
                    queueVideoLadder(unprobed.k, await probeVideo(url.startsWith("/") ? devOverlayPath(unprobed.k) : url))
                } catch (e) {
                    console.error("[VIDEO] probe", unprobed.k, e.message)
                    photosDb.prepare(`INSERT INTO video_sources (source_key, probe_error, probe_fails) VALUES (?, ?, 1)
                        ON CONFLICT(source_key) DO UPDATE SET probe_error = excluded.probe_error, probe_fails = COALESCE(probe_fails, 0) + 1`).run(unprobed.k, e.message)
                }
                delay = 2 * 1000
            } else {
                // 2. Next rung: stay on the video already downloaded, else the newest video with work left.
                const order = `CASE r.height ${VIDEO_RUNG_PRIORITY.map((h, i) => `WHEN ${h} THEN ${i}`).join(" ")} ELSE 99 END`
                const pick = (where, ...args) => photosDb.prepare(`
                    SELECT r.source_key, r.height, s.width, s.height AS src_h, s.fps, s.duration
                    FROM video_renditions r JOIN video_sources s ON s.source_key = r.source_key
                    WHERE r.status = 'queued' AND COALESCE(r.fails, 0) < ${VIDEO_RUNG_MAX_FAILS} ${where}
                      AND EXISTS (SELECT 1 FROM images i WHERE i.r2_key_original = r.source_key AND i.original_name NOT LIKE '[DELETED] %')
                    ORDER BY (SELECT MAX(i.created_at) FROM images i WHERE i.r2_key_original = r.source_key) DESC, ${order}
                    LIMIT 1`).get(...args)
                const job = (videoTmp && pick("AND r.source_key = ?", videoTmp.sourceKey)) || pick("")
                if (!job) {
                    dropVideoTmp()
                    delay = 5 * 60 * 1000
                } else {
                    await runRendition(job)
                    delay = 3 * 1000
                }
            }
        } else if (videoTmp && Date.now() - videoTmp.at > 60 * 60 * 1000) dropVideoTmp()
    } catch (e) {
        console.error("[VIDEO] tick failed:", e.message)
        delay = 60 * 1000
    }
    setTimeout(videoTick, delay)
}

async function runRendition(job) {
    const src = { width: job.width, height: job.src_h, fps: job.fps, duration: job.duration }
    const key = job.source_key.replace(/_original\.[^.]+$/, "") + `_v${job.height}.mp4`
    const out = `/tmp/rend_${Date.now()}_${job.height}.mp4`
    photosDb.prepare("UPDATE video_renditions SET status = 'processing', updated_at = ? WHERE source_key = ? AND height = ?").run(Date.now(), job.source_key, job.height)
    const t0 = Date.now()
    try {
        if (!videoTmp || videoTmp.sourceKey !== job.source_key) {
            dropVideoTmp()
            const p = `/tmp/rendsrc_${Date.now()}`
            const stream = await getR2ReadStream(job.source_key)
            await new Promise((resolve, reject) => {
                const ws = fs.createWriteStream(p)
                stream.pipe(ws)
                ws.on("finish", resolve)
                ws.on("error", reject)
                stream.on("error", reject)
            })
            videoTmp = { sourceKey: job.source_key, path: p, at: Date.now() }
        }
        videoTmp.at = Date.now()
        await encodeRendition(videoTmp.path, out, job.height, src)
        const buf = fs.readFileSync(out)
        await uploadWithRetry(key, buf, "video/mp4")
        photosDb.prepare("UPDATE video_renditions SET status = 'done', r2_key = ?, size_bytes = ?, last_error = NULL, updated_at = ? WHERE source_key = ? AND height = ?")
            .run(key, buf.length, Date.now(), job.source_key, job.height)
        console.log(`[VIDEO] ${job.source_key} ${job.height}p ${(buf.length / 1048576).toFixed(1)}MB in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
    } catch (e) {
        console.error(`[VIDEO] ${job.source_key} ${job.height}p failed:`, e.message)
        photosDb.prepare(`UPDATE video_renditions SET status = CASE WHEN COALESCE(fails, 0) + 1 >= ${VIDEO_RUNG_MAX_FAILS} THEN 'failed' ELSE 'queued' END,
            fails = COALESCE(fails, 0) + 1, last_error = ?, updated_at = ? WHERE source_key = ? AND height = ?`).run(String(e.message).slice(0, 300), Date.now(), job.source_key, job.height)
    } finally {
        try { fs.unlinkSync(out) } catch (e) {}
    }
}

// A restart mid-encode leaves a rung marked 'processing': put it back in the queue.
photosDb.prepare("UPDATE video_renditions SET status = 'queued' WHERE status = 'processing'").run()
setTimeout(videoTick, 2 * 60 * 1000)

// Downloads at a chosen video quality ("up to H"). The original when the video itself is no taller
// than H (it is the best version within the limit: a 1080p video asked for "up to 1080p" or "4K" gets
// its original, not its 720p rendition). Otherwise the tallest finished rung not above H; if none is
// finished yet, the smallest finished rung, else the original. height is the rung picked (null = the
// original), for the file name.
function resolveVideoDownload(img, maxH) {
    const orig = { r2key: img.r2_key_original, height: null }
    if (!maxH || !img.r2_key_original) return orig
    const src = photosDb.prepare("SELECT width, height FROM video_sources WHERE source_key = ?").get(img.r2_key_original)
    const short = src && src.width ? Math.min(src.width, src.height) : null
    if (short && short <= maxH) return orig
    const rows = photosDb.prepare("SELECT height, r2_key FROM video_renditions WHERE source_key = ? AND status = 'done' AND r2_key IS NOT NULL ORDER BY height DESC").all(img.r2_key_original)
    const fit = rows.find(r => r.height <= maxH)
    if (fit) return { r2key: fit.r2_key, height: fit.height }
    const smallest = rows[rows.length - 1]
    return smallest ? { r2key: smallest.r2_key, height: smallest.height } : orig
}

// The quality menu's data for one video: the original on top, then each rung, done or still waiting.
function videoRenditionsFor(img) {
    const src = img.r2_key_original && photosDb.prepare("SELECT * FROM video_sources WHERE source_key = ?").get(img.r2_key_original)
    const rows = src ? photosDb.prepare("SELECT height, fps, status, size_bytes FROM video_renditions WHERE source_key = ? ORDER BY height DESC").all(img.r2_key_original) : []
    const short = src && src.width ? Math.min(src.width, src.height) : null
    const origFps = src?.fps ? Math.round(src.fps) : null
    return {
        duration: src?.duration || null,
        original: {
            variant: "original",
            height: short,
            fps: origFps,
            label: short ? videoQualityLabel(short, origFps || 0) : null,
            badge: short ? videoQualityBadge(short) : null,
            size_bytes: img.size_bytes || null,
        },
        renditions: rows.map(r => ({
            variant: `v${r.height}`,
            height: r.height,
            fps: r.fps,
            label: videoQualityLabel(r.height, r.fps || 0),
            badge: videoQualityBadge(r.height),
            // "failed" rungs are simply not offered; queued and in-progress ones show as waiting.
            status: r.status === "done" ? "ready" : r.status === "failed" ? "failed" : "queued",
            size_bytes: r.size_bytes || null,
        })).filter(r => r.status !== "failed"),
    }
}

// ===== Trash: permanent deletion =====
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

// R2 objects are removed a few at a time in the background, and only once no remaining row (a copy,
// or anything still in the trash) points at the same object.
const r2DeleteQueue = []
let r2DeleteRunning = false
function queueR2Deletes(keys) {
    r2DeleteQueue.push(...keys)
    if (r2DeleteRunning) return
    r2DeleteRunning = true
    ;(async () => {
        while (r2DeleteQueue.length) {
            const batch = r2DeleteQueue.splice(0, 4)
            await Promise.all(batch.map(k => r2KeyReferencedElsewhere(k, "")
                ? null
                : deleteFromR2(k).catch(e => console.error("[TRASH] R2 delete failed", k, e.message))))
        }
        r2DeleteRunning = false
    })()
}

function deleteSharesFor(kind, ids) {
    for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400)
        photosDb.prepare(`DELETE FROM shares WHERE kind = ? AND target_id IN (${chunk.map(() => "?").join(",")})`).run(kind, ...chunk)
    }
}

function purgeImageRows(rows) {
    if (!rows.length) return 0
    const del = photosDb.prepare("DELETE FROM images WHERE id = ?")
    const keys = new Set()
    photosDb.transaction(() => {
        for (const r of rows) {
            del.run(r.id)
            for (const k of [r.r2_key_original, r.r2_key_preview, r.r2_key_thumb, r.r2_key_sd, r.r2_key_medium, r.r2_key_4k]) if (k) keys.add(k)
        }
    })()
    deleteSharesFor("image", rows.map(r => r.id))
    // A video's quality renditions belong to its original; once no row uses that original any more,
    // they go too (a copy still using it keeps them).
    for (const r of rows) {
        if (!r.r2_key_original || r2KeyReferencedElsewhere(r.r2_key_original, "")) continue
        const rend = photosDb.prepare("SELECT r2_key FROM video_renditions WHERE source_key = ? AND r2_key IS NOT NULL").all(r.r2_key_original)
        rend.forEach(x => keys.add(x.r2_key))
        photosDb.prepare("DELETE FROM video_renditions WHERE source_key = ?").run(r.r2_key_original)
        photosDb.prepare("DELETE FROM video_sources WHERE source_key = ?").run(r.r2_key_original)
    }
    queueR2Deletes([...keys])
    return rows.length
}

// Removes a trashed album subtree: every album that went to the trash with it and their deleted images.
function purgeAlbumRoot(rootId) {
    const ids = photosDb.prepare("SELECT id FROM albums WHERE trash_root_id = ? AND name LIKE '[DELETED] %'").all(rootId).map(r => r.id)
    if (!ids.length) return { albums: 0, images: 0 }
    let images = 0
    for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200)
        images += purgeImageRows(photosDb.prepare(`SELECT * FROM images WHERE original_name LIKE '[DELETED] %' AND album_id IN (${chunk.map(() => "?").join(",")})`).all(...chunk))
    }
    const delAlbum = photosDb.prepare("DELETE FROM albums WHERE id = ?")
    photosDb.transaction(() => { for (const id of ids) delAlbum.run(id) })()
    deleteSharesFor("album", ids)
    return { albums: ids.length, images }
}

function runTrashAutoPurge() {
    try {
        const cutoff = Date.now() - TRASH_RETENTION_MS
        let albums = 0, images = 0
        for (const r of photosDb.prepare("SELECT id FROM albums WHERE name LIKE '[DELETED] %' AND trash_root_id = id AND deleted_at < ?").all(cutoff)) {
            const res = purgeAlbumRoot(r.id)
            albums += res.albums
            images += res.images
        }
        images += purgeImageRows(photosDb.prepare("SELECT * FROM images WHERE original_name LIKE '[DELETED] %' AND trash_root_id IS NULL AND deleted_at < ?").all(cutoff))
        if (albums || images) console.log(`[TRASH] auto-purged ${albums} albums and ${images} files older than 30 days`)
    } catch (e) { console.error("[TRASH] auto-purge failed:", e.message) }
}
setTimeout(runTrashAutoPurge, 5 * 60 * 1000)
setInterval(runTrashAutoPurge, 6 * 60 * 60 * 1000)

const CONVERT_FORMATS = { jpg: { ext: '.jpg', mime: 'image/jpeg' }, png: { ext: '.png', mime: 'image/png' }, webp: { ext: '.webp', mime: 'image/webp' } }

// ===== Upload-First: Only metadata + R2 upload (NO processing) =====
// ===== When a photo was taken =====
// Cameras and file names record wall-clock time with no zone. The server runs in UTC, so reading that
// with new Date(y, m, d, ...) stored Thai-time photos 7 hours late; they are read as Thai time instead.
const LOCAL_UTC_OFFSET_MS = 7 * 3600 * 1000
function wallClockToUtc(y, mo, d, h, mi, s, offsetMs = LOCAL_UTC_OFFSET_MS) {
    const ts = Date.UTC(y, mo - 1, d, h, mi, s) - offsetMs
    return Number.isFinite(ts) ? ts : null
}

// sharp hands back the raw EXIF block; this reads just DateTimeOriginal (falling back to
// DateTimeDigitized, then the plain DateTime tag) out of it, with no extra dependency. When the
// camera also wrote the matching OffsetTime tag (most phones do), that zone is used.
function exifTakenAt(exifBuf) {
    try {
        if (!exifBuf || exifBuf.length < 16) return null
        let base = 0
        if (exifBuf.slice(0, 4).toString("latin1") === "Exif") base = 6
        const order = exifBuf.slice(base, base + 2).toString("latin1")
        if (order !== "II" && order !== "MM") return null
        const le = order === "II"
        const u16 = o => (le ? exifBuf.readUInt16LE(o) : exifBuf.readUInt16BE(o))
        const u32 = o => (le ? exifBuf.readUInt32LE(o) : exifBuf.readUInt32BE(o))
        if (u16(base + 2) !== 42) return null
        const found = {}
        const readIfd = (ifdOffset, depth) => {
            if (depth > 2) return
            const at = base + ifdOffset
            if (at + 2 > exifBuf.length) return
            const count = u16(at)
            for (let i = 0; i < count; i++) {
                const entry = at + 2 + i * 12
                if (entry + 12 > exifBuf.length) return
                const tag = u16(entry)
                const type = u16(entry + 2)
                const n = u32(entry + 4)
                if (tag === 0x8769) { readIfd(u32(entry + 8), depth + 1); continue }
                if (type !== 2 || n > 64) continue
                const isDate = tag === 0x9003 || tag === 0x9004 || tag === 0x0132
                const isOffset = tag === 0x9011 || tag === 0x9012 || tag === 0x9010
                if (!(isDate && n >= 19) && !(isOffset && n >= 6)) continue
                const valueAt = n <= 4 ? entry + 8 : base + u32(entry + 8)
                if (valueAt + n > exifBuf.length) continue
                found[tag] = exifBuf.slice(valueAt, valueAt + n).toString("latin1").replace(/\0.*$/, "").trim()
            }
        }
        readIfd(u32(base + 4), 0)
        const dateTag = found[0x9003] ? 0x9003 : found[0x9004] ? 0x9004 : 0x0132
        const raw = found[dateTag]
        if (!raw) return null
        const offsetTag = { 0x9003: 0x9011, 0x9004: 0x9012, 0x0132: 0x9010 }[dateTag]
        return exifDateToUtc(raw, found[offsetTag])
    } catch (e) { return null }
}

// "2024:01:15 08:30:00" (+ optional "+07:00") to epoch ms. Also used for the date the browser read out
// of a photo before re-encoding it for upload (the re-encode drops EXIF).
function exifDateToUtc(raw, offset) {
    const m = String(raw || "").match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
    if (!m) return null
    const [, y, mo, d, h, mi, s] = m.map(Number)
    if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null
    let offsetMs = LOCAL_UTC_OFFSET_MS
    const om = String(offset || "").match(/^([+-])(\d{2}):(\d{2})/)
    if (om && Number(om[2]) <= 14) offsetMs = (om[1] === "-" ? -1 : 1) * (Number(om[2]) * 60 + Number(om[3])) * 60000
    const ts = wallClockToUtc(y, mo, d, h, mi, s, offsetMs)
    if (!ts || ts > Date.now() + 86400000) return null
    return ts
}

// Videos: the creation time in the MP4/MOV movie header (mvhd), which is UTC by spec. Cameras that
// never set their clock leave it at 0 (1904) or near the 1970/2000 epochs; those are ignored.
function videoTakenAt(buf) {
    try {
        const findBox = (start, end, type) => {
            for (let at = start; at + 8 <= end;) {
                let size = buf.readUInt32BE(at)
                const name = buf.toString("latin1", at + 4, at + 8)
                let header = 8
                if (size === 1) { if (at + 16 > end) return null; size = Number(buf.readBigUInt64BE(at + 8)); header = 16 }
                else if (size === 0) size = end - at
                if (size < header) return null
                if (name === type) return { body: at + header, end: Math.min(at + size, end) }
                at += size
            }
            return null
        }
        const moov = findBox(0, buf.length, "moov")
        if (!moov) return null
        const mvhd = findBox(moov.body, moov.end, "mvhd")
        if (!mvhd) return null
        const version = buf[mvhd.body]
        const secs = version === 1 ? Number(buf.readBigUInt64BE(mvhd.body + 4)) : buf.readUInt32BE(mvhd.body + 4)
        const ts = (secs - 2082844800) * 1000
        if (ts < Date.UTC(2005, 0, 1) || ts > Date.now() + 86400000) return null
        return ts
    } catch (e) { return null }
}

// Phone cameras stamp the date into the file name (IMG_20240115_123456, 20240115_123456, PXL_…, VID_…).
// That is the only date available for files already uploaded, since re-reading EXIF would mean pulling
// every original back out of R2.
function filenameTakenAt(name) {
    if (!name) return null
    const s = String(name)

    // A bare 17-20 digit name is a Discord snowflake, which carries the exact time the file was posted.
    const snow = s.match(/^(\d{17,20})(?:\s*\(\d+\))?\.[A-Za-z0-9]+$/)
    if (snow) {
        const ts = Number(BigInt(snow[1]) >> 22n) + 1420070400000
        if (ts > 1420070400000 && ts < Date.now() + 86400000) return ts
        return null
    }

    // Camera/phone names: IMG_20240115_123456, 20240115_123456, PXL_20240115_123456789, 2024-01-15.
    // The date must not sit inside a longer run of digits, or an id like 631115567852159913 would
    // be read as a date.
    const m = s.match(/(?<![0-9])((?:19|20)\d{2})[-_.]?(\d{2})[-_.]?(\d{2})(?![0-9])(?:[-_ T]?(\d{2})[-_.:]?(\d{2})[-_.:]?(\d{2})?)?/)
    if (!m) return null
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
    const h = Number(m[4] || 12), mi = Number(m[5] || 0), sec = Number(m[6] || 0)
    if (y < 1995 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null
    const ts = wallClockToUtc(y, mo, d, h, mi, sec)
    if (!ts || ts > Date.now() + 86400000) return null
    return ts
}
const isSnowflakeName = name => /^(\d{17,20})(?:\s*\(\d+\))?\.[A-Za-z0-9]+$/.test(String(name || ""))

// One-time fix for rows stored before the Thai-time reading above: every taken_at then came from
// EXIF or a file name read as UTC (7 hours late), except Discord snowflake names, which were right.
try {
    photosDb.exec("CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, ran_at INTEGER)")
    const MIGRATION = "taken_at_thai_time"
    if (!photosDb.prepare("SELECT 1 FROM app_migrations WHERE name = ?").get(MIGRATION)) {
        const rows = photosDb.prepare("SELECT id, original_name FROM images WHERE taken_at IS NOT NULL").all()
        const shift = photosDb.prepare("UPDATE images SET taken_at = taken_at - ? WHERE id = ?")
        let shifted = 0
        photosDb.transaction(() => {
            for (const r of rows) if (!isSnowflakeName(r.original_name)) { shift.run(LOCAL_UTC_OFFSET_MS, r.id); shifted++ }
            photosDb.prepare("INSERT INTO app_migrations (name, ran_at) VALUES (?, ?)").run(MIGRATION, Date.now())
        })()
        console.log(`[PHOTOS] taken_at moved to Thai time: ${shifted}/${rows.length}`)
    }
} catch (e) { console.error("[PHOTOS] taken_at Thai time migration failed:", e.message) }

// The raw EXIF block ("Exif\0\0" + TIFF) of a JPEG, from however much of the file's head is at hand.
function jpegExifBlock(buf) {
    if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) return null
    for (let at = 2; at + 4 <= buf.length;) {
        const marker = buf.readUInt16BE(at)
        if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null
        const len = buf.readUInt16BE(at + 2)
        if (marker === 0xffe1 && buf.toString("latin1", at + 4, at + 10) === "Exif\0\0") return buf.slice(at + 4, Math.min(at + 2 + len, buf.length))
        at += 2 + len
    }
    return null
}

// One-time pass after boot: photos uploaded before EXIF was read have no taken_at. Their originals on
// R2 still carry EXIF, so read just the first 128 KB of each JPEG and fill the gaps.
async function backfillTakenAtFromR2() {
    const MIGRATION = "taken_at_exif_backfill"
    if (photosDb.prepare("SELECT 1 FROM app_migrations WHERE name = ?").get(MIGRATION)) return
    const rows = photosDb.prepare(`SELECT id, r2_key_original FROM images WHERE taken_at IS NULL AND (file_type IS NULL OR file_type != 'video')
        AND r2_key_original IS NOT NULL AND (lower(r2_key_original) LIKE '%.jpg' OR lower(r2_key_original) LIKE '%.jpeg')`).all()
    const upd = photosDb.prepare("UPDATE images SET taken_at = ? WHERE id = ? AND taken_at IS NULL")
    let next = 0, filled = 0, failed = 0
    const worker = async () => {
        while (next < rows.length) {
            const r = rows[next++]
            try {
                const url = presignR2Get(r.r2_key_original)
                if (url.startsWith("/")) continue
                const resp = await fetch(url, { headers: { Range: "bytes=0-131071" } })
                if (!resp.ok) { failed++; continue }
                const ts = exifTakenAt(jpegExifBlock(Buffer.from(await resp.arrayBuffer())))
                if (ts) { upd.run(ts, r.id); filled++ }
            } catch (e) { failed++ }
        }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
    console.log(`[PHOTOS] taken_at read from R2 EXIF: ${filled}/${rows.length}${failed ? `, ${failed} failed` : ""}`)
    if (!failed) photosDb.prepare("INSERT INTO app_migrations (name, ran_at) VALUES (?, ?)").run(MIGRATION, Date.now())
}
setTimeout(() => backfillTakenAtFromR2().catch(e => console.error("[PHOTOS] taken_at R2 backfill failed:", e.message)), 60 * 1000)

// One cheap pass at boot: fill taken_at for rows that still have none and whose file name carries a date.
// Rows that match nothing stay NULL and fall back to created_at wherever taken dates are used.
try {
    const pending = photosDb.prepare("SELECT id, original_name FROM images WHERE taken_at IS NULL AND original_name IS NOT NULL").all()
    if (pending.length) {
        const upd = photosDb.prepare("UPDATE images SET taken_at = ? WHERE id = ?")
        let filled = 0
        photosDb.transaction(rows => {
            for (const r of rows) {
                const ts = filenameTakenAt(r.original_name)
                if (ts) { upd.run(ts, r.id); filled++ }
            }
        })(pending)
        if (filled) console.log(`[PHOTOS] taken_at backfilled from file names: ${filled}/${pending.length}`)
    }
} catch (e) { console.error("[PHOTOS] taken_at backfill failed:", e.message) }

async function uploadOriginal(fileBuffer, originalName, albumId, clientTaken = null) {
    const id = generateId();
    const ext = path.extname(originalName).toLowerCase() || "";
    const videoExts = [".mp4", ".mov", ".m4v", ".webm"];
    const isVideo = videoExts.includes(ext);

    let w = 0, h = 0, takenAt = null;
    if (!isVideo) {
        const meta = await sharp(fileBuffer).metadata();
        const dims = validateImageMeta(meta);
        w = dims.width;
        h = dims.height;
        takenAt = exifTakenAt(meta.exif);
    } else {
        takenAt = videoTakenAt(fileBuffer);
    }
    // The browser read the date before re-encoding the photo (which drops EXIF) and sent it along.
    if (!takenAt && clientTaken) takenAt = exifDateToUtc(clientTaken.date, clientTaken.offset);
    if (!takenAt) takenAt = filenameTakenAt(originalName);

    const mimeMap = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic", ".heif": "image/heif", ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/x-m4v", ".webm": "video/webm" };
    const mimeType = mimeMap[ext] || "application/octet-stream";
    const r2Key = `next9/photos/${albumId}/${id}_original${ext}`;

    const t0 = Date.now();
    await uploadWithRetry(r2Key, fileBuffer, mimeType);
    console.log(`[UPLOAD] ${id} (${originalName}) ${w}x${h} ${(fileBuffer.length/1024).toFixed(0)}KB → R2 in ${Date.now()-t0}ms`);

    return { id, albumId, originalName, width: w, height: h, sizeBytes: fileBuffer.length, r2KeyOriginal: r2Key, isVideo, takenAt };
}

// ===== Background Processing Worker =====
async function processOneImage(task) {
    const t0 = Date.now();
    try {
        photosDb.prepare("UPDATE images SET processing_status = 'processing', processing_started_at = ? WHERE id = ?").run(Date.now(), task.id);

        // Re-read the current row rather than trusting the task snapshot — if this image was queued
        // for a conversion more than once in quick succession, an earlier run may have already
        // changed r2_key_original/original_name by the time this one actually executes. Using the
        // stale task fields here would re-encode the wrong (possibly already-deleted) R2 object
        // and/or double up the filename extension via dedupeName (e.g. "photo.jpg.png").
        const current = photosDb.prepare("SELECT r2_key_original, original_name, size_bytes, r2_key_4k FROM images WHERE id = ?").get(task.id);
        if (!current || !current.r2_key_original) throw new Error("Image row missing or original not ready");

        console.log(`[BG] Processing ${task.id} (${current.original_name}) ${task.width}x${task.height} ${(current.size_bytes/1024).toFixed(0)}KB`);

        let fileBuffer = await getFromR2(current.r2_key_original);
        let r2KeyOriginal = current.r2_key_original;
        let originalName = current.original_name;
        let sizeBytes = current.size_bytes;

        // A pending format conversion (from /convert or /convert-bulk) rides along on the task —
        // those endpoints only flip the DB row to 'pending' and enqueue; the actual re-encode +
        // re-upload of the original happens here, in the background worker, not in the request.
        if (task.convert_format && CONVERT_FORMATS[task.convert_format]) {
            const spec = CONVERT_FORMATS[task.convert_format];
            let convPipeline = sharp(fileBuffer).rotate();
            if (task.convert_format === 'jpg') convPipeline = convPipeline.jpeg({ quality: 92 });
            else if (task.convert_format === 'png') convPipeline = convPipeline.png({ quality: 90 });
            else convPipeline = convPipeline.webp({ quality: 90 });
            const convertedBuf = await convPipeline.toBuffer();
            const newKey = `next9/photos/${task.album_id}/${task.id}_original${spec.ext}`;
            await uploadWithRetry(newKey, convertedBuf, spec.mime);
            if (r2KeyOriginal !== newKey && !r2KeyReferencedElsewhere(r2KeyOriginal, task.id)) deleteFromR2(r2KeyOriginal).catch(() => {});
            // The 4K was rendered from the old original; drop it so it's rebuilt from the converted file.
            if (current.r2_key_4k && !r2KeyReferencedElsewhere(current.r2_key_4k, task.id)) deleteFromR2(current.r2_key_4k).catch(() => {});
            const baseName = (originalName || task.id).replace(/\.[^.]+$/, '');
            originalName = dedupeName(task.album_id, baseName + spec.ext);
            r2KeyOriginal = newKey;
            fileBuffer = convertedBuf;
            sizeBytes = convertedBuf.length;
            photosDb.prepare("UPDATE images SET r2_key_original = ?, original_name = ?, size_bytes = ?, convert_format = NULL, r2_key_4k = NULL, idle_4k_fails = 0 WHERE id = ?")
                .run(r2KeyOriginal, originalName, sizeBytes, task.id);
        }

        const basePath = `next9/photos/${task.album_id}/${task.id}`;

        // Every derivative comes from one decode pass, so the whole set is generated together and can be
        // re-generated with a tolerant decoder if the strict one refuses the file.
        const renderVariants = async (sharpOpts) => {
            // Sharp pipeline base: auto-rotate EXIF orientation
            const sharpBase = sharp(fileBuffer, sharpOpts).rotate();

            // 1. Preview (tiny blur base64, hard limit ~4KB)
            let previewBuf = await sharpBase.clone().resize(16, null, { fit: "inside" }).blur(2).webp({ quality: 40, effort: 3 }).toBuffer();
            if (previewBuf.length > 4096) {
                previewBuf = await sharpBase.clone().resize(10, null, { fit: "inside" }).blur(2).webp({ quality: 30, effort: 3 }).toBuffer();
            }
            const previewB64 = "data:image/webp;base64," + previewBuf.toString("base64");

            // 2. Low/thumb (strictly < 5KB for ultra-fast grid loading)
            let thumbBuf = await sharpBase.clone().resize(280, null, { fit: "inside" }).webp({ quality: 42, effort: 4 }).toBuffer();
            if (thumbBuf.length > 5120) {
                thumbBuf = await sharpBase.clone().resize(240, null, { fit: "inside" }).webp({ quality: 32, effort: 4 }).toBuffer();
                if (thumbBuf.length > 5120) {
                    thumbBuf = await sharpBase.clone().resize(200, null, { fit: "inside" }).webp({ quality: 25, effort: 4 }).toBuffer();
                }
            }

            // 3. sd — sits between thumb and medium, fast-loading "make out what it is" tier
            const sdBuf = await sharpBase.clone().resize(640, null, { fit: "inside" }).webp({ quality: 58, effort: 4 }).toBuffer();

            // 4. Medium — ALWAYS generate (Use Original Extension for download compatibility)
            let mediumBuf;
            let mediumPipeline = sharpBase.clone();

            if (sizeBytes >= 512 * 1024) {
                mediumPipeline = mediumPipeline.resize(1600, null, { fit: "inside" });
            }

            const ext = path.extname(originalName || '').toLowerCase();
            let targetExt = ext;
            let mimeTypeMedium = "image/jpeg";

            if (ext === '.png') {
                mediumPipeline = mediumPipeline.png({ quality: 80, effort: 3 });
                mimeTypeMedium = "image/png";
            } else if (ext === '.webp') {
                mediumPipeline = mediumPipeline.webp({ quality: 80, effort: 3 });
                mimeTypeMedium = "image/webp";
            } else {
                // Default to JPEG for .jpg, .jpeg, .heic, etc. to ensure wide compatibility
                mediumPipeline = mediumPipeline.jpeg({ quality: 80 });
                targetExt = '.jpg';
                mimeTypeMedium = "image/jpeg";
            }

            mediumBuf = await mediumPipeline.toBuffer();
            return {
                previewB64, previewBuf, thumbBuf, sdBuf, mediumBuf,
                mediumKey: basePath + "_medium" + targetExt,
                sdKey: basePath + "_sd.webp",
                mimeTypeMedium
            };
        };

        // A photo whose upload was cut short still has a valid header and most of its scan lines, but a
        // strict decode refuses the whole file ("Premature end of input file") and retrying can never
        // help — the bytes in R2 are all there will ever be. Decoding what did arrive, the way a browser
        // does, turns a permanently broken tile into a usable (slightly short) photo.
        let variants, salvaged = false;
        try {
            variants = await renderVariants({});
        } catch (e) {
            if (!/premature|truncat|corrupt|unexpected end of|not enough data|VipsJpeg|VipsPng|vips2?webp/i.test(e.message || "")) throw e;
            console.warn(`[BG] ${task.id} strict decode failed (${e.message}) — retrying tolerantly`);
            variants = await renderVariants({ failOn: "none" });
            salvaged = true;
        }
        const { previewB64, previewBuf, thumbBuf, sdBuf, mediumBuf, mediumKey, sdKey, mimeTypeMedium } = variants;

        // Upload all variants in parallel
        await Promise.all([
            uploadWithRetry(basePath + "_preview.webp", previewBuf, "image/webp"),
            uploadWithRetry(basePath + "_thumb.webp", thumbBuf, "image/webp"),
            uploadWithRetry(sdKey, sdBuf, "image/webp"),
            uploadWithRetry(mediumKey, mediumBuf, mimeTypeMedium),
        ]);

        photosDb.prepare(`UPDATE images SET preview_b64 = ?, r2_key_preview = ?, r2_key_thumb = ?, r2_key_sd = ?, r2_key_medium = ?, processing_status = 'done', processed_at = ?, processing_started_at = NULL, retry_count = 0, last_error = NULL WHERE id = ?`)
            .run(previewB64, basePath + "_preview.webp", basePath + "_thumb.webp", sdKey, mediumKey, Date.now(), task.id);

        // Kept on the finished row so the grid can mark the photo as recovered-but-incomplete.
        if (salvaged) photosDb.prepare("UPDATE images SET last_error = ? WHERE id = ?").run("PARTIAL: ไฟล์ต้นฉบับอัปโหลดมาไม่ครบ กู้ภาพเท่าที่อ่านได้", task.id);

        console.log(`[BG] Done ${task.id} in ${Date.now()-t0}ms (preview=${previewBuf.length}B thumb=${thumbBuf.length}B sd=${sdBuf.length}B medium=${mediumBuf.length}B${salvaged ? " SALVAGED" : ""})`);
    } catch (e) {
        if (task.timedOut) return; // the watchdog already recorded this run
        const retries = (task.retry_count || 0) + 1;
        const status = retries >= MAX_BG_RETRIES ? 'failed' : 'pending';
        photosDb.prepare("UPDATE images SET processing_status = ?, retry_count = ?, last_error = ? WHERE id = ?")
            .run(status, retries, e.message, task.id);
        console.error(`[BG] Error ${task.id} (retry ${retries}/${MAX_BG_RETRIES}): ${e.message}`);
    }
}

// ---- Video thumbnails ----
// The thumbnail used to be the frame at 0.1 s, which for many clips is black (a fade-in, a title card,
// a camera still opening) or a flat single colour. Now a few points through the video are tried (10%,
// 25%, 50%, 75% of its length); at each, ffmpeg's thumbnail filter picks the most representative of
// the next ~50 frames, and the first pick that is neither dark nor flat wins. If none qualifies, the
// most detailed one is used, and if extraction fails outright, the very first frame as before.
const VIDEO_FRAME_MIN_MEAN = 24;   // average brightness 0-255 below this reads as black
const VIDEO_FRAME_MIN_STDEV = 12;  // less variation than this is a flat colour, not a picture

const runFile = (cmd, args, timeout) => new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 }, (err, stdout) => err ? reject(err) : resolve(String(stdout)))
})

async function frameQuality(buf) {
    const st = await sharp(buf).stats()
    const ch = st.channels.slice(0, 3)
    const mean = ch.reduce((n, c) => n + c.mean, 0) / ch.length
    const stdev = ch.reduce((n, c) => n + c.stdev, 0) / ch.length
    return { mean, stdev, usable: mean >= VIDEO_FRAME_MIN_MEAN && stdev >= VIDEO_FRAME_MIN_STDEV }
}

async function pickVideoFrame(videoPath, tmpBase) {
    let duration = 0
    try {
        duration = parseFloat(await runFile("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoPath], 30000)) || 0
    } catch (e) {}
    const times = duration > 0 ? [0.1, 0.25, 0.5, 0.75].map(f => +(duration * f).toFixed(2)) : [0]
    let best = null
    for (let i = 0; i < times.length; i++) {
        const out = `${tmpBase}_${i}.jpg`
        try {
            await runFile("ffmpeg", ["-y", "-v", "error", "-ss", String(times[i]), "-i", videoPath, "-vf", "thumbnail=50", "-frames:v", "1", "-f", "image2", out], 90000)
            const buf = fs.readFileSync(out)
            const q = await frameQuality(buf)
            if (q.usable) return { buf, at: times[i], ...q }
            if (!best || q.mean * q.stdev > best.mean * best.stdev) best = { buf, at: times[i], ...q }
        } catch (e) {
            // This point failed (seek past a short clip's end, a broken stretch): try the next.
        } finally {
            try { fs.unlinkSync(out) } catch (e) {}
        }
    }
    if (best) return best
    const out = `${tmpBase}_first.jpg`
    try {
        await runFile("ffmpeg", ["-y", "-v", "error", "-i", videoPath, "-frames:v", "1", "-f", "image2", out], 90000)
        const buf = fs.readFileSync(out)
        return { buf, at: 0, ...(await frameQuality(buf)) }
    } finally {
        try { fs.unlinkSync(out) } catch (e) {}
    }
}

// Writes a video's still-image tiers (preview, thumb, sd, medium) from one frame and records them.
async function storeVideoFrame(task, frameBuffer) {
    const basePath = `next9/photos/${task.album_id}/${task.id}`;
    const sharpBase = sharp(frameBuffer).rotate();

    let previewBuf = await sharpBase.clone().resize(16, null, { fit: "inside" }).blur(2).webp({ quality: 40, effort: 3 }).toBuffer();
    if (previewBuf.length > 4096) {
        previewBuf = await sharpBase.clone().resize(10, null, { fit: "inside" }).blur(2).webp({ quality: 30, effort: 3 }).toBuffer();
    }
    let thumbBuf = await sharpBase.clone().resize(280, null, { fit: "inside" }).webp({ quality: 42, effort: 4 }).toBuffer();
    if (thumbBuf.length > 5120) {
        thumbBuf = await sharpBase.clone().resize(240, null, { fit: "inside" }).webp({ quality: 32, effort: 4 }).toBuffer();
        if (thumbBuf.length > 5120) {
            thumbBuf = await sharpBase.clone().resize(200, null, { fit: "inside" }).webp({ quality: 25, effort: 4 }).toBuffer();
        }
    }
    // sd tier (between thumb and medium)
    const sdBuf = await sharpBase.clone().resize(640, null, { fit: "inside" }).webp({ quality: 58, effort: 4 }).toBuffer();
    const sdKey = basePath + "_sd.webp";
    // Use JPEG for video medium thumbnails for compatibility
    const mediumBuf = await sharpBase.clone().resize(1600, null, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
    const mediumKey = basePath + "_medium.jpg";

    await Promise.all([
        uploadWithRetry(basePath + "_preview.webp", previewBuf, "image/webp"),
        uploadWithRetry(basePath + "_thumb.webp", thumbBuf, "image/webp"),
        uploadWithRetry(sdKey, sdBuf, "image/webp"),
        uploadWithRetry(mediumKey, mediumBuf, "image/jpeg"),
    ]);
    const previewB64 = "data:image/webp;base64," + previewBuf.toString("base64");
    photosDb.prepare(`UPDATE images SET preview_b64 = ?, r2_key_preview = ?, r2_key_thumb = ?, r2_key_sd = ?, r2_key_medium = ?, processing_status = 'done', processed_at = ?, processing_started_at = NULL, retry_count = 0, last_error = NULL WHERE id = ?`)
        .run(previewB64, basePath + "_preview.webp", basePath + "_thumb.webp", sdKey, mediumKey, Date.now(), task.id);
    // The share-link preview image is built from medium: drop the cached one.
    ogCache.delete(task.id);
}

async function downloadVideoToTmp(task) {
    const tmpVid = `/tmp/vid_${task.id}_${Date.now()}.mp4`;
    const r2Stream = await getR2ReadStream(task.r2_key_original);
    await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(tmpVid);
        r2Stream.pipe(ws);
        ws.on('finish', resolve);
        ws.on('error', reject);
        r2Stream.on('error', reject);
    });
    return tmpVid;
}

async function processOneVideo(task) {
    const t0 = Date.now();
    let tmpVid = null, tmpImg = null;
    try {
        photosDb.prepare("UPDATE images SET processing_status = 'processing', processing_started_at = ? WHERE id = ?").run(Date.now(), task.id);
        console.log(`[BG] Processing Video ${task.id} (${task.original_name})`);

        // 1. Download video to temp file
        tmpVid = await downloadVideoToTmp(task);
        // 2. Pick a frame that shows something (see pickVideoFrame)
        const frame = await pickVideoFrame(tmpVid, `/tmp/vid_${task.id}_${Date.now()}`);
        // 3. Still-image tiers from it
        await storeVideoFrame(task, frame.buf);
        // Measure it now, while the file is here, and queue its quality ladder for idle time.
        try { queueVideoLadder(task.r2_key_original, await probeVideo(tmpVid)) } catch (e) { console.error("[VIDEO] probe", task.id, e.message) }
        console.log(`[BG] Video ${task.id} frame at ${frame.at}s (brightness ${frame.mean.toFixed(0)}, detail ${frame.stdev.toFixed(0)}${frame.usable ? "" : ", best available"})`);
        console.log(`[BG] Done Video ${task.id} in ${Date.now()-t0}ms`);
    } catch (e) {
        if (task.timedOut) return; // the watchdog already recorded this run
        const retries = (task.retry_count || 0) + 1;
        const status = retries >= MAX_BG_RETRIES ? 'failed' : 'pending';
        photosDb.prepare("UPDATE images SET processing_status = ?, retry_count = ?, last_error = ? WHERE id = ?")
            .run(status, retries, e.message, task.id);
        console.error(`[BG] Error Video ${task.id} (retry ${retries}/${MAX_BG_RETRIES}): ${e.message}`);
    } finally {
        if (tmpVid && fs.existsSync(tmpVid)) { try { fs.unlinkSync(tmpVid) } catch(e){} }
        if (tmpImg && fs.existsSync(tmpImg)) { try { fs.unlinkSync(tmpImg) } catch(e){} }
    }
}

// Runs one job with a watchdog. The slot (bgActive) is released exactly once: when the job settles, or
// when it overruns BG_TIMEOUT_MS, whichever is first. On a timeout the row is recorded like any other
// failure (retry or 'failed'), and the job's own error path is told to stay quiet if it ends later.
function runBgTask(task, isVideo) {
    bgActive++;
    let released = false;
    const release = () => { if (!released) { released = true; bgActive--; } };
    const limit = isVideo ? BG_TIMEOUT_MS.video : BG_TIMEOUT_MS.image;
    const timer = setTimeout(() => {
        task.timedOut = true;
        const retries = (task.retry_count || 0) + 1;
        const status = retries >= MAX_BG_RETRIES ? 'failed' : 'pending';
        try {
            // Only if still ours: a run that finished in the meantime already wrote 'done'.
            photosDb.prepare("UPDATE images SET processing_status = ?, retry_count = ?, last_error = ?, processing_started_at = NULL WHERE id = ? AND processing_status = 'processing'")
                .run(status, retries, `timeout after ${Math.round(limit / 1000)}s`, task.id);
        } catch (e) { console.error("[BG] timeout bookkeeping", task.id, e.message); }
        console.error(`[BG] Timeout ${task.id} after ${limit}ms (retry ${retries}/${MAX_BG_RETRIES})`);
        release();
    }, limit);
    (isVideo ? processOneVideo : processOneImage)(task)
        .catch((e) => console.error("[BG] unhandled", task.id, e))
        .finally(() => { clearTimeout(timer); release(); });
}

async function startBackgroundWorker() {
    // Bootstrap: recover any pending/processing tasks from DB (crash recovery)
    const pending = photosDb.prepare(`
        SELECT id, album_id, r2_key_original, original_name, width, height, size_bytes, retry_count, file_type
        FROM images WHERE processing_status IN ('pending', 'processing')
        ORDER BY created_at ASC
    `).all();
    if (pending.length > 0) {
        console.log(`[BG] Bootstrap: recovered ${pending.length} pending tasks from DB`);
        pending.forEach(t => {
            if (t.file_type === 'video') videoProcessingQueue.push(t);
            else processingQueue.push(t);
        });
    }
    console.log("[BG] Background processing worker started");

    while (true) {
        try {
            // Don't exceed concurrency
            if (bgActive >= MAX_BG_CONCURRENCY) {
                await new Promise(r => setTimeout(r, 500));
                continue;
            }

            // 1. Try in-memory queue first (images first, then videos). This used to pause everything
            // while any upload was in flight. A visitor uploading a long batch sends files back to back,
            // so the worker (checking every 3 s) almost never saw a gap, and every tile of the batch sat
            // on "processing" until the whole upload ended. Images now keep flowing at concurrency 1;
            // only videos yield to uploads, and only for a bounded time.
            const uploadsBusy = activeUploads > 0 || Date.now() - lastUploadAt < 1500;
            let task = processingQueue.shift();
            let isVideoTask = false;
            if (!task && videoProcessingQueue.length) {
                const head = videoProcessingQueue[0];
                head.queuedAt = head.queuedAt || Date.now();
                if (!uploadsBusy || Date.now() - head.queuedAt > VIDEO_UPLOAD_DEFER_MS) {
                    task = videoProcessingQueue.shift();
                    isVideoTask = true;
                }
            }

            // 2. Fallback: check DB for any missed tasks (rare, crash recovery)
            if (!task) {
                task = photosDb.prepare(`
                    SELECT id, album_id, r2_key_original, original_name, width, height, size_bytes, retry_count, file_type
                    FROM images WHERE processing_status = 'pending' AND file_type = 'image'
                    ORDER BY created_at DESC LIMIT 1
                `).get();
                if (!task && !uploadsBusy && !videoProcessingQueue.length) {
                    task = photosDb.prepare(`
                        SELECT id, album_id, r2_key_original, original_name, width, height, size_bytes, retry_count, file_type
                        FROM images WHERE processing_status = 'pending' AND file_type = 'video'
                        ORDER BY created_at DESC LIMIT 1
                    `).get();
                    if (task) isVideoTask = true;
                }
            }

            if (!task) {
                // Short while uploads run, so freshly queued images start within a second.
                await new Promise(r => setTimeout(r, uploadsBusy || videoProcessingQueue.length ? 1000 : 5000));
                continue;
            }
            runBgTask(task, task.file_type === 'video' || isVideoTask); // fire-and-forget, slot freed by the watchdog wrapper
            await new Promise(r => setTimeout(r, 300)); // small gap between dispatches
        } catch (e) {
            console.error("[BG] Worker loop error:", e);
            await new Promise(r => setTimeout(r, 10000));
        }
    }
}

startBackgroundWorker();

function writeJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8")
}
// Global students data for fast search (Loaded once on startup)
let globalStudentsData = [];
try {
    const studentsPath = path.join(__dirname, 'students.json');
    if (fs.existsSync(studentsPath)) {
        globalStudentsData = JSON.parse(fs.readFileSync(studentsPath, 'utf8'));
        console.log(`[INERT] Loaded ${globalStudentsData.length} students into memory for search.`);
    }
} catch (e) {
    console.error("[INERT] Error loading students.json into memory", e.message);
}

// Function to reload students data (can be called if students.json is updated)
function reloadGlobalStudents() {
    try {
        const studentsPath = path.join(__dirname, 'students.json');
        if (fs.existsSync(studentsPath)) {
            globalStudentsData = JSON.parse(fs.readFileSync(studentsPath, 'utf8'));
            console.log(`[INERT] Reloaded ${globalStudentsData.length} students into memory.`);
        }
    } catch (e) {
        console.error("[INERT] Error reloading students.json", e.message);
    }
}

const server = http.createServer((req, res) => {
    // อนุญาต CORS
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Upload-Order, X-Share-Token, X-Taken-At, X-Taken-Offset")

    if (req.method === "OPTIONS") {
        res.writeHead(200)
        return res.end()
    }

    function getPinkbookConfigSync() {
        try {
            const configPath = path.join(dataDir, "pinkbook_config.json");
            if (fs.existsSync(configPath)) {
                return JSON.parse(fs.readFileSync(configPath, "utf-8"));
            }
        } catch(e) {}
        return {};
    }

    function getPinkbookCurrentTerm() {
        const cfg = getPinkbookConfigSync();
        return (cfg.current_term && cfg.current_term.trim()) || "2/2569";
    }

    // Pinkbook API
    if (req.method === "GET" && req.url.startsWith("/api/pinkbook/config")) {
        const configPath = path.join(dataDir, "pinkbook_config.json");
        let configData = {
            current_term: "2/2569",
            terms: ["2/2569", "1/2569"],
            week_1_start: "2026-10-26",
            items: [
                { title: "ไม่วงกลม กและข หน้าปก", allow_week: false },
                { title: "ไม่เขียนที่อยู่", allow_week: false },
                { title: "ไม่เขียนตารางเรียนนักเรียน", allow_week: false },
                { title: "ไม่เขียนตารางสอนครูที่ปรึกษา", allow_week: false },
                { title: "ไม่เขียนสัปดาห์", allow_week: true },
                { title: "ไม่เขียนวันที่/เดือน/ปี", allow_week: true },
                { title: "ไม่ได้เขียนยอดรวมขาด / ลา", allow_week: true },
                { title: "ไม่เขียนเรื่องที่อบรมแต่ละวัน", allow_week: true },
                { title: "ไม่มีลายเซ็นครูที่ปรึกษา", allow_week: true }
            ]
        };
        try {
            if (fs.existsSync(configPath)) {
                const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
                configData = { ...configData, ...parsed };
                if (!configData.current_term) configData.current_term = "2/2569";
                if (!Array.isArray(configData.terms) || configData.terms.length === 0) configData.terms = ["2/2569", "1/2569"];
            }
        } catch (e) {
            console.error("Failed to read pinkbook config:", e);
        }
        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
        });
        return res.end(JSON.stringify({ success: true, config: configData }));
    }

    // ---- Pinkbook form drafts ----
    // The inspection form saves its unsubmitted state here as it is filled in, keyed by a random ID
    // the browser keeps permanently (localStorage + cookie), so closing the tab — or the browser
    // crashing — loses nothing: the next visit from that browser restores the form exactly.
    // GET  /api/pinkbook/draft?id=…            → { success, draft, updated_at } (draft null if none)
    // POST /api/pinkbook/draft {id, draft}     → upsert; draft null deletes it (after a submit)
    // POST also accepts text/plain, so navigator.sendBeacon can flush the last change on page hide.
    if (req.url.startsWith("/api/pinkbook/draft") && (req.method === "GET" || req.method === "POST")) {
        const DRAFT_ID = /^[A-Za-z0-9_-]{16,64}$/;
        const openDraftDb = () => {
            const db = new Database(path.join(dataDir, "pinkbook.db"));
            db.prepare(`CREATE TABLE IF NOT EXISTS pinkbook_drafts (draft_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)`).run();
            return db;
        };
        const send = (code, obj) => {
            res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            res.end(JSON.stringify(obj));
        };
        if (req.method === "GET") {
            const id = new URL(req.url, `http://${req.headers.host}`).searchParams.get("id") || "";
            if (!DRAFT_ID.test(id)) return send(400, { success: false, message: "bad id" });
            try {
                const db = openDraftDb();
                const row = db.prepare(`SELECT data, updated_at FROM pinkbook_drafts WHERE draft_id = ?`).get(id);
                db.close();
                return send(200, { success: true, draft: row ? JSON.parse(row.data) : null, updated_at: row ? row.updated_at : 0 });
            } catch (e) {
                console.error("pinkbook draft read error:", e);
                return send(500, { success: false });
            }
        }
        let body = "";
        let tooBig = false;
        req.setEncoding("utf8");
        req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 256 * 1024) tooBig = true;
        });
        req.on("end", () => {
            if (tooBig) return send(413, { success: false, message: "draft too large" });
            try {
                const { id, draft } = JSON.parse(body || "{}");
                if (typeof id !== "string" || !DRAFT_ID.test(id)) return send(400, { success: false, message: "bad id" });
                const db = openDraftDb();
                if (draft == null) {
                    db.prepare(`DELETE FROM pinkbook_drafts WHERE draft_id = ?`).run(id);
                } else {
                    if (typeof draft !== "object") { db.close(); return send(400, { success: false }); }
                    const savedAt = Number(draft.savedAt) || Date.now();
                    // Never let a late, older write (a slow request, a second tab) overwrite a newer draft.
                    const cur = db.prepare(`SELECT updated_at FROM pinkbook_drafts WHERE draft_id = ?`).get(id);
                    if (!cur || cur.updated_at <= savedAt) {
                        db.prepare(`INSERT INTO pinkbook_drafts (draft_id, data, updated_at) VALUES (?, ?, ?)
                                    ON CONFLICT(draft_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`).run(id, JSON.stringify(draft), savedAt);
                    }
                }
                db.close();
                return send(200, { success: true });
            } catch (e) {
                console.error("pinkbook draft write error:", e);
                return send(400, { success: false });
            }
        });
        return;
    }

    if (req.method === "POST" && req.url.startsWith("/api/pinkbook/add-item")) {
        let body = '';
        req.setEncoding("utf8"); req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { title, allow_week } = JSON.parse(body);
                if (!title || typeof title !== 'string' || !title.trim()) {
                    res.writeHead(400); return res.end(JSON.stringify({ success: false, message: 'ไม่มีชื่อรายการ' }));
                }
                const configPath = path.join(dataDir, "pinkbook_config.json");
                let configData = { items: [] };
                try {
                    if (fs.existsSync(configPath)) configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
                } catch(e) {}
                if (!Array.isArray(configData.items)) configData.items = [];
                // Check duplicate
                if (configData.items.some(i => i.title === title.trim())) {
                    res.writeHead(200); return res.end(JSON.stringify({ success: false, message: 'มีรายการนี้อยู่แล้ว' }));
                }
                configData.items.push({ title: title.trim(), allow_week: !!allow_week });
                fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), "utf-8");
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ success: true }));
            } catch(e) {
                console.error("add-item error:", e);
                res.writeHead(500); return res.end(JSON.stringify({ success: false, message: 'เกิดข้อผิดพลาด' }));
            }
        });
        return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/pinkbook/latest")) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const grade = url.searchParams.get("grade");
        const room = url.searchParams.get("room");
        const group = url.searchParams.get("group");
        const term = url.searchParams.get("term") || getPinkbookCurrentTerm();
        try {
            const db = new Database(path.join(dataDir, "pinkbook.db"));
            let row;
            if (group === '-' || !group) {
                const stmt = db.prepare(`SELECT * FROM pinkbook_records WHERE grade = ? AND room = ? AND (group_name = '-' OR group_name = 'ก' OR group_name = '') AND term = ? ORDER BY id DESC LIMIT 1`);
                row = stmt.get(grade, room, term);
            } else {
                const stmt = db.prepare(`SELECT * FROM pinkbook_records WHERE grade = ? AND room = ? AND group_name = ? AND term = ? ORDER BY id DESC LIMIT 1`);
                row = stmt.get(grade, room, group, term);
            }
            db.close();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, data: row || null }));
        } catch (err) {
            console.error("Pinkbook latest error:", err);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
    }

    if (req.method === "POST" && req.url.startsWith("/api/pinkbook/login")) {
        let body = "";
        req.setEncoding("utf8"); req.on("data", c => body += c);
        req.on("end", () => {
            const data = JSON.parse(body);
            if (data.password === "1") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true }));
            } else {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: false, error: "รหัสผ่านไม่ถูกต้อง" }));
            }
        });
        return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/pinkbook/reports")) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const week = url.searchParams.get("week");
        const term = url.searchParams.get("term") || getPinkbookCurrentTerm();
        try {
            const db = new Database(path.join(dataDir, "pinkbook.db"));
            const stmt = db.prepare(`SELECT * FROM pinkbook_records WHERE inspected_week = ? AND term = ? ORDER BY grade, room, group_name`);
            const rows = stmt.all(week, term);
            db.close();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, data: rows }));
        } catch(err) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
    }

    if (req.method === "DELETE" && req.url.startsWith("/api/pinkbook/reports/")) {
        const id = req.url.split("/").pop();
        try {
            const db = new Database(path.join(dataDir, "pinkbook.db"));
            const getStmt = db.prepare(`SELECT * FROM pinkbook_records WHERE id = ?`);
            const record = getStmt.get(id);
            if (record) {
                db.prepare(`DELETE FROM pinkbook_records WHERE id = ?`).run(id);
                // Record log
                db.prepare(`INSERT INTO pinkbook_logs (record_id, inspected_week, grade, room, group_name, action, action_by, status, issues, unsubmitted_weeks, raw_issues, diff_summary, term) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                  .run(null, record.inspected_week, record.grade, record.room, record.group_name, 'delete', 'แอดมิน', 'ยังไม่ส่ง', '-', '[]', '{}', 'ลบผลการตรวจห้องนี้', record.term || getPinkbookCurrentTerm());
            }
            db.close();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
        } catch(err) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
    }

    if (req.method === "POST" && req.url.startsWith("/api/pinkbook/reports/admin_save")) {
        let body = "";
        req.setEncoding("utf8"); req.on("data", c => body += c);
        req.on("end", () => {
            try {
                const { week, grade, room, group_name, status, issues, unsubmitted_weeks, raw_issues, action_by, diff_summary, term } = JSON.parse(body);
                const db = new Database(path.join(dataDir, "pinkbook.db"));
                const adminName = action_by || 'แอดมิน';
                const targetTerm = term || getPinkbookCurrentTerm();

                if (status === 'ยังไม่ส่ง') {
                    // ลบ record จาก DB ถ้ามีอยู่
                    db.prepare(`DELETE FROM pinkbook_records WHERE inspected_week = ? AND grade = ? AND room = ? AND group_name = ? AND term = ?`)
                      .run(week, grade, room, group_name, targetTerm);
                    
                    // บันทึก Log
                    db.prepare(`INSERT INTO pinkbook_logs (record_id, inspected_week, grade, room, group_name, action, action_by, status, issues, unsubmitted_weeks, raw_issues, diff_summary, term) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                      .run(null, week, grade, room, group_name, 'edit', adminName, 'ยังไม่ส่ง', '-', '[]', '{}', diff_summary || 'เปลี่ยนสถานะเป็น ยังไม่ส่ง', targetTerm);
                } else {
                    // ค้นหา record เดิม
                    const existing = db.prepare(`SELECT id FROM pinkbook_records WHERE inspected_week = ? AND grade = ? AND room = ? AND group_name = ? AND term = ? LIMIT 1`)
                      .get(week, grade, room, group_name, targetTerm);
                    
                    let recId;
                    if (existing) {
                        recId = existing.id;
                        db.prepare(`UPDATE pinkbook_records SET issues = ?, unsubmitted_weeks = ?, raw_issues = ? WHERE id = ?`)
                          .run(issues || '-', JSON.stringify(unsubmitted_weeks || []), JSON.stringify(raw_issues || {}), recId);
                    } else {
                        const ins = db.prepare(`INSERT INTO pinkbook_records (inspector_name, inspected_week, grade, room, group_name, issues, unsubmitted_weeks, raw_issues, term) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                          .run(adminName, week, grade, room, group_name, issues || '-', JSON.stringify(unsubmitted_weeks || []), JSON.stringify(raw_issues || {}), targetTerm);
                        recId = ins.lastInsertRowid;
                    }

                    // บันทึก Log
                    db.prepare(`INSERT INTO pinkbook_logs (record_id, inspected_week, grade, room, group_name, action, action_by, status, issues, unsubmitted_weeks, raw_issues, diff_summary, term) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                      .run(recId, week, grade, room, group_name, 'edit', adminName, status, issues || '-', JSON.stringify(unsubmitted_weeks || []), JSON.stringify(raw_issues || {}), diff_summary || 'แก้ไขข้อมูลผลการตรวจ', targetTerm);
                }

                db.close();
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true }));
            } catch(err) {
                console.error("Pinkbook admin_save error:", err);
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // Submission / edit history for the form's "ดูประวัติการส่ง" drawer: the newest log entries,
    // optionally for one inspector, plus the list of everyone who has submitted (for the filter).
    if (req.method === "GET" && req.url.startsWith("/api/pinkbook/history")) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const name = (url.searchParams.get("name") || "").trim();
        const term = url.searchParams.get("term") || getPinkbookCurrentTerm();
        const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "300", 10) || 300));
        try {
            const db = new Database(path.join(dataDir, "pinkbook.db"), { readonly: true });
            const cols = `id, record_id, inspected_week, grade, room, group_name, action, action_by, status, issues, unsubmitted_weeks, diff_summary, created_at, term`;
            const rows = name
                ? db.prepare(`SELECT ${cols} FROM pinkbook_logs WHERE action_by = ? AND term = ? ORDER BY created_at DESC, id DESC LIMIT ?`).all(name, term, limit)
                : db.prepare(`SELECT ${cols} FROM pinkbook_logs WHERE term = ? ORDER BY created_at DESC, id DESC LIMIT ?`).all(term, limit);
            const names = db.prepare(`SELECT action_by AS name, COUNT(*) AS n, MAX(created_at) AS last FROM pinkbook_logs WHERE term = ? GROUP BY action_by ORDER BY last DESC`).all(term);
            db.close();
            res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            res.end(JSON.stringify({ success: true, data: rows, names }));
        } catch (err) {
            console.error("Pinkbook history error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/pinkbook/logs")) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const week = url.searchParams.get("week");
        const grade = url.searchParams.get("grade");
        const room = url.searchParams.get("room");
        const group = url.searchParams.get("group") || '-';
        const term = url.searchParams.get("term") || getPinkbookCurrentTerm();
        try {
            const db = new Database(path.join(dataDir, "pinkbook.db"));
            let rows;
            if (group === '-' || !group) {
                const stmt = db.prepare(`SELECT * FROM pinkbook_logs WHERE inspected_week = ? AND grade = ? AND room = ? AND (group_name = '-' OR group_name = 'ก' OR group_name = '') AND term = ? ORDER BY id DESC`);
                rows = stmt.all(week, grade, room, term);
            } else {
                const stmt = db.prepare(`SELECT * FROM pinkbook_logs WHERE inspected_week = ? AND grade = ? AND room = ? AND group_name = ? AND term = ? ORDER BY id DESC`);
                rows = stmt.all(week, grade, room, group, term);
            }
            db.close();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, data: rows }));
        } catch (err) {
            console.error("Pinkbook logs error:", err);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
    }

    if (req.method === "POST" && req.url.startsWith("/api/pinkbook/logs/revert")) {
        let body = "";
        req.setEncoding("utf8"); req.on("data", c => body += c);
        req.on("end", () => {
            try {
                const { log_id, action_by } = JSON.parse(body);
                const db = new Database(path.join(dataDir, "pinkbook.db"));
                const targetLog = db.prepare(`SELECT * FROM pinkbook_logs WHERE id = ?`).get(log_id);
                if (!targetLog) {
                    db.close();
                    res.writeHead(404, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ success: false, error: "ไม่พบประวัติ Log ที่ต้องการย้อนกลับ" }));
                }

                const targetDateStr = targetLog.created_at || '';
                const revertSummary = `ย้อนกลับไปข้อมูลของ ${targetLog.action_by} (${targetDateStr})`;
                const adminName = action_by || 'แอดมิน';
                const logTerm = targetLog.term || getPinkbookCurrentTerm();

                if (targetLog.status === 'ยังไม่ส่ง' || targetLog.action === 'delete') {
                    db.prepare(`DELETE FROM pinkbook_records WHERE inspected_week = ? AND grade = ? AND room = ? AND group_name = ? AND term = ?`)
                      .run(targetLog.inspected_week, targetLog.grade, targetLog.room, targetLog.group_name, logTerm);
                    
                    db.prepare(`INSERT INTO pinkbook_logs (record_id, inspected_week, grade, room, group_name, action, action_by, status, issues, unsubmitted_weeks, raw_issues, diff_summary, term) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                      .run(null, targetLog.inspected_week, targetLog.grade, targetLog.room, targetLog.group_name, 'revert', adminName, 'ยังไม่ส่ง', '-', '[]', '{}', revertSummary, logTerm);
                } else {
                    const existing = db.prepare(`SELECT id FROM pinkbook_records WHERE inspected_week = ? AND grade = ? AND room = ? AND group_name = ? AND term = ? LIMIT 1`)
                      .get(targetLog.inspected_week, targetLog.grade, targetLog.room, targetLog.group_name, logTerm);
                    
                    let recId;
                    if (existing) {
                        recId = existing.id;
                        db.prepare(`UPDATE pinkbook_records SET issues = ?, unsubmitted_weeks = ?, raw_issues = ? WHERE id = ?`)
                          .run(targetLog.issues, targetLog.unsubmitted_weeks || '[]', targetLog.raw_issues || '{}', recId);
                    } else {
                        const ins = db.prepare(`INSERT INTO pinkbook_records (inspector_name, inspected_week, grade, room, group_name, issues, unsubmitted_weeks, raw_issues, term) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                          .run(targetLog.action_by, targetLog.inspected_week, targetLog.grade, targetLog.room, targetLog.group_name, targetLog.issues, targetLog.unsubmitted_weeks || '[]', targetLog.raw_issues || '{}', logTerm);
                        recId = ins.lastInsertRowid;
                    }

                    db.prepare(`INSERT INTO pinkbook_logs (record_id, inspected_week, grade, room, group_name, action, action_by, status, issues, unsubmitted_weeks, raw_issues, diff_summary, term) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                      .run(recId, targetLog.inspected_week, targetLog.grade, targetLog.room, targetLog.group_name, 'revert', adminName, targetLog.status, targetLog.issues, targetLog.unsubmitted_weeks || '[]', targetLog.raw_issues || '{}', revertSummary, logTerm);
                }

                db.close();
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true }));
            } catch(err) {
                console.error("Pinkbook revert error:", err);
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    if (req.method === "POST" && req.url.startsWith("/api/pinkbook/verify")) {
        let body = "";
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const { inspector_name, inspected_week, records, term } = JSON.parse(body);
                const targetTerm = term || getPinkbookCurrentTerm();
                const db = new Database(path.join(dataDir, "pinkbook.db"));
                
                // ตรวจสอบว่า record ทั้งหมดที่ส่งมามีอยู่ใน DB หรือไม่ (ตรวจสอบจากข้อมูลล่าสุด)
                const stmt = db.prepare(`SELECT id FROM pinkbook_records WHERE inspector_name = ? AND inspected_week = ? AND grade = ? AND room = ? AND group_name = ? AND term = ? ORDER BY id DESC LIMIT 1`);
                
                let allFound = true;
                if (!records || records.length === 0) {
                    allFound = false;
                } else {
                    for (const r of records) {
                        const row = stmt.get(inspector_name, inspected_week, r.grade, r.room, r.group_name, targetTerm);
                        if (!row) {
                            allFound = false;
                            break;
                        }
                    }
                }
                
                db.close();
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true, verified: allFound }));
            } catch (err) {
                console.error("Pinkbook verify error:", err);
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    if (req.method === "POST" && req.url.startsWith("/api/pinkbook/submit")) {
        let body = "";
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const data = JSON.parse(body);
                const targetTerm = data.term || getPinkbookCurrentTerm();
                const db = new Database(path.join(dataDir, "pinkbook.db"));
                const stmt = db.prepare(`INSERT INTO pinkbook_records (inspector_name, inspected_week, grade, room, group_name, issues, unsubmitted_weeks, raw_issues, term) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                const insertLogStmt = db.prepare(`INSERT INTO pinkbook_logs (record_id, inspected_week, grade, room, group_name, action, action_by, status, issues, unsubmitted_weeks, raw_issues, diff_summary, term) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                
                let insertedCount = 0;
                const tx = db.transaction((records) => {
                    for (const r of records) {
                        const info = stmt.run(data.inspector_name, data.inspected_week, r.grade, r.room, r.group_name, r.issues, JSON.stringify(r.unsubmitted_weeks || []), JSON.stringify(r.raw_issues || {}), targetTerm);
                        const status = (r.issues && r.issues !== '-') ? 'ไม่เรียบร้อย' : 'เรียบร้อย';
                        insertLogStmt.run(
                            info.lastInsertRowid,
                            data.inspected_week,
                            r.grade,
                            r.room,
                            r.group_name,
                            'submit',
                            data.inspector_name,
                            status,
                            r.issues,
                            JSON.stringify(r.unsubmitted_weeks || []),
                            JSON.stringify(r.raw_issues || {}),
                            'ส่งผลการตรวจครั้งแรก',
                            targetTerm
                        );
                        insertedCount++;
                    }
                });
                tx(data.records);
                
                db.close();
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true, count: insertedCount }));
            } catch (err) {
                console.error("Pinkbook save error:", err);
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }


    // Verify Auth Endpoint
    if (req.method === "POST" && req.url === "/api/verify-auth") {
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", () => {
            try {
                const { password } = JSON.parse(body)
                if (password === EDITOR_PASSWORD) {
                    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                    res.end(JSON.stringify({ success: true }))
                } else {
                    res.writeHead(401)
                    res.end(JSON.stringify({ success: false, message: "Unauthorized" }))
                }
            } catch (e) {
                res.writeHead(400)
                res.end("Invalid JSON")
            }
        })
        return
    }

    // Member photo from the editor: the raw image file as the body, ?index=<position in members.json>.
    // Stored as next9/members/2/<slug>.webp (portrait 4:5, the shape every member page shows) and the
    // member's img gets a ?v= stamp so the CDN and browsers fetch the new photo, not the cached old one.
    if (req.method === "POST" && req.url.startsWith("/api/member-photo")) {
        if (req.headers.authorization !== EDITOR_PASSWORD) {
            res.writeHead(401)
            return res.end(JSON.stringify({ success: false }))
        }
        const index = Number(new URL(req.url, "http://x").searchParams.get("index"))
        const chunks = []
        let size = 0
        req.on("data", chunk => {
            size += chunk.length
            if (size <= 30 * 1024 * 1024) chunks.push(chunk)
        })
        req.on("end", async () => {
            const send = (code, obj) => {
                res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify(obj))
            }
            if (size > 30 * 1024 * 1024) return send(413, { success: false, message: "ไฟล์ใหญ่เกิน 30MB" })
            try {
                const members = await downloadMembers()
                const member = members[index]
                if (!Number.isInteger(index) || !member) return send(400, { success: false, message: "ไม่พบสมาชิก" })
                const slug = String(member.slug || "")
                if (!/^[a-z0-9_-]+$/.test(slug)) return send(400, { success: false, message: "slug ไม่ถูกต้อง" })
                const webp = await sharp(Buffer.concat(chunks), { failOn: "none" })
                    .rotate()
                    .resize(960, 1200, { fit: "cover", position: "attention" })
                    .webp({ quality: 84 })
                    .toBuffer()
                await uploadBufferToR2(`next9/members/2/${slug}.webp`, webp, "image/webp")
                members[index] = { ...member, img: `2/${slug}.webp?v=${Date.now()}`, updatedAt: Date.now() }
                await uploadToR2("next9/members/members.json", JSON.stringify(members, null, 2))
                send(200, { success: true, member: members[index] })
            } catch (err) {
                console.error("member-photo:", err)
                send(500, { success: false, message: "อัปโหลดรูปไม่สำเร็จ" })
            }
        })
        return
    }

    if (req.method === "POST" && req.url === "/api/save-member") {
    const authHeader = req.headers.authorization;
    if (authHeader !== EDITOR_PASSWORD) {
        res.writeHead(401);
        return res.end(JSON.stringify({ success: false }));
    }

    let body = "";
    req.setEncoding("utf8"); req.on("data", chunk => body += chunk);

    req.on("end", async () => {
        try {
        const { index, member } = JSON.parse(body);

        const members = await downloadMembers();

        // The editor addresses a member by position; refuse if that position now holds someone else
        // (the list changed since the editor loaded it), instead of overwriting the wrong person.
        if (!members[index] || (member.slug && members[index].slug !== member.slug)) {
            res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
            return res.end(JSON.stringify({ success: false, message: "รายชื่อมีการเปลี่ยนแปลง กรุณารีเฟรชหน้า" }));
        }

        members[index] = {
            ...member,
            updatedAt: Date.now()
        };

        const jsonString = JSON.stringify(members, null, 2);
        await uploadToR2("next9/members/members.json", jsonString);

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ success: true, member: members[index] }));

        } catch (err) {
        console.error(err);
        res.writeHead(500);
        res.end(JSON.stringify({ success: false }));
        }
    });

    return;
    }

    if (req.method === "POST" && req.url === "/api/generate-site") {
        const authHeader = req.headers.authorization
        if (authHeader !== EDITOR_PASSWORD) {
            res.writeHead(401)
            return res.end(JSON.stringify({ success: false }))
        }

        ;(async () => {
            try {
                console.log("Start generate")
                const output = await runGenerate()
                console.log("Generate done")

                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, output }))
            } catch (err) {
                console.error("Generate error:", err)
                res.writeHead(500)
                res.end(JSON.stringify({ success: false }))
            }
        })()

        return
    }

    // ===== Toilet Form API =====
    console.log("INCOMING REQ", req.method, req.url); const urlParts = req.url.split("?")
    const urlPath = urlParts[0]
    const urlQuery = new URLSearchParams(urlParts[1] || "")

    // GET /api/toilet/config - public
    if (req.method === "GET" && urlPath === "/api/toilet/config") {
        const cfg = readJSON(toiletConfigPath, { rooms: [], problems: [] })
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
        return res.end(JSON.stringify(cfg))
    }

    // POST /api/toilet/submit - public
    if (req.method === "POST" && urlPath === "/api/toilet/submit") {
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", () => {
            try {
                const { roomId, role, problem, customProblem } = JSON.parse(body)
                const cfg = readJSON(toiletConfigPath, { rooms: [], problems: [] })
                const room = cfg.rooms.find(r => r.id === roomId)
                if (!room) {
                    console.log("Unhandled:", req.method, req.url); res.writeHead(404)
                    return res.end(JSON.stringify({ success: false, message: "ไม่พบห้องน้ำ" }))
                }
                const submissions = readJSON(toiletSubmissionsPath, [])
                const submission = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                    roomId,
                    roomName: room.name,
                    role,
                    problem: problem === "อื่นๆ" ? customProblem : problem,
                    isCustom: problem === "อื่นๆ",
                    timestamp: Date.now(),
                    closed: false,
                    closedAt: null
                }
                submissions.push(submission)
                writeJSON(toiletSubmissionsPath, submissions)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true }))
            } catch (e) {
                res.writeHead(400)
                res.end(JSON.stringify({ success: false, message: "Invalid request" }))
            }
        })
        return
    }

    // POST /api/toilet/verify - verify toilet password
    if (req.method === "POST" && urlPath === "/api/toilet/verify") {
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", () => {
            try {
                const { password } = JSON.parse(body)
                if (password === TOILET_PASSWORD) {
                    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                    res.end(JSON.stringify({ success: true }))
                } else {
                    res.writeHead(401)
                    res.end(JSON.stringify({ success: false }))
                }
            } catch (e) {
                res.writeHead(400)
                res.end("Invalid JSON")
            }
        })
        return
    }

    // GET /api/toilet/submissions - requires auth
    if (req.method === "GET" && urlPath === "/api/toilet/submissions") {
        if (req.headers.authorization !== TOILET_PASSWORD) {
            res.writeHead(401)
            return res.end(JSON.stringify({ success: false }))
        }
        const submissions = readJSON(toiletSubmissionsPath, [])
        const roomId = urlQuery.get("roomId")
        let filtered = submissions
        if (roomId) filtered = submissions.filter(s => s.roomId === roomId)
        filtered.sort((a, b) => b.timestamp - a.timestamp)
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
        return res.end(JSON.stringify(filtered))
    }

    // POST /api/toilet/close - requires auth
    if (req.method === "POST" && urlPath === "/api/toilet/close") {
        if (req.headers.authorization !== TOILET_PASSWORD) {
            res.writeHead(401)
            return res.end(JSON.stringify({ success: false }))
        }
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", () => {
            try {
                const { id } = JSON.parse(body)
                const submissions = readJSON(toiletSubmissionsPath, [])
                const idx = submissions.findIndex(s => s.id === id)
                if (idx === -1) {
                    console.log("Unhandled:", req.method, req.url); res.writeHead(404)
                    return res.end(JSON.stringify({ success: false }))
                }
                submissions[idx].closed = true
                submissions[idx].closedAt = Date.now()
                writeJSON(toiletSubmissionsPath, submissions)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true }))
            } catch (e) {
                res.writeHead(400)
                res.end(JSON.stringify({ success: false }))
            }
        })
        return
    }

    // POST /api/toilet/save-config - requires auth
    if (req.method === "POST" && urlPath === "/api/toilet/save-config") {
        if (req.headers.authorization !== TOILET_PASSWORD) {
            res.writeHead(401)
            return res.end(JSON.stringify({ success: false }))
        }
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", () => {
            try {
                const { rooms, problems } = JSON.parse(body)
                writeJSON(toiletConfigPath, { rooms: rooms || [], problems: problems || [] })
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true }))
            } catch (e) {
                res.writeHead(400)
                res.end(JSON.stringify({ success: false }))
            }
        })
        return
    }

    // ===== Building Inspection Form API =====

    // GET /api/building/config - ดึงข้อมูลโครงสร้าง Form
    if (req.method === "GET" && urlPath === "/api/building/config") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
        return res.end(JSON.stringify({
            success: true,
            config: {
                ITEMS: [
                    "เก็บขยะ กวาดพื้น ถูพื้น",
                    "จัดโต๊ะ เก้าอี้หน้าห้อง",
                    "จัดโต๊ะ เก้าอี้นักเรียน",
                    "ลบกระดาน เก็บแปรงลบ และปากกา",
                    "จัดโต๊ะครู อย่างเป็นระเบียบ เรียบร้อย"
                ],
                SCORES: [
                    { value: 3, label: "ดีมาก", class: "score-3" },
                    { value: 2, label: "พอใช้", class: "score-2" },
                    { value: 1, label: "ปรับปรุง", class: "score-1" },
                    { value: 0, label: "ไม่ผ่าน", class: "score-0" }
                ],
                BUILDINGS: BUILDING_VALID_NUMBERS
            }
        }))
    }

    // GET /api/building/config_v2 - ดึงข้อมูลโครงสร้าง Form สำหรับ v2
    if (req.method === "GET" && urlPath === "/api/building/config_v2") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
        return res.end(JSON.stringify({
            success: true,
            config: {
                ITEMS: [
                    "หลังห้องเรียน",
                    "หลังตู้ล็อกเกอร์(ถ้าห้องนั้นมี)",
                    "หน้าห้องเรียน",
                    "กระดานดำ",
                    "โต๊ะนักเรียน",
                    "การปิดเครื่องใช้ไฟฟ้า"
                ],
                BUILDINGS: BUILDING_VALID_NUMBERS
            }
        }))
    }

    // POST /api/building/upload_image - อัปโหลดรูปภาพขึ้น R2 ทันที
    if (req.method === "POST" && urlPath === "/api/building/upload_image") {
        const ct = req.headers["content-type"] || ""
        if (!ct.includes("multipart/form-data")) {
            res.writeHead(400)
            return res.end(JSON.stringify({success: false, message: "Must be multipart/form-data"}))
        }

        const boundaryMatch = ct.match(/boundary=([^;]+)/)
        if (!boundaryMatch) { 
            res.writeHead(400)
            return res.end(JSON.stringify({ success: false })) 
        }

        let raw = Buffer.alloc(0)
        req.on("data", chunk => raw = Buffer.concat([raw, chunk]))
        req.on("end", async () => {
            try {
                const files = parseMultipart(raw, boundaryMatch[1].trim())
                let uploadedUrl = ""
                
                for (const f of files) {
                    if (f.filename && f.name === "image") {
                        const ts = Date.now()
                        const cleanName = f.filename.replace(/[^a-zA-Z0-9.\-_]/g, "_")
                        const building = f.filename.split('_b')[1]?.split('_')[0] || "u"
                        const room = f.filename.split('_r')[1]?.split('_')[0] || "u"
                        const imageKey = `next9/building_inspections/${ts}_b${building}_r${room}_${cleanName}`
                        const contentType = f.contentType || "image/jpeg"
                        // Fire and forget - do not await to return early
                        uploadBufferToR2(imageKey, f.data, contentType).catch(err => {
                            console.error("[BUILDING] Background R2 upload error:", err)
                        })
                        uploadedUrl = imageKey
                        break;
                    }
                }
                
                if (!uploadedUrl) {
                    res.writeHead(400)
                    return res.end(JSON.stringify({ success: false, message: "No image found" }))
                }

                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                return res.end(JSON.stringify({ success: true, url: uploadedUrl }))
            } catch (e) {
                console.error("Building upload_image error:", e)
                res.writeHead(500)
                return res.end(JSON.stringify({ success: false, message: e.message }))
            }
        })
        return
    }

    // POST /api/building/delete_image - ลบรูปภาพจาก R2
    if (req.method === "POST" && urlPath === "/api/building/delete_image") {
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", async () => {
            try {
                const { url } = JSON.parse(body)
                if (url) {
                    await deleteFromR2(url)
                }
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                return res.end(JSON.stringify({ success: true }))
            } catch (e) {
                console.error("Building delete_image error:", e)
                res.writeHead(500)
                return res.end(JSON.stringify({ success: false, message: e.message }))
            }
        })
        return
    }

    // POST /api/building/submit - บันทึกข้อมูลตรวจอาคารลง DB
    if (req.method === "POST" && urlPath === "/api/building/submit") {
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", async () => {
            try {
                const payload = JSON.parse(body)
                const { date, inspector, building, rooms } = payload

                // Validate required fields
                if (!date || !inspector || !building || !rooms || !Array.isArray(rooms) || rooms.length === 0) {
                    res.writeHead(400)
                    return res.end(JSON.stringify({ success: false, message: "Missing required fields" }))
                }

                // Validate building number against allow-list
                if (!BUILDING_VALID_NUMBERS.includes(String(building))) {
                    res.writeHead(400)
                    return res.end(JSON.stringify({ success: false, message: "Invalid building number" }))
                }

                // Validate each room's data
                for (const room of rooms) {
                    if (!room.room || !room.items || !Array.isArray(room.items) || room.items.length !== 5) {
                        res.writeHead(400)
                        return res.end(JSON.stringify({ success: false, message: "Invalid room data" }))
                    }
                    for (const score of room.items) {
                        const s = Number(score)
                        if (isNaN(s) || s < 0 || s > 3 || !Number.isInteger(s)) {
                            res.writeHead(400)
                            return res.end(JSON.stringify({ success: false, message: "Invalid score value" }))
                        }
                    }
                }

                const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })

                const insertStmt = buildingDb.prepare(`
                    INSERT INTO building_inspections (
                        timestamp, date, inspector, building, room,
                        item1, item2, item3, item4, item5, total, note, images
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `)

                const insertMany = buildingDb.transaction((roomsData) => {
                    for (const room of roomsData) {
                        const items = room.items.map(Number)
                        const total = items.reduce((a, b) => a + b, 0)
                        const noteText = typeof room.note === 'string' ? room.note.slice(0, 500) : ''
                        const imagesJson = JSON.stringify(room.images || [])
                        insertStmt.run(
                            timestamp,
                            date,
                            inspector,
                            String(building),
                            String(room.room),
                            items[0],
                            items[1],
                            items[2],
                            items[3],
                            items[4],
                            total,
                            noteText,
                            imagesJson
                        )
                    }
                })

                insertMany(rooms)

                console.log(`[BUILDING] Submitted ${rooms.length} room(s) for อาคาร ${building}`)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, count: rooms.length }))
            } catch (e) {
                console.error("[BUILDING] submit error:", e.message)
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: "Submit failed" }))
            }
        })
        return
    }

    // GET /api/building/data - ดึงข้อมูลตรวจอาคารจาก database
    if (req.method === "GET" && urlPath === "/api/building/data") {
        try {
            const buildingParam = urlQuery.get("building") || "all"
            const buildings = buildingParam === "all" ? BUILDING_VALID_NUMBERS : [buildingParam]

            // Validate building param
            if (buildingParam !== "all" && !BUILDING_VALID_NUMBERS.includes(buildingParam)) {
                res.writeHead(400)
                return res.end(JSON.stringify({ success: false, message: "Invalid building number" }))
            }

            const placeholders = buildings.map(() => '?').join(',')
            const query = `SELECT * FROM building_inspections WHERE building IN (${placeholders}) ORDER BY timestamp ASC`
            const rows = buildingDb.prepare(query).all(...buildings)

            res.writeHead(200, { 
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
            })
            res.end(JSON.stringify({ success: true, data: rows }))
        } catch (e) {
            console.error("[BUILDING] data error:", e.message)
            res.writeHead(500)
            res.end(JSON.stringify({ success: false, message: "Failed to fetch data" }))
        }
        return
    }

    // POST /api/building/submit_v2 - บันทึกข้อมูลตรวจอาคารลง DB v2
    if (req.method === "POST" && urlPath === "/api/building/submit_v2") {
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", async () => {
            try {
                const payload = JSON.parse(body)
                const { date, inspector1, inspector2, inspector3, building, rooms } = payload
                
                if (!date || !inspector1 || !building || !rooms || !Array.isArray(rooms) || rooms.length === 0) {
                    res.writeHead(400)
                    return res.end(JSON.stringify({ success: false, message: "Missing required fields" }))
                }
                if (!BUILDING_VALID_NUMBERS.includes(String(building))) {
                    res.writeHead(400)
                    return res.end(JSON.stringify({ success: false, message: "Invalid building number" }))
                }

                const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
                
                const insertInspStmt = buildingDb.prepare(`
                    INSERT INTO building_inspections_v2 (
                        timestamp, date, inspector1, inspector2, inspector3, building, floor, room, status, overall_image_url
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `)
                const insertIssueStmt = buildingDb.prepare(`
                    INSERT INTO building_issues_v2 (
                        inspection_id, issue_name, image_url
                    ) VALUES (?, ?, ?)
                `)

                const insertMany = buildingDb.transaction((roomsData) => {
                    for (const r of roomsData) {
                        const info = insertInspStmt.run(
                            timestamp, date, inspector1, inspector2 || "", inspector3 || "",
                            String(building), String(r.floor), String(r.room), String(r.status), String(r.overall_image_url || "")
                        )
                        const inspectionId = info.lastInsertRowid;
                        if (r.issues && Array.isArray(r.issues)) {
                            for (const issue of r.issues) {
                                insertIssueStmt.run(inspectionId, String(issue.name), String(issue.image_url))
                            }
                        }
                    }
                })
                insertMany(rooms)
                
                console.log(`[BUILDING v2] Submitted ${rooms.length} room(s) for อาคาร ${building}`)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, count: rooms.length }))
            } catch (e) {
                console.error("Building submit_v2 error:", e)
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: e.message }))
            }
        })
        return
    }

    // GET /api/building/data_v2 - ดึงข้อมูลตรวจอาคาร v1 & v2
    if (req.method === "GET" && urlPath === "/api/building/data_v2") {
        try {
            const v1Records = buildingDb.prepare("SELECT * FROM building_inspections ORDER BY id DESC").all()
            const v2Records = buildingDb.prepare("SELECT * FROM building_inspections_v2 ORDER BY id DESC").all()
            const v2Issues = buildingDb.prepare("SELECT * FROM building_issues_v2").all()

            // Group issues by inspection_id
            const issuesMap = {}
            for (const issue of v2Issues) {
                if (!issuesMap[issue.inspection_id]) issuesMap[issue.inspection_id] = []
                issuesMap[issue.inspection_id].push(issue)
            }
            
            for (let i = 0; i < v2Records.length; i++) {
                v2Records[i].issues = issuesMap[v2Records[i].id] || []
            }

            res.writeHead(200, { 
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
            })
            res.end(JSON.stringify({ success: true, v1Data: v1Records, v2Data: v2Records }))
        } catch (e) {
            console.error("Building data_v2 error:", e)
            res.writeHead(500)
            res.end(JSON.stringify({ success: false, message: e.message }))
        }
        return
    }

    // POST /api/building/cancel_deduction - ยกเลิกการหักคะแนนสำหรับประเด็นที่ระบุ
    if (req.method === "POST" && urlPath === "/api/building/cancel_deduction") {
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", async () => {
            try {
                const payload = JSON.parse(body)
                const { issue_id, is_cancelled } = payload
                
                if (!issue_id) {
                    res.writeHead(400)
                    return res.end(JSON.stringify({ success: false, message: "Missing issue_id" }))
                }

                buildingDb.prepare("UPDATE building_issues_v2 SET is_cancelled = ? WHERE id = ?").run(is_cancelled ? 1 : 0, issue_id)
                
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true }))
            } catch (e) {
                console.error("Building cancel_deduction error:", e)
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: e.message }))
            }
        })
        return
    }

    // ===== Submit Inert JSON API =====
    const submitInertJsonPath = path.join(dataDir, "submit_inert.json");

    if (req.method === "GET" && urlPath === "/api/submit-inert/data") {
        try {
            if (fs.existsSync(submitInertJsonPath)) {
                const data = fs.readFileSync(submitInertJsonPath, "utf-8");
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(data);
            } else {
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end("[]");
            }
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: e.message }));
        }
        return;
    }

    if (req.method === "POST" && urlPath === "/api/submit-inert/submit") {
        let raw = Buffer.alloc(0)
        req.on("data", chunk => raw = Buffer.concat([raw, chunk]))
        req.on("end", async () => {
            try {
                const ct = req.headers["content-type"]
                if (!ct || !ct.includes("multipart/form-data")) {
                    res.writeHead(400);
                    return res.end(JSON.stringify({ success: false, message: "Invalid Content-Type" }));
                }

                const boundaryMatch = ct.match(/boundary=([^;]+)/)
                if (!boundaryMatch) { res.writeHead(400); return res.end(JSON.stringify({ success: false })) }
                
                const files = parseMultipart(raw, boundaryMatch[1].trim())
                
                let reporter = "";
                let classes = "[]";
                let id = "";
                let date_str = "";
                let fileBuf = null;
                let fileName = "";
                let contentType = "";

                console.log("FILES PARSED:", files.map(f => ({ name: f.name, isFile: !!f.filename, dataLen: f.data.length, dataStr: f.data.toString("utf8") }))); files.forEach(f => {
                    if (f.filename) {
                        fileBuf = f.data;
                        fileName = f.filename;
                        contentType = f.contentType || "image/jpeg";
                    } else if (f.name === "reporter") reporter = f.data.toString("utf-8").trim();
                    else if (f.name === "classes") classes = f.data.toString("utf-8").trim();
                    else if (f.name === "id") id = f.data.toString("utf-8").trim();
                    else if (f.name === "date_str") date_str = f.data.toString("utf-8").trim();
                });

                if (!reporter) {
                    res.writeHead(400); return res.end(JSON.stringify({ success: false, message: "Missing reporter" }));
                }

                let parsedClasses = [];
                try { parsedClasses = JSON.parse(classes); } catch (e) {}

                let dbData = [];
                if (fs.existsSync(submitInertJsonPath)) {
                    try { dbData = JSON.parse(fs.readFileSync(submitInertJsonPath, "utf-8")); } catch (e) {}
                }

                let imageKey = "";
                if (fileBuf) {
                    const ts = Date.now();
                    const cleanName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
                    imageKey = `next9/submit_inert/${ts}_${cleanName}`;
                    await uploadBufferToR2(imageKey, fileBuf, contentType);
                }

                const nowISO = new Date().toISOString();
                
                if (id) {
                    // Edit mode
                    const idx = dbData.findIndex(d => d.id === id);
                    if (idx !== -1) {
                        dbData[idx].reporter = reporter;
                        dbData[idx].classes = parsedClasses;
                        if (imageKey) {
                            dbData[idx].image_key = imageKey;
                        }
                        dbData[idx].updated_at = nowISO;
                    } else {
                        res.writeHead(404); return res.end(JSON.stringify({ success: false, message: "Record not found" }));
                    }
                } else {
                    // Create new
                    if (!imageKey) {
                        res.writeHead(400); return res.end(JSON.stringify({ success: false, message: "Missing image file" }));
                    }
                    
                    if (!date_str) {
                        // Use BKK Date as default string representation
                        const bkkDate = new Date(Date.now() + 7 * 60 * 60 * 1000);
                        date_str = bkkDate.toISOString().split('T')[0];
                    }

                    // We allow multiple submissions per day
                    dbData.push({
                        id: Date.now().toString() + Math.floor(Math.random()*1000),
                        date_str: date_str,
                        timestamp: nowISO,
                        reporter: reporter,
                        classes: parsedClasses,
                        image_key: imageKey,
                        updated_at: nowISO
                    });
                }

                fs.writeFileSync(submitInertJsonPath, JSON.stringify(dbData, null, 2), "utf-8");

                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ success: true }));

            } catch (error) {
                console.error("[SUBMIT_INERT] Error:", error);
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: error.message }));
            }
        });
        return;
    }

    if (req.method === "POST" && urlPath === "/api/submit-inert/admin-override") {
        let raw = Buffer.alloc(0)
        req.on("data", chunk => raw = Buffer.concat([raw, chunk]))
        req.on("end", () => {
            try {
                const body = JSON.parse(raw.toString("utf-8"));
                const date_str = body.date_str;
                
                let dbData = [];
                if (fs.existsSync(submitInertJsonPath)) {
                    try { dbData = JSON.parse(fs.readFileSync(submitInertJsonPath, "utf-8")); } catch (e) {}
                }

                const existingOverrideIndex = dbData.findIndex(d => d.date_str === date_str && d.is_admin_override);
                
                if (existingOverrideIndex !== -1) {
                    // Toggle OFF
                    dbData.splice(existingOverrideIndex, 1);
                } else {
                    // Toggle ON
                    const nowISO = new Date().toISOString();
                    const allClasses = [
                        "ข้างอ.5 ม.1", "ข้างอ.5 ม.2", "ข้างอ.5 ม.3", "ข้างอ.5 ม.4", "ข้างอ.5 ม.5", "ข้างอ.5 ม.6",
                        "หลังโดม ม.1", "หลังโดม ม.2", "หลังโดม ม.3", "หลังโดม ม.4", "หลังโดม ม.5", "หลังโดม ม.6"
                    ];
                    dbData.push({
                        id: "override_" + Date.now().toString(),
                        date_str: date_str,
                        timestamp: nowISO,
                        reporter: "แอดมินยืนยันครบ",
                        classes: allClasses,
                        image_key: "", 
                        updated_at: nowISO,
                        is_admin_override: true
                    });
                }

                fs.writeFileSync(submitInertJsonPath, JSON.stringify(dbData, null, 2), "utf-8");
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                res.writeHead(500); res.end(JSON.stringify({ success: false, message: err.message }));
            }
        });
        return;
    }

    if (req.method === "DELETE" && urlPath === "/api/submit-inert/delete") {
        try {
            const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
            const id = parsedUrl.searchParams.get("id");
            if (!id) {
                res.writeHead(400);
                return res.end(JSON.stringify({ success: false, message: "Missing id" }));
            }
            
            let dbData = [];
            if (fs.existsSync(submitInertJsonPath)) {
                try { dbData = JSON.parse(fs.readFileSync(submitInertJsonPath, "utf-8")); } catch (e) {}
            }
            
            const initialLength = dbData.length;
            dbData = dbData.filter(d => d.id !== id);
            
            if (dbData.length !== initialLength) {
                fs.writeFileSync(submitInertJsonPath, JSON.stringify(dbData, null, 2), "utf-8");
            }
            
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: true }));
        } catch (error) {
            console.error("[SUBMIT_INERT] Delete Error:", error);
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, message: error.message }));
        }
        return;
    }

    // ===== Inert Form API =====

    // GET /api/inert/config - ดึงข้อมูล Config ของฟอร์ม
    if (req.method === "GET" && urlPath === "/api/inert/config") {
        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
        })
        
        let configData = {
            COLUMNS: [
                { header: "ประทับเวลา", source: "timestamp" },
                { header: "วันที่", source: "dateFormatted" },
                { header: "ชื่อผู้ตรวจ", source: "inspector" },
                { header: "รหัสประจำตัวนักเรียน", source: "studentId" },
                { header: "ชื่อ - สกุล", source: "name" },
                { header: "ชั้น", source: "cls" },
                { header: "ห้อง", source: "room" },
                { header: "เลขที่", source: "number" },
                { header: "สาย - เฉื่อย", source: "typeVal" },
                { header: "รายการผิดระเบียบ", source: "violations" }
            ],
            TYPES: ["เฉื่อย", "สาย", "ไม่เข้าแถวหน้าเสาธง", "อื่นๆ"],
            VIOLATIONS: ["ไม่ผูกโบว์", "กระเป๋าผิดระเบียบ", "รองเท้าผิดระเบียบ", "ถุงเท้าผิดระเบียบ", "ทรงผมผิดระเบียบ", "อื่นๆ"]
        };
        
        try {
            if (fs.existsSync(inertConfigPath)) {
                configData = JSON.parse(fs.readFileSync(inertConfigPath, "utf-8"));
            }
        } catch (e) {
            console.error("Failed to read inert config", e);
        }

        if (!configData.SHEET_ID) configData.SHEET_ID = INERT_SHEET_ID;
        if (!configData.SHEET_RANGE) configData.SHEET_RANGE = INERT_SHEET_RANGE;
        if (!configData.SHEET_JUNIOR_RANGE) configData.SHEET_JUNIOR_RANGE = INERT_SHEET_JUNIOR_RANGE;
        if (!configData.SHEET_HIGH_RANGE) configData.SHEET_HIGH_RANGE = INERT_SHEET_HIGH_RANGE;

        if (!configData.terms) {
            configData.terms = {
                "1": {
                    SHEET_ID: configData.SHEET_ID || "",
                    SHEET_RANGE: configData.SHEET_RANGE || "Sheet1",
                    SHEET_JUNIOR_RANGE: configData.SHEET_JUNIOR_RANGE || "ม.ต้น",
                    SHEET_HIGH_RANGE: configData.SHEET_HIGH_RANGE || "ม.ปลาย"
                },
                "2": {
                    SHEET_ID: configData.SHEET_ID || "",
                    SHEET_RANGE: configData.SHEET_RANGE || "Sheet1",
                    SHEET_JUNIOR_RANGE: configData.SHEET_JUNIOR_RANGE || "ม.ต้น",
                    SHEET_HIGH_RANGE: configData.SHEET_HIGH_RANGE || "ม.ปลาย"
                }
            };
        }

        return res.end(JSON.stringify({
            success: true,
            config: configData
        }))
    }

    // POST /api/inert/config - บันทึกข้อมูล Config ของฟอร์ม
    if (req.method === "POST" && urlPath === "/api/inert/config") {
        if (req.headers.authorization !== EDITOR_PASSWORD) {
            res.writeHead(401); 
            return res.end(JSON.stringify({ success: false, message: "Unauthorized" }));
        }

        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", () => {
            try {
                const newConfig = JSON.parse(body);
                
                // Merge with existing config to preserve TYPES and VIOLATIONS
                let existingConfig = {
                    COLUMNS: [
                        { header: "ประทับเวลา", source: "timestamp" },
                        { header: "วันที่", source: "dateFormatted" },
                        { header: "ชื่อผู้ตรวจ", source: "inspector" },
                        { header: "รหัสประจำตัวนักเรียน", source: "studentId" },
                        { header: "ชื่อ - สกุล", source: "name" },
                        { header: "ชั้น", source: "cls" },
                        { header: "ห้อง", source: "room" },
                        { header: "เลขที่", source: "number" },
                        { header: "สาย - เฉื่อย", source: "typeVal" },
                        { header: "รายการผิดระเบียบ", source: "violations" }
                    ],
                    TYPES: ["เฉื่อย", "สาย", "ไม่เข้าแถวหน้าเสาธง", "อื่นๆ"],
                    VIOLATIONS: ["ไม่ผูกโบว์", "กระเป๋าผิดระเบียบ", "รองเท้าผิดระเบียบ", "ถุงเท้าผิดระเบียบ", "ทรงผมผิดระเบียบ", "อื่นๆ"]
                };
                if (fs.existsSync(inertConfigPath)) {
                    existingConfig = { ...existingConfig, ...JSON.parse(fs.readFileSync(inertConfigPath, "utf-8")) };
                }
                const finalConfig = { ...existingConfig, ...newConfig };

                fs.writeFileSync(inertConfigPath, JSON.stringify(finalConfig, null, 2), "utf-8");
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                console.error("Failed to save inert config", e);
                res.writeHead(500);
                res.end(JSON.stringify({ success: false, message: "Failed to save config" }));
            }
        });
        return;
    }

    // GET /api/inert/sheet-data - ดึงข้อมูลจาก Google Sheet (สำหรับ auto-fill source)
    if (req.method === "GET" && urlPath === "/api/inert/sheet-data") {
        ;(async () => {
            try {
                if (!getEffectiveInertSheetId() || !SERVICE_ACCOUNT) {
                    res.writeHead(503)
                    return res.end(JSON.stringify({ success: false, message: "Google Sheets not configured" }))
                }
                const ranges = getEffectiveInertRanges()
                const sheetConfig = getInertSheetConfig(ranges.lookup)
                const rows = await readSheet(sheetConfig)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, data: rows }))
            } catch (e) {
                console.error("[INERT] sheet-data error:", e.message)
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: "Failed to read sheet" }))
            }
        })()
        return
    }

    // GET /api/students/search?q=xxx - Auto-fill: ค้นหาจาก local JSON (รวดเร็วกว่าและไม่เปลืองโควต้า)
    if (req.method === "GET" && urlPath === "/api/students/search") {
        const query = (urlQuery.get("q") || "").trim().toLowerCase();
        if (!query) {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            return res.end(JSON.stringify({ success: true, results: [] }));
        }

        const results = [];
        for (const student of globalStudentsData) {
            if (
                student.studentId.includes(query) ||
                (student.name && student.name.toLowerCase().includes(query)) ||
                (student.firstName && student.firstName.toLowerCase().includes(query)) ||
                (student.lastName && student.lastName.toLowerCase().includes(query))
            ) {
                results.push(student);
                if (results.length >= 10) break; // Limit to 10 results for performance
            }
        }

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({ success: true, results }));
    }

    // GET /api/inert/report - ดึงข้อมูลสรุปการส่งฟอร์มที่ประมวลผลแล้ว
    // Helper: convert Google Sheets serial date number to DD/MM/YYYY
    function formatInertDate(raw) {
        if (!raw) return '';
        const str = String(raw).trim();
        // Already formatted date string (contains /)
        if (str.includes('/')) return str;
        // Numeric serial date (e.g. 46322 = days since 1899-12-30)
        const num = Number(str);
        if (!isNaN(num) && num > 1000 && num < 999999) {
            const d = new Date(Math.round((num - 25569) * 86400 * 1000));
            if (!isNaN(d.getTime())) {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                return `${dd}/${mm}/${d.getFullYear()}`;
            }
        }
        return str;
    }

    if (req.method === "GET" && urlPath === "/api/inert/report") {
        ;(async () => {
            try {
                const term = urlQuery.get("term") || "2";
                if (!getEffectiveInertSheetId(term) || !SERVICE_ACCOUNT) {
                    res.writeHead(503)
                    return res.end(JSON.stringify({ success: false, message: "Google Sheets not configured" }))
                }
                const ranges = getEffectiveInertRanges(term);
                const type = urlQuery.get("type") || "all";
                let range = ranges.all;
                if (type === "junior") range = ranges.junior;
                else if (type === "high") range = ranges.high;

                const sheetConfig = getInertSheetConfig(range, term)
                const rows = await readSheet(sheetConfig)
                
                if (!rows || rows.length <= 2) {
                    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                    return res.end(JSON.stringify({ success: true, data: [] }));
                }

                const headers = rows[1];
                const dataRows = rows.slice(2);
                
                const h = {};
                headers.forEach((hdr, idx) => {
                    if (hdr === "วันที่") h.dateFormatted = idx;
                    else if (hdr === "รหัสประจำตัว") h.studentId = idx;
                    else if (hdr.includes("ชื่อ - สกุล")) h.name = idx;
                    else if (hdr === "ชั้น") h.cls = idx;
                    else if (hdr === "ห้อง") h.room = idx;
                    else if (hdr === "รายการผิดระเบียบ") h.violations = idx;
                });

                const parsed = dataRows.map(row => {
                    const sid = String(row[h.studentId] || '').trim();
                    const sheetName = (row[h.name] || '').trim();
                    const violationsText = row[h.violations] || '';
                    
                    let studentInfo = null;
                    if (sid) {
                        studentInfo = globalStudentsData.find(st => st.studentId === sid);
                    }
                    if (!studentInfo && sheetName) {
                        for (const st of globalStudentsData) {
                            if (st.firstName && st.lastName && 
                                sheetName.includes(st.firstName) && 
                                sheetName.includes(st.lastName)) {
                                studentInfo = st;
                                break;
                            }
                        }
                    }

                    let displayName = sheetName;
                    if (studentInfo && studentInfo.name) {
                        displayName = studentInfo.name;
                    }

                    const clsVal = row[h.cls] || (studentInfo ? `ม.${studentInfo.class}` : '');
                    const roomVal = (studentInfo && studentInfo.room) ? String(studentInfo.room) : (row[h.room] || '');

                    return {
                        date: formatInertDate(row[h.dateFormatted] || ''),
                        studentId: sid,
                        name: displayName,
                        cls: clsVal,
                        room: roomVal,
                        number: (studentInfo && studentInfo.number) || '',
                        classType: (studentInfo && studentInfo.classType) || '',
                        prefix: (studentInfo && studentInfo.prefix) || '',
                        violations: violationsText,
                        classNum: parseInt((clsVal || '').replace(/\D/g, '')) || (studentInfo ? studentInfo.class : 0),
                        roomNum: parseInt(roomVal) || 0
                    };
                });

                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, data: parsed }))
            } catch (e) {
                console.error("[INERT] report error:", e.message)
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: "Failed to generate report" }))
            }
        })()
        return
    }

    // GET /api/inert/submissions - ดึงข้อมูลสรุปการส่งฟอร์ม (สาย-เฉื่อย) สำหรับหน้า viewforms
    if (req.method === "GET" && urlPath === "/api/inert/submissions") {
        ;(async () => {
            try {
                if (!getEffectiveInertSheetId() || !SERVICE_ACCOUNT) {
                    res.writeHead(503)
                    return res.end(JSON.stringify({ success: false, message: "Google Sheets not configured" }))
                }
                const ranges = getEffectiveInertRanges();
                const type = urlQuery.get("type") || "all";
                let range = ranges.all;
                if (type === "junior") range = ranges.junior;
                else if (type === "high") range = ranges.high;

                const sheetConfig = getInertSheetConfig(range)
                const rows = await readSheet(sheetConfig)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, data: rows }))
            } catch (e) {
                console.error("[INERT] submissions error:", e.message)
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: "Failed to read sheet" }))
            }
        })()
        return
    }

    // GET /api/inert/lookup?q=xxx - Auto-fill: ค้นหาจาก Sheet data
    if (req.method === "GET" && urlPath === "/api/inert/lookup") {
        const query = (urlQuery.get("q") || "").trim().toLowerCase()
        if (!query) {
            res.writeHead(400)
            return res.end(JSON.stringify({ success: false, message: "Missing query" }))
        }
        ;(async () => {
            try {
                if (!getEffectiveInertSheetId() || !SERVICE_ACCOUNT) {
                    res.writeHead(503)
                    return res.end(JSON.stringify({ success: false, message: "Google Sheets not configured" }))
                }
                const ranges = getEffectiveInertRanges();
                const sheetConfig = getInertSheetConfig(ranges.lookup)
                const rows = await readSheet(sheetConfig)
                if (rows.length === 0) {
                    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                    return res.end(JSON.stringify({ success: true, results: [] }))
                }
                // Row 0 = headers, rest = data
                const headers = rows[0]
                const results = []
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i]
                    // ค้นหาในทุก column
                    const match = row.some(cell => (cell || "").toLowerCase().includes(query))
                    if (match) {
                        const obj = {}
                        headers.forEach((h, idx) => { obj[h] = row[idx] || "" })
                        results.push(obj)
                    }
                }
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, results }))
            } catch (e) {
                console.error("[INERT] lookup error:", e.message)
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: "Lookup failed" }))
            }
        })()
        return
    }

    // POST /api/inert/submit - ส่งข้อมูลแบบฟอร์มไป Google Sheet (multi-row)
    if (req.method === "POST" && urlPath === "/api/inert/submit") {
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", async () => {
            try {
                if (!getEffectiveInertSheetId() || !SERVICE_ACCOUNT) {
                    res.writeHead(503)
                    return res.end(JSON.stringify({ success: false, message: "Google Sheets not configured" }))
                }
                const payload = JSON.parse(body)
                const { headers, sources, rows } = payload
                if (!headers || !rows || !Array.isArray(headers) || !Array.isArray(rows) || rows.length === 0) {
                    res.writeHead(400)
                    return res.end(JSON.stringify({ success: false, message: "Invalid payload: need headers[] and rows[]" }))
                }

                const ranges = getEffectiveInertRanges();
                const sheetConfig = getInertSheetConfig(ranges.all)
                const existing = await readSheet(sheetConfig)

                // ถ้า sheet ยังว่าง → สร้าง header row ก่อน
                if (existing.length === 0) {
                    await appendSheet(sheetConfig, [headers])
                }

                // Append ทุก rows ไปที่ชีตรวม
                const appendRes1 = await appendSheet(sheetConfig, rows)
                await formatAppendedRows(sheetConfig, appendRes1, sources).catch(e => console.error("Format error:", e))

                // หา index ของคอลัมน์ "ชั้น" (cls) เพื่อแยก ม.ต้น / ม.ปลาย
                let clsIndex = 5; // default fallback
                if (sources && sources.indexOf('cls') !== -1) {
                    clsIndex = sources.indexOf('cls');
                } else if (headers) {
                    const idx = headers.findIndex(h => h.includes('ชั้น'));
                    if (idx !== -1) clsIndex = idx;
                }

                // แยกข้อมูล ม.ต้น และ ม.ปลาย
                const juniorRows = rows.filter(r => r[clsIndex] === 'ม.1' || r[clsIndex] === 'ม.2' || r[clsIndex] === 'ม.3')
                const highRows = rows.filter(r => r[clsIndex] === 'ม.4' || r[clsIndex] === 'ม.5' || r[clsIndex] === 'ม.6')

                if (juniorRows.length > 0) {
                    const juniorConfig = getInertSheetConfig(ranges.junior)
                    const existingJunior = await readSheet(juniorConfig)
                    if (existingJunior.length === 0) await appendSheet(juniorConfig, [headers])
                    const appendRes2 = await appendSheet(juniorConfig, juniorRows)
                    await formatAppendedRows(juniorConfig, appendRes2, sources).catch(e => console.error("Format error:", e))
                }

                if (highRows.length > 0) {
                    const highConfig = getInertSheetConfig(ranges.high)
                    const existingHigh = await readSheet(highConfig)
                    if (existingHigh.length === 0) await appendSheet(highConfig, [headers])
                    const appendRes3 = await appendSheet(highConfig, highRows)
                    await formatAppendedRows(highConfig, appendRes3, sources).catch(e => console.error("Format error:", e))
                }

                console.log(`[INERT] Submitted ${rows.length} row(s) to Google Sheets (Junior: ${juniorRows.length}, High: ${highRows.length})`)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, count: rows.length }))
            } catch (e) {
                console.error("[INERT] submit error:", e.message)
                res.writeHead(500)
                res.end(JSON.stringify({ success: false, message: "Submit failed" }))
            }
        })
        return
    }

    // ===== Album OG Injector =====
    // Social crawlers (LINE, Facebook, Discord, Twitter/X, ...) don't execute client-side JS, so the
    // rich-preview meta tags have to be baked into the HTML server-side before it's sent.
    // Link-preview data (Open Graph) for an album link. Used by the legacy album page below and, through
    // GET /api/photos/og?id=, by the Next.js album page, so shared links keep their preview card.
    function albumPreview(albumId) {
        const album = albumId && photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(albumId);
        if (!album) return null;
        const title = `${album.name} - NEXT9 Photos`;
        const desc = "ดูรูปภาพและวิดีโอในอัลบั้มนี้บน NEXT9";
        const pageUrl = `https://next9.yumistack.net/photos/album/?id=${encodeURIComponent(albumId)}`;
        // CRITICAL: a locked album must never leak a real photo through the preview image,
        // even though photo URLs aren't secret-key-protected — the whole point of locking an
        // album is that its contents shouldn't be visible without the password, and an OG
        // image bypasses that entirely (crawlers, then anyone with the share link, would see
        // a photo from inside a "locked" album without ever entering it).
        let image = "https://cdn.yumistack.net/next9/logo01.webp";
        if (!isAlbumPathLocked(album)) {
            const firstPhoto = photosDb.prepare("SELECT id FROM images WHERE album_id = ? AND processing_status = 'done' AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at DESC LIMIT 1").get(albumId);
            if (firstPhoto) image = `https://next9.yumistack.net/api/image/${firstPhoto.id}/medium`;
        }
        return { title, description: desc, url: pageUrl, image };
    }

    // Share links (/s/?t=). Unlike albumPreview, the photo is shown even when the album is locked: the
    // owner created this link to publish exactly that album or photo, and the link opens it without a
    // password anyway, so the preview reveals nothing the link doesn't.
    function sharePreview(token) {
        const m = shareLinkMeta(token);
        const pageUrl = `https://next9.yumistack.net/s/?t=${encodeURIComponent(token)}`;
        if (!m.ok) {
            const title = m.reason === "expired" ? "ลิงก์นี้หมดอายุแล้ว" : "ลิงก์นี้ใช้ไม่ได้แล้ว";
            return { title: `${title} - NEXT9`, description: "ลิงก์ที่แชร์จาก NEXT9 Photos", url: pageUrl, image: "https://cdn.yumistack.net/next9/logo01.webp", type: "website", valid: false };
        }
        const parts = [];
        let description, type = "website";
        if (m.kind === "album") {
            if (m.photos) parts.push(`${m.photos.toLocaleString("en-US")} รูป`);
            if (m.videos) parts.push(`${m.videos.toLocaleString("en-US")} วิดีโอ`);
            if (m.subfolders) parts.push(`${m.subfolders} โฟลเดอร์ย่อย`);
            description = `อัลบั้มรูป NEXT9` + (parts.length ? ` · ${parts.join(" · ")}` : "");
        } else {
            if (m.fileType === "video") type = "video.other";
            description = (m.fileType === "video" ? "วิดีโอจาก NEXT9" : "รูปภาพจาก NEXT9") + (m.albumName ? ` · อัลบั้ม ${m.albumName}` : "");
        }
        // ?v= changes when the cover changes, so crawlers that cache by URL pick up the new picture.
        const image = m.imageId
            ? `https://next9.yumistack.net/api/share/${encodeURIComponent(token)}/og.jpg?v=${encodeURIComponent(m.imageId)}`
            : "https://cdn.yumistack.net/next9/logo01.webp";
        return {
            title: m.title, description, url: pageUrl, image, type, valid: true,
            imageWidth: m.imageId ? OG_W : null, imageHeight: m.imageId ? OG_H : null,
        };
    }

    // GET /api/photos/og?id=<albumId> | ?share=<token> — link preview data for the web pages' metadata.
    if (req.method === "GET" && urlPath === "/api/photos/og") {
        let preview = null;
        try {
            const share = urlQuery.get("share");
            preview = share ? (/^[A-Za-z0-9_-]{8,40}$/.test(share) ? sharePreview(share) : null) : albumPreview(urlQuery.get("id"));
        } catch (err) { console.error(err); }
        res.writeHead(preview ? 200 : 404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(JSON.stringify(preview ? { success: true, ...preview } : { success: false }));
    }

    if (req.method === "GET" && (urlPath === "/photos/album" || urlPath === "/photos/album/" || urlPath === "/photos/album/index.html")) {
        let html = "";
        try {
            html = fs.readFileSync(path.join(__dirname, "photos/album/index.html"), "utf-8");
            const preview = albumPreview(urlQuery.get("id"));
            if (preview) {
                const { title, description: desc, url: pageUrl, image } = preview;
                const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const titleAttr = esc(title), descAttr = esc(desc), imageAttr = esc(image), urlAttr = esc(pageUrl);

                // Match whatever <title> the page has (a fixed-string match silently broke when the title text changed);
                // a replacer function keeps "$" in album names from being read as a replacement pattern.
                html = html.replace(/<title>[^<]*<\/title>/i, () =>
`<title>${titleAttr}</title>
    <meta property="og:type" content="website">
    <meta property="og:url" content="${urlAttr}">
    <meta property="og:title" content="${titleAttr}">
    <meta property="og:description" content="${descAttr}">
    <meta property="og:image" content="${imageAttr}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${titleAttr}">
    <meta name="twitter:description" content="${descAttr}">
    <meta name="twitter:image" content="${imageAttr}">`);
            }
        } catch (err) {
            console.error(err);
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache" });
        return res.end(html);
    }

    // ===== Photos Album API =====
    // GET /api/dev-r2/<key> — dev read-only mode only: serves objects written to the local overlay,
    // standing in for the signed R2 URL the real bucket would have answered. Supports Range so dev
    // videos seek like they do from R2.
    if (DEV_READONLY && req.method === "GET" && urlPath.startsWith("/api/dev-r2/")) {
        const key = urlPath.slice("/api/dev-r2/".length).split("/").map(decodeURIComponent).join("/")
        const file = devOverlayPath(key)
        if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end("Not Found") }
        const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic", ".heif": "image/heif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/x-m4v", ".webm": "video/webm", ".json": "application/json" }
        const size = fs.statSync(file).size
        const headers = { "Content-Type": types[path.extname(file).toLowerCase()] || "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "no-store" }
        const disposition = urlQuery.get("disposition")
        if (disposition) headers["Content-Disposition"] = disposition
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "")
        if (range && size > 0) {
            const start = range[1] === "" ? Math.max(0, size - Number(range[2])) : Number(range[1])
            const end = range[1] !== "" && range[2] !== "" ? Math.min(Number(range[2]), size - 1) : size - 1
            if (start > end || start >= size) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end() }
            res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 })
            return fs.createReadStream(file, { start, end }).pipe(res)
        }
        res.writeHead(200, { ...headers, "Content-Length": size })
        return fs.createReadStream(file).pipe(res)
    }

    const imageServeMatch = urlPath.match(/^\/api\/image\/([^/]+)\/(preview|thumb|sd|medium|4k|original|renditions|v\d{3,4}|vmax\d{3,4})$/)
    const albumIdMatch = urlPath.match(/^\/api\/photos\/albums\/([^/]+)$/)
    const albumImagesMatch = urlPath.match(/^\/api\/photos\/albums\/([^/]+)\/images$/)
    const uploadMatch = urlPath.match(/^\/api\/photos\/upload\/([^/]+)$/)
    const deleteImageMatch = urlPath.match(/^\/api\/photos\/images\/([^/]+)$/)
    const convertMatch = urlPath.match(/^\/api\/photos\/images\/([^/]+)\/convert$/)
    const retryMatch = urlPath.match(/^\/api\/photos\/images\/([^/]+)\/retry$/)

    // POST /api/photos/verify
    if (req.method === "POST" && urlPath === "/api/photos/verify") {
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", () => {
            try {
                const { password } = JSON.parse(body)
                if (password === PHOTOS_PASSWORD) {
                    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                    res.end(JSON.stringify({ success: true }))
                } else {
                    res.writeHead(401)
                    res.end(JSON.stringify({ success: false }))
                }
            } catch (e) { res.writeHead(400); res.end("Invalid JSON") }
        })
        return
    }

    // GET /api/photos/albums?search=&sort=default|updated_desc|updated_asc|created_desc|created_asc|count_desc|count_asc
    if (req.method === "GET" && urlPath === "/api/photos/albums") {
        // Flat list of every album the request may see (the client builds the folder tree).
        // ?parent=root|<id> narrows it to one level.
        const byId = loadAlbumMap()
        const parentParam = urlQuery.get("parent")
        let albums = [...byId.values()].filter(a => !a.name.startsWith('[DELETED] '))
        if (parentParam) {
            const wanted = parentParam === "root" ? null : parentParam
            albums = albums.filter(a => (a.parent_id || null) === wanted)
        }
        albums.sort((a, b) => (b.event_date || b.created_at) - (a.event_date || a.created_at) || b.updated_at - a.updated_at)
        // The list page polls this; an unchanged list costs a 304 with no body instead of the full JSON.
        const body = JSON.stringify(serializeAlbums(req, albums, byId))
        const etag = '"' + crypto.createHash("sha1").update(body).digest("base64url") + '"'
        if (req.headers["if-none-match"] === etag) {
            res.writeHead(304, { ETag: etag, "Cache-Control": "no-cache" })
            return res.end()
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", ETag: etag, "Cache-Control": "no-cache" })
        return res.end(body)
    }

    // POST /api/photos/albums/:id/pin  { pinned: true|false } — pinned albums list first for everyone
    const pinMatch = urlPath.match(/^\/api\/photos\/albums\/([^/]+)\/pin$/)
    if (req.method === "POST" && pinMatch) {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", () => {
            try {
                const { pinned } = JSON.parse(body || "{}")
                const album = photosDb.prepare("SELECT id FROM albums WHERE id = ? AND name NOT LIKE '[DELETED] %'").get(pinMatch[1])
                if (!album) { res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }); return res.end(JSON.stringify({ success: false })) }
                const pinnedAt = pinned ? Date.now() : null
                photosDb.prepare("UPDATE albums SET pinned_at = ? WHERE id = ?").run(pinnedAt, album.id)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, pinned_at: pinnedAt }))
            } catch (e) { res.writeHead(400); res.end(JSON.stringify({ success: false })) }
        })
        return
    }

    // POST /api/photos/albums
    if (req.method === "POST" && urlPath === "/api/photos/albums") {
        const admin = isAdminReq(req)
        const editor = !admin && shareEditorFor(req)
        if (!admin && !editor) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", () => {
            try {
                const { name, event_date, parent_id } = JSON.parse(body)
                if (!name || !name.trim()) { res.writeHead(400); return res.end(JSON.stringify({ success: false, message: "Name required" })) }
                let parentId = null
                // An editor link can add a folder only where the link would then show it: inside the shared
                // album, on a link that includes sub-folders.
                if (editor && (!parent_id || !editor.include_subfolders || !shareEditorCovers(req, parent_id))) { res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" }); return res.end(JSON.stringify({ success: false, message: "ลิงก์นี้สร้างโฟลเดอร์ตรงนี้ไม่ได้" })) }
                if (parent_id) {
                    const parent = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(parent_id)
                    if (!parent || parent.name.startsWith('[DELETED] ')) { res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }); return res.end(JSON.stringify({ success: false, message: "ไม่พบโฟลเดอร์ปลายทาง" })) }
                    if (admin && !validateAlbumAccess(req, parent)) { res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" }); return res.end(JSON.stringify({ success: false, locked: true, message: "โฟลเดอร์ปลายทางถูกล็อก" })) }
                    parentId = parent.id
                }
                const id = generateId()
                const now = Date.now()
                const evtDate = event_date ? parseInt(event_date) : now
                photosDb.prepare("INSERT INTO albums (id, name, photo_count, created_at, updated_at, event_date, parent_id) VALUES (?, ?, 0, ?, ?, ?, ?)").run(id, name.trim(), now, now, evtDate, parentId)
                if (parentId) photosDb.prepare("UPDATE albums SET updated_at = ? WHERE id = ?").run(now, parentId)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, album: { id, name: name.trim(), parent_id: parentId, photo_count: 0, created_at: now, updated_at: now, event_date: evtDate } }))
            } catch (e) { res.writeHead(400); res.end(JSON.stringify({ success: false })) }
        })
        return
    }
    // ===== Trash =====
    // GET /api/photos/trash?offset=&limit= — deleted folders (one entry per delete) and individually deleted files
    if (req.method === "GET" && urlPath === "/api/photos/trash") {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        const byId = loadAlbumMap()
        const strip = str => String(str || "").replace(/^\[DELETED\] /, "")
        const expiresAt = t => (t || Date.now()) + TRASH_RETENTION_MS
        const countImages = photosDb.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN file_type = 'video' THEN 1 ELSE 0 END) AS videos FROM images WHERE trash_root_id = ?")
        const firstImage = photosDb.prepare("SELECT id FROM images WHERE trash_root_id = ? AND COALESCE(file_type, 'image') != 'video' ORDER BY created_at DESC LIMIT 1")
        const all = [...byId.values()]
        const albums = all
            .filter(a => a.name.startsWith('[DELETED] ') && a.trash_root_id === a.id)
            .sort((a, b) => (b.deleted_at || 0) - (a.deleted_at || 0))
            .map(a => {
                const parent = a.parent_id ? byId.get(a.parent_id) : null
                const locked = !!findLockGate(req, a, byId)
                const c = countImages.get(a.id)
                const cover = locked ? null : firstImage.get(a.id)
                return {
                    id: a.id, name: strip(a.name), deleted_at: a.deleted_at, expires_at: expiresAt(a.deleted_at),
                    from: parent && !parent.name.startsWith('[DELETED] ') ? { id: parent.id, name: parent.name } : null,
                    folders: all.filter(x => x.trash_root_id === a.id).length - 1,
                    items: c.n, videos: c.videos || 0, locked, cover_id: cover ? cover.id : null
                }
            })
        const offset = Math.max(0, parseInt(urlQuery.get("offset") || "0") || 0)
        const limit = Math.min(Math.max(1, parseInt(urlQuery.get("limit") || "200") || 200), 500)
        const where = "original_name LIKE '[DELETED] %' AND trash_root_id IS NULL"
        const imageTotal = photosDb.prepare(`SELECT COUNT(*) AS n FROM images WHERE ${where}`).get().n
        const images = photosDb.prepare(`SELECT id, album_id, original_name, file_type, width, height, size_bytes, deleted_at FROM images WHERE ${where} ORDER BY deleted_at DESC, id LIMIT ? OFFSET ?`)
            .all(limit, offset)
            .map(i => {
                const album = byId.get(i.album_id)
                return {
                    id: i.id, name: strip(i.original_name), file_type: i.file_type || "image", width: i.width, height: i.height, size_bytes: i.size_bytes,
                    deleted_at: i.deleted_at, expires_at: expiresAt(i.deleted_at),
                    album: album ? { id: album.id, name: strip(album.name), alive: !album.name.startsWith('[DELETED] ') } : null,
                    locked: !!(album && findLockGate(req, album, byId))
                }
            })
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
        return res.end(JSON.stringify({ success: true, retention_days: 30, albums, images, image_total: imageTotal, next_offset: offset + images.length < imageTotal ? offset + images.length : null }))
    }

    // POST /api/photos/trash/restore  { albums: [trashed album ids], images: [ids] }
    if (req.method === "POST" && urlPath === "/api/photos/trash/restore") {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        ;(async () => {
            const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) }
            try {
                const { albums = [], images = [] } = JSON.parse(String(await collectBody(req)) || "{}")
                const byId = loadAlbumMap()
                const now = Date.now()
                let restoredAlbums = 0, restoredImages = 0
                const skipped = []
                const touched = new Set()
                const restoreAlbumRows = photosDb.prepare("UPDATE albums SET name = substr(name, 11), deleted_at = NULL, trash_root_id = NULL, updated_at = ? WHERE trash_root_id = ? AND name LIKE '[DELETED] %'")
                const restoreImageRows = photosDb.prepare("UPDATE images SET original_name = substr(original_name, 11), deleted_at = NULL, trash_root_id = NULL WHERE trash_root_id = ? AND original_name LIKE '[DELETED] %'")
                const detach = photosDb.prepare("UPDATE albums SET parent_id = NULL WHERE id = ?")
                const getImg = photosDb.prepare("SELECT id, album_id, original_name, trash_root_id FROM images WHERE id = ?")
                const getAlbumName = photosDb.prepare("SELECT name FROM albums WHERE id = ?")
                const restoreOne = photosDb.prepare("UPDATE images SET original_name = ?, deleted_at = NULL, trash_root_id = NULL WHERE id = ?")
                photosDb.transaction(() => {
                    for (const id of albums) {
                        const root = byId.get(id)
                        if (!root || root.trash_root_id !== root.id || !root.name.startsWith('[DELETED] ')) { skipped.push({ id, reason: "ไม่พบในถังขยะ" }); continue }
                        const parent = root.parent_id ? byId.get(root.parent_id) : null
                        // The folder it lived in is gone too: it comes back at the top level.
                        if (root.parent_id && (!parent || parent.name.startsWith('[DELETED] '))) detach.run(root.id)
                        restoredAlbums += restoreAlbumRows.run(now, root.id).changes
                        restoredImages += restoreImageRows.run(root.id).changes
                        for (const a of byId.values()) if (a.trash_root_id === root.id) touched.add(a.id)
                    }
                    for (const id of images) {
                        const img = getImg.get(id)
                        if (!img || !img.original_name.startsWith('[DELETED] ') || img.trash_root_id) { skipped.push({ id, reason: "ไม่พบในถังขยะ" }); continue }
                        const album = getAlbumName.get(img.album_id)
                        if (!album || album.name.startsWith('[DELETED] ')) { skipped.push({ id, reason: "อัลบั้มของไฟล์นี้ถูกลบ ให้กู้คืนอัลบั้มก่อน" }); continue }
                        restoreOne.run(dedupeName(img.album_id, img.original_name.slice(10)), id)
                        touched.add(img.album_id)
                        restoredImages++
                    }
                })()
                const recount = photosDb.prepare("UPDATE albums SET photo_count = (SELECT COUNT(*) FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'), updated_at = ? WHERE id = ?")
                for (const aId of touched) recount.run(aId, now, aId)
                json(200, { success: true, restoredAlbums, restoredImages, skipped })
            } catch (e) { console.error("[trash restore]", e); json(400, { success: false }) }
        })()
        return
    }

    // POST /api/photos/trash/purge  { albums: [ids], images: [ids] } | { all: true } — permanent, frees R2 storage
    if (req.method === "POST" && urlPath === "/api/photos/trash/purge") {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        ;(async () => {
            const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) }
            try {
                const { albums = [], images = [], all = false } = JSON.parse(String(await collectBody(req)) || "{}")
                let purgedAlbums = 0, purgedImages = 0
                const roots = all
                    ? photosDb.prepare("SELECT id FROM albums WHERE name LIKE '[DELETED] %' AND trash_root_id = id").all().map(r => r.id)
                    : albums.filter(id => photosDb.prepare("SELECT 1 FROM albums WHERE id = ? AND trash_root_id = id AND name LIKE '[DELETED] %'").get(id))
                for (const id of roots) {
                    const r = purgeAlbumRoot(id)
                    purgedAlbums += r.albums
                    purgedImages += r.images
                }
                const loose = all
                    ? photosDb.prepare("SELECT * FROM images WHERE original_name LIKE '[DELETED] %' AND trash_root_id IS NULL").all()
                    : images.map(id => photosDb.prepare("SELECT * FROM images WHERE id = ? AND original_name LIKE '[DELETED] %' AND trash_root_id IS NULL").get(id)).filter(Boolean)
                purgedImages += purgeImageRows(loose)
                json(200, { success: true, albums: purgedAlbums, images: purgedImages })
            } catch (e) { console.error("[trash purge]", e); json(400, { success: false }) }
        })()
        return
    }

    // POST /api/photos/albums/:id/cover  { imageId | null } — choose the album cover (null = automatic)
    const coverMatch = urlPath.match(/^\/api\/photos\/albums\/([^/]+)\/cover$/)
    if (req.method === "POST" && coverMatch) {
        // The cover is an album-level setting: site password only, never an edit share link.
        const admin = isAdminReq(req)
        if (!admin) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        ;(async () => {
            const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) }
            try {
                const album = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(coverMatch[1])
                if (!album || album.name.startsWith('[DELETED] ')) return json(404, { success: false, message: "ไม่พบอัลบั้ม" })
                if (!validateAlbumAccess(req, album)) return json(403, { success: false, locked: true, message: "อัลบั้มถูกล็อก" })
                const { imageId = null } = JSON.parse(String(await collectBody(req)) || "{}")
                if (imageId && !photosDb.prepare("SELECT 1 FROM images WHERE id = ? AND album_id = ? AND original_name NOT LIKE '[DELETED] %'").get(imageId, album.id)) {
                    return json(404, { success: false, message: "ไฟล์นี้ไม่ได้อยู่ในอัลบั้มนี้" })
                }
                photosDb.prepare("UPDATE albums SET custom_cover_id = ?, updated_at = ? WHERE id = ?").run(imageId, Date.now(), album.id)
                json(200, { success: true, custom_cover_id: imageId })
            } catch (e) { json(400, { success: false }) }
        })()
        return
    }

    // POST /api/photos/album-tree  { parentId, paths: ["Trip", "Trip/Day 1", …] } — folders for a folder upload.
    // Existing sub-albums with the same name are reused, so uploading the same folder twice merges into it.
    if (req.method === "POST" && urlPath === "/api/photos/album-tree") {
        const admin = isAdminReq(req)
        const editor = !admin && shareEditorFor(req)
        if (!admin && !editor) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        ;(async () => {
            const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) }
            try {
                const { parentId = null, paths } = JSON.parse(String(await collectBody(req)) || "{}")
                if (!Array.isArray(paths) || paths.length > 5000) return json(400, { success: false })
                if (editor && (!parentId || !editor.include_subfolders || !shareEditorCovers(req, parentId))) return json(403, { success: false, message: "ลิงก์นี้สร้างโฟลเดอร์ตรงนี้ไม่ได้" })
                let parent = null
                if (parentId) {
                    parent = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(parentId)
                    if (!parent || parent.name.startsWith('[DELETED] ')) return json(404, { success: false, message: "ไม่พบโฟลเดอร์ปลายทาง" })
                    if (admin && !validateAlbumAccess(req, parent)) return json(403, { success: false, locked: true, message: "โฟลเดอร์ปลายทางถูกล็อก" })
                }
                const wanted = new Set()
                for (const p of paths) {
                    const segs = String(p).split("/").map(x => x.trim().slice(0, 200)).filter(Boolean)
                    for (let i = 1; i <= segs.length; i++) wanted.add(segs.slice(0, i).join("/"))
                }
                const ordered = [...wanted].sort((a, b) => a.split("/").length - b.split("/").length)
                if (ordered.length > 500) return json(400, { success: false, message: "โฟลเดอร์ย่อยมากเกินไป (สูงสุด 500)" })
                const findChild = photosDb.prepare("SELECT * FROM albums WHERE name = ? AND name NOT LIKE '[DELETED] %' AND ((? IS NULL AND parent_id IS NULL) OR parent_id = ?)")
                const idTaken = photosDb.prepare("SELECT 1 FROM albums WHERE id = ?")
                const insert = photosDb.prepare("INSERT INTO albums (id, name, photo_count, created_at, updated_at, event_date, parent_id) VALUES (?, ?, 0, ?, ?, ?, ?)")
                const map = {}
                let created = 0
                const now = Date.now()
                photosDb.transaction(() => {
                    for (const p of ordered) {
                        const segs = p.split("/")
                        const name = segs[segs.length - 1]
                        const pid = segs.length === 1 ? (parent ? parent.id : null) : map[segs.slice(0, -1).join("/")]
                        const reuse = findChild.all(name, pid, pid).find(a => !findLockGate(req, a))
                        if (reuse) { map[p] = reuse.id; continue }
                        let id
                        do { id = generateId() } while (idTaken.get(id))
                        insert.run(id, name, now, now, now, pid)
                        map[p] = id
                        created++
                    }
                    if (parent && created) photosDb.prepare("UPDATE albums SET updated_at = ? WHERE id = ?").run(now, parent.id)
                })()
                json(200, { success: true, map, created })
            } catch (e) { console.error("[album-tree]", e); json(400, { success: false }) }
        })()
        return
    }

    // GET /api/photos/timeline — every photo/video the request can open, across all albums.
    //   Cursor mode:  ?before=<ms>&beforeId=<id>&limit=
    //   Page mode (the album viewer's "all photos" view): ?page=&limit=50&sort=latest|oldest&dateFrom=&dateTo=
    //   ?all=1: lightweight metadata of everything (select all)
    if (req.method === "GET" && urlPath === "/api/photos/timeline") {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        const json = obj => { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)) }
        const byId = loadAlbumMap()
        const albumIds = [...byId.values()].filter(a => !a.name.startsWith('[DELETED] ') && !findLockGate(req, a, byId)).map(a => a.id)
        if (!albumIds.length) return json({ success: true, images: [], albums: {}, next: null, total: 0, months: [], page: 1, hasMore: false })
        let base = `original_name NOT LIKE '[DELETED] %' AND processing_status = 'done' AND album_id IN (${albumIds.map(() => "?").join(",")})`
        const baseParams = [...albumIds]
        // ?dateField=taken groups and sorts by when the photo was taken, falling back to the upload
        // time for anything with no EXIF date and no date in its file name.
        const dateExpr = urlQuery.get("dateField") === "taken" ? "COALESCE(taken_at, created_at)" : "created_at"
        const dateFrom = parseInt(urlQuery.get("dateFrom") || "") || null
        const dateTo = parseInt(urlQuery.get("dateTo") || "") || null
        if (dateFrom) { base += ` AND ${dateExpr} >= ?`; baseParams.push(dateFrom) }
        if (dateTo) { base += ` AND ${dateExpr} <= ?`; baseParams.push(dateTo) }
        const albumNames = rows => { const names = {}; for (const r of rows) if (!names[r.album_id]) names[r.album_id] = byId.get(r.album_id).name; return names }

        if (urlQuery.get("all") === "1") {
            const rows = photosDb.prepare(`SELECT id, album_id, original_name, width, height, size_bytes, created_at, taken_at, ${dateExpr} AS date_ref, file_type FROM images WHERE ${base} ORDER BY ${dateExpr} DESC, id DESC`).all(...baseParams)
            return json({ success: true, images: rows, albums: albumNames(rows) })
        }

        const pageParam = parseInt(urlQuery.get("page") || "") || null
        if (pageParam) {
            const limit = Math.min(Math.max(1, parseInt(urlQuery.get("limit") || "50") || 50), 100)
            const order = urlQuery.get("sort") === "oldest" ? "ASC" : "DESC"
            const total = photosDb.prepare(`SELECT COUNT(*) AS n FROM images WHERE ${base}`).get(...baseParams).n
            // day_key is computed here, in Thai time, so the grid groups on exactly the same key the
            // per-day totals below are counted on — no timezone drift between the two.
            const dayKeyExpr = `strftime('%Y-%m-%d', ${dateExpr} / 1000, 'unixepoch', '+7 hours')`
            const rows = photosDb.prepare(`SELECT id, album_id, original_name, width, height, size_bytes, preview_b64, processing_status, created_at, taken_at, ${dateExpr} AS date_ref, ${dayKeyExpr} AS day_key, file_type FROM images WHERE ${base} ORDER BY ${dateExpr} ${order}, id ${order} LIMIT ? OFFSET ?`).all(...baseParams, limit, (pageParam - 1) * limit)
            const videos = pageParam === 1 ? photosDb.prepare(`SELECT COUNT(*) AS n FROM images WHERE ${base} AND file_type = 'video'`).get(...baseParams).n : undefined
            // Every day's real total, for the whole filtered set — sent once with page 1 so each day
            // heading shows its final number immediately instead of counting up as pages load.
            const days = pageParam === 1
                ? photosDb.prepare(`SELECT ${dayKeyExpr} AS d, COUNT(*) AS n FROM images WHERE ${base} GROUP BY d ORDER BY d ${order}`).all(...baseParams)
                : undefined
            return json({ success: true, images: rows, albums: albumNames(rows), total, videos, days, page: pageParam, limit, hasMore: pageParam * limit < total })
        }

        const limit = Math.min(Math.max(1, parseInt(urlQuery.get("limit") || "150") || 150), 300)
        const before = parseInt(urlQuery.get("before") || "0") || null
        const beforeId = urlQuery.get("beforeId") || ""
        let where = base
        const params = [...baseParams]
        if (before) { where += " AND (created_at < ? OR (created_at = ? AND id < ?))"; params.push(before, before, beforeId) }
        const rows = photosDb.prepare(`SELECT id, album_id, original_name, width, height, file_type, created_at FROM images WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`).all(...params, limit + 1)
        const images = rows.slice(0, limit)
        const last = images[images.length - 1]
        const payload = { success: true, images, albums: albumNames(images), next: rows.length > limit ? { before: last.created_at, beforeId: last.id } : null }
        if (!before) {
            payload.total = photosDb.prepare(`SELECT COUNT(*) AS n FROM images WHERE ${base}`).get(...baseParams).n
            // Months in Thai time (UTC+7), for the jump-to-month control.
            payload.months = photosDb.prepare(`SELECT strftime('%Y-%m', created_at / 1000, 'unixepoch', '+7 hours') AS ym, COUNT(*) AS n, MAX(created_at) AS latest FROM images WHERE ${base} GROUP BY ym ORDER BY ym DESC`).all(...baseParams)
        }
        return json(payload)
    }

    // ===== Share links (managed with the site password) =====
    const shareView = row => {
        let target = null
        if (row.kind === "album") {
            const a = photosDb.prepare("SELECT id, name FROM albums WHERE id = ?").get(row.target_id)
            if (a && !a.name.startsWith('[DELETED] ')) target = { id: a.id, name: a.name }
        } else {
            const i = photosDb.prepare("SELECT id, album_id, original_name FROM images WHERE id = ?").get(row.target_id)
            if (i && !i.original_name.startsWith('[DELETED] ')) target = { id: i.id, name: i.original_name, album_id: i.album_id }
        }
        return {
            id: row.id, kind: row.kind, target_id: row.target_id, target, url: `/s/?t=${row.id}`,
            include_subfolders: !!row.include_subfolders, allow_download: true, role: row.role === "editor" ? "editor" : "viewer",
            created_at: row.created_at, expires_at: row.expires_at, expired: !!(row.expires_at && row.expires_at < Date.now()),
            view_count: row.view_count || 0, last_viewed_at: row.last_viewed_at
        }
    }

    // POST /api/photos/shares  { kind: 'album'|'image', targetId, expiresInDays: 0|1|7|30|90, role: 'viewer'|'editor', includeSubfolders }
    // Downloads are always allowed. 'editor' is for album links only (a single-file link has nothing to edit).
    if (req.method === "POST" && urlPath === "/api/photos/shares") {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        ;(async () => {
            const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) }
            try {
                const { kind, targetId, expiresInDays = 7, role = "viewer", includeSubfolders = true } = JSON.parse(String(await collectBody(req)) || "{}")
                if (!["album", "image"].includes(kind) || !targetId) return json(400, { success: false })
                const shareRole = kind === "album" && role === "editor" ? "editor" : "viewer"
                const days = Number(expiresInDays)
                if (![0, 1, 7, 30, 90].includes(days)) return json(400, { success: false })
                let album
                if (kind === "album") {
                    album = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(targetId)
                } else {
                    const img = photosDb.prepare("SELECT album_id FROM images WHERE id = ? AND original_name NOT LIKE '[DELETED] %'").get(targetId)
                    if (!img) return json(404, { success: false, message: "ไม่พบไฟล์" })
                    album = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(img.album_id)
                }
                if (!album || album.name.startsWith('[DELETED] ')) return json(404, { success: false, message: "ไม่พบโฟลเดอร์" })
                if (!validateAlbumAccess(req, album)) return json(403, { success: false, locked: true, message: "ปลดล็อกอัลบั้มก่อนแชร์" })
                const id = crypto.randomBytes(12).toString("base64url")
                const now = Date.now()
                photosDb.prepare("INSERT INTO shares (id, kind, target_id, include_subfolders, allow_download, role, created_at, expires_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)")
                    .run(id, kind, targetId, kind === "album" && includeSubfolders ? 1 : 0, shareRole, now, days ? now + days * 86400000 : null)
                json(200, { success: true, share: shareView(photosDb.prepare("SELECT * FROM shares WHERE id = ?").get(id)) })
            } catch (e) { console.error("[share create]", e); json(400, { success: false }) }
        })()
        return
    }

    // GET /api/photos/shares?targetId= — active (not revoked) links, optionally for one target
    if (req.method === "GET" && urlPath === "/api/photos/shares") {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        const targetId = urlQuery.get("targetId")
        const rows = targetId
            ? photosDb.prepare("SELECT * FROM shares WHERE target_id = ? AND revoked_at IS NULL ORDER BY created_at DESC").all(targetId)
            : photosDb.prepare("SELECT * FROM shares WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 500").all()
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
        return res.end(JSON.stringify({ success: true, shares: rows.map(shareView) }))
    }

    // PATCH /api/photos/shares/:id — change what an existing link allows, without handing out a new URL.
    // Body may carry any of { expiresInDays: 0|1|7|30|90, role: 'viewer'|'editor', includeSubfolders }.
    const shareEditMatch = urlPath.match(/^\/api\/photos\/shares\/([A-Za-z0-9_-]+)$/)
    if ((req.method === "PATCH" || req.method === "PUT") && shareEditMatch) {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        ;(async () => {
            const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) }
            try {
                const body = JSON.parse(String(await collectBody(req)) || "{}")
                const row = photosDb.prepare("SELECT * FROM shares WHERE id = ? AND revoked_at IS NULL").get(shareEditMatch[1])
                if (!row) return json(404, { success: false, message: "ไม่พบลิงก์นี้" })
                const sets = [], params = []
                if (body.role !== undefined) {
                    if (!["viewer", "editor"].includes(body.role) || (body.role === "editor" && row.kind !== "album")) return json(400, { success: false })
                    sets.push("role = ?"); params.push(body.role)
                }
                if (body.includeSubfolders !== undefined && row.kind === "album") { sets.push("include_subfolders = ?"); params.push(body.includeSubfolders ? 1 : 0) }
                if (body.expiresInDays !== undefined) {
                    const days = Number(body.expiresInDays)
                    if (![0, 1, 7, 30, 90].includes(days)) return json(400, { success: false })
                    // The countdown restarts from now, so an expired link comes back to life when given a new window.
                    sets.push("expires_at = ?"); params.push(days ? Date.now() + days * 86400000 : null)
                }
                if (!sets.length) return json(400, { success: false, message: "ไม่มีอะไรให้แก้" })
                photosDb.prepare(`UPDATE shares SET ${sets.join(", ")} WHERE id = ?`).run(...params, row.id)
                json(200, { success: true, share: shareView(photosDb.prepare("SELECT * FROM shares WHERE id = ?").get(row.id)) })
            } catch (e) { console.error("[share edit]", e); json(400, { success: false }) }
        })()
        return
    }

    // DELETE /api/photos/shares/:id — revoke
    const shareRevokeMatch = urlPath.match(/^\/api\/photos\/shares\/([A-Za-z0-9_-]+)$/)
    if (req.method === "DELETE" && shareRevokeMatch) {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        const r = photosDb.prepare("UPDATE shares SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(Date.now(), shareRevokeMatch[1])
        res.writeHead(r.changes ? 200 : 404, { "Content-Type": "application/json; charset=utf-8" })
        return res.end(JSON.stringify({ success: !!r.changes }))
    }

    // ===== Link preview image for share links (Open Graph) =====
    // GET /api/share/:token/og.jpg — the shared photo (or the shared album's cover) as a 1200x630 JPEG,
    // the size and format every preview crawler (LINE, Facebook, Discord, X) accepts. og:image on the
    // web /s/ page points here (see sharePreview). Answers only while the link itself is valid.
    const shareOgMatch = urlPath.match(/^\/api\/share\/([A-Za-z0-9_-]{8,40})\/og\.jpg$/)
    if (req.method === "GET" && shareOgMatch) {
        const meta = shareLinkMeta(shareOgMatch[1])
        if (!meta.ok || !meta.imageId) { res.writeHead(404); return res.end("Not Found") }
        ;(async () => {
            try {
                const jpg = await shareOgImage(meta.imageId)
                if (!jpg) { res.writeHead(404); return res.end("Not Found") }
                res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": jpg.length, "Cache-Control": "public, max-age=86400", "X-Robots-Tag": "noindex" })
                res.end(jpg)
            } catch (e) {
                console.error("[og]", meta.imageId, e.message)
                if (!res.headersSent) { res.writeHead(500); res.end() }
            }
        })()
        return
    }

    // ===== Public share viewer API: no site password, never reaches outside what was shared =====
    // GET /api/share/:token | /api/share/:token/album/:albumId?page= | /api/share/:token/image/:imageId/:variant
    const publicShareMatch = urlPath.match(/^\/api\/share\/([A-Za-z0-9_-]{8,40})(?:\/album\/([^/]+)(\/all)?|\/image\/([^/]+)\/(thumb|sd|medium|4k|original|renditions|v\d{3,4}|vmax\d{3,4}))?$/)
    if (req.method === "GET" && publicShareMatch) {
        const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }); res.end(JSON.stringify(obj)) }
        const share = photosDb.prepare("SELECT * FROM shares WHERE id = ?").get(publicShareMatch[1])
        const now = Date.now()
        if (!share || share.revoked_at) return json(404, { success: false, reason: "invalid", message: "ลิงก์นี้ใช้ไม่ได้แล้ว" })
        if (share.expires_at && share.expires_at < now) return json(410, { success: false, reason: "expired", message: "ลิงก์นี้หมดอายุแล้ว" })
        const byId = loadAlbumMap()
        const alive = a => !!a && !a.name.startsWith('[DELETED] ')
        const getImage = photosDb.prepare("SELECT id, album_id, original_name, width, height, size_bytes, preview_b64, created_at, file_type, processing_status FROM images WHERE id = ? AND original_name NOT LIKE '[DELETED] %'")
        // Albums nested below a shared album are in scope, except behind a lock of their own.
        const inScope = albumId => {
            if (share.kind !== "album") return false
            const album = byId.get(albumId)
            if (!alive(album)) return false
            if (albumId === share.target_id) return true
            if (!share.include_subfolders) return false
            const chain = getAlbumChain(album, byId)
            const idx = chain.findIndex(a => a.id === share.target_id)
            return idx > 0 && chain.slice(0, idx).every(a => alive(a) && !a.is_locked)
        }
        const sharedImage = share.kind === "image" ? getImage.get(share.target_id) : null
        if (share.kind === "album" ? !alive(byId.get(share.target_id)) : !sharedImage) {
            return json(404, { success: false, reason: "gone", message: "ไฟล์หรือโฟลเดอร์ที่แชร์ถูกลบไปแล้ว" })
        }

        if (publicShareMatch[4]) {
            const img = getImage.get(publicShareMatch[4])
            const ok = img && (share.kind === "image" ? img.id === share.target_id : inScope(img.album_id))
            if (!ok) { res.writeHead(404); return res.end("Not Found") }
            const wantsDownload = urlQuery.get("download") === "1"
            if (wantsDownload && !share.allow_download) { res.writeHead(403); return res.end("Download disabled") }
            let variant = publicShareMatch[5]
            // View-only links never hand out full-size files (videos still need the original to play).
            if (!share.allow_download && (variant === "original" || variant === "4k") && img.file_type !== "video") variant = "medium"
            res.writeHead(302, { Location: `/api/image/${img.id}/${variant}${wantsDownload ? "?download=1" : ""}`, "Cache-Control": "private, max-age=600" })
            return res.end()
        }

        if (publicShareMatch[2]) {
            const albumId = publicShareMatch[2]
            if (!inScope(albumId)) return json(404, { success: false, reason: "scope", message: "ลิงก์นี้ไม่ได้แชร์โฟลเดอร์นี้" })
            const album = byId.get(albumId)
            const chain = getAlbumChain(album, byId)
            const breadcrumb = chain.slice(0, chain.findIndex(a => a.id === share.target_id) + 1).reverse().slice(0, -1).map(a => ({ id: a.id, name: a.name }))
            // /all: lightweight metadata of every file, for "select all" / custom select in the shared view.
            if (publicShareMatch[3]) {
                const all = photosDb.prepare("SELECT id, album_id, original_name, width, height, size_bytes, created_at, file_type FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' AND processing_status = 'done' ORDER BY created_at DESC").all(albumId)
                return json(200, { success: true, images: all })
            }
            const page = Math.max(1, parseInt(urlQuery.get("page") || "1") || 1)
            const limit = Math.min(Math.max(1, parseInt(urlQuery.get("limit") || "50") || 50), 100)
            const order = urlQuery.get("sort") === "oldest" ? "ASC" : "DESC"
            let where = "album_id = ? AND original_name NOT LIKE '[DELETED] %' AND processing_status = 'done'"
            const params = [albumId]
            const dateFrom = parseInt(urlQuery.get("dateFrom") || "") || null
            const dateTo = parseInt(urlQuery.get("dateTo") || "") || null
            if (dateFrom) { where += " AND created_at >= ?"; params.push(dateFrom) }
            if (dateTo) { where += " AND created_at <= ?"; params.push(dateTo) }
            const total = photosDb.prepare(`SELECT COUNT(*) AS n FROM images WHERE ${where}`).get(...params).n
            const images = photosDb.prepare(`SELECT id, album_id, original_name, width, height, size_bytes, preview_b64, created_at, file_type, processing_status FROM images WHERE ${where} ORDER BY created_at ${order} LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit)
            let children = []
            if (page === 1 && share.include_subfolders) {
                const countStmt = photosDb.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN file_type = 'video' THEN 1 ELSE 0 END) AS videos FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' AND processing_status = 'done'")
                const coverStmt = photosDb.prepare("SELECT id, preview_b64 FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' AND processing_status = 'done' ORDER BY (id = ?) DESC, created_at DESC LIMIT 1")
                // Totals over a sub-folder and everything below it; locked folders are hidden here, so skipped.
                const shareTotals = (id, seen = new Set()) => {
                    seen.add(id)
                    const sc = countStmt.get(id)
                    const t = { folders: 0, photos: (sc.n || 0) - (sc.videos || 0), videos: sc.videos || 0 }
                    for (const x of byId.values()) {
                        if (x.parent_id !== id || !alive(x) || x.is_locked || seen.has(x.id)) continue
                        const ct = shareTotals(x.id, seen)
                        t.folders += 1 + ct.folders
                        t.photos += ct.photos
                        t.videos += ct.videos
                    }
                    return t
                }
                children = [...byId.values()]
                    .filter(a => a.parent_id === albumId && alive(a) && !a.is_locked)
                    .sort((a, b) => (b.event_date || b.created_at) - (a.event_date || a.created_at))
                    .map(a => {
                        const c = countStmt.get(a.id)
                        const cover = coverStmt.get(a.id, a.custom_cover_id || "")
                        const t = shareTotals(a.id)
                        return {
                            id: a.id, name: a.name, parent_id: albumId, is_locked: false, pinned_at: null,
                            photo_count: (c.n || 0) - (c.videos || 0), video_count: c.videos || 0,
                            cover_images: cover ? [{ id: cover.id, preview_b64: cover.preview_b64 }] : [],
                            child_count: [...byId.values()].filter(x => x.parent_id === a.id && alive(x) && !x.is_locked).length,
                            total_folders: t.folders, total_photos: t.photos, total_videos: t.videos,
                            has_access: true, cover_image_id: cover ? cover.id : null, cover_preview: cover ? cover.preview_b64 : null
                        }
                    })
            }
            return json(200, { success: true, album: { id: album.id, name: album.name, event_date: album.event_date || album.created_at, created_at: album.created_at, updated_at: album.updated_at, is_locked: false, custom_cover_id: null }, breadcrumb, children, images, total, page, limit, hasMore: page * limit < total })
        }

        photosDb.prepare("UPDATE shares SET view_count = view_count + 1, last_viewed_at = ? WHERE id = ?").run(now, share.id)
        const base = { success: true, kind: share.kind, allow_download: !!share.allow_download, role: share.role === "editor" ? "editor" : "viewer", include_subfolders: !!share.include_subfolders, expires_at: share.expires_at }
        if (share.kind === "album") {
            const a = byId.get(share.target_id)
            return json(200, { ...base, album: { id: a.id, name: a.name, event_date: a.event_date || a.created_at } })
        }
        const i = sharedImage
        return json(200, { ...base, image: { id: i.id, name: i.original_name, original_name: i.original_name, width: i.width, height: i.height, size_bytes: i.size_bytes, file_type: i.file_type, preview_b64: i.preview_b64, created_at: i.created_at, processing_status: "done" } })
    }

    // POST /api/photos/albums/:id/copy  { parentId, password } — deep copy an album and everything nested in
    // it. Image rows are duplicated but keep pointing at the same R2 objects, so copies cost no storage.
    const copyAlbumMatch = urlPath.match(/^\/api\/photos\/albums\/([^/]+)\/copy$/)
    if (req.method === "POST" && copyAlbumMatch) {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", async () => {
            const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) }
            try {
                const { parentId, password } = JSON.parse(body || "{}")
                const byId = loadAlbumMap()
                const src = byId.get(copyAlbumMatch[1])
                if (!src || src.name.startsWith('[DELETED] ')) return json(404, { success: false, message: "ไม่พบอัลบั้ม" })
                if (findLockGate(req, src, byId)) return json(403, { success: false, message: "ไม่มีสิทธิ์เข้าถึงอัลบั้มต้นทาง" })
                let parent = null
                if (parentId) {
                    parent = byId.get(parentId)
                    if (!parent || parent.name.startsWith('[DELETED] ')) return json(404, { success: false, message: "ไม่พบโฟลเดอร์ปลายทาง" })
                    if (getAlbumChain(parent, byId).some(a => a.id === src.id)) return json(400, { success: false, message: "ทำสำเนาเข้าไปในตัวเองหรือโฟลเดอร์ย่อยของตัวเองไม่ได้" })
                    if (!(await passesLockGate(req, parent, password))) return json(403, { success: false, locked: true, message: "รหัสผ่านโฟลเดอร์ปลายทางไม่ถูกต้อง" })
                }
                const subtreeIds = collectSubtreeIds(src.id, byId)
                if (subtreeIds.length > 300) return json(400, { success: false, message: "อัลบั้มนี้มีโฟลเดอร์ย่อยมากเกินไป" })

                const destParentId = parent ? parent.id : null
                const siblingNames = new Set([...byId.values()]
                    .filter(a => (a.parent_id || null) === destParentId && !a.name.startsWith('[DELETED] '))
                    .map(a => a.name))
                let rootName = `${src.name} (สำเนา)`
                for (let n = 2; siblingNames.has(rootName); n++) rootName = `${src.name} (สำเนา ${n})`

                const albumCols = photosDb.prepare("PRAGMA table_info(albums)").all().map(c => c.name)
                const imageCols = photosDb.prepare("PRAGMA table_info(images)").all().map(c => c.name)
                const insertAlbum = photosDb.prepare(`INSERT INTO albums (${albumCols.join(", ")}) VALUES (${albumCols.map(() => "?").join(", ")})`)
                const insertImage = photosDb.prepare(`INSERT INTO images (${imageCols.join(", ")}) VALUES (${imageCols.map(() => "?").join(", ")})`)
                const imagesOf = photosDb.prepare("SELECT * FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at")
                const albumIdTaken = photosDb.prepare("SELECT 1 FROM albums WHERE id = ?")
                const imageIdTaken = photosDb.prepare("SELECT 1 FROM images WHERE id = ?")
                const recount = photosDb.prepare(`UPDATE albums SET
                    photo_count = (SELECT COUNT(*) FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'),
                    cover_image_id = (SELECT id FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at DESC LIMIT 1)
                    WHERE id = ?`)

                const idMap = new Map()
                let copied = 0, skipped = 0
                const now = Date.now()
                photosDb.transaction(() => {
                    for (const oldId of subtreeIds) {
                        const a = byId.get(oldId)
                        let newId
                        do { newId = generateId() } while (albumIdTaken.get(newId))
                        idMap.set(oldId, newId)
                        const isRoot = oldId === src.id
                        const row = { ...a, id: newId, name: isRoot ? rootName : a.name, parent_id: isRoot ? destParentId : idMap.get(a.parent_id), created_at: now, updated_at: now, pinned_at: null, cover_image_id: null, photo_count: 0, custom_cover_id: null, deleted_at: null, trash_root_id: null }
                        insertAlbum.run(...albumCols.map(c => row[c] === undefined ? null : row[c]))
                        const imgIdMap = new Map()
                        for (const img of imagesOf.all(oldId)) {
                            // Rows still processing aren't in any worker queue under a new id; a copy would stay stuck.
                            if (img.processing_status !== 'done' || img.convert_format || !img.r2_key_original) { skipped++; continue }
                            let imgId
                            do { imgId = generateId() } while (imageIdTaken.get(imgId))
                            const copy = { ...img, id: imgId, album_id: newId, folder_id: null, deleted_at: null, trash_root_id: null }
                            insertImage.run(...imageCols.map(c => copy[c] === undefined ? null : copy[c]))
                            imgIdMap.set(img.id, imgId)
                            copied++
                        }
                        recount.run(newId, newId, newId)
                        if (a.custom_cover_id && imgIdMap.has(a.custom_cover_id)) {
                            photosDb.prepare("UPDATE albums SET custom_cover_id = ? WHERE id = ?").run(imgIdMap.get(a.custom_cover_id), newId)
                        }
                    }
                    if (destParentId) photosDb.prepare("UPDATE albums SET updated_at = ? WHERE id = ?").run(now, destParentId)
                })()
                json(200, { success: true, album_id: idMap.get(src.id), albums: subtreeIds.length, copied, skipped })
            } catch (e) { console.error("[copy album]", e); json(400, { success: false }) }
        })
        return
    }

    // POST /api/photos/albums/:id/lock — Set album password
    const lockMatch = urlPath.match(/^\/api\/photos\/albums\/([^/]+)\/lock$/)
    if (req.method === "POST" && lockMatch) {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        const aId = lockMatch[1]
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", async () => {
            try {
                const { password } = JSON.parse(body)
                if (!password || password.length < 4) { res.writeHead(400); return res.end(JSON.stringify({ success: false, message: "รหัสต้องมีอย่างน้อย 4 ตัวอักษร" })) }
                const hash = await hashPassword(password)
                photosDb.prepare("UPDATE albums SET is_locked = 1, password_hash = ?, updated_at = ? WHERE id = ?").run(hash, Date.now(), aId)
                const token = generateAlbumToken(aId)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, token }))
            } catch (e) { res.writeHead(400); res.end(JSON.stringify({ success: false })) }
        })
        return
    }

    // POST /api/photos/albums/:id/unlock — Remove album password
    const unlockMatch = urlPath.match(/^\/api\/photos\/albums\/([^/]+)\/unlock$/)
    if (req.method === "POST" && unlockMatch) {
        const aId = unlockMatch[1]
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", async () => {
            try {
                const { password } = JSON.parse(body)
                const album = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(aId)
                if (!album || !album.is_locked) { res.writeHead(400); return res.end(JSON.stringify({ success: false, message: "อัลบั้มไม่ได้ล็อก" })) }
                const valid = await verifyPassword(password, album.password_hash)
                if (!valid) { res.writeHead(401); return res.end(JSON.stringify({ success: false, message: "รหัสไม่ถูกต้อง" })) }
                photosDb.prepare("UPDATE albums SET is_locked = 0, password_hash = NULL, updated_at = ? WHERE id = ?").run(Date.now(), aId)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true }))
            } catch (e) { res.writeHead(400); res.end(JSON.stringify({ success: false })) }
        })
        return
    }

    // POST /api/photos/albums/:id/verify — Verify album password & get access token
    const verifyAlbumMatch = urlPath.match(/^\/api\/photos\/albums\/([^/]+)\/verify$/)
    if (req.method === "POST" && verifyAlbumMatch) {
        const aId = verifyAlbumMatch[1]
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
        if (!checkBruteForce(clientIp)) {
            res.writeHead(429, { "Content-Type": "application/json; charset=utf-8" })
            return res.end(JSON.stringify({ success: false, message: "ลองบ่อยเกินไป กรุณารอสักครู่" }))
        }
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", async () => {
            try {
                const { password } = JSON.parse(body)
                const album = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(aId)
                // A lock covers everything nested inside it, so the password asked for is the top-most locked album's.
                const gate = album ? getAlbumChain(album).reverse().find(a => a.is_locked) : null
                if (!gate) { res.writeHead(400); return res.end(JSON.stringify({ success: false })) }
                const valid = await verifyPassword(password, gate.password_hash)
                if (!valid) {
                    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" })
                    return res.end(JSON.stringify({ success: false, message: "รหัสไม่ถูกต้อง" }))
                }
                const token = generateAlbumToken(gate.id)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, token, album_id: gate.id }))
            } catch (e) { res.writeHead(400); res.end(JSON.stringify({ success: false })) }
        })
        return
    }

    // PUT /api/photos/albums/:id (rename / update event_date — requires album access for locked albums)
    if (req.method === "PUT" && albumIdMatch) {
        const admin = isAdminReq(req)
        if (!admin && !shareEditorFor(req)) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        const aId = albumIdMatch[1]
        const album = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(aId)
        if (!album || album.name.startsWith('[DELETED] ')) { res.writeHead(404); return res.end(JSON.stringify({ success: false })) }
        if (!admin && !shareEditorCovers(req, aId)) { res.writeHead(403); return res.end(JSON.stringify({ success: false })) }
        if (admin && !validateAlbumAccess(req, album)) {
            res.writeHead(403); return res.end(JSON.stringify({ success: false, message: "Album locked" }))
        }
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", async () => {
            try {
                const data = JSON.parse(body)
                const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) }
                if (data.name !== undefined && (!data.name || !data.name.trim())) return json(400, { success: false, message: "Name required" })
                // An editor link may rename; the album's date and moving it elsewhere need the site password.
                if (!admin && data.parent_id !== undefined) return json(403, { success: false, message: "ลิงก์นี้ย้ายโฟลเดอร์ไม่ได้" })
                if (!admin && data.event_date !== undefined) return json(403, { success: false, message: "ลิงก์นี้แก้วันที่อัลบั้มไม่ได้" })
                if (data.parent_id !== undefined) {
                    const newParentId = data.parent_id || null
                    if (newParentId) {
                        const target = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(newParentId)
                        if (!target || target.name.startsWith('[DELETED] ')) return json(404, { success: false, message: "ไม่พบโฟลเดอร์ปลายทาง" })
                        if (getAlbumChain(target).some(a => a.id === aId)) return json(400, { success: false, message: "ย้ายอัลบั้มเข้าไปในตัวเองหรือโฟลเดอร์ย่อยของตัวเองไม่ได้" })
                        if (!(await passesLockGate(req, target, data.password))) return json(403, { success: false, locked: true, message: "รหัสผ่านโฟลเดอร์ปลายทางไม่ถูกต้อง" })
                    }
                    const movedAt = Date.now()
                    photosDb.prepare("UPDATE albums SET parent_id = ?, updated_at = ? WHERE id = ?").run(newParentId, movedAt, aId)
                    if (newParentId) photosDb.prepare("UPDATE albums SET updated_at = ? WHERE id = ?").run(movedAt, newParentId)
                }
                if (data.name !== undefined) {
                    if (!data.name || !data.name.trim()) { res.writeHead(400); return res.end(JSON.stringify({ success: false, message: "Name required" })) }
                    photosDb.prepare("UPDATE albums SET name = ?, updated_at = ? WHERE id = ?").run(data.name.trim(), Date.now(), aId)
                }
                if (data.event_date !== undefined) {
                    const evtDate = parseInt(data.event_date) || Date.now()
                    photosDb.prepare("UPDATE albums SET event_date = ?, updated_at = ? WHERE id = ?").run(evtDate, Date.now(), aId)
                }
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true }))
            } catch (e) { res.writeHead(400); res.end(JSON.stringify({ success: false })) }
        })
        return
    }

    // DELETE /api/photos/albums/:id
    if (req.method === "DELETE" && albumIdMatch) {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        const aId = albumIdMatch[1]
        ;(async () => {
            try {
                const byId = loadAlbumMap()
                const album = byId.get(aId)
                if (!album || album.name.startsWith('[DELETED] ')) { res.writeHead(404); return res.end(JSON.stringify({ success: false })) }
                if (findLockGate(req, album, byId)) { res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" }); return res.end(JSON.stringify({ success: false, locked: true, message: "อัลบั้มถูกล็อก" })) }
                // Soft delete the album, every album nested inside it, and all of their images
                const now = Date.now()
                const delAlbum = photosDb.prepare("UPDATE albums SET name = '[DELETED] ' || name, updated_at = ?, pinned_at = NULL, deleted_at = ?, trash_root_id = ? WHERE id = ? AND name NOT LIKE '[DELETED] %'")
                const delImages = photosDb.prepare("UPDATE images SET original_name = '[DELETED] ' || original_name, deleted_at = ?, trash_root_id = ? WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'")
                photosDb.transaction(() => {
                    for (const id of collectSubtreeIds(aId, byId)) { delAlbum.run(now, now, aId, id); delImages.run(now, aId, id) }
                })()
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true }))
            } catch (e) { console.error(e); res.writeHead(500); res.end(JSON.stringify({ success: false })) }
        })()
        return
    }

    // GET /api/photos/albums/:id/images?page=&limit=&sort=&dateFrom=&dateTo=
    if (req.method === "GET" && albumImagesMatch) {
        const aId = albumImagesMatch[1]
        const album = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(aId)
        if (!album || album.name.startsWith('[DELETED] ')) { 
            res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }); 
            return res.end(JSON.stringify({ error: "Album not found", deleted: true })) 
        }
        
        // Album lock check (its own lock or a locked album above it): return album info but block image access
        const lockGate = findLockGate(req, album)
        if (lockGate) {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
            return res.end(JSON.stringify({ album: { id: album.id, name: album.name, photo_count: album.photo_count, is_locked: true, parent_id: album.parent_id || null, created_at: album.created_at, updated_at: album.updated_at }, images: [], total: 0, page: 1, limit: 50, hasMore: false, locked: true, lock_gate_id: lockGate.id, lock_gate_name: lockGate.id === album.id ? null : lockGate.name }))
        }
        
        const page = parseInt(urlQuery.get("page") || "1")
        const limit = Math.min(parseInt(urlQuery.get("limit") || "50"), 100)
        const offset = (page - 1) * limit
        const sort = urlQuery.get("sort") || "latest"
        const dateFrom = urlQuery.get("dateFrom")
        const dateTo = urlQuery.get("dateTo")
        let where = "album_id = ? AND original_name NOT LIKE '[DELETED] %'"
        const params = [aId]
        if (dateFrom) { where += " AND created_at >= ?"; params.push(parseInt(dateFrom)) }
        if (dateTo) { where += " AND created_at <= ?"; params.push(parseInt(dateTo)) }
        const orderBy = sort === "oldest" ? "created_at ASC" : "created_at DESC"
        const images = photosDb.prepare(`SELECT id, album_id, original_name, width, height, size_bytes, preview_b64, processing_status, last_error, created_at, taken_at, file_type FROM images WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...params, limit, offset)
        const total = photosDb.prepare(`SELECT COUNT(*) as cnt FROM images WHERE ${where}`).get(...params).cnt
        album.is_locked = !!album.is_locked
        delete album.password_hash
        const payload = { album, images, total, page, limit, hasMore: offset + images.length < total }
        // The first page also carries the folder context: where this album sits and the albums inside it.
        if (page === 1) {
            const byId = loadAlbumMap()
            payload.breadcrumb = getAlbumChain(byId.get(aId) || album, byId).slice(1).reverse().map(a => ({ id: a.id, name: a.name }))
            const children = [...byId.values()]
                .filter(a => a.parent_id === aId && !a.name.startsWith('[DELETED] '))
                .sort((a, b) => (b.event_date || b.created_at) - (a.event_date || a.created_at) || b.updated_at - a.updated_at)
            payload.children = serializeAlbums(req, children, byId)
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
        return res.end(JSON.stringify(payload))
    }

    // GET /api/photos/albums/:id/all-images
    const allImagesMatch = urlPath.match(/^\/api\/photos\/albums\/([^/]+)\/all-images$/)
    if (req.method === "GET" && allImagesMatch) {
        const aId = allImagesMatch[1]
        const album = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(aId)
        if (!album || album.name.startsWith('[DELETED] ')) { 
            res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" }); 
            return res.end(JSON.stringify({ error: "Album not found", deleted: true })) 
        }
        if (!validateAlbumAccess(req, album)) {
            res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" })
            return res.end(JSON.stringify({ success: false, message: "Album locked" }))
        }
        
        const sort = urlQuery.get("sort") || "latest"
        const dateFrom = urlQuery.get("dateFrom")
        const dateTo = urlQuery.get("dateTo")
        let where = "album_id = ? AND original_name NOT LIKE '[DELETED] %'"
        const params = [aId]
        if (dateFrom) { where += " AND created_at >= ?"; params.push(parseInt(dateFrom)) }
        if (dateTo) { where += " AND created_at <= ?"; params.push(parseInt(dateTo)) }
        const orderBy = sort === "oldest" ? "created_at ASC" : "created_at DESC"
        
        // Exclude preview_b64 to keep payload tiny
        const images = photosDb.prepare(`SELECT id, file_type, processing_status, size_bytes, width, height, original_name, created_at FROM images WHERE ${where} ORDER BY ${orderBy}`).all(...params)
        
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
        return res.end(JSON.stringify({ success: true, images }))
    }

    // X-Upload-Order: "<session>:<block>:<seq>" from the album page (UploadOrder in the web app). The grid
    // is newest-first by created_at, and the page uploads several files at once, so the order requests
    // finish in is not the order the files were picked. Each block gets a start time from this server's
    // clock the first time any of its files arrives; a file's created_at is that time plus its seq in
    // milliseconds, so photos keep the picked order after a reload and the client's clock never matters.
    // Without the header (older pages, other clients) created_at is simply the arrival time.
    function orderedCreatedAt(header) {
        const m = /^([A-Za-z0-9_-]{4,40}):(\d{1,9}):(\d{1,9})$/.exec(String(header || ""))
        if (!m) return Date.now()
        const key = `${m[1]}:${m[2]}`, seq = Number(m[3]), now = Date.now()
        let anchor = uploadOrderAnchors.get(key)
        if (!anchor) {
            anchor = { t: now, base: seq }
            uploadOrderAnchors.set(key, anchor)
            for (const [k, a] of uploadOrderAnchors) if (now - a.t > 6 * 3600 * 1000) uploadOrderAnchors.delete(k)
        }
        return anchor.t + (seq - anchor.base)
    }

    // POST /api/photos/upload/:albumId — UPLOAD-FIRST (no processing)
    if (req.method === "POST" && uploadMatch) {
        req.setTimeout(600000)
        res.setTimeout(600000)
        const admin = isAdminReq(req)
        if (!admin && !shareEditorFor(req)) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        const aId = uploadMatch[1]
        const album = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(aId)
        if (!album) { console.log("Unhandled:", req.method, req.url); res.writeHead(404); return res.end(JSON.stringify({ success: false, message: "Album not found" })) }
        if (admin ? !validateAlbumAccess(req, album) : !shareEditorCovers(req, aId)) { res.writeHead(403); return res.end(JSON.stringify({ success: false, message: "Album locked" })) }
        activeUploads++
        const t0 = Date.now()
        // Set once this request has taken responsibility for a picked file, so the reply it produces
        // can be handed to any repeat of the same file (see uploadIdem).
        let idemKey = null, idemDone = null, idemResults = null
        ;(async () => {
            try {
                const raw = await collectBody(req)
                const ct = req.headers["content-type"] || ""
                const boundaryMatch = ct.match(/boundary=([^;]+)/)
                if (!boundaryMatch) { res.writeHead(400); return res.end(JSON.stringify({ success: false })) }
                const files = parseMultipart(raw, boundaryMatch[1].trim())
                if (files.length === 0) { res.writeHead(400); return res.end(JSON.stringify({ success: false })) }
                const results = []
                const insertStmt = photosDb.prepare("INSERT INTO images (id, album_id, original_name, width, height, size_bytes, r2_key_original, processing_status, created_at, file_type, taken_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
                const orderedAt = orderedCreatedAt(req.headers["x-upload-order"])
                // The upload batch this request belongs to. A batch the user cancelled stores nothing more:
                // a request can still be arriving, or be mid-way to R2, when the browser aborts it, and it
                // used to finish on its own and put a photo back after "cancel and move to trash".
                const run = uploadRunFor(req.headers["x-upload-order"])
                const cancelledReply = () => { res.writeHead(409, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify({ success: false, cancelled: true })) }
                if (run && run.cancelled) return cancelledReply()

                // Already stored, or being stored right now, for this same picked file: answer with
                // that copy instead of making a second one.
                // The key alone is not trusted to name the same file: a page that reused its session id
                // across albums sent "<session>:1:1" again for a different photo and was answered with the
                // old one, so the new file was never stored. A repeat must also match the album, file name
                // and size of what was stored under the key.
                const key = uploadIdemKey(req.headers["x-upload-order"])
                const fingerprint = aId + "\n" + files.filter(f => f.filename).map(f => f.filename + ":" + f.data.length).join("\n")
                if (key) {
                    const prior = uploadIdem.get(key)
                    if (prior && prior.fingerprint !== fingerprint) {
                        console.log(`[UPLOAD] ${key} reused for a different file — storing it as new`)
                    } else if (prior) {
                        const stored = await prior.done
                        if (stored && stored.length) {
                            console.log(`[UPLOAD] ${key} was already stored — answering with the copy on record`)
                            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                            return res.end(JSON.stringify({ success: true, uploaded: stored.length, images: stored, deduped: true }))
                        }
                        // The earlier attempt stored nothing (it failed, or it was cancelled): this
                        // one does the work.
                    }
                    idemKey = key
                    const entry = { at: Date.now(), fingerprint }
                    entry.done = new Promise(resolve => { idemDone = resolve })
                    uploadIdem.set(key, entry)
                    for (const [k, v] of uploadIdem) if (Date.now() - v.at > 6 * 3600 * 1000) uploadIdem.delete(k)
                }
                let fileIndex = 0
                for (const file of files) {
                    if (!file.filename) continue; // Skip non-file fields
                    const clientTaken = req.headers["x-taken-at"] ? { date: String(req.headers["x-taken-at"]), offset: String(req.headers["x-taken-offset"] || "") } : null
                    const img = await uploadOriginal(file.data, file.filename, aId, clientTaken)
                    if (run && run.cancelled) {
                        // Cancelled while this file was on its way to R2: take the stored copy back out.
                        queueR2Deletes([img.r2KeyOriginal])
                        console.log(`[UPLOAD] ${img.id} dropped: upload cancelled`)
                        continue
                    }
                    const now = orderedAt + fileIndex++
                    const fileType = img.isVideo ? 'video' : 'image';
                    img.originalName = dedupeName(aId, img.originalName)
                    insertStmt.run(img.id, aId, img.originalName, img.width, img.height, img.sizeBytes, img.r2KeyOriginal, 'pending', now, fileType, img.takenAt || null)
                    results.push({ id: img.id, width: img.width, height: img.height, file_type: fileType })
                    if (run) run.ids.add(img.id)
                    // Instantly enqueue for background processing (no DB poll delay)
                    enqueueProcessing({ id: img.id, album_id: aId, r2_key_original: img.r2KeyOriginal, original_name: img.originalName, width: img.width, height: img.height, size_bytes: img.sizeBytes, retry_count: 0, file_type: fileType })
                }
                const newCount = photosDb.prepare("SELECT COUNT(*) as cnt FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'").get(aId).cnt
                const latestImg = photosDb.prepare("SELECT id FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at DESC LIMIT 1").get(aId)
                photosDb.prepare("UPDATE albums SET photo_count = ?, cover_image_id = ?, updated_at = ? WHERE id = ?").run(newCount, latestImg ? latestImg.id : null, Date.now(), aId)
                idemResults = results
                if (run && run.cancelled && !results.length) return cancelledReply()
                console.log(`[UPLOAD] ${results.length} files → R2 in ${Date.now()-t0}ms (upload-only, processing deferred)`)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, uploaded: results.length, images: results }))
            } catch (e) {
                console.error(`[UPLOAD] ERROR:`, e.message)
                if (!res.headersSent) { res.writeHead(500); res.end(JSON.stringify({ success: false, message: e.message })) }
            } finally {
                // Always, including the error and cancelled paths: a repeat that is waiting on this
                // request must never hang, and one that stored nothing must be free to try again.
                if (idemDone) idemDone(idemResults)
                if (idemKey && !(idemResults && idemResults.length)) uploadIdem.delete(idemKey)
                activeUploads--
                lastUploadAt = Date.now()
            }
        })()
        return
    }

    // POST /api/photos/duty-upload — evidence photos from the daily duty check-in (ShiftManager, a
    // static page on GitHub Pages with no login). Multipart { date: "YYYY-MM-DD", name, position,
    // files... }. Open to anyone, so it is narrow on purpose: images only, written only into
    // "เวรประจำวัน" > "dd/mm/yy" (Buddhist year), which it finds or makes itself, and rate limited per IP.
    if (req.method === "POST" && urlPath === "/api/photos/duty-upload") {
        const json = (status, obj) => { if (!res.headersSent) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) } }
        const len = parseInt(req.headers["content-length"] || "0", 10)
        if (!len || len > DUTY_MAX_BODY) { req.resume(); return json(413, { success: false, message: "ไฟล์รวมใหญ่เกินไป" }) }
        const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim()
        req.setTimeout(600000)
        res.setTimeout(600000)
        activeUploads++
        ;(async () => {
            try {
                const ct = req.headers["content-type"] || ""
                const boundaryMatch = ct.match(/boundary=([^;]+)/)
                if (!boundaryMatch) return json(400, { success: false })
                const parts = parseMultipart(await collectBody(req), boundaryMatch[1].trim())
                const field = n => { const p = parts.find(x => x.name === n && !x.filename); return p ? p.data.toString("utf-8").trim() : "" }
                const files = parts.filter(p => p.filename && DUTY_IMAGE_EXTS.includes(path.extname(p.filename).toLowerCase()))
                const date = field("date"), name = field("name").slice(0, 120), position = field("position").slice(0, 120)
                const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
                if (!dm || !name) return json(400, { success: false, message: "ข้อมูลไม่ครบ" })
                const day = new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3]) - LOCAL_UTC_OFFSET_MS)
                if (isNaN(day) || day.getTime() > Date.now() + 86400000 || day.getTime() < Date.now() - DUTY_MAX_AGE_MS) return json(400, { success: false, message: "วันที่ไม่ถูกต้อง" })
                if (!files.length) return json(400, { success: false, message: "ไม่มีไฟล์รูป" })
                if (files.length > DUTY_MAX_FILES) return json(400, { success: false, message: `ส่งได้ครั้งละไม่เกิน ${DUTY_MAX_FILES} รูป` })
                if (!dutyRateOk(ip, files.length)) return json(429, { success: false, message: "ส่งรูปถี่เกินไป รอสักครู่แล้วลองใหม่" })

                // Find or make the folders. All synchronous SQLite, so two check-ins at once cannot both make one.
                const now = Date.now()
                const findChild = (parentId, nm) => parentId
                    ? photosDb.prepare("SELECT * FROM albums WHERE parent_id = ? AND name = ? ORDER BY created_at LIMIT 1").get(parentId, nm)
                    : photosDb.prepare("SELECT * FROM albums WHERE parent_id IS NULL AND name = ? ORDER BY created_at LIMIT 1").get(nm)
                const makeChild = (parentId, nm, evt) => {
                    const id = generateId()
                    photosDb.prepare("INSERT INTO albums (id, name, photo_count, created_at, updated_at, event_date, parent_id) VALUES (?, ?, 0, ?, ?, ?, ?)").run(id, nm, now, now, evt, parentId)
                    return photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(id)
                }
                const root = findChild(null, DUTY_ROOT_ALBUM) || makeChild(null, DUTY_ROOT_ALBUM, now)
                const dayName = `${dm[3]}/${dm[2]}/${String(+dm[1] + 543).slice(-2)}`
                const album = findChild(root.id, dayName) || makeChild(root.id, dayName, day.getTime())
                const aId = album.id

                const clean = s => s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-").replace(/\s+/g, " ").trim()
                const base = clean(position ? `${name}-${position}` : name) || "เวร"
                const insertStmt = photosDb.prepare("INSERT INTO images (id, album_id, original_name, width, height, size_bytes, r2_key_original, processing_status, created_at, file_type, taken_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
                const results = []
                let i = 0
                for (const file of files) {
                    const ext = path.extname(file.filename).toLowerCase()
                    let img
                    try { img = await uploadOriginal(file.data, `${base}${ext}`, aId) }
                    catch (e) { console.warn(`[DUTY] skipped ${file.filename}: ${e.message}`); continue }
                    img.originalName = dedupeName(aId, img.originalName)
                    insertStmt.run(img.id, aId, img.originalName, img.width, img.height, img.sizeBytes, img.r2KeyOriginal, 'pending', Date.now() + i++, 'image', img.takenAt || null)
                    results.push({ id: img.id, name: img.originalName })
                    enqueueProcessing({ id: img.id, album_id: aId, r2_key_original: img.r2KeyOriginal, original_name: img.originalName, width: img.width, height: img.height, size_bytes: img.sizeBytes, retry_count: 0, file_type: 'image' })
                }
                if (!results.length) return json(400, { success: false, message: "อ่านไฟล์รูปไม่ได้" })
                const newCount = photosDb.prepare("SELECT COUNT(*) as cnt FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'").get(aId).cnt
                const latestImg = photosDb.prepare("SELECT id FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at DESC LIMIT 1").get(aId)
                photosDb.prepare("UPDATE albums SET photo_count = ?, cover_image_id = ?, updated_at = ? WHERE id = ?").run(newCount, latestImg ? latestImg.id : null, Date.now(), aId)
                photosDb.prepare("UPDATE albums SET updated_at = ? WHERE id = ?").run(Date.now(), root.id)
                console.log(`[DUTY] ${results.length} photo(s) from ${name} → ${DUTY_ROOT_ALBUM}/${dayName}`)
                json(200, { success: true, uploaded: results.length, album: { id: aId, name: dayName, root_id: root.id }, images: results })
            } catch (e) {
                console.error(`[DUTY] ERROR:`, e.message)
                json(500, { success: false, message: "อัปโหลดไม่สำเร็จ" })
            } finally {
                activeUploads--
                lastUploadAt = Date.now()
            }
        })()
        return
    }

    // POST /api/photos/duty-delete  { date: "YYYY-MM-DD", name, duty?, all? } — the ShiftManager page
    // deleting one of its own entries. Same trust model as duty-upload (no login), so it is held to the
    // same narrow scope: only files in "เวรประจำวัน" › that day, only names starting with
    // "{name}-{duty}-" (or "{name}-" with all=1), and only to the trash, where they can be restored.
    if (req.method === "POST" && urlPath === "/api/photos/duty-delete") {
        const json = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) }
        const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim()
        if (!dutyRateOk(ip, 1)) return json(429, { success: false, message: "ลบถี่เกินไป ลองใหม่อีกสักครู่" })
        ;(async () => {
            try {
                const body = JSON.parse(await collectBody(req))
                const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(body.date || ""))
                const clean = s => String(s || "").replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120)
                const name = clean(body.name), duty = clean(body.duty)
                if (!dm || !name || (!duty && !body.all)) return json(400, { success: false, message: "ข้อมูลไม่ครบ" })
                const root = photosDb.prepare("SELECT id FROM albums WHERE parent_id IS NULL AND name = ? ORDER BY created_at LIMIT 1").get(DUTY_ROOT_ALBUM)
                const dayName = `${dm[3]}/${dm[2]}/${String(+dm[1] + 543).slice(-2)}`
                const album = root && photosDb.prepare("SELECT id FROM albums WHERE parent_id = ? AND name = ? ORDER BY created_at LIMIT 1").get(root.id, dayName)
                if (!album) return json(200, { success: true, deleted: 0 })
                const prefix = body.all ? `${name}-` : `${name}-${duty}-`
                const rows = photosDb.prepare("SELECT id, original_name FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'").all(album.id)
                    .filter(r => r.original_name.startsWith(prefix))
                const del = photosDb.prepare("UPDATE images SET original_name = '[DELETED] ' || original_name, deleted_at = ?, trash_root_id = NULL WHERE id = ? AND original_name NOT LIKE '[DELETED] %'")
                const now = Date.now()
                photosDb.transaction(() => { for (const r of rows) del.run(now, r.id) })()
                const newCount = photosDb.prepare("SELECT COUNT(*) as cnt FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'").get(album.id).cnt
                const latestImg = photosDb.prepare("SELECT id FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at DESC LIMIT 1").get(album.id)
                photosDb.prepare("UPDATE albums SET photo_count = ?, cover_image_id = ?, updated_at = ? WHERE id = ?").run(newCount, latestImg ? latestImg.id : null, now, album.id)
                if (rows.length) console.log(`[DUTY] ${rows.length} photo(s) of ${name} → trash (${DUTY_ROOT_ALBUM}/${dayName})`)
                json(200, { success: true, deleted: rows.length })
            } catch (e) {
                console.error(`[DUTY] delete ERROR:`, e.message)
                json(500, { success: false, message: "ลบไม่สำเร็จ" })
            }
        })()
        return
    }

    // POST /api/photos/images/rename  { items: [{ id, name }] } — rename one or many files. `name` is the
    // new base name; the extension always stays the file's current one. Names already used in the album
    // get " (n)", but files renamed in the same batch don't block each other (so A↔B swaps work).
    if (req.method === "POST" && urlPath === "/api/photos/images/rename") {
        const admin = isAdminReq(req)
        if (!admin && !shareEditorFor(req)) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        ;(async () => {
            try {
                const { items } = JSON.parse(await collectBody(req))
                if (!Array.isArray(items) || !items.length || items.length > 2000) { res.writeHead(400); return res.end(JSON.stringify({ success: false })) }
                const getImg = photosDb.prepare("SELECT id, album_id, original_name FROM images WHERE id = ? AND original_name NOT LIKE '[DELETED] %'")
                const rows = []
                for (const it of items) {
                    const img = getImg.get(String(it && it.id || ""))
                    if (!img) continue
                    if (!admin && !shareEditorCovers(req, img.album_id)) { res.writeHead(403); return res.end(JSON.stringify({ success: false })) }
                    const base = String(it.name || "").replace(/[\\/:*?"<>|\x00-\x1f]+/g, "-").trim().slice(0, 200)
                    if (!base) continue
                    const dot = img.original_name.lastIndexOf(".")
                    rows.push({ img, name: base + (dot > 0 ? img.original_name.slice(dot) : "") })
                }
                const batchIds = new Set(rows.map(r => r.img.id))
                const taken = new Map() // album_id -> names used by files outside this batch + names already assigned
                const setStmt = photosDb.prepare("UPDATE images SET original_name = ? WHERE id = ?")
                const renamed = []
                photosDb.transaction(() => {
                    for (const { img, name } of rows) {
                        if (!taken.has(img.album_id)) {
                            taken.set(img.album_id, new Set(
                                photosDb.prepare("SELECT id, original_name FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'").all(img.album_id)
                                    .filter(r => !batchIds.has(r.id)).map(r => r.original_name)
                            ))
                        }
                        const used = taken.get(img.album_id)
                        let final = name
                        if (used.has(final)) {
                            const dot = name.lastIndexOf(".")
                            const b = dot > 0 ? name.slice(0, dot) : name
                            const ext = dot > 0 ? name.slice(dot) : ""
                            let n = 1
                            while (used.has(`${b} (${n})${ext}`)) n++
                            final = `${b} (${n})${ext}`
                        }
                        used.add(final)
                        setStmt.run(final, img.id)
                        renamed.push({ id: img.id, original_name: final })
                    }
                })()
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, renamed }))
            } catch (e) { console.error(e); res.writeHead(500); res.end(JSON.stringify({ success: false })) }
        })()
        return
    }

    // DELETE /api/photos/images/:id
    if (req.method === "DELETE" && deleteImageMatch) {
        const admin = isAdminReq(req)
        if (!admin && !shareEditorFor(req)) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        const imgId = deleteImageMatch[1]
        ;(async () => {
            try {
                const img = photosDb.prepare("SELECT * FROM images WHERE id = ?").get(imgId)
                if (!img) { console.log("Unhandled:", req.method, req.url); res.writeHead(404); return res.end(JSON.stringify({ success: false })) }
                if (!admin && !shareEditorCovers(req, img.album_id)) { res.writeHead(403); return res.end(JSON.stringify({ success: false })) }
                
                // Soft delete image
                photosDb.prepare("UPDATE images SET original_name = '[DELETED] ' || original_name, deleted_at = ?, trash_root_id = NULL WHERE id = ? AND original_name NOT LIKE '[DELETED] %'").run(Date.now(), imgId)
                
                const newCount = photosDb.prepare("SELECT COUNT(*) as cnt FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'").get(img.album_id).cnt
                const latestImg = photosDb.prepare("SELECT id FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at DESC LIMIT 1").get(img.album_id)
                photosDb.prepare("UPDATE albums SET photo_count = ?, cover_image_id = ?, updated_at = ? WHERE id = ?").run(newCount, latestImg ? latestImg.id : null, Date.now(), img.album_id)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true }))
            } catch (e) { console.error(e); res.writeHead(500); res.end(JSON.stringify({ success: false })) }
        })()
        return
    }

    // Flip an image to 'pending' with a target format and hand it to the background worker —
    // deliberately does NO image I/O here (no R2 download/upload/sharp encode). That heavy work
    // happens once in processOneImage(), off the request. Keeps this a plain, fast SQLite write.
    function queueConvert(img, format) {
        photosDb.prepare("UPDATE images SET processing_status = 'pending', convert_format = ?, processing_started_at = NULL WHERE id = ?")
            .run(format, img.id)
        enqueueProcessing({ id: img.id, album_id: img.album_id, r2_key_original: img.r2_key_original, original_name: img.original_name, width: img.width, height: img.height, size_bytes: img.size_bytes, retry_count: 0, file_type: 'image', convert_format: format })
    }

    // POST /api/photos/images/:id/convert  { format: 'jpg'|'png'|'webp' }
    if (req.method === "POST" && convertMatch) {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        const imgId = convertMatch[1]
        ;(async () => {
            try {
                const body = JSON.parse(await collectBody(req))
                if (!CONVERT_FORMATS[body.format]) { res.writeHead(400); return res.end(JSON.stringify({ success: false, message: "Invalid format" })) }
                const img = photosDb.prepare("SELECT * FROM images WHERE id = ?").get(imgId)
                if (!img || img.file_type === 'video' || !img.r2_key_original) { res.writeHead(404); return res.end(JSON.stringify({ success: false })) }
                queueConvert(img, body.format)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true }))
            } catch (e) { console.error(e); res.writeHead(500); res.end(JSON.stringify({ success: false, message: e.message })) }
        })()
        return
    }

    // POST /api/photos/images/convert-bulk  { ids: [...], format } — queues every id in one quick
    // pass of synchronous SQLite writes, then responds. No network/encoding happens in this request,
    // which is what makes converting hundreds of images at once fast now.
    if (req.method === "POST" && req.url === "/api/photos/images/convert-bulk") {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        ;(async () => {
            try {
                const body = JSON.parse(await collectBody(req))
                const { ids, format } = body
                if (!Array.isArray(ids) || !CONVERT_FORMATS[format]) { res.writeHead(400); return res.end(JSON.stringify({ success: false })) }
                let queued = 0
                for (const imgId of ids) {
                    const img = photosDb.prepare("SELECT * FROM images WHERE id = ?").get(imgId)
                    if (!img || img.file_type === 'video' || !img.r2_key_original) continue
                    queueConvert(img, format)
                    queued++
                }
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, queued }))
            } catch (e) { console.error(e); res.writeHead(500); res.end(JSON.stringify({ success: false })) }
        })()
        return
    }

    // POST /api/photos/images/:id/rethumb[?ifDark=1] — pick a new still for a video (pickVideoFrame) and
    // replace its thumbnail tiers in place. The video stays 'done' throughout, so it never drops out of
    // the grid the way a full reprocess would. With ifDark=1 it first looks at the current thumbnail and
    // leaves videos whose still already shows a picture alone (used to repair old black thumbnails:
    // scripts/video-rethumb.mjs).
    const rethumbMatch = urlPath.match(/^\/api\/photos\/images\/([^/]+)\/rethumb$/)
    if (req.method === "POST" && rethumbMatch) {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        ;(async () => {
            const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) }
            let tmpVid = null
            try {
                const img = photosDb.prepare("SELECT id, album_id, file_type, processing_status, r2_key_original, r2_key_sd, r2_key_medium, r2_key_thumb FROM images WHERE id = ? AND original_name NOT LIKE '[DELETED] %'").get(rethumbMatch[1])
                if (!img || img.file_type !== "video" || !img.r2_key_original) return json(404, { success: false, message: "not a video" })
                if (img.processing_status !== "done") return json(409, { success: false, message: "still processing" })
                // The current still, from whichever size exists: videos processed before the sd size
                // existed have only thumb and medium. Checking sd alone once read those as "unknown" and
                // replaced 60 good stills.
                let before = null
                for (const key of [img.r2_key_sd, img.r2_key_medium, img.r2_key_thumb]) {
                    if (!key) continue
                    try { before = await frameQuality(await getFromR2(key)); break } catch (e) {}
                }
                // ifDark only replaces a still known to be dark: one that cannot be read is left alone.
                if (urlQuery.get("ifDark") === "1" && (!before || before.usable)) return json(200, { success: true, skipped: true, before })
                tmpVid = await downloadVideoToTmp(img)
                const frame = await pickVideoFrame(tmpVid, `/tmp/rethumb_${img.id}_${Date.now()}`)
                await storeVideoFrame(img, frame.buf)
                console.log(`[RETHUMB] ${img.id} frame at ${frame.at}s (brightness ${frame.mean.toFixed(0)}, detail ${frame.stdev.toFixed(0)})`)
                json(200, { success: true, regenerated: true, before, after: { at: frame.at, mean: frame.mean, stdev: frame.stdev, usable: frame.usable } })
            } catch (e) {
                console.error("[RETHUMB]", rethumbMatch[1], e.message)
                json(500, { success: false, message: e.message })
            } finally {
                if (tmpVid) { try { fs.unlinkSync(tmpVid) } catch (e) {} }
            }
        })()
        return
    }

    // POST /api/photos/images/:id/retry — re-run background processing after a failure (position unchanged)
    if (req.method === "POST" && retryMatch) {
        const admin = isAdminReq(req)
        if (!admin && !shareEditorFor(req)) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        const imgId = retryMatch[1]
        ;(async () => {
            try {
                const img = photosDb.prepare("SELECT * FROM images WHERE id = ?").get(imgId)
                if (!img || !img.r2_key_original) { res.writeHead(404); return res.end(JSON.stringify({ success: false })) }
                if (!admin && !shareEditorCovers(req, img.album_id)) { res.writeHead(403); return res.end(JSON.stringify({ success: false })) }
                photosDb.prepare("UPDATE images SET processing_status = 'pending', processing_started_at = NULL, retry_count = 0, last_error = NULL WHERE id = ?").run(imgId)
                enqueueProcessing({ id: imgId, album_id: img.album_id, r2_key_original: img.r2_key_original, original_name: img.original_name, width: img.width, height: img.height, size_bytes: img.size_bytes, retry_count: 0, file_type: img.file_type || 'image' })
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true }))
            } catch (e) { console.error(e); res.writeHead(500); res.end(JSON.stringify({ success: false })) }
        })()
        return
    }

    // POST /api/photos/upload-cancel  { session, blocks: [n], remove, ids? }
    // The album page's cancel button. Marks those upload batches cancelled, so any of their requests
    // still arriving or still being stored is dropped (uploadRunFor). remove: true also moves to the
    // trash every photo the batches stored, including ones whose reply never reached the browser
    // because it aborted the request after the server had the whole file. ids: rows the page knows of,
    // trashed too (a batch older than the server's memory of it, or from before a restart).
    if (req.method === "POST" && urlPath === "/api/photos/upload-cancel") {
        const admin = isAdminReq(req)
        if (!admin && !shareEditorFor(req)) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        ;(async () => {
            const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) }
            try {
                const body = JSON.parse(String(await collectBody(req)) || "{}")
                const session = String(body.session || "")
                if (!/^[A-Za-z0-9_-]{4,40}$/.test(session)) return json(400, { success: false })
                const ids = new Set(Array.isArray(body.ids) ? body.ids.map(String) : [])
                for (const b of Array.isArray(body.blocks) ? body.blocks : []) {
                    if (!/^\d{1,9}$/.test(String(b))) continue
                    const run = uploadRunFor(`${session}:${b}:0`)
                    run.cancelled = body.remove ? "remove" : "stop"
                    if (body.remove) run.ids.forEach(id => ids.add(id))
                }
                const inReach = [...ids].filter(id => { if (admin) return true; const r = photosDb.prepare("SELECT album_id FROM images WHERE id = ?").get(id); return r && shareEditorCovers(req, r.album_id) })
                const trashed = body.remove && inReach.length ? softDeleteImages(inReach) : 0
                console.log(`[UPLOAD] cancel ${session} blocks=${JSON.stringify(body.blocks)} remove=${!!body.remove} trashed=${trashed}`)
                json(200, { success: true, trashed })
            } catch (e) { console.error("[upload-cancel]", e.message); json(400, { success: false }) }
        })()
        return
    }

    // POST /api/photos/images/delete-bulk - delete multiple images (for upload rollback)
    if (req.method === "POST" && req.url === "/api/photos/images/delete-bulk") {
        const admin = isAdminReq(req)
        if (!admin && !shareEditorFor(req)) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        ;(async () => {
            try {
                const body = JSON.parse(await collectBody(req))
                const { ids } = body
                if (!ids || !Array.isArray(ids)) { res.writeHead(400); return res.end(JSON.stringify({ success: false })) }
                // An editor link only reaches files inside what it shares.
                const allowed = admin ? ids : ids.filter(id => { const r = photosDb.prepare("SELECT album_id FROM images WHERE id = ?").get(String(id)); return r && shareEditorCovers(req, r.album_id) })
                softDeleteImages(allowed)
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true }))
            } catch (e) { console.error(e); res.writeHead(500); res.end(JSON.stringify({ success: false })) }
        })()
        return
    }

    // GET /api/photos/images/status?ids=a,b,c — processing state of specific photos. The album listing
    // only returns finished photos, so an upload tile waiting on a photo that failed processing (or that
    // went into another album) had nothing to wait for and said "processing" forever. The upload tiles
    // poll this for their own ids. Only status is returned, like the album status endpoint.
    if (req.method === "GET" && urlPath === "/api/photos/images/status") {
        const ids = String(new URL(req.url, "http://x").searchParams.get("ids") || "").split(",").map(x => x.trim()).filter(Boolean).slice(0, 200)
        let rows = []
        if (ids.length) rows = photosDb.prepare(`SELECT id, album_id, processing_status, last_error, original_name FROM images WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids)
        const images = rows.map(r => ({
            id: r.id,
            album_id: r.album_id,
            status: String(r.original_name || "").startsWith("[DELETED] ") ? "deleted" : r.processing_status,
            error: r.processing_status === "failed" ? r.last_error : null,
        }))
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
        return res.end(JSON.stringify({ success: true, images }))
    }

    // GET /api/photos/albums/:id/status — processing status for polling
    const statusMatch = urlPath.match(/^\/api\/photos\/albums\/([^/]+)\/status$/)
    if (req.method === "GET" && statusMatch) {
        const aId = statusMatch[1]
        const processing = photosDb.prepare("SELECT COUNT(*) as cnt FROM images WHERE album_id = ? AND processing_status IN ('pending','processing') AND original_name NOT LIKE '[DELETED] %'").get(aId).cnt
        const failed = photosDb.prepare("SELECT COUNT(*) as cnt FROM images WHERE album_id = ? AND processing_status = 'failed' AND original_name NOT LIKE '[DELETED] %'").get(aId).cnt
        const total = photosDb.prepare("SELECT COUNT(*) as cnt FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'").get(aId).cnt
        // Return recently processed images so frontend can update previews
        const recent = photosDb.prepare("SELECT id, preview_b64 FROM images WHERE album_id = ? AND processing_status = 'done' AND original_name NOT LIKE '[DELETED] %' AND preview_b64 IS NOT NULL ORDER BY processed_at DESC LIMIT 50").all(aId)
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
        return res.end(JSON.stringify({ processing, failed, total, activeUploads, recent }))
    }

    // POST /api/photos/images/move — move images to another album
    if (req.method === "POST" && urlPath === "/api/photos/images/move") {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", async () => {
            try {
                const { ids, targetAlbumId, password } = JSON.parse(body)
                if (!ids || !targetAlbumId) { res.writeHead(400); return res.end(JSON.stringify({ success: false })) }
                const target = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(targetAlbumId)
                if (!target) { console.log("Unhandled:", req.method, req.url); res.writeHead(404); return res.end(JSON.stringify({ success: false, message: "Target album not found" })) }
                
                {
                    const hasAccess = await passesLockGate(req, target, password)
                    if (!hasAccess) {
                        res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" })
                        return res.end(JSON.stringify({ success: false, locked: true, message: "รหัสผ่านอัลบั้มปลายทางไม่ถูกต้อง" }))
                    }
                }

                const sourceAlbums = new Set()
                for (const id of ids) {
                    const img = photosDb.prepare("SELECT album_id FROM images WHERE id = ?").get(id)
                    if (img) {
                        sourceAlbums.add(img.album_id)
                        photosDb.prepare("UPDATE images SET album_id = ? WHERE id = ?").run(targetAlbumId, id)
                    }
                }
                // Update counts for all affected albums
                sourceAlbums.add(targetAlbumId)
                for (const aId of sourceAlbums) {
                    const cnt = photosDb.prepare("SELECT COUNT(*) as cnt FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'").get(aId).cnt
                    const latest = photosDb.prepare("SELECT id FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at DESC LIMIT 1").get(aId)
                    photosDb.prepare("UPDATE albums SET photo_count = ?, cover_image_id = ?, updated_at = ? WHERE id = ?").run(cnt, latest ? latest.id : null, Date.now(), aId)
                }
                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
                res.end(JSON.stringify({ success: true, moved: ids.length }))
            } catch (e) { res.writeHead(400); res.end(JSON.stringify({ success: false })) }
        })
        return
    }

    // POST /api/photos/images/copy — duplicate image rows into another album.
    // Copies point at the SAME R2 objects (no storage duplication), so any code path that deletes an
    // R2 object must first check r2KeyReferencedElsewhere().
    if (req.method === "POST" && urlPath === "/api/photos/images/copy") {
        if (req.headers.authorization !== PHOTOS_PASSWORD) { res.writeHead(401); return res.end(JSON.stringify({ success: false })) }
        let body = ""
        req.setEncoding("utf8"); req.on("data", chunk => body += chunk)
        req.on("end", async () => {
            const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)) }
            try {
                const { ids, targetAlbumId, password } = JSON.parse(body)
                if (!Array.isArray(ids) || !ids.length || ids.length > 5000 || !targetAlbumId) return json(400, { success: false })
                const target = photosDb.prepare("SELECT * FROM albums WHERE id = ?").get(targetAlbumId)
                if (!target || target.name.startsWith('[DELETED] ')) return json(404, { success: false, message: "ไม่พบอัลบั้มปลายทาง" })

                if (!(await passesLockGate(req, target, password))) return json(403, { success: false, locked: true, message: "รหัสผ่านอัลบั้มปลายทางไม่ถูกต้อง" })

                const getImg = photosDb.prepare("SELECT * FROM images WHERE id = ?")
                const rows = ids.map(id => getImg.get(id)).filter(Boolean)

                // Copying out of a locked album into another album would bypass its password, so the
                // caller must hold access to every source album, not just the destination.
                const getAlbum = photosDb.prepare("SELECT * FROM albums WHERE id = ?")
                for (const srcId of new Set(rows.map(r => r.album_id))) {
                    if (!validateAlbumAccess(req, getAlbum.get(srcId))) return json(403, { success: false, message: "ไม่มีสิทธิ์เข้าถึงอัลบั้มต้นทาง" })
                }

                // Only finished, non-deleted items: a pending/processing/failed row isn't in any worker
                // queue under its new id, so a copy of it would stay stuck forever.
                const copyable = rows.filter(r =>
                    r.processing_status === 'done' && !r.convert_format && r.r2_key_original &&
                    !(r.original_name || '').startsWith('[DELETED] '))

                const columns = photosDb.prepare("PRAGMA table_info(images)").all().map(c => c.name)
                const insert = photosDb.prepare(`INSERT INTO images (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`)
                const idExists = photosDb.prepare("SELECT 1 FROM images WHERE id = ?")
                const takenNames = new Set(
                    photosDb.prepare("SELECT original_name FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'").all(targetAlbumId).map(r => r.original_name))
                const uniqueName = (name) => {
                    if (!takenNames.has(name)) return name
                    const dot = name.lastIndexOf('.')
                    const base = dot > 0 ? name.slice(0, dot) : name
                    const ext = dot > 0 ? name.slice(dot) : ''
                    let n = 1
                    while (takenNames.has(`${base} (${n})${ext}`)) n++
                    return `${base} (${n})${ext}`
                }

                photosDb.transaction(() => {
                    for (const row of copyable) {
                        let newId
                        do { newId = generateId() } while (idExists.get(newId))
                        const name = uniqueName(row.original_name || newId)
                        takenNames.add(name)
                        // folder_id belongs to the source album's folder tree, so it doesn't carry over.
                        const copy = { ...row, id: newId, album_id: targetAlbumId, original_name: name, folder_id: null }
                        insert.run(...columns.map(c => copy[c] === undefined ? null : copy[c]))
                    }
                    const cnt = photosDb.prepare("SELECT COUNT(*) as cnt FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'").get(targetAlbumId).cnt
                    const latest = photosDb.prepare("SELECT id FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at DESC LIMIT 1").get(targetAlbumId)
                    photosDb.prepare("UPDATE albums SET photo_count = ?, cover_image_id = ?, updated_at = ? WHERE id = ?").run(cnt, latest ? latest.id : null, Date.now(), targetAlbumId)
                })()

                json(200, { success: true, copied: copyable.length, skipped: ids.length - copyable.length })
            } catch (e) { console.error("[copy]", e); json(400, { success: false }) }
        })
        return
    }

    // GET /api/image/:id/:variant[?download=1] — 302 to a signed R2 URL so the browser pulls the bytes
    // straight from R2. Proxying them through this VPS capped every image at ~50 KB/s.
    if (req.method === "GET" && imageServeMatch) {
        const imgId = imageServeMatch[1]
        const variant = imageServeMatch[2]
        ;(async () => {
            try {
                const img = photosDb.prepare(`SELECT r2_key_preview, r2_key_thumb, r2_key_sd, r2_key_medium, r2_key_4k, r2_key_original, original_name, processing_status, file_type, width, height, size_bytes FROM images WHERE id = ?`).get(imgId)
                if (!img) { res.writeHead(404); return res.end("Not Found") }
                const isDownload = urlQuery.get("download") === "1"

                // Video quality ladder: the list for the player's menu, and each finished rung.
                if (variant === "renditions") {
                    if (img.file_type !== "video") { res.writeHead(404); return res.end("Not Found") }
                    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
                    return res.end(JSON.stringify({ success: true, ...videoRenditionsFor(img) }))
                }
                // vmax720: "up to 720p" for downloads (resolveVideoDownload); falls through to the normal
                // download path below with the picked file.
                let videoDl = null
                if (variant.startsWith("vmax")) {
                    if (img.file_type !== "video") { res.writeHead(404); return res.end("Not Found") }
                    videoDl = resolveVideoDownload(img, Number(variant.slice(4)))
                }
                if (variant.startsWith("v") && !videoDl) {
                    const r = img.file_type === "video" && photosDb.prepare("SELECT r2_key FROM video_renditions WHERE source_key = ? AND height = ? AND status = 'done'").get(img.r2_key_original, Number(variant.slice(1)))
                    if (!r || !r.r2_key) { res.writeHead(404); return res.end("Not Found") }
                    res.writeHead(302, { Location: presignR2Get(r.r2_key, { cacheControl: `private, max-age=${R2_SIGNED_MAX_AGE_S}` }), "Cache-Control": "private, max-age=3600" })
                    return res.end()
                }

                // Smart fallback chain: requested → next best (no original fallback for thumb/preview in grid)
                let r2key = null
                if (videoDl) r2key = videoDl.r2key
                else if (isDownload && img.file_type === "video") r2key = img.r2_key_original // a video's sd/medium keys are poster images
                else if (variant === "thumb") r2key = img.r2_key_thumb
                else if (variant === "sd") r2key = img.r2_key_sd || img.r2_key_thumb
                else if (variant === "medium") r2key = img.r2_key_medium || img.r2_key_original
                else if (variant === "preview") r2key = img.r2_key_preview || img.r2_key_thumb
                else if (variant === "4k") {
                    r2key = img.r2_key_original
                    if (has4kTier(img) && img.processing_status === "done") {
                        if (img.r2_key_4k) r2key = img.r2_key_4k
                        else {
                            try { r2key = await generate4k(imgId) } catch (e) { console.error("[4K on-demand]", imgId, e.message) }
                        }
                    }
                }
                else r2key = img.r2_key_original

                // Lazy backfill: images processed before the "sd" tier existed don't have r2_key_sd yet.
                // Generate it once on first request instead of a bulk reprocessing job.
                if (variant === "sd" && !img.r2_key_sd && img.r2_key_original && img.processing_status === 'done' && img.file_type !== "video") {
                    try {
                        const origBuf = await getFromR2(img.r2_key_original)
                        const sdBuf = await sharp(origBuf).rotate().resize(640, null, { fit: "inside" }).webp({ quality: 58, effort: 4 }).toBuffer()
                        const sdKey = img.r2_key_original.replace(/_original\.[^.]+$/, '_sd.webp')
                        await uploadWithRetry(sdKey, sdBuf, "image/webp")
                        photosDb.prepare("UPDATE images SET r2_key_sd = ? WHERE id = ?").run(sdKey, imgId)
                        r2key = sdKey
                    } catch (e) { console.error("[SD backfill]", imgId, e.message) }
                }

                if (!r2key) { res.writeHead(404); return res.end("Not Found") }

                let contentDisposition
                if (isDownload) {
                    let dlName = img.original_name || imgId;
                    if (/^image\.(jpg|jpeg|png|heic)$/i.test(dlName) || /^[0-9_-]+\.[a-z]+$/i.test(dlName) || dlName.startsWith(imgId)) {
                        const album = photosDb.prepare("SELECT name FROM albums WHERE id = (SELECT album_id FROM images WHERE id = ?)").get(imgId);
                        if (album) {
                            const siblings = photosDb.prepare("SELECT id FROM images WHERE album_id = (SELECT album_id FROM images WHERE id = ?) AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at ASC").all(imgId);
                            const idx = siblings.findIndex(x => x.id === imgId) + 1;
                            dlName = `${album.name}_${idx}`;
                        }
                    }
                    dlName = dlName.replace(/\.[^.]+$/, '') + (videoDl && videoDl.height ? `_${videoDl.height}p` : "") + path.extname(r2key);
                    contentDisposition = `attachment; filename*=UTF-8''${rfc3986(dlName)}`
                }

                // download=1 also yields a different signed URL than the plain one — that's intentional:
                // an <img> (no-cors) and a download fetch() (cors) must not share a cached R2 response, or
                // the fetch reuses a copy stored without CORS headers and fails.
                const location = presignR2Get(r2key, { contentDisposition, cacheControl: `private, max-age=${R2_SIGNED_MAX_AGE_S}` })

                // proxy=1 — stream the bytes through this server instead of redirecting. The redirect is
                // still the default because proxying capped every image at ~50 KB/s, but a fetch() that
                // has to read the bytes (building a ZIP, saving with progress) cannot follow a redirect to
                // R2 unless the bucket's CORS policy names the exact site origin. When it does not, the
                // fetch fails with "TypeError: Failed to fetch" and nothing can be saved, so the client
                // retries through here. Same origin, so CORS never applies.
                if (urlQuery.get("proxy") === "1") {
                    const headers = { "Cache-Control": "private, max-age=600" }
                    if (contentDisposition) headers["Content-Disposition"] = contentDisposition
                    if (location.startsWith("/")) {
                        // Dev overlay: the bytes are a local file, not R2.
                        try {
                            const buf = await getFromR2(r2key)
                            headers["Content-Length"] = buf.length
                            res.writeHead(200, headers)
                            return res.end(buf)
                        } catch (e) {
                            console.error("[proxy dev]", r2key, e.message)
                            if (!res.headersSent) { res.writeHead(502); res.end("Bad Gateway") }
                            return
                        }
                    }
                    const upstream = https.get(location, (up) => {
                        if (!up.statusCode || up.statusCode >= 400) {
                            up.resume()
                            if (!res.headersSent) { res.writeHead(502); res.end("Bad Gateway") }
                            return
                        }
                        if (up.headers["content-type"]) headers["Content-Type"] = up.headers["content-type"]
                        if (up.headers["content-length"]) headers["Content-Length"] = up.headers["content-length"]
                        res.writeHead(200, headers)
                        up.pipe(res)
                    })
                    upstream.on("error", (e) => {
                        console.error("[proxy]", r2key, e.message)
                        if (!res.headersSent) { res.writeHead(502); res.end("Bad Gateway") }
                        else res.destroy()
                    })
                    // The visitor navigated away mid-download: stop pulling from R2.
                    res.on("close", () => upstream.destroy())
                    return
                }
                res.writeHead(302, {
                    Location: location,
                    // Not-yet-final rows fall back to other tiers; don't let the browser pin that choice.
                    "Cache-Control": img.processing_status === "done" ? "private, max-age=3600" : "no-store",
                })
                res.end()
            } catch (e) { console.error(e); if (!res.headersSent) { res.writeHead(500); res.end("Error") } }
        })()
        return
    }

    // GET /api/photos/download-zip/:albumId?ids=a,b&quality=… | ?tree=1&quality=…
    // tree=1 walks the album and every sub-album the request can open; each file carries a `path`
    // (sub-folder/…/name) so the ZIP keeps the folder structure.
    // POST /api/photos/media-summary  { ids } | { tree: albumId } | { share: token, ids }
    // What the download dialog needs to offer only meaningful quality caps: how many photos and videos
    // a download holds, the largest photo edge and the largest video's shorter side ("p"). A video not
    // yet measured makes videoMaxShort null (unknown), and the dialog then hides nothing. Same access as
    // the downloads themselves: the site password (locked albums need their credential), or a share
    // link, which only answers for files inside what it shares.
    if (req.method === "POST" && urlPath === "/api/photos/media-summary") {
        ;(async () => {
            const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)) }
            try {
                const body = JSON.parse(String(await collectBody(req)) || "{}")
                const byId = loadAlbumMap()
                const alive = a => !!a && !a.name.startsWith("[DELETED] ")
                let rows = []
                const cols = "i.id, i.album_id, i.file_type, i.width, i.height, i.r2_key_original"
                const byIds = (ids) => {
                    const out = []
                    const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, 50000)
                    for (let k = 0; k < list.length; k += 500) {
                        const chunk = list.slice(k, k + 500)
                        out.push(...photosDb.prepare(`SELECT ${cols} FROM images i WHERE i.id IN (${chunk.map(() => "?").join(",")}) AND i.original_name NOT LIKE '[DELETED] %'`).all(...chunk))
                    }
                    return out
                }
                if (body.share) {
                    const share = photosDb.prepare("SELECT * FROM shares WHERE id = ?").get(String(body.share))
                    if (!share || share.revoked_at || (share.expires_at && share.expires_at < Date.now())) return json(404, { success: false })
                    // Inside the share: the shared image, or files of the shared album (and of unlocked
                    // sub-albums when the link includes them) - the same rule as the public share API.
                    const inScope = (albumId) => {
                        if (share.kind !== "album") return false
                        const album = byId.get(albumId)
                        if (!alive(album)) return false
                        if (albumId === share.target_id) return true
                        if (!share.include_subfolders) return false
                        const chain = getAlbumChain(album, byId)
                        const idx = chain.findIndex(a => a.id === share.target_id)
                        return idx > 0 && chain.slice(0, idx).every(a => alive(a) && !a.is_locked)
                    }
                    rows = byIds(body.ids).filter(r => share.kind === "image" ? r.id === share.target_id : inScope(r.album_id))
                } else {
                    if (req.headers.authorization !== PHOTOS_PASSWORD) return json(401, { success: false })
                    if (body.tree) {
                        const root = byId.get(String(body.tree))
                        if (!alive(root) || findLockGate(req, root, byId)) return json(404, { success: false })
                        const children = new Map()
                        for (const a of byId.values()) {
                            if (!a.parent_id || !alive(a)) continue
                            if (!children.has(a.parent_id)) children.set(a.parent_id, [])
                            children.get(a.parent_id).push(a)
                        }
                        const stmt = photosDb.prepare(`SELECT ${cols} FROM images i WHERE i.album_id = ? AND i.original_name NOT LIKE '[DELETED] %'`)
                        const queue = [root]
                        while (queue.length && rows.length < 50000) {
                            const a = queue.shift()
                            rows.push(...stmt.all(a.id))
                            for (const c of children.get(a.id) || []) if (!findLockGate(req, c, byId)) queue.push(c)
                        }
                    } else {
                        rows = byIds(body.ids).filter(r => !findLockGate(req, byId.get(r.album_id), byId))
                    }
                }
                const photos = rows.filter(r => r.file_type !== "video")
                const videos = rows.filter(r => r.file_type === "video")
                const srcStmt = photosDb.prepare("SELECT width, height FROM video_sources WHERE source_key = ? AND probed_at IS NOT NULL")
                let videoMaxShort = 0, unknown = 0
                for (const v of videos) {
                    const src = v.r2_key_original && srcStmt.get(v.r2_key_original)
                    if (!src || !src.width) { unknown++; continue }
                    videoMaxShort = Math.max(videoMaxShort, Math.min(src.width, src.height))
                }
                json(200, {
                    success: true,
                    photoCount: photos.length,
                    videoCount: videos.length,
                    // Unknown (null) when any photo lacks stored dimensions, like videos not yet measured.
                    photoMaxEdge: !photos.length || photos.some(r => !r.width || !r.height) ? null : photos.reduce((m, r) => Math.max(m, r.width, r.height), 0),
                    videoMaxShort: unknown || !videos.length ? null : videoMaxShort,
                })
            } catch (e) {
                console.error("[media-summary]", e.message)
                json(400, { success: false })
            }
        })()
        return
    }

    const zipMatch = urlPath.match(/^\/api\/photos\/download-zip\/([^/]+)$/)
    if (req.method === "GET" && zipMatch) {
        const aId = zipMatch[1]
        const quality = urlQuery.get("quality") || "original"
        // Videos have their own quality ("up to" a height, see resolveVideoDownload); original by default.
        const videoMax = Number(urlQuery.get("videoQuality")) || 0
        const idsParam = urlQuery.get("ids")
        const tree = urlQuery.get("tree") === "1"
        const byId = loadAlbumMap()
        // "all": a selection from the all-photos view, spanning albums; each file's own album must be open.
        const crossAlbum = aId === "all"
        const album = crossAlbum ? { id: "all", name: "NEXT9 Photos" } : byId.get(aId)
        if (!album || album.name.startsWith('[DELETED] ')) { res.writeHead(404); return res.end("Album not found") }
        if (!crossAlbum && findLockGate(req, album, byId)) { res.writeHead(403); return res.end("Album locked") }
        const cols = "id, album_id, original_name, file_type, width, height, processing_status, r2_key_sd, r2_key_medium, r2_key_4k, r2_key_original, taken_at, created_at"
        const safeSegment = str => String(str || "").replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").replace(/^\.+/, "_").trim().slice(0, 120) || "_"
        let entries = []
        if (tree) {
            const children = new Map()
            for (const a of byId.values()) {
                if (!a.parent_id || a.name.startsWith('[DELETED] ')) continue
                if (!children.has(a.parent_id)) children.set(a.parent_id, [])
                children.get(a.parent_id).push(a)
            }
            const stmt = photosDb.prepare(`SELECT ${cols} FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %' ORDER BY created_at`)
            const queue = [{ a: album, dir: "" }]
            while (queue.length && entries.length < 20000) {
                const { a, dir } = queue.shift()
                for (const img of stmt.all(a.id)) entries.push({ img, dir })
                for (const child of children.get(a.id) || []) {
                    if (findLockGate(req, child, byId)) continue // locked sub-folders stay out of the ZIP
                    queue.push({ a: child, dir: dir + safeSegment(child.name) + "/" })
                }
            }
        } else if (idsParam && crossAlbum) {
            const one = photosDb.prepare(`SELECT ${cols} FROM images WHERE id = ? AND original_name NOT LIKE '[DELETED] %'`)
            entries = idsParam.split(",").filter(Boolean).map(id => one.get(id))
                .filter(img => img && !findLockGate(req, byId.get(img.album_id), byId))
                .map(img => ({ img, dir: "" }))
        } else if (idsParam) {
            const one = photosDb.prepare(`SELECT ${cols} FROM images WHERE id = ? AND album_id = ?`)
            entries = idsParam.split(",").filter(Boolean).map(id => one.get(id, aId)).filter(Boolean).map(img => ({ img, dir: "" }))
        } else if (crossAlbum) {
            res.writeHead(400); return res.end("ids required")
        } else {
            entries = photosDb.prepare(`SELECT ${cols} FROM images WHERE album_id = ? AND original_name NOT LIKE '[DELETED] %'`).all(aId).map(img => ({ img, dir: "" }))
        }
        if (entries.length === 0) { res.writeHead(404); return res.end("No images") }

        // Signed URLs for tiers that already exist. url: null means the tier still has to be generated;
        // the client then falls back to /api/image/:id/:quality?download=1, which builds it and redirects.
        const usedPaths = new Set()
        const files = entries.map(({ img, dir }, idx) => {
            if (!img.r2_key_original) return null
            let r2key, ext, suffix = ""
            if (img.file_type === "video") {
                const v = resolveVideoDownload(img, videoMax)
                r2key = v.r2key
                if (v.height) suffix = `_${v.height}p`
            }
            else if (quality === "original") r2key = img.r2_key_original
            else if (quality === "sd") { r2key = img.processing_status === "done" ? img.r2_key_sd : null; ext = ".webp" }
            else if (quality === "4k") { r2key = has4kTier(img) ? img.r2_key_4k : img.r2_key_original; ext = ".jpg" }
            else r2key = img.r2_key_medium || img.r2_key_original
            if (r2key) ext = path.extname(r2key) || ".jpg"
            let dlName = img.original_name || img.id
            if (/^image\.(jpg|jpeg|png|heic)$/i.test(dlName) || /^[0-9_-]+\.[a-z]+$/i.test(dlName) || dlName.startsWith(img.id)) {
                dlName = `${album.name}_${idx + 1}`
            }
            const base = safeSegment(dlName.replace(/\.[^.]+$/, '') + suffix)
            let filePath = dir + base + ext
            for (let n = 2; usedPaths.has(filePath.toLowerCase()); n++) filePath = `${dir}${base} (${n})${ext}`
            usedPaths.add(filePath.toLowerCase())
            return { id: img.id, url: r2key ? presignR2Get(r2key, { contentDisposition: "attachment" }) : null, name: filePath.split("/").pop(), path: filePath, taken_at: img.taken_at || img.created_at || null }
        }).filter(Boolean)

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
        return res.end(JSON.stringify({ zipName: album.name.replace(/[^a-zA-Z0-9ก-๙]/g, '_') + '.zip', files }))
    }

    console.log("Unhandled:", req.method, req.url); res.writeHead(404)
    res.end("Not Found")
})

server.listen(port, () => {
    console.log("Server running on port", port)
})