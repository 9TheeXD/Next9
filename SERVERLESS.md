# ย้าย Next9 จาก VPS ไป Serverless (ฟรี)

branch `serverless` เตรียมโค้ดทุกระบบให้รันบน Vercel + Turso + Supabase + Cloudflare R2 (ที่ใช้อยู่แล้ว)
ไม่มีเซิร์ฟเวอร์ให้ดูแล และอยู่ในโควตาฟรีทั้งหมด เหลือแค่สร้างบัญชี ตั้งค่า แล้วย้ายข้อมูลตามขั้นตอนด้านล่าง

## ภาพรวม

| ระบบ | Vercel project (Root Directory) | ฐานข้อมูล | โดเมน (เดิม) |
|---|---|---|---|
| เว็บหลัก + API + LINE bot | `next/web` | Turso `next9` (Singapore) | next9.yumistack.net |
| ประเมินแถว | `assessRow` | Turso `assess` (Singapore) | assess-row-next9.yumistack.net |
| Next Breath admin + API | `cigarette/admin-web` | Supabase Postgres (Singapore) | ciga-next9.yumistack.net |
| Next Breath แอป (web) | `cigarette/mobile-app` | – (เรียก API ของ admin-web) | app-ciga-next9.yumistack.net |

ไฟล์ (รูป วิดีโอ เสียง สมาชิก) อยู่ใน R2 bucket `assets` เหมือนเดิม
ระบบลงเวร `ShiftManager/` รวมอยู่ใน repo นี้ เว็บ next9 เปิดให้ที่ `/duty/` (ดูหัวข้อ 8)

region: function ทุกตัวตั้งไว้ที่ Singapore (`sin1` ใน `vercel.json`) ที่เดียวกับ Turso (`aws-ap-southeast-1`)
และ Supabase หน้าหนึ่งยิง query หลายครั้ง ถ้า function กับ DB อยู่ห่างกัน ทุก query จะช้าตามระยะ
ถ้าย้าย DB ไป region อื่น ให้แก้ `regions` ใน `vercel.json` ให้ตรงกัน

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
   แล้วสร้าง group ที่ Singapore: `turso group create default --location aws-ap-southeast-1`
3. **Supabase** สร้าง project region Singapore (Southeast Asia) จด database password ไว้
4. **cron-job.org** สมัครฟรี (ใช้ตอนท้าย)

## 2. ย้ายข้อมูล

ทำตอนจะสลับจริง เพื่อให้ได้ข้อมูลล่าสุด ช่วงนั้นควรปิดฟอร์มชั่วคราว หรือทำตอนไม่มีคนใช้

### 2.1 เว็บหลัก (Turso `next9`)

script อยู่ใน branch `serverless` เท่านั้น บน VPS ให้เปิด branch นี้เป็นโฟลเดอร์แยกด้วย `git worktree`
อย่า checkout ในโฟลเดอร์ production

```bash
git -C /home/cmp/sdh-council worktree add ~/next9-serverless serverless
cd ~/next9-serverless/next/web
npm ci
turso db create next9 --group default
export TURSO_DATABASE_URL=$(turso db show next9 --url)
export TURSO_AUTH_TOKEN=$(turso db tokens create next9)
node scripts/import-vps-data.mjs --turso --from /home/cmp/sdh-council/next/data --root /home/cmp/sdh-council/next
```

(`--turso` เขียนเข้า Turso ตรงๆ ถ้าเครื่องมี `sqlite3` จะใช้วิธี `--out ./next9.db` แล้วตามด้วย
`turso db create next9 --from-file ./next9.db` แทนก็ได้)

script จะรวม `building.db`, `photos.db`, `pinkbook.db` และไฟล์ JSON ทั้งหมด
(`toilet_*.json`, `students.json`, `inspectors.json`, `data/*_config.json`, `submit_inert.json`)
เป็นไฟล์เดียว รันซ้ำได้

### 2.2 ประเมินแถว (Turso `assess`)

```bash
cd ~/next9-serverless/assessRow
npm ci
turso db create assess --group default
export TURSO_DATABASE_URL=$(turso db show assess --url)
export TURSO_AUTH_TOKEN=$(turso db tokens create assess)
node scripts/import-vps-data.mjs --turso --from /home/cmp/sdh-council/assessRow/data/assess.db
```

(ข้อมูลเหลือราว 11MB จากไฟล์เดิม 144MB เพราะตาราง `trend_cache` เก่ากับพื้นที่ว่างไม่ถูก copy)

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

## 3. Cloudflare R2: CORS

ตรวจแล้ว (2026-11-10): bucket `assets` อนุญาต GET และ PUT จาก `https://next9.yumistack.net` อยู่แล้ว
หลังย้ายโดเมนจึงไม่ต้องทำอะไร

ถ้าจะทดสอบอัปโหลดรูปหรือดาวน์โหลด ZIP ผ่านโดเมน vercel.app ก่อนย้ายโดเมน ให้เพิ่ม origin นั้น:
Cloudflare → R2 → bucket `assets` → Settings → CORS Policy → เพิ่ม `https://next9-web.vercel.app`
ใน `AllowedOrigins` (`AllowedMethods`: `GET`, `PUT`, `HEAD`; `AllowedHeaders`: `Content-Type`)
ถ้าไม่เพิ่ม การส่งไฟล์ไป R2 จาก vercel.app จะโดนปฏิเสธ (403) ส่วนการดูรูปปกติใช้ได้

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
- `DATABASE_URL`: connection string แบบ **Transaction pooler** (port 6543) ของ Supabase ต่อท้ายด้วย
  `?sslmode=no-verify` (ถ้าใช้ `sslmode=require` ไลบรารี `pg` จะปฏิเสธ cert ของ Supabase)
- `JWT_SECRET`, `ADMIN_PASSWORD`: ค่าเดิมจาก `.env.local` เดิม ต้องใช้ `JWT_SECRET` เดิม ไม่งั้นผู้ใช้แอปหลุด login
- `CORS_ORIGIN=https://app-ciga-next9.yumistack.net`
- `FIREBASE_SERVICE_ACCOUNT`: เนื้อหาไฟล์ `serviceAccountKey.json`
- `CRON_SECRET`: สุ่ม
- `CF_ACCOUNT_ID`, `R2_*`, `SOUNDS_PUBLIC_BASE_URL=https://cdn.yumistack.net`

**ciga-app**
- `EXPO_PUBLIC_API_URL=/api` (`vercel.json` ส่ง `/api/*` ต่อไปที่ `https://ciga-next9.yumistack.net` เหมือน nginx เดิม
  ถ้าเปลี่ยนโดเมนของ ciga-admin ให้แก้ปลายทาง rewrite นั้นด้วย)

ค่าที่เป็นไฟล์ JSON ทั้งไฟล์ (service account) ให้วางเนื้อหา JSON ลงช่อง value ได้เลย

## 5. โดเมน

ลองผ่านโดเมน `*.vercel.app` ก่อน เมื่อใช้ได้แล้วจึงย้ายโดเมนจริง:
Vercel project → Settings → Domains → เพิ่มโดเมนเดิม แล้วแก้ DNS ตามที่ Vercel บอก
(ส่วนใหญ่เป็น CNAME ไป `cname.vercel-dns.com`) ถ้า DNS อยู่ที่ Cloudflare ให้ปิด proxy (เมฆสีเทา) ของ record นั้น

- **assess-row**: login Google ใช้ได้เฉพาะโดเมนที่อยู่ใน Google Cloud Console → APIs & Services →
  Credentials → OAuth client → Authorized redirect URIs
  - โดเมนจริง `https://assess-row-next9.yumistack.net/api/auth/callback/google` (เดิมมีอยู่แล้ว)
  - ทดสอบบน vercel.app: เพิ่ม `https://assess-row-sdh.vercel.app/api/auth/callback/google`
    (ถ้าไม่เพิ่ม Google ตอบ `Error 400: redirect_uri_mismatch`)
  - `NEXTAUTH_URL` ใน Vercel ต้องตรงกับโดเมนที่ใช้อยู่ ย้ายโดเมนแล้วเปลี่ยนกลับเป็นโดเมนจริงแล้ว Redeploy

## 6. LINE bot

LINE Developers → channel → Messaging API → Webhook URL:
`https://next9.yumistack.net/api/line/webhook` → Verify → เปิด Use webhook

## 7. ตั้งเวลาแจ้งเตือน Next Breath

cron-job.org → Create cronjob:
- URL: `https://ciga-next9.yumistack.net/api/cron/smart-push?key=<CRON_SECRET ของ ciga-admin>`
- ทุก 5 นาที

นอกจากส่งแจ้งเตือนตรงเวลา งานนี้ยังทำให้ Supabase ไม่ถูกพักเพราะไม่มีการใช้งาน (free plan พักหลัง 7 วัน)

cron ของ `next9` (รายวัน 03:00 น.) และ `assess-row` (backup 09:00 น.) Vercel รันเองตาม `vercel.json`

## 8. ShiftManager (ระบบลงเวร)

copy มาจาก `DARWINZY/ShiftManager` (main ล่าสุด `40e5ebd`) อยู่ที่ `ShiftManager/` ใน repo นี้
และเว็บ next9 เปิดให้ที่ **`https://next9.yumistack.net/duty/`** (build script copy เข้า `public/duty/`)

- เปิดจาก next9 รูปเวรส่งเข้า API ของ origin เดียวกัน และส่งตรงเข้า R2 ผ่าน `duty-upload-url` แล้วตามด้วย `duty-commit` ได้ทุกขนาด
- `js/config.js`: `PHOTOS_ORIGIN` เลือกเอง เปิดจาก next9 / `*.vercel.app` / localhost ใช้ origin เดียวกัน
  เปิดจากที่อื่น (GitHub Pages เดิม) ยิงไป `https://next9.yumistack.net`
- Google Apps Script (`ShiftManager/apps-script/Code.gs`) ยังเหมือนเดิม ไม่ต้อง deploy ใหม่
- GitHub Pages เดิมใช้ต่อได้ช่วงเปลี่ยนผ่าน แต่ส่งรูปได้ไม่เกินราว 4.5MB ต่อครั้ง
  ให้บอกสมาชิกเปลี่ยนไปใช้ลิงก์ `/duty/` แล้วค่อยปิด GitHub Pages
- แก้ ShiftManager ต่อจากนี้ให้แก้ใน `ShiftManager/` ของ repo นี้

## 8.5 วันย้ายจริง: import ข้อมูลล่าสุดทับอีกรอบ

ระหว่างทดสอบ DB บน Turso/Supabase ถูกเขียนไปแล้ว วันย้ายให้ปิดการเขียนบน VPS แล้ว import ใหม่ด้วย
`--reset` (ล้างทุกตารางก่อน token เดิมใช้ต่อได้):

```bash
cd ~/next9-serverless && git pull
cd next/web && export $(cat ~/next9-secrets/turso-next9.env | xargs)
node scripts/import-vps-data.mjs --turso --reset --from /home/cmp/sdh-council/next/data --root /home/cmp/sdh-council/next
cd ../../assessRow && export $(cat ~/next9-secrets/turso-assess.env | xargs)
node scripts/import-vps-data.mjs --turso --reset --from /home/cmp/sdh-council/assessRow/data/assess.db
```

Postgres (Next Breath): ใน Supabase SQL editor รัน `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
แล้ว `pg_dump` / `psql` ใหม่ตามข้อ 2.3 จากนั้น Redeploy ทุก project เพื่อล้าง cache ใน memory

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
