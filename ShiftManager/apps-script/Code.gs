// ─────────────────────────────────────────────────────────────────
// Code.gs — Google Apps Script สำหรับเวรประจำวัน v3
//
// รับข้อมูลจากหน้าเว็บ → เก็บรูปลง Google Drive → บันทึก 1 แถวลงชีท
//
// วิธีติดตั้ง / อัปเดต:
// 1. เปิด Google Sheets → Extensions → Apps Script
// 2. ลบโค้ดเดิม แล้ว copy โค้ดนี้วางแทน
// 3. (ไม่บังคับ) Project Settings → Script properties
//      DRIVE_FOLDER_ID = id ของโฟลเดอร์ Drive ที่จะเก็บรูป
//    ถ้าไม่ใส่ จะสร้าง/ใช้โฟลเดอร์ชื่อ "เวรประจำวัน" ใน My Drive ให้เอง
// 4. Deploy → Manage deployments → แก้ deployment เดิม → Version: New version → Deploy
//    (แก้ deployment เดิม URL /exec จะไม่เปลี่ยน ไม่ต้องแก้ js/config.js)
//    ถ้าสร้าง New deployment ใหม่: Execute as: Me, Who has access: Anyone
//    แล้วเอา URL ใหม่ไปใส่ใน js/config.js
// ─────────────────────────────────────────────────────────────────

const SHEET_ID = "1u3nuYSwHyJOigNMjcDUqYCk3xvsNWi9dQlNURRLve-U";
const SHEET_GID = 1803925258;            // แท็บ "บันทึกเวรประจำวัน"
const DRIVE_ROOT_NAME = "เวรประจำวัน";
const TZ = "Asia/Bangkok";

// คอลัมน์ในชีท (ตามแท็บที่ใช้อยู่)
const HEADERS = [
  "เวลาที่บันทึก", "วันที่ปฏิบัติงาน", "ชื่อ-นามสกุล", "ตำแหน่งในสภานักเรียน",
  "หน้าที่รับผิดชอบ", "สถานะการมา/ลา", "หมายเหตุ", "รูปหลักฐาน",
];
const COL = { time: 1, date: 2, name: 3, position: 4, duty: 5, status: 6, note: 7, photo: 8 };

// ────── POST: รับข้อมูลจากฟอร์ม ──────
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === "delete") return deleteRecord(data, lock);
    const workDate = String(data.workDate || "").trim();
    const fullName = String(data.fullName || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !fullName) return json({ result: "error", message: "ข้อมูลไม่ครบ" });

    // 1) รูป → Drive (ทำก่อนล็อก เพราะใช้เวลานาน)
    const photos = Array.isArray(data.photos) ? data.photos : (data.photo ? [{ data: data.photo }] : []);
    // ชื่อไฟล์: หน้าเว็บส่ง fileBase มา ("ชื่อ-จุดเวร-วว-ดด-ปป HH.mm") ถ้าไม่มีใช้ "ชื่อ-ตำแหน่ง"
    const fileBase = String(data.fileBase || "").trim() || (data.position ? fullName + "-" + data.position : fullName);
    const links = savePhotos(photos, workDate, fileBase);

    // 2) แถวในชีท — ล็อกกันสองคนเขียนพร้อมกัน
    lock.waitLock(30000);
    const sheet = getSheet();
    const timestamp = Utilities.formatDate(new Date(), TZ, "d/M/yyyy, H:mm:ss");
    // แก้แถวเดิมเฉพาะตอนกดดินสอ (หน้าเว็บส่ง rowTime มา) ไม่งั้นเพิ่มแถวใหม่
    // เพราะ 1 คนลงได้หลายจุดในวันเดียวกัน
    const existing = data.rowTime ? findRow(sheet, fullName, workDate, data.rowTime) : 0;

    if (existing) {
      // แก้รายการ: แก้แถวเดิม รูปเก่าเก็บไว้ รูปใหม่ต่อท้าย
      const oldLinks = String(sheet.getRange(existing, COL.photo).getValue() || "").split(/\s+/).filter(s => /^https?:\/\//.test(s));
      sheet.getRange(existing, 1, 1, HEADERS.length).setValues([[
        timestamp, workDate, fullName, data.position || "", data.duty || "", data.status || "", data.note || "",
        oldLinks.concat(links).join("\n"),
      ]]);
    } else {
      sheet.appendRow([
        timestamp, workDate, fullName, data.position || "", data.duty || "", data.status || "", data.note || "",
        links.join("\n"),
      ]);
    }
    SpreadsheetApp.flush();

    return json({ result: "success", message: existing ? "แก้ไขเรียบร้อย" : "บันทึกเรียบร้อย", updated: !!existing, photos: links.length });
  } catch (err) {
    return json({ result: "error", message: err.message });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ────── ลบรายการ: ลบแถว + ย้ายรูปใน Drive ไปถังขยะ ──────
function deleteRecord(data, lock) {
  const workDate = String(data.workDate || "").trim();
  const fullName = String(data.fullName || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !fullName) return json({ result: "error", message: "ข้อมูลไม่ครบ" });
  lock.waitLock(30000);
  const sheet = getSheet();
  const row = findRow(sheet, fullName, workDate, data.rowTime, true); // ลบต้องตรงแถวเท่านั้น
  if (!row) return json({ result: "error", message: "ไม่พบรายการนี้ในชีท" });
  const links = String(sheet.getRange(row, COL.photo).getValue() || "").split(/\s+/);
  let trashed = 0;
  links.forEach(u => {
    const m = u.match(/\/d\/([-\w]{20,})/) || u.match(/[?&]id=([-\w]{20,})/);
    if (!m) return;
    try { DriveApp.getFileById(m[1]).setTrashed(true); trashed++; } catch (e) {}
  });
  sheet.deleteRow(row);
  SpreadsheetApp.flush();
  return json({ result: "success", message: "ลบเรียบร้อย", photos: trashed });
}

// ────── GET: ตรวจว่า script ทำงานอยู่ ──────
function doGet() {
  // หน้าเว็บอ่าน version: 3.1 เปิดปุ่มลบ, 3.2 ส่งเพิ่มหลายจุดในวันเดียวได้
  return json({ result: "success", message: "เวรประจำวัน v3", version: "3.2" });
}

// ────── Helpers ──────

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheets().find(s => s.getSheetId() === SHEET_GID);
  if (!sheet) {
    sheet = ss.insertSheet("บันทึกเวรประจำวัน");
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

// วันที่ในชีทมีหลายแบบ ("2026-11-06", "06/11/2026", หรือเป็น Date) → "yyyy-MM-dd"
function normDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const p = s.split("/");
  if (p.length === 3) {
    let y = parseInt(p[2], 10);
    if (y > 2500) y -= 543;
    return y + "-" + ("0" + p[1]).slice(-2) + "-" + ("0" + p[0]).slice(-2);
  }
  return s;
}

// แถวของคนนี้ในวันนั้น (เลขแถว) หรือ 0
// rowTime = ค่า "เวลาที่บันทึก" ตามที่ชีทแสดง ใช้ระบุแถวตรงตัวเมื่อวันนั้นมีหลายแถว
// ไม่ส่งมาหรือหาไม่เจอ ใช้แถวล่าสุดของวันนั้น (strict = หาไม่เจอคืน 0)
function findRow(sheet, name, workDate, rowTime, strict) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const vals = sheet.getRange(2, COL.time, last - 1, 3).getValues();        // เวลา, วันที่, ชื่อ
  const shown = sheet.getRange(2, COL.time, last - 1, 1).getDisplayValues(); // เวลาตามที่แสดง
  const norm = s => String(s || "").replace(/\s+/g, " ").trim();
  const want = norm(rowTime);
  let latest = 0;
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][2]).trim() !== name || normDate(vals[i][1]) !== workDate) continue;
    if (!want || norm(shown[i][0]) === want) return i + 2;
    if (!latest) latest = i + 2;
  }
  return strict && want ? 0 : latest;
}

// โฟลเดอร์ Drive: เวรประจำวัน / dd-mm-yy (พ.ศ.)
function dayFolder(workDate) {
  const props = PropertiesService.getScriptProperties();
  let root;
  const rootId = props.getProperty("DRIVE_FOLDER_ID");
  if (rootId) root = DriveApp.getFolderById(rootId);
  else {
    const it = DriveApp.getRootFolder().getFoldersByName(DRIVE_ROOT_NAME);
    root = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(DRIVE_ROOT_NAME);
    props.setProperty("DRIVE_FOLDER_ID", root.getId());
  }
  const p = workDate.split("-");
  const name = p[2] + "-" + p[1] + "-" + String(parseInt(p[0], 10) + 543).slice(-2);
  const it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

// บันทึกรูป (data URL) ลง Drive แล้วคืนลิงก์ดู
function savePhotos(photos, workDate, fileBase) {
  if (!photos.length) return [];
  const folder = dayFolder(workDate);
  const base = fileBase.replace(/[\\/:*?"<>|]+/g, "-");
  const links = [];
  photos.forEach((p, i) => {
    const m = String(p && p.data || "").match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return;
    const mime = m[1];
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" }[mime] || "jpg";
    const name = base + (photos.length > 1 ? " (" + (i + 1) + ")" : "") + "." + ext;
    const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(m[2]), mime, name));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
    links.push(file.getUrl());
  });
  return links;
}
