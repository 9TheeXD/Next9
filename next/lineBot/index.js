import express from 'express';
import * as line from '@line/bot-sdk';
import axios from 'axios';
import FormData from 'form-data';
import 'dotenv/config';
import dialogflow from '@google-cloud/dialogflow';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.channelAccessToken
});

const app = express();

const PHOTOS_API_BASE = 'http://127.0.0.1:8089/api/photos';
const PHOTOS_PASSWORD = process.env.PHOTOS_PASSWORD || 'next9';

// Setup Dialogflow Client
const dialogflowProjectId = 'sdh-next9-chatbot';
const sessionClient = new dialogflow.SessionsClient({
  keyFilename: './sdh-next9-chatbot-48c3f65957fa.json'
});

// Memory map: userId -> session
const userSessions = new Map();

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

// ---- Photo uploads from chat ----
// LINE delivers every photo of a multi-photo send as its own webhook event, a few seconds apart, and
// tags the ones sent together with imageSet { id, index, total }. The bot used to start uploading 1.5 s
// after each photo, so each became its own run with its own "uploading" and "done" message: six photos
// gave twelve bubbles, all push messages (which count against the OA's monthly quota).
//
// Now a run waits until every photo of a set has arrived (or nothing new came for a while), photos that
// arrive during the upload join the same run, progress is LINE's loading indicator (free, not a
// message), and the run ends with one summary: a reply (free) when the last photo's reply token is still
// valid, else a single push.
const QUIET_MS = 3000;        // no new photo for this long: the send is complete
const SET_WAIT_MS = 30000;    // longest wait for the rest of an image set
const REPLY_TOKEN_MS = 50000; // reply tokens last about a minute; stay on the safe side

function missingFromSets(session) {
    // Photos of a set still on their way: total announced minus the ones seen so far (this run).
    if (!session.sets) return 0;
    let missing = 0;
    for (const [, set] of session.sets) missing += Math.max(0, set.total - set.seen);
    return missing;
}

function scheduleUpload(userId) {
    const session = userSessions.get(userId);
    if (!session || session.isUploading) return; // a running upload picks new photos up itself
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => {
        session.timer = null;
        const waiting = missingFromSets(session) > 0 && Date.now() - session.lastPhotoAt < SET_WAIT_MS;
        if (waiting) return scheduleUpload(userId);
        processQueue(userId);
    }, QUIET_MS);
}

// Answers with the newest unused reply token when it is still valid (replies are free), else one push
// (pushes count against the OA's monthly quota). A token is single-use, so it is spent here.
async function replyOrPush(userId, session, messages) {
    const token = session.lastReplyToken;
    const fresh = token && Date.now() - (session.lastReplyAt || 0) < REPLY_TOKEN_MS;
    session.lastReplyToken = null;
    if (fresh) {
        try {
            await client.replyMessage({ replyToken: token, messages });
            return;
        } catch (e) {
            // Expired or already used meanwhile: fall through to a push.
        }
    }
    try {
        await client.pushMessage({ to: userId, messages });
    } catch (e) {}
}

async function showLoading(userId) {
    try {
        await client.showLoadingAnimation({ chatId: userId, loadingSeconds: 60 });
    } catch (e) {}
}

// Waits for photos still on their way (rest of a set, or a send still arriving). True when more came.
async function waitForMore(session) {
    for (;;) {
        if (session.imageQueue.length) return true;
        const sinceLast = Date.now() - session.lastPhotoAt;
        const setPending = missingFromSets(session) > 0 && sinceLast < SET_WAIT_MS;
        if (!setPending && sinceLast >= QUIET_MS) return false;
        await new Promise((r) => setTimeout(r, 500));
    }
}

async function processQueue(userId) {
    const session = userSessions.get(userId);
    if (!session || !session.imageQueue || session.imageQueue.length === 0) return;
    if (session.isUploading) return;
    if (session.state !== 'READY_FOR_IMAGES') return;

    session.isUploading = true;
    session.totalUploaded = 0;
    session.totalFailed = 0;
    let loadingAt = Date.now();
    await showLoading(userId);

    do {
        while (session.imageQueue.length > 0) {
            // Upload in the order the photos were sent: by set, then by position in the set.
            session.imageQueue.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
            const msg = session.imageQueue.shift();
            const messageId = typeof msg === 'string' ? msg : msg.id;
            const ext = (typeof msg === 'object' && msg.type === 'video') ? '.mp4' : '.jpg';
            if (Date.now() - loadingAt > 50000) {
                loadingAt = Date.now();
                showLoading(userId);
            }
            try {
                const stream = await blobClient.getMessageContent(messageId);
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                const buffer = Buffer.concat(chunks);

                const form = new FormData();
                form.append('file', buffer, `${messageId}${ext}`);

                await axios.post(`${PHOTOS_API_BASE}/upload/${session.albumId}`, form, {
                    headers: { ...form.getHeaders(), 'Authorization': PHOTOS_PASSWORD },
                    maxBodyLength: Infinity,
                });
                session.totalUploaded++;
            } catch (error) {
                console.error('Upload Error for', messageId, ':', error.message);
                session.totalFailed++;
            }
        }
    } while (await waitForMore(session));

    let resultText = `✅ อัปโหลดเสร็จสมบูรณ์ ${session.totalUploaded} ไฟล์ ลงในอัลบั้ม "${session.albumName}"`;
    if (session.totalFailed > 0) resultText += `\n❌ ไม่สำเร็จ ${session.totalFailed} ไฟล์ (ลองส่งไฟล์นั้นใหม่อีกครั้งได้ครับ)`;
    resultText += `\n\n*(หากต้องการเปลี่ยนอัลบั้ม ให้กดที่เมนู "อัปโหลดรูปภาพ" ใหม่อีกครั้งครับ)*`;

    await replyOrPush(userId, session, [{ type: 'text', text: resultText }]);

    session.sets?.clear();
    session.totalUploaded = 0;
    session.totalFailed = 0;
    session.isUploading = false;

    if (session.imageQueue.length > 0) scheduleUpload(userId);
}

async function askUploadConfirmation(event, session, albumName) {
    session.state = 'WAITING_FOR_UPLOAD_CONFIRMATION';
    return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{
            type: 'text',
            text: `✅ คุณเลือกอัลบั้ม "${albumName}" แล้ว\n\nพบไฟล์ที่รอคิวอยู่ ${session.imageQueue.length} ไฟล์ คุณต้องการอัปโหลดลงอัลบั้มนี้เลยหรือไม่?`,
            quickReply: {
                items: [
                    {
                        type: 'action',
                        action: {
                            type: 'postback',
                            label: '✅ อัปโหลดเลย',
                            data: 'action=confirm_upload',
                            displayText: 'อัปโหลดรูปที่ค้างไว้เลย'
                        }
                    },
                    {
                        type: 'action',
                        action: {
                            type: 'postback',
                            label: '❌ ยกเลิกคิวนี้',
                            data: 'action=cancel_upload',
                            displayText: 'ยกเลิกรูปลอตที่ค้างไว้'
                        }
                    }
                ]
            }
        }]
    });
}

async function handleEvent(event) {
  const userId = event.source.userId;

  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim();
    
    // Check if user is in WAITING_FOR_ALBUM_NAME state
    const session = userSessions.get(userId);
    if (session && session.state === 'WAITING_FOR_ALBUM_NAME') {
        // If they click the rich menu again, cancel the creation flow
        if (text === 'อัปโหลดรูปภาพ' || text === 'อัปโหลดรูป') {
            session.state = 'WAITING_FOR_ALBUM_SELECTION';
        } else {
            try {
                const response = await axios.post(`${PHOTOS_API_BASE}/albums`, { name: text }, {
                    headers: { 'Authorization': PHOTOS_PASSWORD }
                });
                
                if (response.data && response.data.success) {
                    const newAlbum = response.data.album;
                    session.albumId = newAlbum.id;
                    session.albumName = newAlbum.name;

                    if (session.imageQueue && session.imageQueue.length > 0) {
                        return askUploadConfirmation(event, session, newAlbum.name);
                    } else {
                        session.state = 'READY_FOR_IMAGES';
                        return client.replyMessage({
                            replyToken: event.replyToken,
                            messages: [{ type: 'text', text: `✅ สร้างอัลบั้ม "${newAlbum.name}" สำเร็จ!\n\n📸 กรุณาส่งรูปภาพมาได้เลยครับ (ส่งรวดเดียวหลายรูปได้เลย)` }]
                        });
                    }
                } else {
                    return client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{ type: 'text', text: '❌ สร้างอัลบั้มไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }]
                    });
                }
            } catch (error) {
                return client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{ type: 'text', text: `❌ เกิดข้อผิดพลาดในการสร้างอัลบั้ม: ${error.message}` }]
                });
            }
        }
    }

    // เมื่อกดปุ่มจาก Rich Menu
    if (text === 'อัปโหลดรูปภาพ' || text === 'อัปโหลดรูป') {
        try {
            const response = await axios.get(`${PHOTOS_API_BASE}/albums`);
            const albums = response.data.filter(a => !a.is_locked); 
            
            const quickReplyItems = [];

            // Add Create Album option as the first item
            quickReplyItems.push({
                type: 'action',
                action: {
                    type: 'postback',
                    label: '➕ สร้างอัลบั้มใหม่',
                    data: 'action=create_album',
                    displayText: 'สร้างอัลบั้มใหม่'
                }
            });

            // Add top 12 albums
            const albumItems = albums.slice(0, 12).map(a => ({
                type: 'action',
                action: {
                    type: 'postback',
                    label: a.name.substring(0, 20), 
                    data: `action=select_album&id=${a.id}&name=${encodeURIComponent(a.name.substring(0, 20))}`,
                    displayText: `เลือกอัลบั้ม: ${a.name.substring(0, 20)}`
                }
            }));

            quickReplyItems.push(...albumItems);

            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{
                    type: 'text',
                    text: 'กรุณาเลือกอัลบั้มที่ต้องการอัปโหลดรูปลงไปครับ หรือกดสร้างใหม่ (แสดงสูงสุด 12 อัลบั้มล่าสุด):',
                    quickReply: { items: quickReplyItems }
                }]
            });
        } catch (error) {
            console.error(error);
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{ type: 'text', text: 'เกิดข้อผิดพลาดในการดึงข้อมูลอัลบั้มครับ' }]
            });
        }
    } else {
        // Fallback to Dialogflow for unknown text commands
        try {
            const sessionPath = sessionClient.projectAgentSessionPath(dialogflowProjectId, userId);
            
            const request = {
                session: sessionPath,
                queryInput: {
                    text: {
                        text: text,
                        languageCode: 'th',
                    },
                },
            };
            
            const [response] = await sessionClient.detectIntent(request);
            const result = response.queryResult;
            
            let replyMessages = [];

            // First, try to extract LINE-specific custom payloads
            if (result.fulfillmentMessages && result.fulfillmentMessages.length > 0) {
                for (const msg of result.fulfillmentMessages) {
                    if (msg.payload && msg.payload.fields && msg.payload.fields.line) {
                        // Complex Custom Payload (convert struct to JSON)
                        // This is a simplified approach. For raw JSON, it's easier to use text fallback if complex.
                        // But let's check for standard text responses first:
                    } else if (msg.text && msg.text.text && msg.text.text.length > 0) {
                        replyMessages.push({ type: 'text', text: msg.text.text[0] });
                    } else if (msg.message === 'payload' && msg.payload) {
                        // Direct payload from some Node.js client versions
                        const structJson = dialogflow.util.struct.decode(msg.payload);
                        if (structJson.line) {
                            replyMessages.push(structJson.line);
                        }
                    }
                }
            }

            // Fallback to default fulfillmentText if no messages parsed
            if (replyMessages.length === 0 && result.fulfillmentText) {
                replyMessages.push({ type: 'text', text: result.fulfillmentText });
            }
            
            if (replyMessages.length > 0) {
                return client.replyMessage({
                    replyToken: event.replyToken,
                    messages: replyMessages
                });
            } else {
                const intentName = result.intent ? result.intent.displayName : 'Unknown';
                return client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{ type: 'text', text: `(Debug) 🤖 จับเจตนาได้คือ: "${intentName}"\nแต่เซิร์ฟเวอร์ดึงข้อความจากแท็บ LINE ไม่สำเร็จ แนะนำให้ก๊อปปี้ข้อความไปใส่ในแท็บ DEFAULT แทนครับ` }]
                });
            }
        } catch (error) {
            console.error('Dialogflow error:', error);
            // Silent fail or simple generic fallback if DF fails
            return client.replyMessage({
                replyToken: event.replyToken,
                messages: [{ type: 'text', text: 'ขออภัยครับ ระบบประมวลผลข้อความขัดข้อง กรุณาลองใหม่อีกครั้ง' }]
            });
        }
    }
  }

  if (event.type === 'postback') {
      const data = new URLSearchParams(event.postback.data);
      
      let session = userSessions.get(userId);
      if (!session) {
          session = { imageQueue: [], totalUploaded: 0, totalFailed: 0, isUploading: false };
          userSessions.set(userId, session);
      }

      if (data.get('action') === 'create_album') {
          session.state = 'WAITING_FOR_ALBUM_NAME';
          return client.replyMessage({
              replyToken: event.replyToken,
              messages: [{
                  type: 'text',
                  text: '✏️ กรุณาพิมพ์ชื่ออัลบั้มใหม่ที่ต้องการสร้าง แล้วส่งมาเป็นข้อความได้เลยครับ',
                  quickReply: {
                      items: [
                          {
                              type: 'action',
                              action: {
                                  type: 'postback',
                                  label: '❌ ยกเลิกการสร้าง',
                                  data: 'action=cancel_create_album',
                                  displayText: 'ยกเลิกการสร้างอัลบั้ม'
                              }
                          }
                      ]
                  }
              }]
          });
      }

      if (data.get('action') === 'select_album') {
          const albumId = data.get('id');
          const albumName = data.get('name');
          
          session.albumId = albumId;
          session.albumName = albumName;

          if (session.imageQueue && session.imageQueue.length > 0) {
              return askUploadConfirmation(event, session, albumName);
          } else {
              session.state = 'READY_FOR_IMAGES';
              return client.replyMessage({
                  replyToken: event.replyToken,
                  messages: [{ type: 'text', text: `✅ คุณเลือกอัลบั้ม "${albumName}" แล้ว\n\n📸 กรุณาส่งรูปภาพมาได้เลยครับ (ส่งรวดเดียวหลายรูปได้เลย)` }]
              });
          }
      }

      if (data.get('action') === 'confirm_upload') {
          if (session.state === 'WAITING_FOR_UPLOAD_CONFIRMATION') {
              session.state = 'READY_FOR_IMAGES';
              processQueue(userId);
              return;
          }
      }

      if (data.get('action') === 'cancel_upload') {
          if (session.state === 'WAITING_FOR_UPLOAD_CONFIRMATION') {
              session.state = 'READY_FOR_IMAGES';
              session.imageQueue = [];
              return client.replyMessage({
                  replyToken: event.replyToken,
                  messages: [{ type: 'text', text: '🗑️ ยกเลิกรูปลอตที่ค้างไว้เรียบร้อยแล้ว\n\n📸 กรุณาส่งรูปภาพลอตใหม่มาได้เลยครับ' }]
              });
          }
      }

      if (data.get('action') === 'cancel_create_album') {
          if (session.state === 'WAITING_FOR_ALBUM_NAME') {
              session.state = 'WAITING_FOR_ALBUM_SELECTION';
              return client.replyMessage({
                  replyToken: event.replyToken,
                  messages: [{ type: 'text', text: '🛑 ยกเลิกการสร้างอัลบั้มแล้วครับ กรุณากดเมนู "อัปโหลดรูปภาพ" เพื่อเลือกอัลบั้มตามปกติครับ' }]
              });
          }
      }
  }

  if (event.type === 'message' && (event.message.type === 'image' || event.message.type === 'video')) {
      let session = userSessions.get(userId);
      if (!session) {
          session = {
              state: 'WAITING_FOR_ALBUM_SELECTION',
              imageQueue: [],
              isUploading: false,
              totalUploaded: 0,
              totalFailed: 0
          };
          userSessions.set(userId, session);
      }

      if (!session.imageQueue) {
          session.imageQueue = [];
          session.isUploading = false;
          session.totalUploaded = 0;
          session.totalFailed = 0;
      }
      if (!session.sets) session.sets = new Map();
      session.photoSeq = (session.photoSeq || 0) + 1;

      // Photos sent together share imageSet.id; index/total say where this one fits and how many to expect.
      const set = event.message.imageSet;
      let seq = session.photoSeq * 1000;
      if (set && set.id) {
          let s = session.sets.get(set.id);
          if (!s) {
              s = { total: Number(set.total) || 0, seen: 0, base: session.photoSeq * 1000 };
              session.sets.set(set.id, s);
          }
          s.seen++;
          seq = s.base + (Number(set.index) || 0);
      }
      session.imageQueue.push({ id: event.message.id, type: event.message.type, seq });
      session.lastPhotoAt = Date.now();
      // The newest reply token answers the whole send at the end, for free.
      session.lastReplyToken = event.replyToken;
      session.lastReplyAt = Date.now();

      if (session.state !== 'READY_FOR_IMAGES') {
          if (session.warningTimer) clearTimeout(session.warningTimer);
          // One warning per send, not per photo: wait until the photos stop arriving.
          session.warningTimer = setTimeout(async () => {
              session.warningTimer = null;
              
              if (session.state === 'WAITING_FOR_UPLOAD_CONFIRMATION') {
                  await replyOrPush(userId, session, [{ type: 'text', text: `⚠️ คุณยังไม่ได้ยืนยันการอัปโหลด กรุณากดปุ่ม "✅ อัปโหลดเลย" หรือ "❌ ยกเลิกคิวนี้" ในข้อความก่อนหน้านี้ครับ` }]);
                  return;
              }

              const count = session.imageQueue.length;
              let text = `⚠️ ระบบได้รับไฟล์ที่รอคิวอัปโหลด ${count} ไฟล์\n\nแต่คุณยังไม่ได้เลือกอัลบั้มครับ กรุณากดปุ่ม "อัปโหลดรูปภาพ" จากเมนูแล้วเลือกอัลบั้มก่อน (หรือพิมพ์ชื่ออัลบั้มถ้ากำลังสร้างใหม่) ครับ`;
              
              await replyOrPush(userId, session, [{ type: 'text', text }]);
          }, QUIET_MS);
          return;
      }

      scheduleUpload(userId);
  }
}

const port = process.env.PORT || 8090;
app.listen(port, () => {
  console.log(`LINE Bot listening on port ${port}`);
});
