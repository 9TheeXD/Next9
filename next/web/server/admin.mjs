// The admin pages' API, public settings, files from R2, and the generated ShiftManager scripts.
// Mounted from handleApi (server/api.mjs), which passes the R2 helpers in `ctx`.
//
//   GET  /api/file/<key>                    302 to a signed R2 URL (site images, member photos, form photos)
//   GET  /api/settings/public?s=site,home   public settings sections
//   POST /api/auth/check {kind, password}   checks one of the staff passwords
//   GET  /api/building/rooms/<n>(.json)     rooms of one building, by floor (/forms/building/rooms/<n>.json)
//   GET  /api/duty/config.js | data.js      ShiftManager's js/config.js and js/data.js, from settings
//
//   POST /api/admin/login {password}        -> { token }   (every other /api/admin/* call sends
//                                                            Authorization: Bearer <token>)
//   GET|PUT /api/admin/settings/<section>   one settings section
//   GET|PUT /api/admin/doc/<name>           the forms' own documents (inert, pinkbook, toilet, inspectors)
//   GET|PUT /api/admin/passwords
//   GET|PUT /api/admin/secrets              (GET never returns the values)
//   POST /api/admin/upload-url {name, type} -> { key, url } signed PUT into next9/site/
//   POST /api/admin/students/sync           reload the student list from its Google Sheet
//   GET  /api/admin/status                  configuration check for the handover page
//   GET  /api/admin/export                  every setting as one JSON file
//   POST /api/admin/import                  restore that file
import crypto from "node:crypto"
import { kvGet, kvSet } from "./kv.mjs"
import { getCachedToken, httpRequest } from "./google-sheets.js"
import {
    DEFAULTS, PUBLIC_SECTIONS, PASSWORD_KINDS, getSettings, getManySettings, saveSettings,
    getPasswords, savePasswords, describeSecrets, saveSecrets, getSecret, getServiceAccount,
    issueAdminToken, verifyAdminToken, getSchool,
} from "./settings.mjs"

// kv documents the forms already had before the admin pages, editable here as they are.
const DOCS = {
    inert: { key: "inert_config", fallback: {} },
    pinkbook: { key: "pinkbook_config", fallback: {} },
    toilet: { key: "toilet_config", fallback: { rooms: [], problems: [] } },
    inspectors: { key: "inspectors", fallback: [] },
}

// Pages built from settings; saving a section refreshes them at once instead of waiting for the
// periodic revalidation.
const PAGES_OF = {
    site: ["/", "/about/", "/policy/", "/problem/", "/links/", "/member/", "/member/grade/"],
    home: ["/"],
    about: ["/about/"],
    problem: ["/problem/"],
    policies: ["/", "/policy/"],
    links: ["/links/"],
    members: ["/member/", "/member/grade/"],
}

// Files the site may hand out through /api/file/. Album photos have their own access rules
// (/api/image/) and backups are private, so neither is reachable here.
function publicFileKey(key) {
    if (!key.startsWith("next9/") || key.includes("..") || key.includes("//")) return false
    return !/^next9\/(photos|assess-row|backups?)\//.test(key)
}

// Browsers always ask again; Vercel's CDN answers repeats for 30 s (and serves the old copy while it
// refreshes), so a settings change reaches everyone within about half a minute.
const SHORT_CACHE = { "Cache-Control": "public, max-age=0, must-revalidate", "CDN-Cache-Control": "max-age=30, stale-while-revalidate=300" }

const json = (res, code, body, headers = {}) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers })
    res.end(JSON.stringify(body))
}

async function readJson(req, limit = 2 * 1024 * 1024) {
    const chunks = []
    let size = 0
    for await (const c of req) {
        size += c.length
        if (size > limit) throw new Error("ข้อมูลใหญ่เกินไป")
        chunks.push(c)
    }
    const text = Buffer.concat(chunks).toString("utf8")
    return text ? JSON.parse(text) : {}
}

async function revalidate(res, paths) {
    if (typeof res.revalidate !== "function") return
    await Promise.all([...new Set(paths)].map((p) => res.revalidate(p).catch((e) => console.warn("[revalidate]", p, e.message))))
}

export async function handleAdminApi(req, res, ctx) {
    const url = new URL(req.url, "http://x")
    // Rewritten requests (next.config.ts) may arrive with their original path.
    const path = url.pathname
        .replace(/^\/duty\/js\/(config|data)\.js$/, "/api/duty/$1.js")
        .replace(/^\/forms\/building\/rooms\//, "/api/building/rooms/")

    // ---- files ----
    if (req.method === "GET" && path.startsWith("/api/file/")) {
        let key
        try { key = decodeURIComponent(path.slice("/api/file/".length)) } catch { return json(res, 400, { success: false }) }
        if (!publicFileKey(key)) return json(res, 404, { success: false })
        // The signed URL stays the same for hours (see presignR2Get), so browsers and Vercel's CDN can
        // keep the redirect for an hour.
        res.writeHead(302, { Location: ctx.presignR2Get(key, { cacheControl: "public, max-age=64800" }), "Cache-Control": "public, max-age=3600, s-maxage=3600" })
        return res.end()
    }

    // ---- public settings ----
    if (req.method === "GET" && path === "/api/settings/public") {
        const wanted = (url.searchParams.get("s") || "").split(",").map((s) => s.trim()).filter((s) => PUBLIC_SECTIONS.has(s))
        const out = await getManySettings(wanted)
        return json(res, 200, { success: true, settings: out }, { ...SHORT_CACHE })
    }

    // ---- member list (the editor reads it uncached) ----
    if (req.method === "GET" && path === "/api/members") {
        return json(res, 200, await ctx.downloadMembers())
    }

    // ---- staff passwords (the pages that used to compare in the browser) ----
    if (req.method === "POST" && path === "/api/auth/check") {
        const { kind, password } = await readJson(req).catch(() => ({}))
        if (!PASSWORD_KINDS[kind] || kind === "admin") return json(res, 400, { success: false })
        const pw = await getPasswords()
        const ok = typeof password === "string" && (password === pw[kind] || password === pw.admin)
        return json(res, ok ? 200 : 401, { success: ok })
    }

    // ---- building rooms (the forms used to read /forms/building/rooms/<n>.json files) ----
    const roomsMatch = path.match(/^\/api\/building\/rooms\/([^/]+?)(?:\.json)?$/)
    if (req.method === "GET" && roomsMatch) {
        const { buildings } = await getSettings("building")
        const b = (buildings || []).find((x) => String(x.number).trim() === roomsMatch[1])
        if (!b) return json(res, 404, {})
        const floors = {}
        for (const f of b.floors || []) {
            const rooms = (Array.isArray(f.rooms) ? f.rooms : String(f.rooms || "").split(/[,\s]+/)).map((r) => String(r).trim()).filter(Boolean)
            if (String(f.floor).trim()) floors[String(f.floor).trim()] = rooms
        }
        return json(res, 200, floors, { ...SHORT_CACHE })
    }

    // ---- ShiftManager scripts ----
    if (req.method === "GET" && (path === "/api/duty/config.js" || path === "/api/duty/data.js")) {
        const d = await getSettings("duty")
        let body
        if (path.endsWith("config.js")) {
            const cfg = {
                SCRIPT_URL: d.script_url, SHEET_ID: d.sheet_id, SHEET_GID: String(d.sheet_gid), PHOTOS_ORIGIN: "",
                PHOTOS_ROOT_ALBUM: d.root_album, MAX_PHOTOS: Number(d.max_photos) || 20, MAX_IMAGE_DIM: 1600, IMAGE_QUALITY: 0.82,
                SESSION_KEY: "duty_current_user", APP_VERSION: "3.3.0",
            }
            body = `// Generated by the NEXT9 site from its settings (admin → เวรประจำวัน).\nconst CONFIG = ${JSON.stringify(cfg, null, 2)};\n`
        } else {
            const members = (d.members || []).map((m, i) => ({ ...m, id: Number(m.id) || i + 1 }))
            body = `// Generated by the NEXT9 site from its settings (admin → เวรประจำวัน).
const MEMBERS = ${JSON.stringify(members, null, 1)};
const DUTY_STATIONS = ${JSON.stringify(d.stations || [], null, 1)};
const STATUSES = ${JSON.stringify(d.statuses || [], null, 1)};
function getMemberById(id) { return MEMBERS.find(m => m.id === id) || null; }
function getMemberByFullName(fullName) { return MEMBERS.find(m => m.fullName === fullName) || null; }
`
        }
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", ...SHORT_CACHE })
        return res.end(body)
    }

    if (!path.startsWith("/api/admin/")) return false

    // ---- admin ----
    if (req.method === "POST" && path === "/api/admin/login") {
        const { password } = await readJson(req).catch(() => ({}))
        const pw = await getPasswords()
        // Slow down guessing a little.
        await new Promise((r) => setTimeout(r, 400))
        // ADMIN_RESET_PASSWORD (Vercel env, 8+ characters) also opens the admin pages: the way back in
        // when the admin password is lost. Remove it again after setting a new password.
        const reset = process.env.ADMIN_RESET_PASSWORD || ""
        const ok = typeof password === "string" && !!password && (password === pw.admin || (reset.length >= 8 && password === reset))
        if (!ok) return json(res, 401, { success: false, message: "รหัสผ่านไม่ถูกต้อง" })
        return json(res, 200, { success: true, token: await issueAdminToken() })
    }

    const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "")
    if (!(await verifyAdminToken(bearer))) return json(res, 401, { success: false, message: "กรุณาเข้าสู่ระบบใหม่" })

    try {
        if (req.method === "GET" && path === "/api/admin/me") return json(res, 200, { success: true })

        // Terms + classes as every system sees them (settings.mjs getSchool), uncached.
        if (req.method === "GET" && path === "/api/admin/school") return json(res, 200, { success: true, school: await getSchool() })

        const sectionMatch = path.match(/^\/api\/admin\/settings\/([a-z_]+)$/)
        if (sectionMatch) {
            const section = sectionMatch[1]
            if (!DEFAULTS[section]) return json(res, 404, { success: false, message: "ไม่พบหมวดนี้" })
            if (req.method === "GET") return json(res, 200, { success: true, value: await getSettings(section), defaults: DEFAULTS[section] })
            if (req.method === "PUT") {
                const value = await saveSettings(section, await readJson(req))
                await revalidate(res, PAGES_OF[section] || [])
                return json(res, 200, { success: true, value })
            }
        }

        const docMatch = path.match(/^\/api\/admin\/doc\/([a-z_]+)$/)
        if (docMatch) {
            const doc = DOCS[docMatch[1]]
            if (!doc) return json(res, 404, { success: false })
            if (req.method === "GET") return json(res, 200, { success: true, value: (await kvGet(doc.key, null)) ?? doc.fallback })
            if (req.method === "PUT") {
                const value = await readJson(req)
                if (Array.isArray(doc.fallback) !== Array.isArray(value)) return json(res, 400, { success: false, message: "รูปแบบข้อมูลไม่ถูกต้อง" })
                await kvSet(doc.key, value)
                return json(res, 200, { success: true, value })
            }
        }

        if (path === "/api/admin/passwords") {
            if (req.method === "PUT") await savePasswords(await readJson(req))
            const pw = await getPasswords()
            const kinds = Object.fromEntries(Object.entries(PASSWORD_KINDS).map(([k, d]) => [k, { label: d.label, value: pw[k] }]))
            return json(res, 200, { success: true, kinds })
        }

        if (path === "/api/admin/secrets") {
            if (req.method === "PUT") return json(res, 200, { success: true, secrets: await saveSecrets(await readJson(req, 64 * 1024)) })
            return json(res, 200, { success: true, secrets: await describeSecrets() })
        }

        if (req.method === "POST" && path === "/api/admin/upload-url") {
            const { name, type } = await readJson(req)
            if (!/^image\/|^application\/pdf$/.test(String(type || ""))) return json(res, 400, { success: false, message: "อัปโหลดได้เฉพาะรูปภาพ" })
            const ext = (String(name || "").match(/\.[a-z0-9]{1,5}$/i)?.[0] || "").toLowerCase()
            const key = `next9/site/${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}${ext}`
            return json(res, 200, { success: true, key, url: ctx.presignR2Put(key) })
        }

        if (req.method === "POST" && path === "/api/admin/students/sync") {
            const count = await ctx.syncStudents()
            return json(res, 200, { success: true, count })
        }

        // Reads the sheet with the settings in the body (not yet saved) and shows what would be imported.
        if (req.method === "POST" && path === "/api/admin/students/preview") {
            const body = await readJson(req)
            const settings = { ...(await getSettings("students_import")), ...(body || {}) }
            return json(res, 200, { success: true, preview: await ctx.syncStudents({ dryRun: true, settings }) })
        }

        if (req.method === "GET" && path === "/api/admin/students") {
            const list = (await kvGet("students", [])) || []
            const byGrade = {}
            for (const s of list) {
                const g = s.class ?? s.cls ?? s.grade ?? "?"
                byGrade[g] = (byGrade[g] || 0) + 1
            }
            return json(res, 200, { success: true, count: list.length, byGrade, sample: list.slice(0, 5) })
        }

        // The assessment system (assessRow) is managed from here too: its admin APIs, called with the
        // secret both projects share (NEXT9_ASSESS_SECRET). See assessRow/lib/session.js.
        const assessMatch = path.match(/^\/api\/admin\/assess\/((?:settings\/(?:lock|eval-time|term))|(?:admin\/(?:whitelist|email-rules|accounts|overview)))$/)
        if (assessMatch) {
            // NEXT9_ASSESS_SECRET, or derived from the R2 key both projects share (assessRow/lib/session.js).
            const secret = process.env.NEXT9_ASSESS_SECRET || (process.env.R2_SECRET_KEY ? crypto.createHash("sha256").update(`next9-assess-integration:${process.env.R2_SECRET_KEY}`).digest("hex") : "")
            if (secret.length < 16) return json(res, 503, { success: false, message: "ยังไม่ได้ตั้ง NEXT9_ASSESS_SECRET หรือ R2_SECRET_KEY ใน Vercel" })
            const base = (process.env.ASSESS_URL || "https://assess-row-sdh.vercel.app").replace(/\/+$/, "")
            const chunks = []
            for await (const c of req) chunks.push(c)
            const r = await fetch(`${base}/api/${assessMatch[1]}${url.search}`, {
                method: req.method,
                headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
                body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
                redirect: "manual",
                signal: AbortSignal.timeout(20000),
            })
            const text = await r.text()
            if (r.status >= 300 && r.status < 400) return json(res, 502, { success: false, message: "ระบบประเมินไม่ยอมรับการเชื่อมต่อ (R2_SECRET_KEY หรือ NEXT9_ASSESS_SECRET ของสอง project ต้องตรงกัน และระบบประเมินต้อง deploy รุ่นล่าสุดแล้ว)" })
            res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") || "application/json", "Cache-Control": "no-store" })
            return res.end(text)
        }

        if (req.method === "GET" && path === "/api/admin/status") return json(res, 200, { success: true, checks: await statusChecks(url.searchParams.get("deep") === "1") })

        if (req.method === "GET" && path === "/api/admin/export") {
            const out = { exportedAt: new Date().toISOString(), settings: {}, docs: {} }
            for (const s of Object.keys(DEFAULTS)) out.settings[s] = await getSettings(s)
            for (const [name, d] of Object.entries(DOCS)) out.docs[name] = (await kvGet(d.key, null)) ?? d.fallback
            if (url.searchParams.get("passwords") === "1") out.passwords = await getPasswords()
            const stamp = new Date().toISOString().slice(0, 10)
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="next9-settings-${stamp}.json"`, "Cache-Control": "no-store" })
            return res.end(JSON.stringify(out, null, 2))
        }

        if (req.method === "POST" && path === "/api/admin/import") {
            const data = await readJson(req, 8 * 1024 * 1024)
            const done = []
            for (const [s, v] of Object.entries(data.settings || {})) if (DEFAULTS[s]) { await saveSettings(s, v); done.push(s) }
            for (const [name, v] of Object.entries(data.docs || {})) if (DOCS[name]) { await kvSet(DOCS[name].key, v); done.push(name) }
            if (data.passwords) { await savePasswords(data.passwords); done.push("passwords") }
            await revalidate(res, Object.values(PAGES_OF).flat())
            return json(res, 200, { success: true, imported: done })
        }

        return json(res, 404, { success: false, message: "ไม่พบคำสั่งนี้" })
    } catch (e) {
        console.error("[admin]", req.method, path, e)
        return json(res, 400, { success: false, message: e.message || "ทำรายการไม่สำเร็จ" })
    }
}

// What a new team needs to know is working. deep=1 also calls Google and LINE.
async function statusChecks(deep) {
    const env = (n) => !!process.env[n]
    const checks = []
    const add = (group, name, ok, detail = "", fix = "") => checks.push({ group, name, ok, detail, fix })

    add("พื้นฐาน (Vercel → Environment Variables)", "ฐานข้อมูล Turso", env("TURSO_DATABASE_URL") && env("TURSO_AUTH_TOKEN"), "", "ใส่ TURSO_DATABASE_URL และ TURSO_AUTH_TOKEN")
    add("พื้นฐาน (Vercel → Environment Variables)", "ที่เก็บไฟล์ Cloudflare R2", env("CF_ACCOUNT_ID") && env("R2_ACCESS_KEY") && env("R2_SECRET_KEY"), process.env.R2_BUCKET || "assets", "ใส่ CF_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY")
    add("พื้นฐาน (Vercel → Environment Variables)", "ALBUM_TOKEN_SECRET", env("ALBUM_TOKEN_SECRET"), "", "ตั้งเป็นข้อความสุ่มยาวๆ และห้ามเปลี่ยน")
    add("พื้นฐาน (Vercel → Environment Variables)", "CRON_SECRET (งานล้างข้อมูลรายวัน)", env("CRON_SECRET"), "", "ตั้งเป็นข้อความสุ่มยาวๆ")
    add("พื้นฐาน (Vercel → Environment Variables)", "SITE_ORIGIN (ที่อยู่เว็บ)", env("SITE_ORIGIN"), process.env.SITE_ORIGIN || "", "เช่น https://next9-web.vercel.app")

    const saved = (await kvGet("passwords", null)) || {}
    add("รหัสผ่าน", "รหัสผ่านผู้ดูแลตั้งแล้ว", !!saved.admin || env("ADMIN_PASSWORD"), saved.admin ? "ตั้งในหน้าจัดการ" : env("ADMIN_PASSWORD") ? "จาก ADMIN_PASSWORD" : "ยังใช้รหัสของหน้าแก้ไขสมาชิก", "หน้ารหัสผ่าน → ตั้งรหัสผู้ดูแลใหม่")

    const sa = await getServiceAccount()
    add("Google", "Service account", !!sa, sa?.client_email || "", "หน้าคีย์เชื่อมต่อ → ใส่ไฟล์ JSON ของ service account")
    const sheets = await getSettings("sheets")
    const inert = (await kvGet("inert_config", null)) || {}
    const school = await getSettings("school")
    const inertSheet = inert.terms?.[String(school.term)]?.SHEET_ID || inert.SHEET_ID || process.env.INERT_SHEET_ID || ""
    const sheetList = [
        ["Sheet ตรวจอาคาร", (sheets.building_sheet_id || process.env.BUILDING_SHEET_ID || "").trim()],
        ["Sheet รายชื่อนักเรียน", ((await getSettings("students_import")).sheet_id || sheets.students_sheet_id || process.env.STUDENTS_SHEET_ID || "").trim()],
        [`Sheet สาย-เฉื่อย (ภาคเรียน ${school.term})`, String(inertSheet).replace(/^.*\/d\/([^/]+).*$/, "$1").trim()],
    ]
    let token = null
    if (deep && sa) {
        try { token = await getCachedToken(sa.client_email, sa.private_key) } catch (e) { add("Google", "เข้าสู่ระบบ Google ด้วย service account", false, e.message.slice(0, 160)) }
    }
    for (const [name, id] of sheetList) {
        if (!id) { add("Google", name, false, "ยังไม่ได้ตั้ง", "ใส่ Sheet ID"); continue }
        if (!token) { add("Google", name, true, id); continue }
        try {
            const meta = JSON.parse(await httpRequest("GET", "sheets.googleapis.com", `/v4/spreadsheets/${id}?fields=properties.title`, null, { Authorization: `Bearer ${token}` }))
            add("Google", name, true, meta.properties?.title || id)
        } catch (e) {
            add("Google", name, false, /403|404/.test(e.message) ? "เปิดไม่ได้: แชร์ Sheet ให้อีเมล service account เป็น Editor หรือยัง?" : e.message.slice(0, 160), `แชร์ Sheet ให้ ${sa?.client_email || "service account"}`)
        }
    }

    const lineToken = await getSecret("line_channel_access_token")
    const lineSecret = await getSecret("line_channel_secret")
    if (deep && lineToken) {
        try {
            const r = await fetch("https://api.line.me/v2/bot/info", { headers: { Authorization: `Bearer ${lineToken}` } })
            const info = await r.json().catch(() => ({}))
            add("LINE bot", "Channel access token", r.ok, r.ok ? info.displayName || "" : `HTTP ${r.status}`)
        } catch (e) { add("LINE bot", "Channel access token", false, e.message) }
    } else add("LINE bot", "Channel access token", !!lineToken, lineToken ? "ตั้งแล้ว" : "ยังไม่ได้ตั้ง", "หน้าคีย์เชื่อมต่อ")
    add("LINE bot", "Channel secret", !!lineSecret, "", "หน้าคีย์เชื่อมต่อ")
    add("LINE bot", "Dialogflow (ตอบแชท)", !!(await getSecret("dialogflow_credentials_json")), "ไม่บังคับ", "")

    const students = (await kvGet("students", [])) || []
    add("ข้อมูล", "รายชื่อนักเรียน", students.length > 0, `${students.length} คน`, "หน้ารายชื่อนักเรียน → ดึงรายชื่อใหม่")
    const inspectors = (await kvGet("inspectors", [])) || []
    add("ข้อมูล", "รายชื่อผู้ตรวจ", inspectors.length > 0, `${inspectors.length} คน`, "หน้าผู้ตรวจ")
    return checks
}
