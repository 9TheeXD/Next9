// Student list from the school's Google Sheet (was sync_students.js writing students.json).
// Each sheet holds room headers ("รายชื่อนักเรียนชั้นมัธยมศึกษาปีที่ 4/1 ก") followed by student rows
// (no., -, student id, prefix, first name, last name). The result is stored in kv_store "students",
// which the inert form's search and lookup read.
// Run: POST /api/students/sync (Authorization: EDITOR_PASSWORD), or node scripts/sync-students.mjs.
import { getCachedToken, httpRequest } from "./google-sheets.js"
import { kvSet } from "./kv.mjs"

export async function syncStudents({ sheetId = process.env.STUDENTS_SHEET_ID, serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON } = {}) {
    if (!sheetId) throw new Error("STUDENTS_SHEET_ID is not set")
    if (!serviceAccount) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set")
    const sa = typeof serviceAccount === "string" ? JSON.parse(serviceAccount) : serviceAccount
    const token = await getCachedToken(sa.client_email, sa.private_key)
    const auth = { Authorization: `Bearer ${token}` }
    const meta = JSON.parse(await httpRequest("GET", "sheets.googleapis.com", `/v4/spreadsheets/${sheetId}`, null, auth))
    const allStudents = []
    for (const sheet of meta.sheets || []) {
        const title = sheet.properties.title
        const data = JSON.parse(await httpRequest("GET", "sheets.googleapis.com", `/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(title)}`, null, auth))
        let currentClass = parseInt(title, 10) || 0
        let currentRoom = 0
        let classType = ""
        for (const row of data.values || []) {
            if (!row || row.length === 0) continue
            const firstCell = String(row[0] || "").trim()
            if (firstCell.includes("มัธยมศึกษาปีที่")) {
                const match = firstCell.match(/มัธยมศึกษาปีที่\s*(\d+)\/(\d+)\s*(.*)/)
                if (match) {
                    currentClass = parseInt(match[1], 10)
                    currentRoom = parseInt(match[2], 10)
                    classType = match[3].trim()
                }
                continue
            }
            const numVal = parseInt(firstCell, 10)
            const studentId = String(row[2] || "").trim()
            const prefix = String(row[3] || "").trim()
            const firstName = String(row[4] || "").trim()
            const lastName = String(row[5] || "").trim()
            if (!isNaN(numVal) && studentId.length >= 4 && firstName && currentClass > 0 && currentRoom > 0) {
                allStudents.push({
                    studentId, prefix, firstName, lastName,
                    name: `${prefix} ${firstName} ${lastName}`.trim(),
                    class: currentClass, room: currentRoom, number: numVal, classType,
                })
            }
        }
    }
    await kvSet("students", allStudents)
    return allStudents.length
}
