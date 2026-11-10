import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCachedToken, httpRequest } from './lib/google-sheets.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STUDENTS_SHEET_ID = process.env.STUDENTS_SHEET_ID;
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'service-account.json');

async function syncStudents() {
    try {
        if (!STUDENTS_SHEET_ID) {
            throw new Error("STUDENTS_SHEET_ID not found in .env");
        }

        const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'));
        const email = sa.client_email;
        const privateKey = sa.private_key;

        console.log("Fetching Spreadsheet metadata...");
        const token = await getCachedToken(email, privateKey);
        
        // 1. Get all sheets in the spreadsheet
        const getRes = await httpRequest('GET', 'sheets.googleapis.com', `/v4/spreadsheets/${STUDENTS_SHEET_ID}`, null, {
            'Authorization': `Bearer ${token}`
        });
        const sheetData = JSON.parse(getRes);
        const sheets = sheetData.sheets || [];

        const allStudents = [];

        // 2. Loop through each sheet to fetch data
        for (const sheet of sheets) {
            const title = sheet.properties.title;
            console.log(`Processing sheet: ${title}`);
            
            const encodedRange = encodeURIComponent(title);
            const pathUrl = `/v4/spreadsheets/${STUDENTS_SHEET_ID}/values/${encodedRange}`;
            
            const res = await httpRequest('GET', 'sheets.googleapis.com', pathUrl, null, {
                'Authorization': `Bearer ${token}`
            });
            const data = JSON.parse(res);
            const rows = data.values || [];

            let currentClass = parseInt(title, 10) || 0;
            let currentRoom = 0;
            let classType = "";

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                const firstCell = String(row[0] || '').trim();

                // Check room header, e.g. "รายชื่อนักเรียนชั้นมัธยมศึกษาปีที่ 4/1 ก"
                if (firstCell.includes("มัธยมศึกษาปีที่")) {
                    const match = firstCell.match(/มัธยมศึกษาปีที่\s*(\d+)\/(\d+)\s*(.*)/);
                    if (match) {
                        currentClass = parseInt(match[1], 10);
                        currentRoom = parseInt(match[2], 10);
                        classType = match[3].trim();
                    }
                    continue;
                }

                // Check student row
                const numVal = parseInt(firstCell, 10);
                const studentId = String(row[2] || "").trim();
                const prefix = String(row[3] || "").trim();
                const firstName = String(row[4] || "").trim();
                const lastName = String(row[5] || "").trim();

                if (!isNaN(numVal) && studentId.length >= 4 && firstName && currentClass > 0 && currentRoom > 0) {
                    const name = `${prefix} ${firstName} ${lastName}`.trim();

                    allStudents.push({
                        studentId: studentId,
                        prefix: prefix,
                        firstName: firstName,
                        lastName: lastName,
                        name: name,
                        class: currentClass,
                        room: currentRoom,
                        number: numVal,
                        classType: classType
                    });
                }
            }
        }

        // 6. Write to students.json
        const outputPath = path.join(__dirname, 'students.json');
        fs.writeFileSync(outputPath, JSON.stringify(allStudents, null, 2), 'utf-8');
        
        console.log(`Successfully generated students.json with ${allStudents.length} records!`);

    } catch (e) {
        console.error("Error syncing students:", e);
    }
}

syncStudents();
