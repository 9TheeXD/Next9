/**
 * Google Sheets API Helper
 * 
 * ใช้ Google Sheets API v4 ผ่าน Service Account
 * - อ่านข้อมูลจาก Sheet (สำหรับ auto-fill)
 * - เขียนข้อมูลลง Sheet (สำหรับ form submit)
 * 
 * ต้องการ env:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL - email ของ service account
 *   GOOGLE_PRIVATE_KEY          - private key (PEM format, base64-encoded)
 *   INERT_SHEET_ID              - Google Sheets spreadsheet ID
 *   INERT_SHEET_RANGE           - Sheet range e.g. "Sheet1!A:Z"
 *   INERT_LOOKUP_SHEET_RANGE    - Sheet range สำหรับ auto-fill data source
 */

import crypto from 'crypto'
import https from 'https'

// ===== JWT Token Generation for Google Service Account =====

function base64url(data) {
    return Buffer.from(data).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * สร้าง JWT access token จาก Service Account credentials
 * @param {string} email - Service account email
 * @param {string} privateKeyPEM - Private key in PEM format
 * @param {string} scope - OAuth scope
 * @returns {Promise<string>} Access token
 */
async function getAccessToken(email, privateKeyPEM, scope = 'https://www.googleapis.com/auth/spreadsheets') {
    const now = Math.floor(Date.now() / 1000)
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const payload = base64url(JSON.stringify({
        iss: email,
        scope: scope,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }))

    const signInput = `${header}.${payload}`
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(signInput)
    const signature = sign.sign(privateKeyPEM, 'base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const jwt = `${signInput}.${signature}`

    // Exchange JWT for access token
    const tokenResponse = await httpRequest('POST', 'oauth2.googleapis.com', '/token', 
        `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
        { 'Content-Type': 'application/x-www-form-urlencoded' }
    )

    const tokenData = JSON.parse(tokenResponse)
    if (!tokenData.access_token) {
        throw new Error('Failed to get access token: ' + tokenResponse)
    }
    return tokenData.access_token
}

// ===== Token Cache =====
// Per service account: the admin page can switch to another account at any time.
let cachedToken = null
let tokenExpiry = 0
let tokenEmail = null

async function getCachedToken(email, privateKeyPEM) {
    if (cachedToken && tokenEmail === email && Date.now() < tokenExpiry) {
        return cachedToken
    }
    cachedToken = await getAccessToken(email, privateKeyPEM)
    tokenEmail = email
    tokenExpiry = Date.now() + 50 * 60 * 1000 // 50 minutes (token valid 60 min)
    return cachedToken
}

function invalidateTokenCache() {
    cachedToken = null
    tokenExpiry = 0
}

// ===== HTTP Helper =====

function httpRequest(method, host, path, body, headers = {}) {
    // Local development runs against the real service account. NEXT9_DEV_READONLY=1 refuses every
    // write to Google Sheets so a test submission can never land in the council's real spreadsheets.
    // Token requests (oauth2.googleapis.com) and reads still go through.
    if (process.env.NEXT9_DEV_READONLY === '1' && method !== 'GET' && host === 'sheets.googleapis.com') {
        console.warn(`[DEV READONLY] blocked ${method} https://${host}${path}`)
        return Promise.reject(new Error('Google Sheets writes are disabled (NEXT9_DEV_READONLY=1)'))
    }
    return new Promise((resolve, reject) => {
        const bodyBuf = body ? Buffer.from(body, 'utf-8') : null
        const options = {
            host,
            path,
            method,
            headers: {
                ...headers,
                ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {})
            }
        }

        const req = https.request(options, (res) => {
            res.setEncoding('utf8');
            let data = ''
            res.setEncoding("utf8"); res.on('data', chunk => data += chunk)
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data)
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`))
                }
            })
        })

        req.on('error', reject)
        if (bodyBuf) req.write(bodyBuf)
        req.end()
    })
}

// ===== Google Sheets Operations =====

/**
 * อ่านข้อมูลจาก Google Sheet
 * @param {Object} config - { email, privateKey, spreadsheetId, range }
 * @returns {Promise<Array<Array<string>>>} 2D array of values
 */
export async function readSheet(config) {
    const { email, privateKey, spreadsheetId, range } = config
    const token = await getCachedToken(email, privateKey)
    const encodedRange = encodeURIComponent(range)
    const path = `/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`

    const response = await httpRequest('GET', 'sheets.googleapis.com', path, null, {
        'Authorization': `Bearer ${token}`
    })

    const data = JSON.parse(response)
    return data.values || []
}

/**
 * เขียนข้อมูลต่อท้าย Google Sheet (append)
 * @param {Object} config - { email, privateKey, spreadsheetId, range }
 * @param {Array<Array<string>>} values - 2D array ของข้อมูลที่ต้องการเขียน
 * @returns {Promise<Object>} result
 */
export async function appendSheet(config, values) {
    const { email, privateKey, spreadsheetId, range } = config
    const token = await getCachedToken(email, privateKey)
    const encodedRange = encodeURIComponent(range)
    const path = `/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`

    const body = JSON.stringify({
        range: range,
        majorDimension: 'ROWS',
        values: values
    })

    const response = await httpRequest('POST', 'sheets.googleapis.com', path, body, {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    })

    return JSON.parse(response)
}

/**
 * อัพเดทข้อมูลใน Google Sheet (update specific range)
 * @param {Object} config - { email, privateKey, spreadsheetId, range }
 * @param {Array<Array<string>>} values - 2D array ของข้อมูลที่ต้องการเขียน
 * @returns {Promise<Object>} result
 */
export async function updateSheet(config, values) {
    const { email, privateKey, spreadsheetId, range } = config
    const token = await getCachedToken(email, privateKey)
    const encodedRange = encodeURIComponent(range)
    const path = `/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`

    const body = JSON.stringify({
        range: range,
        majorDimension: 'ROWS',
        values: values
    })

    const response = await httpRequest('PUT', 'sheets.googleapis.com', path, body, {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    })

    return JSON.parse(response)
}

/**
 * จัดรูปแบบแถวที่เพิ่งเพิ่มเข้าไป (ตีเส้นทุกมุม, จัดกึ่งกลาง ยกเว้น ชื่อกับผิดระเบียบชิดซ้าย, พื้นหลังสีขาว)
 * @param {Object} config 
 * @param {Object} appendResult - ผลลัพธ์จาก appendSheet
 * @param {Array<string>} sources - Array of data sources (optional, defaults to 10 columns)
 */
export async function formatAppendedRows(config, appendResult, sources = null) {
    if (!appendResult || !appendResult.updates || !appendResult.updates.updatedRange) return null;
    const updatedRange = appendResult.updates.updatedRange;
    const match = updatedRange.match(/^(?:'([^']+)'|([^!]+))![A-Z]+(\d+)(?::[A-Z]+(\d+))?$/);
    if (!match) return null;

    const sheetName = match[1] || match[2];
    const startRow = parseInt(match[3]) - 1;
    const endRow = match[4] ? parseInt(match[4]) : parseInt(match[3]);

    const { email, privateKey, spreadsheetId } = config;
    const token = await getCachedToken(email, privateKey);

    // ดึง sheetId จากชื่อ sheet
    const getRes = await httpRequest('GET', 'sheets.googleapis.com', `/v4/spreadsheets/${spreadsheetId}`, null, {
        'Authorization': `Bearer ${token}`
    });
    const sheetData = JSON.parse(getRes);
    const sheet = sheetData.sheets.find(s => s.properties.title === sheetName);
    if (!sheet) return null;
    const sheetId = sheet.properties.sheetId;

    const colCount = sources ? sources.length : 10;

    // ตั้งค่าการจัดรูปแบบ
    const requests = [
        // 1. กำหนดทั้งหมด: กึ่งกลาง, สีพื้นหลังขาว (เพื่อล้างสีที่ copy มา), ขอบทุกมุม
        {
            repeatCell: {
                range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: colCount },
                cell: {
                    userEnteredFormat: {
                        horizontalAlignment: 'CENTER',
                        backgroundColor: { red: 1, green: 1, blue: 1 }, // ขาวล้วน
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
        }
    ];

    // 2. จัดชิดซ้ายเฉพาะคอลัมน์ที่เป็น ชื่อผู้ตรวจ, ชื่อเด็ก, รายการผิดระเบียบ
    if (sources) {
        sources.forEach((src, idx) => {
            if (src === 'inspector' || src === 'name' || src === 'violations') {
                requests.push({
                    repeatCell: {
                        range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: idx, endColumnIndex: idx + 1 },
                        cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } },
                        fields: 'userEnteredFormat.horizontalAlignment'
                    }
                });
            }
        });
    } else {
        // Fallback for old hardcoded indices if sources not provided
        [2, 4, 9].forEach(idx => {
            requests.push({
                repeatCell: {
                    range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: idx, endColumnIndex: idx + 1 },
                    cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } },
                    fields: 'userEnteredFormat.horizontalAlignment'
                }
            });
        });
    }

    const body = JSON.stringify({ requests });
    const response = await httpRequest('POST', 'sheets.googleapis.com', `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, body, {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    });
    return JSON.parse(response);
}

export { invalidateTokenCache, getCachedToken, httpRequest }
