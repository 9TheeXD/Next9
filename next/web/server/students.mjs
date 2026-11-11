// Student list from the school's Google Sheet. The result is stored in kv_store "students", which
// the inert form's search and lookup read: [{ studentId, prefix, firstName, lastName, name, class,
// room, number, classType }].
//
// How the sheet is read is a setting (admin → รายชื่อนักเรียน, section "students_import"), so a new
// sheet layout needs no code change:
//   mode "header":  each room starts with a heading row such as "รายชื่อนักเรียนชั้นมัธยมศึกษาปีที่ 4/1 ก",
//                   matched by header_pattern ({ชั้น} {ห้อง} {สาย} mark the parts), followed by one row
//                   per student.
//   mode "columns": one row per student with the grade and room in their own columns.
// Columns are letters (A, B, C …). Rows whose "number" cell is not a number are skipped (titles,
// blank lines), as are rows without a student ID or first name.
//
// Run: the admin page (ดึงรายชื่อใหม่ / ดูตัวอย่าง), POST /api/students/sync (Authorization:
// EDITOR_PASSWORD), or node scripts/sync-students.mjs.
import { getCachedToken, httpRequest } from "./google-sheets.js"
import { kvSet } from "./kv.mjs"
import { getSettings, getSecret } from "./settings.mjs"

const col = (letter) => {
    const s = String(letter || "").trim().toUpperCase()
    if (!/^[A-Z]{1,2}$/.test(s)) return -1
    return s.length === 1 ? s.charCodeAt(0) - 65 : (s.charCodeAt(0) - 64) * 26 + (s.charCodeAt(1) - 65)
}

// "มัธยมศึกษาปีที่ {ชั้น}/{ห้อง} {สาย}" -> a regex with named groups. Spaces match any spacing.
export function headerRegex(pattern) {
    const parts = { ชั้น: "(?<grade>\\d+)", ห้อง: "(?<room>\\d+)", สาย: "(?<track>.*)" }
    let re = ""
    for (const piece of String(pattern || "").split(/(\{[^}]+\})/)) {
        const m = piece.match(/^\{(.+)\}$/)
        if (m && parts[m[1]]) re += parts[m[1]]
        else re += piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*")
    }
    return new RegExp(re)
}

function parseRows(rows, title, cfg) {
    const c = {
        number: col(cfg.col_number), id: col(cfg.col_student_id), prefix: col(cfg.col_prefix),
        first: col(cfg.col_first_name), last: col(cfg.col_last_name), full: col(cfg.col_full_name),
        grade: col(cfg.col_grade), room: col(cfg.col_room), header: col(cfg.header_column || "A"),
    }
    const minId = Number(cfg.min_id_length) || 1
    const re = headerRegex(cfg.header_pattern)
    const cell = (row, i) => (i >= 0 ? String(row[i] ?? "").trim() : "")
    const out = []
    let skipped = 0
    let grade = parseInt(title, 10) || 0
    let room = 0
    let track = ""
    for (const row of rows || []) {
        if (!row || row.length === 0) continue
        if (cfg.mode !== "columns") {
            const head = cell(row, c.header)
            const m = head && head.match(re)
            if (m) {
                grade = parseInt(m.groups?.grade, 10) || grade
                room = parseInt(m.groups?.room, 10) || 0
                track = (m.groups?.track || "").trim()
                continue
            }
        }
        const numberText = cell(row, c.number)
        const number = parseInt(numberText, 10)
        if (isNaN(number)) continue
        const studentId = cell(row, c.id)
        let prefix = cell(row, c.prefix)
        let firstName = cell(row, c.first)
        let lastName = cell(row, c.last)
        if (c.full >= 0 && !firstName) {
            // Whole name in one cell: "<prefix> <first> <last>" or "<first> <last>".
            const words = cell(row, c.full).split(/\s+/).filter(Boolean)
            if (/^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง|น\.ส\.)$/.test(words[0] || "")) prefix = prefix || words.shift()
            firstName = words.shift() || ""
            lastName = words.join(" ")
        }
        const g = cfg.mode === "columns" ? parseInt(cell(row, c.grade).replace(/\D/g, ""), 10) || 0 : grade
        const r = cfg.mode === "columns" ? parseInt(cell(row, c.room).replace(/^.*\//, ""), 10) || 0 : room
        if (studentId.length < minId || !firstName || g <= 0 || r <= 0) {
            skipped++
            continue
        }
        out.push({
            studentId, prefix, firstName, lastName,
            name: `${prefix} ${firstName} ${lastName}`.replace(/\s+/g, " ").trim(),
            class: g, room: r, number, classType: cfg.mode === "columns" ? cell(row, col(cfg.col_track)) : track,
        })
    }
    return { students: out, skipped }
}

async function readSheet(sheetId, serviceAccount) {
    const sa = typeof serviceAccount === "string" ? JSON.parse(serviceAccount) : serviceAccount
    const token = await getCachedToken(sa.client_email, sa.private_key)
    const auth = { Authorization: `Bearer ${token}` }
    const meta = JSON.parse(await httpRequest("GET", "sheets.googleapis.com", `/v4/spreadsheets/${sheetId}?fields=properties.title,sheets.properties.title`, null, auth))
    const titles = (meta.sheets || []).map((s) => s.properties.title)
    const get = async (title) => JSON.parse(await httpRequest("GET", "sheets.googleapis.com", `/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(title)}`, null, auth)).values || []
    return { file: meta.properties?.title || sheetId, titles, get }
}

// Reads and converts the sheet. dryRun returns a preview instead of saving.
export async function syncStudents({ sheetId, serviceAccount, dryRun = false, settings } = {}) {
    const cfg = settings || (await getSettings("students_import"))
    if (!sheetId) sheetId = (cfg.sheet_id || "").trim() || ((await getSettings("sheets")).students_sheet_id || "").trim() || process.env.STUDENTS_SHEET_ID
    if (!serviceAccount) serviceAccount = await getSecret("google_service_account_json")
    if (!sheetId) throw new Error("ยังไม่ได้ตั้ง Google Sheet รายชื่อนักเรียน")
    sheetId = String(sheetId).match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || String(sheetId).trim()
    if (!serviceAccount) throw new Error("ยังไม่ได้ใส่ Google service account (หน้าจัดการ → คีย์เชื่อมต่อ)")
    let sheet
    try {
        sheet = await readSheet(sheetId, serviceAccount)
    } catch (e) {
        if (/403|404/.test(e.message)) throw new Error("เปิด Sheet ไม่ได้: ตรวจ Sheet ID และแชร์ไฟล์ให้อีเมล service account แล้วหรือยัง")
        throw e
    }
    const wanted = (cfg.tabs || []).map((t) => String(t).trim()).filter(Boolean)
    const missingTabs = wanted.filter((t) => !sheet.titles.includes(t))
    const tabs = wanted.length ? sheet.titles.filter((t) => wanted.includes(t)) : sheet.titles
    const all = []
    const perTab = []
    let firstRows = null
    for (const title of tabs) {
        const rows = await sheet.get(title)
        if (!firstRows) firstRows = { title, rows: rows.slice(0, 12) }
        const { students, skipped } = parseRows(rows, title, cfg)
        perTab.push({ title, students: students.length, skipped })
        all.push(...students)
    }
    // The same student twice (listed in two tabs): keep the first.
    const seen = new Set()
    const unique = all.filter((s) => (seen.has(s.studentId) ? false : seen.add(s.studentId)))
    if (dryRun) {
        const byRoom = {}
        for (const s of unique) byRoom[`${s.class}/${s.room}`] = (byRoom[`${s.class}/${s.room}`] || 0) + 1
        return {
            file: sheet.file, allTabs: sheet.titles, missingTabs, perTab, count: unique.length,
            duplicates: all.length - unique.length, byRoom, sample: unique.slice(0, 8), firstRows,
        }
    }
    if (!unique.length) throw new Error("ไม่พบรายชื่อนักเรียนเลย ตรวจการตั้งค่าการอ่าน Sheet (กดดูตัวอย่างก่อน)")
    await kvSet("students", unique)
    return unique.length
}
