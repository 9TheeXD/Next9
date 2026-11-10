# ย้าย Next9 จาก VPS ไป Serverless (ฟรี)

branch `serverless` เตรียมโค้ดทุกระบบให้รันบน Vercel + Turso + Supabase + Cloudflare R2 (ที่ใช้อยู่แล้ว)
ไม่มีเซิร์ฟเวอร์ให้ดูแล และอยู่ในโควตาฟรีทั้งหมด เหลือแค่สร้างบัญชี ตั้งค่า แล้วย้ายข้อมูลตามขั้นตอนด้านล่าง

## ภาพรวม

| ระบบ | Vercel project (Root Directory) | ฐานข้อมูล | โดเมน (เดิม) |
|---|---|---|---|
| เว็บหลัก + API + LINE bot | `next/web` | Turso `next9` (Tokyo) | next9.yumistack.net |
| ประเมินแถว | `assessRow` | Turso `assess` (Tokyo) | assess-row-next9.yumistack.net |
| Next Breath admin + API | `cigarette/admin-web` | Supabase Postgres (Singapore) | ciga-next9.yumistack.net |
| Next Breath แอป (web) | `cigarette/mobile-app` | – (เรียก API ของ admin-web) | app-ciga-next9.yumistack.net |

ไฟล์ (รูป วิดีโอ เสียง สมาชิก) อยู่ใน R2 bucket `assets` เหมือนเดิม ส่วน `ShiftManager` อยู่ repo แยก (ดูหัวข้อ 8)

region: function ของ `next/web` และ `assessRow` ตั้งไว้ที่ Tokyo (`hnd1` ใน `vercel.json`) ให้อยู่ที่เดียวกับ Turso
หน้าหนึ่งยิง query หลายครั้ง ถ้า function กับ DB อยู่ห่างกัน ทุก query จะช้าตามระยะ ส่วน `cigarette/admin-web`
ตั้งไว้ที่ Singapore (`sin1`) คู่กับ Supabase ถ้าเลือก region DB อื่น ให้แก้ `regions` ใน `vercel.json` ให้ตรงกัน

## สิ่งที่เปลี่ยนไปจาก VPS

- `next/server.js` ย้ายเป็น `next/web/server/api.mjs` รันเป็น API route ของ Next.js (`src/pages/api/[...path].ts`)
  - SQLite 3 ไฟล์ (building, photos, pinkbook) รวมเป็น Turso DB เดียว
  - ไฟล์ JSON ที่เคยอยู่ข้าง server.js เก็บในตาราง `kv_store` แทน: toilet, pinkbook/inert config,
    submit_inert, students, inspectors
- อัปโหลดรูปและวิดีโอ: browser ส่งไฟล์ตรงเข้า R2 ด้วย signed URL แล้วแจ้ง API (`upload-url`, `upload-commit`)
  เพราะ Vercel รับได้ไม่เกิน 4.5MB ต่อ request
  - รูปยังถูกย่อเป็น preview/thumb/sd/medium ด้วย sharp เหมือนเดิม และ 4K สร้างตอนมีคนขอ
  - วิดีโอเก็บแค่ไฟล์ต้นฉบับ ไม่ทำหลายความชัดแล้ว ภาพหน้าปก ขนาด และความยาวของวิดีโอให้ browser อ่านตอนอัปโหลด
    (วิดีโอที่ส่งจาก LINE ใช้ภาพ preview ของ LINE) ส่วนความชัดที่ VPS ทำเสร็จไว้แล้วยังเลือกดูได้
- งานเบื้องหลัง: ไม่มี worker ค้าง
  - รูปถูกประมวลผลต่อหลังตอบ request (waitUntil)
  - รูปที่ค้างจะถูกปลุกใหม่ตอนหน้าเว็บ poll สถานะ และโดย cron รายวัน (`/api/cron/daily`)
  - cron รายวันล้างถังขยะที่เกิน 30 วันด้วย (เดิมทุก 6 ชม.)
- LINE bot (`lineBot/`) ย้ายเป็น `/api/line/webhook` ใน `next/web` ลำดับการคุยเหมือนเดิม
  - state เก็บใน DB
  - รูปที่ส่งพร้อมกันได้ข้อความสรุปข้อความเดียว
- Discord bot: ตัดออก
- rate limit (รหัสผิด, duty upload) เก็บใน DB แทน memory
- หน้าเว็บเก่า (`next/forms`, `viewforms`, `photos`, `s`, `assets` ฯลฯ) ถูก copy เข้า `public/` ตอน build
  ให้แก้ไฟล์ต้นฉบับที่เดิม
- `assessRow`: `better-sqlite3` เปลี่ยนเป็น libSQL (Turso)
  - backup รายวันเข้า R2 ทำโดย Vercel cron (`/api/cron/backup`)
  - cache ของหน้าสรุปเช็คเวอร์ชันข้อมูลแทนการสแกนตาราง (ประหยัดโควตาอ่านแถวของ Turso)
  - เวลาใน DB ยังเป็นเวลาไทย (`datetime('now', '+7 hours')`)
- `cigarette/admin-web`:
  - เสียงที่อัปโหลดเก็บใน R2 แล้ว ลิงก์เก่า `/api/sounds/<ไฟล์>` redirect ไปที่ใหม่
  - `cron.js` (ทุกนาที) เลิกใช้ ให้ cron-job.org เรียก `/api/cron/smart-push` ทุก 5 นาทีแทน
    แจ้งเตือนจะถูกส่งภายในหนึ่งชั่วโมงหลังเวลาที่ผู้ใช้เลือก และวันละครั้งเหมือนเดิม
  - Firebase key อ่านจาก env แทนไฟล์

## 1. สร้างบัญชี (ฟรีทั้งหมด)

1. **Vercel** (Hobby) ล็อกอินด้วย GitHub ที่เข้าถึง repo `9TheeXD/Next9` ได้
2. **Turso** ติดตั้ง CLI: `curl -sSfL https://get.tur.so/install.sh | bash` แล้ว `turso auth signup`
   เลือก location ของ group เป็น Tokyo (`aws-ap-northeast-1`) หรือที่ใกล้ไทยที่สุดที่มีให้เลือก
3. **Supabase** สร้าง project region Singapore (Southeast Asia) จด database password ไว้
4. **cron-job.org** สมัครฟรี (ใช้ตอนท้าย)

## 2. ย้ายข้อมูล

ทำตอนจะสลับจริง เพื่อให้ได้ข้อมูลล่าสุด ช่วงนั้นควรปิดฟอร์มชั่วคราว หรือทำตอนไม่มีคนใช้

### 2.1 เว็บหลัก (Turso `next9`)

บน VPS (หรือเครื่องที่มี `next/data` ล่าสุด):

```bash
cd next/web
npm ci
node scripts/import-vps-data.mjs --from ../data --root .. --out ./next9.db
turso db create next9 --from-file ./next9.db
turso db show next9 --url          # -> TURSO_DATABASE_URL
turso db tokens create next9       # -> TURSO_AUTH_TOKEN
```

script จะรวม `building.db`, `photos.db`, `pinkbook.db` และไฟล์ JSON ทั้งหมด
(`toilet_*.json`, `students.json`, `inspectors.json`, `data/*_config.json`, `submit_inert.json`)
เป็นไฟล์เดียว รันซ้ำได้

### 2.2 ประเมินแถว (Turso `assess`)

```bash
cd assessRow
npm ci
node scripts/import-vps-data.mjs --from data/assess.db --out ./assess-turso.db
turso db create assess --from-file ./assess-turso.db
turso db show assess --url
turso db tokens create assess
```

(ไฟล์ใหม่เหลือราว 11MB จากเดิม 144MB เพราะตาราง `trend_cache` เก่ากับพื้นที่ว่างไม่ถูก copy)

### 2.3 Next Breath (Supabase Postgres)

```bash
# บน VPS: dump จาก container เดิม
sudo docker exec nextbreath-db pg_dump -U nextbreath -d nextbreath --no-owner --no-acl > nextbreath.sql
# ลงใน Supabase: Project Settings → Database → Connection string แบบ "Direct connection" (port 5432)
psql "postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres" < nextbreath.sql
```

ไฟล์เสียงที่เคยอัปโหลด:

```bash
cd cigarette/admin-web
CF_ACCOUNT_ID=... R2_ACCESS_KEY=... R2_SECRET_KEY=... R2_BUCKET=assets node scripts/upload-sounds.mjs persistent-sounds
```

ลิงก์เสียงเก่าใน DB (`https://ciga-next9.yumistack.net/api/sounds/...`) ใช้ได้ต่อผ่าน redirect
ถ้าอยากให้ชี้ตรงไป R2 รัน SQL นี้ใน Supabase SQL editor (ไม่บังคับ):

```sql
UPDATE "Sound" SET url = replace(url, 'https://ciga-next9.yumistack.net/api/sounds/', 'https://cdn.yumistack.net/next9/nextbreath/sounds/')
WHERE url LIKE 'https://ciga-next9.yumistack.net/api/sounds/%';
```

## 3. Cloudflare R2: เปิด CORS ให้อัปโหลดตรง

Cloudflare → R2 → bucket `assets` → Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": ["https://next9.yumistack.net", "https://<github-user>.github.io"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

แทน `https://<github-user>.github.io` ด้วยโดเมน GitHub Pages ที่เปิด ShiftManager (ไม่ต้องใส่ path)
ถ้าจะทดสอบผ่านโดเมน `*.vercel.app` ก่อน ให้เพิ่มโดเมนนั้นด้วย
R2 API token เดิม (`R2_ACCESS_KEY`/`R2_SECRET_KEY`) ต้องมีสิทธิ์ Object Read & Write ซึ่งเดิมก็ใช้เขียนอยู่แล้ว

## 4. สร้าง Vercel projects

Vercel → Add New → Project → import `9TheeXD/Next9` ทำ 4 ครั้ง ครั้งละ Root Directory:

| Project | Root Directory | Framework | หมายเหตุ |
|---|---|---|---|
| next9 | `next/web` | Next.js | build script copy หน้าเว็บเก่าจาก `../` เอง |
| assess-row | `assessRow` | Next.js | |
| ciga-admin | `cigarette/admin-web` | Next.js | build = `prisma generate && next build` (มีใน package.json) |
| ciga-app | `cigarette/mobile-app` | Other | ค่า build/output อยู่ใน `vercel.json` แล้ว |

ทุก project: Settings → Git → Production Branch = `serverless` (หรือ merge เข้า `main` ภายหลัง)

### Environment Variables

ค่าเดิมส่วนใหญ่อยู่ในไฟล์ `.env` บน VPS ดูรายการเต็มใน `.env.example` ของแต่ละ project

**next9** (`next/web/.env.example`)
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` จากข้อ 2.1
- `CF_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET`: ค่าเดิมจาก `next/.env`
- `EDITOR_PASSWORD`, `PHOTOS_PASSWORD`, `TOILET_PASSWORD`, `ALBUM_TOKEN_SECRET`: ค่าเดิม
  `ALBUM_TOKEN_SECRET` ต้องตั้ง ไม่งั้น token ปลดล็อกอัลบั้มจะไม่คงที่
- `GOOGLE_SERVICE_ACCOUNT_JSON`: เนื้อหาไฟล์ `next/service-account.json` ทั้งไฟล์
- `INERT_*`, `STUDENTS_SHEET_ID`, `BUILDING_SHEET_ID`: ค่าเดิม
- `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`: จาก `next/lineBot/.env`
- `DIALOGFLOW_CREDENTIALS_JSON`: เนื้อหาไฟล์ `next/lineBot/sdh-next9-chatbot-*.json`
- `SITE_ORIGIN=https://next9.yumistack.net`
- `CRON_SECRET`: สุ่มยาวๆ

**assess-row** (`assessRow/.env.example`)
- `TURSO_*` จากข้อ 2.2
- ค่าเดิมจาก `assessRow/.env`: `NEXTAUTH_*`, `GOOGLE_CLIENT_*`, `ADMIN_*`, `CF_ACCOUNT_ID`, `R2_*`
- `JWT_SECRET_KEY`, `CRON_SECRET`: สุ่ม

**ciga-admin** (`cigarette/admin-web/.env.example`)
- `DATABASE_URL`: connection string แบบ **Transaction pooler** (port 6543) ของ Supabase
- `JWT_SECRET`, `ADMIN_PASSWORD`: ค่าเดิมจาก `.env.local` เดิม ต้องใช้ `JWT_SECRET` เดิม ไม่งั้นผู้ใช้แอปหลุด login
- `CORS_ORIGIN=https://app-ciga-next9.yumistack.net`
- `FIREBASE_SERVICE_ACCOUNT`: เนื้อหาไฟล์ `serviceAccountKey.json`
- `CRON_SECRET`: สุ่ม
- `CF_ACCOUNT_ID`, `R2_*`, `SOUNDS_PUBLIC_BASE_URL=https://cdn.yumistack.net`

**ciga-app**
- `EXPO_PUBLIC_API_URL=https://ciga-next9.yumistack.net/api`

ค่าที่เป็นไฟล์ JSON ทั้งไฟล์ (service account) ให้วางเนื้อหา JSON ลงช่อง value ได้เลย

## 5. โดเมน

ลองผ่านโดเมน `*.vercel.app` ก่อน เมื่อใช้ได้แล้วจึงย้ายโดเมนจริง:
Vercel project → Settings → Domains → เพิ่มโดเมนเดิม แล้วแก้ DNS ตามที่ Vercel บอก
(ส่วนใหญ่เป็น CNAME ไป `cname.vercel-dns.com`) ถ้า DNS อยู่ที่ Cloudflare ให้ปิด proxy (เมฆสีเทา) ของ record นั้น

- **assess-row**: ใน Google Cloud Console → OAuth client ให้ redirect URI
  `https://assess-row-next9.yumistack.net/api/auth/callback/google` อยู่ในรายการ (เดิมมีอยู่แล้ว)
  ถ้าทดสอบด้วยโดเมน vercel.app ต้องเพิ่มของโดเมนนั้นด้วย และตั้ง `NEXTAUTH_URL` ให้ตรงกับโดเมนที่ใช้

## 6. LINE bot

LINE Developers → channel → Messaging API → Webhook URL:
`https://next9.yumistack.net/api/line/webhook` → Verify → เปิด Use webhook

## 7. ตั้งเวลาแจ้งเตือน Next Breath

cron-job.org → Create cronjob:
- URL: `https://ciga-next9.yumistack.net/api/cron/smart-push?key=<CRON_SECRET ของ ciga-admin>`
- ทุก 5 นาที

นอกจากส่งแจ้งเตือนตรงเวลา งานนี้ยังทำให้ Supabase ไม่ถูกพักเพราะไม่มีการใช้งาน (free plan พักหลัง 7 วัน)

cron ของ `next9` (รายวัน 03:00 น.) และ `assess-row` (backup 09:00 น.) Vercel รันเองตาม `vercel.json`

## 8. ShiftManager

ใน repo ของ ShiftManager (`DARWINZY/ShiftManager`) มี branch `serverless` ในเครื่อง (ยังไม่ push)
แก้ `js/api.js` ให้ส่งรูปเวรตรงเข้า R2 (`duty-upload-url`, `duty-commit`) แทนการส่งก้อนเดียว
ถ้าเซิร์ฟเวอร์ยังเป็น VPS เดิมจะ fallback เป็นแบบเก่าอัตโนมัติ จึง merge และ push ได้ก่อนย้ายเลย
ถ้าไม่ทำ ShiftManager ยังส่งได้เฉพาะเมื่อรูปรวมต่อครั้งไม่เกินราว 4MB

## 9. ปิด VPS

เมื่อทุกอย่างบนโดเมนจริงใช้ได้ ให้หยุด container เดิม:
`next9-server`, `next9-web`, `next9-line-bot`, `next9-bot`, `assessrow-app`, `ciga-next9`, `nextbreath-db`
แนะนำให้เก็บไฟล์ `data/` และ dump ไว้สักระยะก่อนลบเครื่อง

## โควตาฟรีและสิ่งที่ทำไว้ให้ใช้ช้าลง

| บริการ | โควตา (ประมาณ) | ที่ทำไว้ |
|---|---|---|
| Vercel Hobby | 1M function calls, ~4 ชม. CPU, 100GB transfer/เดือน; request ≤ 4.5MB; function ≤ 300 วินาที | ไฟล์ใหญ่ไม่ผ่าน function; รูป/วิดีโอเสิร์ฟจาก R2 ด้วย signed URL (ไม่กิน bandwidth Vercel); ย่อรูปด้วย sharp ครั้งเดียวตอนอัป; ปิด image optimization; หน้าเว็บเก่าเป็น static |
| Turso Free | 5GB, อ่าน 500M แถว, เขียน 10M แถว/เดือน | assessRow ใช้ตัวนับเวอร์ชัน (trigger) แทนสแกน 65k แถวทุก request; รายชื่อนักเรียน cache ใน memory 10 นาที; schema setup ข้ามเมื่อเวอร์ชันตรง |
| Supabase Free | DB 500MB, พักเมื่อไม่มีใช้ 7 วัน | pool เล็ก (`PG_POOL_MAX`); cron 5 นาทีกันพัก |
| R2 Free | 10GB, egress ฟรี | เหมือนเดิม |

ถ้า CPU ของ Vercel ใกล้เต็ม (ดูที่ Usage) ต้นเหตุหลักคือการย่อรูปตอนอัปโหลดจำนวนมาก
หน้าอัปโหลดย่อรูปในเครื่องผู้ใช้ก่อนส่งอยู่แล้ว ยกเว้นเลือกคุณภาพ "ต้นฉบับ"

## รันในเครื่อง (dev)

```bash
cd next/web
cp .env.example .env.local      # ใส่ค่า R2 และรหัสผ่าน; ใส่ NEXT9_DEV_READONLY=1 เพื่อไม่ให้เขียน R2 จริง
node scripts/import-vps-data.mjs   # สร้าง ../data-dev/next9.db จาก ../data
npm run dev                      # http://localhost:8070
```

`assessRow`: ไม่ตั้ง `TURSO_DATABASE_URL` = ใช้ `data/assess.db`
`cigarette/admin-web`: ตั้ง `DATABASE_URL` เป็น Postgres ในเครื่องหรือ Supabase

## ทดสอบไปแล้ว / ยังไม่ได้ทดสอบ

ทดสอบในเครื่องด้วยสำเนาข้อมูลจริง (`next dev` และ `next build` + `next start`):
- อัลบั้ม: รายการ, รูปในอัลบั้ม, timeline
- อัปโหลด: presign → PUT → commit → ย่อรูปเสร็จ; commit ซ้ำไม่เกิดรูปซ้ำ; อัปโหลดแบบเก่า (multipart)
- จัดการรูป: แปลงไฟล์, ลบ/กู้ถังขยะ, คัดลอก, ล็อก/ปลดล็อกอัลบั้ม
- แชร์: ลิงก์แชร์ editor, OG image, meta ของหน้า `/s/` และ `/photos/album/`
- duty upload ทั้งแบบใหม่และแบบเก่า
- ฟอร์ม: toilet (ส่งพร้อมกัน 5 รายการไม่หาย), pinkbook draft, inert config, ค้นหานักเรียน
- rate limit รหัสผ่านผิด, cron รายวัน, หน้าเว็บเก่าทุกโฟลเดอร์
- assessRow: API ทุกตัวด้วย token admin และ trigger ตัวนับเวอร์ชัน

ยังไม่ได้ทดสอบ (ต้องมีบัญชี/อุปกรณ์จริง):
- deploy จริงบน Vercel, Turso, Supabase
- หน้าอัปโหลดรูปใน browser จริง (โค้ดผ่าน typecheck/lint แต่ยังไม่ได้กดใช้)
- LINE webhook กับ LINE จริง, Dialogflow
- เสียงอัปโหลดของ admin-web กับ R2 จริง, push notification
- `cigarette/admin-web` กับ Supabase (โค้ด DB ไม่ได้แก้นอกจากขนาด pool)
