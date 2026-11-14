# Next Breath — Deployment (Vercel)

ระบบนี้รันบน **Vercel ทั้งหมด** ไม่มี VPS, Docker, PM2 หรือ nginx อีกแล้ว
push เข้า branch production ของ Vercel แล้ว Vercel จะ build และ deploy ให้เอง

## โครงสร้าง

```
┌──────────────────────────┐   /api/* (rewrite)   ┌───────────────────────────┐
│ ciga-app  (Vercel)       │ ───────────────────▶ │ ciga-next9  (Vercel)      │
│ Root: cigarette/mobile-app│                      │ Root: cigarette/admin-web │
│ Expo export → static PWA │                      │ Next.js: API + dashboard  │
└──────────────────────────┘                      └────────────┬──────────────┘
                                                               │
                         ┌─────────────────────────┬───────────┴──────────┬────────────────────┐
                         ▼                         ▼                      ▼                    ▼
                 Supabase Postgres          Cloudflare R2           Firebase (FCM)       cron-job.org
                 (Singapore, pooler 6543)   ไฟล์เสียงที่อัปโหลด      push notification    เรียก /api/cron/*
```

| Vercel project | URL | Root Directory | Framework | Build |
|---|---|---|---|---|
| `ciga-next9` (API + dashboard) | https://ciga-next9.vercel.app | `cigarette/admin-web` | Next.js | `npm run build` = `prisma generate && next build` |
| `app-ciga-next9` (แอป) | https://app-ciga-next9.vercel.app | `cigarette/mobile-app` | Other | ตั้งไว้ใน `mobile-app/vercel.json` (`npm run build`, output `dist`) |

- function ของ ciga-next9 อยู่ที่ `sin1` (Singapore) ใน `admin-web/vercel.json` ให้ใกล้ Supabase
- แอปเรียก API ผ่าน path เดียวกัน (`/api`) แล้ว `mobile-app/vercel.json` rewrite ต่อไปที่ `https://ciga-next9.vercel.app/api/*`
  ถ้าโดเมนของ ciga-next9 เปลี่ยน ให้แก้ปลายทาง rewrite นั้นบรรทัดเดียว

## Environment Variables

ตั้งใน Vercel → Project → Settings → Environment Variables รายการเต็มอยู่ใน `.env.example` ของแต่ละ project

**ciga-next9** (`admin-web/.env.example`)
- `DATABASE_URL` — Supabase "Transaction pooler" (port 6543) ต่อท้าย `?sslmode=no-verify`
- `PG_POOL_MAX` — ขนาด pool ต่อ instance (ค่าแนะนำ 3)
- `JWT_SECRET` — ห้ามเปลี่ยน ถ้าเปลี่ยนผู้ใช้ทุกคนจะหลุด login
- `ADMIN_PASSWORD` — รหัสผ่าน admin dashboard
- `CORS_ORIGIN` — โดเมนของแอป
- `NEXT_PUBLIC_APP_URL` — ลิงก์ไปแอปจากหน้า landing
- `FIREBASE_SERVICE_ACCOUNT` — JSON ของ service account ทั้งไฟล์ (บรรทัดเดียว)
- `CRON_SECRET` — กุญแจของ cron ทุกตัว (ดูหัวข้อ Cron)
- `CF_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET` — เก็บไฟล์เสียงที่ admin อัปโหลด

**ciga-app** (`mobile-app/.env.example`) — อ่านตอน build เท่านั้น
- `EXPO_PUBLIC_API_URL=/api`
- `EXPO_PUBLIC_ADMIN_URL`, `EXPO_PUBLIC_APP_URL` (ไม่บังคับ)

แก้ env แล้วต้อง **Redeploy** ค่าใหม่ถึงจะมีผล

## Cron

Vercel Hobby ไม่มี cron ถี่ จึงใช้ cron-job.org เรียก endpoint พร้อมกุญแจ `CRON_SECRET`
ส่งกุญแจได้สองแบบ: `?key=<CRON_SECRET>` หรือ header `Authorization: Bearer <CRON_SECRET>`

| Endpoint | ความถี่ | หน้าที่ |
|---|---|---|
| `/api/cron/smart-push?key=…` | ทุก 5 นาที | แจ้งเตือนรายวันตามเวลาที่ผู้ใช้เลือก |
| `/api/cron/craving-push?key=…` | ไม่บังคับ | แจ้งเตือนช่วงเวลาเสี่ยงอยากสูบ |
| `/api/cron/notifications?key=…` | ไม่บังคับ | แจ้งเตือนแบบเดิม (สำรอง) |

ถ้าไม่มีกุญแจหรือกุญแจผิด endpoint จะตอบ 401 และไม่ส่งอะไรออกไป

## ฐานข้อมูล (Prisma + Supabase)

Vercel build รันแค่ `prisma generate` **ไม่ได้แก้ schema ของฐานข้อมูลให้**
ถ้าแก้ `admin-web/prisma/schema.prisma` ต้อง push schema เองจากเครื่องที่มี `DATABASE_URL`:

```bash
cd cigarette/admin-web
npm install
DATABASE_URL="<Supabase direct/session connection>" npx prisma db push
```

ทำก่อน deploy โค้ดที่ใช้ตารางหรือคอลัมน์ใหม่ ไม่งั้น API จะ error

## ทำงานในเครื่อง

```bash
# API + dashboard
cd cigarette/admin-web
cp .env.example .env.local   # ใส่ค่า
npm install
npm run dev                  # http://localhost:3000

# แอป (อีก terminal)
cd cigarette/mobile-app
npm install
EXPO_PUBLIC_API_URL=http://localhost:3000/api npx expo start --web
```

ก่อน push ให้เช็คว่า build ผ่าน:

```bash
cd cigarette/admin-web && npm run build
cd cigarette/mobile-app && npm run build    # tsc --noEmit + expo export + service worker
```

`mobile-app` รัน `tsc --noEmit` ตอน build ถ้ามี type error Vercel จะ build ไม่ผ่าน

## ตรวจหลัง deploy

- Vercel → Deployments → ดู build log และ Runtime Logs ของ ciga-next9
- เปิดแอป → login → บันทึกวันนี้ → เปิด SOS เล่นเกม 1 เกม
- เปิด `/dashboard` ของ ciga-next9 ด้วยบัญชี admin

## ไม่ใช้แล้ว

- Docker (`ciga-next9`, `nextbreath-db`), `docker-compose`, `sudo`, PM2, nginx/Coolify
- โฟลเดอร์ `admin-web/persistent-sounds/` เป็นสำเนาไฟล์เสียงสมัย VPS (ตอนนี้เสียงอยู่ใน R2)
  อัปโหลดเข้า R2 ด้วย `node admin-web/scripts/upload-sounds.mjs persistent-sounds`

## ข้อมูลเกมของผู้ใช้
เหรียญ ของในร้าน อัปเกรด คะแนนสูงสุด และด่านที่ปลดล็อก เก็บบนเครื่องและซิงก์ขึ้นตาราง `GameSave` ตามบัญชี (`/api/game-state`)
ตารางนี้สร้างด้วย `admin-web/prisma/migrations/20261114080000_game_save/migration.sql` (รันซ้ำได้) — ถ้าตั้ง DB ใหม่ให้รันไฟล์นี้ด้วย
