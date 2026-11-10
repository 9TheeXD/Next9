# Cigarette Quitting App — Deployment Guide

## ⚠️ สำคัญ: โปรเจ็คนี้รันผ่าน Docker (ต้องใช้ sudo)

**อย่าไปใช้ PM2, npm start, หรือ next start โดยตรง** — ทุกอย่างรันใน Docker container

---

## Architecture

```
┌─────────────────────────────────────────┐
│  VPS (Ubuntu)                           │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Docker: ciga-next9              │    │
│  │ Image: ciga-next9-img           │    │
│  │ Port: 7011 (--network host)     │    │
│  │ Role: Next.js API server        │    │
│  │ Source: ./admin-web              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Docker: nextbreath-db           │    │
│  │ Image: postgres:16-alpine       │    │
│  │ Port: 127.0.0.1:5432            │    │
│  │ Role: PostgreSQL database       │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Static files (Nginx/Coolify)    │    │
│  │ Source: ./mobile-app/dist/      │    │
│  │ Role: PWA mobile app            │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

## Deploy Commands (ต้องใช้ sudo ทุกคำสั่ง Docker)

### 1. Admin-web (API Server) — Docker rebuild

```bash
cd /home/cmp/sdh-council/cigarette/admin-web

# Build image + recreate container (one-liner)
sudo docker build -t ciga-next9-img . && \
sudo docker rm -f ciga-next9 && \
sudo docker run -d --restart always --name ciga-next9 --network host --env-file .env.local \
  -v /home/cmp/sdh-council/cigarette/admin-web/persistent-sounds:/app/public/sounds \
  ciga-next9-img

# ตรวจสอบว่ารันสำเร็จ
sudo docker logs --tail 10 ciga-next9
```

### 2. Mobile-app (PWA) — Expo export + Service Worker

```bash
cd /home/cmp/sdh-council/cigarette/mobile-app

# Export static files
sudo npx expo export --platform web

# Generate service worker
node scripts/generate-sw.js

# ไฟล์จะอยู่ใน ./dist/ — Nginx/Coolify จะ serve อัตโนมัติ
```

### 3. Database — Prisma

```bash
cd /home/cmp/sdh-council/cigarette/admin-web

# Generate Prisma client (ทำก่อน build)
npx prisma generate

# Push schema changes to DB
npx prisma db push

# Migrate (production)
npx prisma migrate deploy
```

---

## Environment

- **Docker env file:** `admin-web/.env.local`
- **Database:** PostgreSQL 16 (container: `nextbreath-db`, user: `nextbreath`)
- **Node version in Docker:** 20-alpine
- **Prisma config:** `admin-web/prisma/schema.prisma`

---

## Full Deploy Workflow (ทำตามลำดับ)

```bash
# 1. Generate Prisma client
cd /home/cmp/sdh-council/cigarette/admin-web
npx prisma generate

# 2. Rebuild & restart API container
sudo docker build -t ciga-next9-img . && \
sudo docker rm -f ciga-next9 && \
sudo docker run -d --restart always --name ciga-next9 --network host --env-file .env.local \
  -v /home/cmp/sdh-council/cigarette/admin-web/persistent-sounds:/app/public/sounds \
  ciga-next9-img

# 3. Export mobile app
cd /home/cmp/sdh-council/cigarette/mobile-app
sudo npx expo export --platform web
node scripts/generate-sw.js

# 4. Verify
sudo docker ps | grep ciga
sudo docker logs --tail 5 ciga-next9
```

---

## ❌ สิ่งที่ห้ามทำ

- ❌ ห้ามใช้ `pm2 restart` — PM2 ไม่ได้ใช้สำหรับโปรเจ็คนี้
- ❌ ห้ามใช้ `npm start` หรือ `next start` โดยตรง — ต้องรันผ่าน Docker เท่านั้น
- ❌ ห้ามแก้ไขไฟล์ใน container โดยตรง — ต้อง rebuild image ใหม่
- ❌ ห้ามลืม `sudo` ก่อนคำสั่ง `docker`
