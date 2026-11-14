# Next Breath — admin-web

Next.js app that serves two things:

- **API** for the Next Breath app: `src/app/api/**/route.ts`
- **Admin dashboard**: `/dashboard` (login with the `admin` account)

Database: Supabase Postgres via Prisma (`prisma/schema.prisma`). Uploaded sounds: Cloudflare R2 (`src/lib/storage.ts`).
Push notifications: Firebase Admin (`src/lib/firebase.ts`).

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
```

Deployed on Vercel. Env vars, cron jobs and database changes: see [`../DEPLOY.md`](../DEPLOY.md).
