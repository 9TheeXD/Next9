// LINE Official Account bot (was lineBot/, an Express server with in-memory state).
//
// Serverless version: LINE posts each webhook to /api/line/webhook. The reply is sent at once (LINE
// only needs a 200) and the work continues in the background (waitUntil). Conversation state is kept
// in the database (line_sessions, line_queue, line_image_sets), because consecutive webhooks may run
// on different instances.
//
// Flow (unchanged for users):
//   "อัปโหลดรูปภาพ" (rich menu) -> pick an album or "➕ สร้างอัลบั้มใหม่" -> send photos/videos.
//   Photos sent before an album is chosen wait in a queue; choosing an album then asks to upload them.
//   Photos sent together (LINE imageSet) get ONE summary message, sent as a free reply when possible.
//   Any other text goes to Dialogflow.
//
// Keys: the admin page (คีย์เชื่อมต่อ), else the env variables LINE_CHANNEL_ACCESS_TOKEN,
// LINE_CHANNEL_SECRET, DIALOGFLOW_CREDENTIALS_JSON (service account key JSON of the Dialogflow agent),
// DIALOGFLOW_PROJECT_ID (default: the key's project_id). Album list length: settings "line".
import * as line from "@line/bot-sdk"
import { openDb } from "./db.mjs"
import { background } from "./background.mjs"
import { createAlbum, ensureSchema, ingestBuffer, listOpenAlbums } from "./api.mjs"
import { getSecret, getSettings } from "./settings.mjs"

const db = openDb("app")
const REPLY_TOKEN_MS = 50000 // reply tokens last about a minute; stay on the safe side

let clients = null
let clientsToken = null
async function lineClients() {
    const channelAccessToken = await getSecret("line_channel_access_token")
    if (!clients || clientsToken !== channelAccessToken) {
        clientsToken = channelAccessToken
        clients = {
            api: new line.messagingApi.MessagingApiClient({ channelAccessToken }),
            blob: new line.messagingApi.MessagingApiBlobClient({ channelAccessToken }),
        }
    }
    return clients
}

let tablesReady = null
function ensureTables() {
    if (!tablesReady) {
        tablesReady = (async () => {
            await ensureSchema()
            await db.exec(`
                CREATE TABLE IF NOT EXISTS line_sessions (user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS line_queue (user_id TEXT NOT NULL, message_id TEXT NOT NULL, type TEXT NOT NULL, seq INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, message_id));
                CREATE TABLE IF NOT EXISTS line_image_sets (set_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, total INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, warned INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
            `)
        })().catch((e) => { tablesReady = null; throw e })
    }
    return tablesReady
}

export async function verifySignature(rawBody, signature) {
    const secret = await getSecret("line_channel_secret")
    if (!secret || !signature) return false
    try { return line.validateSignature(rawBody, secret, signature) } catch { return false }
}

// ---- session ----
async function getSession(userId) {
    const row = await db.prepare("SELECT data FROM line_sessions WHERE user_id = ?").get(userId)
    let s = null
    try { s = row ? JSON.parse(row.data) : null } catch {}
    return s || { state: "WAITING_FOR_ALBUM_SELECTION" }
}
async function saveSession(userId, s) {
    await db.prepare("INSERT INTO line_sessions (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
        .run(userId, JSON.stringify(s), Date.now())
}
async function queueCount(userId) {
    return (await db.prepare("SELECT COUNT(*) AS n FROM line_queue WHERE user_id = ?").get(userId)).n
}

// ---- messaging ----
const text = (t, extra = {}) => ({ type: "text", text: t, ...extra })
async function reply(event, messages) {
    return (await lineClients()).api.replyMessage({ replyToken: event.replyToken, messages })
}
// Reply while the event's token is still fresh (free), else a push (counts against the monthly quota).
async function replyOrPush(event, userId, messages) {
    if (event.replyToken && Date.now() - (event.timestamp || 0) < REPLY_TOKEN_MS) {
        try { await reply(event, messages); return } catch {}
    }
    try { await (await lineClients()).api.pushMessage({ to: userId, messages }) } catch (e) { console.error("[LINE] push failed", e.message) }
}
async function showLoading(userId) {
    try { await (await lineClients()).api.showLoadingAnimation({ chatId: userId, loadingSeconds: 60 }) } catch {}
}

async function streamToBuffer(stream) {
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    return Buffer.concat(chunks)
}

// Downloads one LINE message's content and stores it in the album. True on success.
async function uploadMessage(albumId, msg, createdAt) {
    const { blob } = await lineClients()
    try {
        const buffer = await streamToBuffer(await blob.getMessageContent(msg.id))
        let poster = null
        if (msg.type === "video") {
            try { poster = await streamToBuffer(await blob.getMessageContentPreview(msg.id)) } catch {}
        }
        await ingestBuffer(albumId, buffer, `${msg.id}${msg.type === "video" ? ".mp4" : ".jpg"}`, { poster, createdAt })
        return true
    } catch (e) {
        console.error("[LINE] upload failed", msg.id, e.message)
        return false
    }
}

const doneText = (n, failed, albumName) => {
    let t = `✅ อัปโหลดเสร็จสมบูรณ์ ${n} ไฟล์ ลงในอัลบั้ม "${albumName}"`
    if (failed > 0) t += `\n❌ ไม่สำเร็จ ${failed} ไฟล์ (ลองส่งไฟล์นั้นใหม่อีกครั้งได้ครับ)`
    return t + `\n\n*(หากต้องการเปลี่ยนอัลบั้ม ให้กดที่เมนู "อัปโหลดรูปภาพ" ใหม่อีกครั้งครับ)*`
}

function askUploadConfirmation(event, albumName, count) {
    return reply(event, [text(`✅ คุณเลือกอัลบั้ม "${albumName}" แล้ว\n\nพบไฟล์ที่รอคิวอยู่ ${count} ไฟล์ คุณต้องการอัปโหลดลงอัลบั้มนี้เลยหรือไม่?`, {
        quickReply: { items: [
            { type: "action", action: { type: "postback", label: "✅ อัปโหลดเลย", data: "action=confirm_upload", displayText: "อัปโหลดรูปที่ค้างไว้เลย" } },
            { type: "action", action: { type: "postback", label: "❌ ยกเลิกคิวนี้", data: "action=cancel_upload", displayText: "ยกเลิกรูปลอตที่ค้างไว้" } },
        ] },
    })])
}

// Uploads everything queued for the user (after "✅ อัปโหลดเลย"), then one summary.
async function processQueue(event, userId, session) {
    await showLoading(userId)
    const items = await db.prepare("SELECT message_id, type, seq FROM line_queue WHERE user_id = ? ORDER BY seq").all(userId)
    let ok = 0, failed = 0
    const base = Date.now()
    for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (await uploadMessage(session.albumId, { id: it.message_id, type: it.type }, base + i)) ok++
        else failed++
        await db.prepare("DELETE FROM line_queue WHERE user_id = ? AND message_id = ?").run(userId, it.message_id)
    }
    await replyOrPush(event, userId, [text(doneText(ok, failed, session.albumName))])
}

// One photo/video message. Photos of one send share imageSet { id, index, total }: the event that
// completes the set sends the summary for the whole set.
async function handleMedia(event, userId) {
    const session = await getSession(userId)
    const set = event.message.imageSet
    const seq = (event.timestamp || Date.now()) * 100 + (set ? Number(set.index) || 0 : 0)
    if (set && set.id) {
        await db.prepare("INSERT INTO line_image_sets (set_id, user_id, total, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(set_id) DO NOTHING")
            .run(set.id, userId, Number(set.total) || 1, Date.now())
    }

    if (session.state !== "READY_FOR_IMAGES" || !session.albumId) {
        await db.prepare("INSERT INTO line_queue (user_id, message_id, type, seq, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
            .run(userId, event.message.id, event.message.type, seq, Date.now())
        // One warning per send, not per photo: only the photo that completes its set (or a single photo).
        let last = true
        if (set && set.id) {
            const r = await db.prepare("UPDATE line_image_sets SET done = done + 1, updated_at = ? WHERE set_id = ? RETURNING done, failed, total").get(Date.now(), set.id)
            last = !!r && r.done + r.failed >= r.total
        }
        if (!last) return
        if (session.state === "WAITING_FOR_UPLOAD_CONFIRMATION") {
            return replyOrPush(event, userId, [text(`⚠️ คุณยังไม่ได้ยืนยันการอัปโหลด กรุณากดปุ่ม "✅ อัปโหลดเลย" หรือ "❌ ยกเลิกคิวนี้" ในข้อความก่อนหน้านี้ครับ`)])
        }
        const count = await queueCount(userId)
        return replyOrPush(event, userId, [text(`⚠️ ระบบได้รับไฟล์ที่รอคิวอัปโหลด ${count} ไฟล์\n\nแต่คุณยังไม่ได้เลือกอัลบั้มครับ กรุณากดปุ่ม "อัปโหลดรูปภาพ" จากเมนูแล้วเลือกอัลบั้มก่อน (หรือพิมพ์ชื่ออัลบั้มถ้ากำลังสร้างใหม่) ครับ`)])
    }

    await showLoading(userId)
    const ok = await uploadMessage(session.albumId, event.message, Math.floor(seq / 100) + (set ? Number(set.index) || 0 : 0))
    if (set && set.id) {
        const r = await db.prepare(`UPDATE line_image_sets SET ${ok ? "done = done + 1" : "failed = failed + 1"}, updated_at = ? WHERE set_id = ? RETURNING done, failed, total`).get(Date.now(), set.id)
        if (!r || r.done + r.failed < r.total) return
        return replyOrPush(event, userId, [text(doneText(r.done, r.failed, session.albumName))])
    }
    return replyOrPush(event, userId, [text(doneText(ok ? 1 : 0, ok ? 0 : 1, session.albumName))])
}

async function handleDialogflow(event, userId, input) {
    let dialogflow
    try { dialogflow = (await import("@google-cloud/dialogflow")).default } catch (e) { dialogflow = null }
    const creds = await getSecret("dialogflow_credentials_json")
    if (!dialogflow || !creds) return
    try {
        const credentials = JSON.parse(creds)
        const projectId = (await getSecret("dialogflow_project_id")) || credentials.project_id || "sdh-next9-chatbot"
        const sessionClient = new dialogflow.SessionsClient({ credentials, projectId })
        const sessionPath = sessionClient.projectAgentSessionPath(projectId, userId)
        const [response] = await sessionClient.detectIntent({ session: sessionPath, queryInput: { text: { text: input, languageCode: "th" } } })
        const result = response.queryResult
        const messages = []
        for (const msg of result.fulfillmentMessages || []) {
            if (msg.payload && msg.payload.fields && msg.payload.fields.line) {
                try {
                    const structJson = dialogflow.util?.struct?.decode ? dialogflow.util.struct.decode(msg.payload) : null
                    if (structJson && structJson.line) messages.push(structJson.line)
                } catch {}
            } else if (msg.text && msg.text.text && msg.text.text.length > 0) {
                messages.push(text(msg.text.text[0]))
            }
        }
        if (!messages.length && result.fulfillmentText) messages.push(text(result.fulfillmentText))
        if (messages.length) return reply(event, messages.slice(0, 5))
        const intentName = result.intent ? result.intent.displayName : "Unknown"
        return reply(event, [text(`(Debug) 🤖 จับเจตนาได้คือ: "${intentName}"\nแต่เซิร์ฟเวอร์ดึงข้อความจากแท็บ LINE ไม่สำเร็จ แนะนำให้ก๊อปปี้ข้อความไปใส่ในแท็บ DEFAULT แทนครับ`)])
    } catch (error) {
        console.error("Dialogflow error:", error.message)
        return reply(event, [text("ขออภัยครับ ระบบประมวลผลข้อความขัดข้อง กรุณาลองใหม่อีกครั้ง")])
    }
}

async function showAlbumPicker(event) {
    try {
        const limit = Math.min(12, Math.max(1, Number((await getSettings("line")).album_limit) || 12))
        const albums = await listOpenAlbums(limit)
        const items = [
            { type: "action", action: { type: "postback", label: "➕ สร้างอัลบั้มใหม่", data: "action=create_album", displayText: "สร้างอัลบั้มใหม่" } },
            ...albums.map((a) => ({ type: "action", action: { type: "postback", label: a.name.substring(0, 20), data: `action=select_album&id=${a.id}&name=${encodeURIComponent(a.name.substring(0, 20))}`, displayText: `เลือกอัลบั้ม: ${a.name.substring(0, 20)}` } })),
        ]
        return reply(event, [text(`กรุณาเลือกอัลบั้มที่ต้องการอัปโหลดรูปลงไปครับ หรือกดสร้างใหม่ (แสดงสูงสุด ${limit} อัลบั้มล่าสุด):`, { quickReply: { items } })])
    } catch (error) {
        console.error(error)
        return reply(event, [text("เกิดข้อผิดพลาดในการดึงข้อมูลอัลบั้มครับ")])
    }
}

async function selectAlbum(event, userId, session, album) {
    session.albumId = album.id
    session.albumName = album.name
    const count = await queueCount(userId)
    if (count > 0) {
        session.state = "WAITING_FOR_UPLOAD_CONFIRMATION"
        await saveSession(userId, session)
        return askUploadConfirmation(event, album.name, count)
    }
    session.state = "READY_FOR_IMAGES"
    await saveSession(userId, session)
    return null
}

async function handleEvent(event) {
    const userId = event.source && event.source.userId
    if (!userId) return

    if (event.type === "message" && event.message.type === "text") {
        const input = event.message.text.trim()
        const session = await getSession(userId)
        const isMenu = input === "อัปโหลดรูปภาพ" || input === "อัปโหลดรูป"
        if (session.state === "WAITING_FOR_ALBUM_NAME" && !isMenu) {
            try {
                const album = await createAlbum(input)
                const asked = await selectAlbum(event, userId, session, album)
                if (asked) return asked
                return reply(event, [text(`✅ สร้างอัลบั้ม "${album.name}" สำเร็จ!\n\n📸 กรุณาส่งรูปภาพมาได้เลยครับ (ส่งรวดเดียวหลายรูปได้เลย)`)])
            } catch (error) {
                return reply(event, [text(`❌ เกิดข้อผิดพลาดในการสร้างอัลบั้ม: ${error.message}`)])
            }
        }
        if (isMenu) {
            if (session.state === "WAITING_FOR_ALBUM_NAME") {
                session.state = "WAITING_FOR_ALBUM_SELECTION"
                await saveSession(userId, session)
            }
            return showAlbumPicker(event)
        }
        return handleDialogflow(event, userId, input)
    }

    if (event.type === "postback") {
        const data = new URLSearchParams(event.postback.data)
        const action = data.get("action")
        const session = await getSession(userId)
        if (action === "create_album") {
            session.state = "WAITING_FOR_ALBUM_NAME"
            await saveSession(userId, session)
            return reply(event, [text("✏️ กรุณาพิมพ์ชื่ออัลบั้มใหม่ที่ต้องการสร้าง แล้วส่งมาเป็นข้อความได้เลยครับ", {
                quickReply: { items: [{ type: "action", action: { type: "postback", label: "❌ ยกเลิกการสร้าง", data: "action=cancel_create_album", displayText: "ยกเลิกการสร้างอัลบั้ม" } }] },
            })])
        }
        if (action === "select_album") {
            const album = { id: data.get("id"), name: data.get("name") }
            const asked = await selectAlbum(event, userId, session, album)
            if (asked) return asked
            return reply(event, [text(`✅ คุณเลือกอัลบั้ม "${album.name}" แล้ว\n\n📸 กรุณาส่งรูปภาพมาได้เลยครับ (ส่งรวดเดียวหลายรูปได้เลย)`)])
        }
        if (action === "confirm_upload" && session.state === "WAITING_FOR_UPLOAD_CONFIRMATION") {
            session.state = "READY_FOR_IMAGES"
            await saveSession(userId, session)
            return processQueue(event, userId, session)
        }
        if (action === "cancel_upload" && session.state === "WAITING_FOR_UPLOAD_CONFIRMATION") {
            session.state = "READY_FOR_IMAGES"
            await saveSession(userId, session)
            await db.prepare("DELETE FROM line_queue WHERE user_id = ?").run(userId)
            return reply(event, [text("🗑️ ยกเลิกรูปลอตที่ค้างไว้เรียบร้อยแล้ว\n\n📸 กรุณาส่งรูปภาพลอตใหม่มาได้เลยครับ")])
        }
        if (action === "cancel_create_album" && session.state === "WAITING_FOR_ALBUM_NAME") {
            session.state = "WAITING_FOR_ALBUM_SELECTION"
            await saveSession(userId, session)
            return reply(event, [text('🛑 ยกเลิกการสร้างอัลบั้มแล้วครับ กรุณากดเมนู "อัปโหลดรูปภาพ" เพื่อเลือกอัลบั้มตามปกติครับ')])
        }
        return
    }

    if (event.type === "message" && (event.message.type === "image" || event.message.type === "video")) {
        return handleMedia(event, userId)
    }
}

// Handles a verified webhook body. Events run in the background so LINE gets its 200 at once.
export async function handleWebhook(body) {
    await ensureTables()
    const events = Array.isArray(body && body.events) ? body.events : []
    for (const event of events) {
        background(handleEvent(event).catch((e) => console.error("[LINE] event failed", e && e.message)))
    }
}
