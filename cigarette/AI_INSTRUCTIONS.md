# Project Context for AI Assistants

Next Breath — a quit-smoking app. Everything runs on **Vercel**. There is no VPS, Docker, PM2 or nginx.

- `admin-web/` — Next.js (App Router): the REST API under `src/app/api/` and the admin dashboard.
  Database: Supabase Postgres through Prisma (`prisma/schema.prisma`). Uploaded sounds: Cloudflare R2.
- `mobile-app/` — Expo Router app exported as a static PWA (`npm run build` → `dist/`).
  It calls the API at `/api`, which `mobile-app/vercel.json` rewrites to the admin-web project.
- Games live in `mobile-app/src/games/`: plain TypeScript + Canvas 2D + Web Audio, no React inside.
  `src/components/GameHost.tsx` mounts them. Art is drawn in code; there are no image files to load.

Rules:
- Deploy = push to the Vercel production branch. Never add `sudo`, Docker or server commands.
- `mobile-app` build runs `tsc --noEmit`; a type error fails the Vercel build.
- Vercel does not migrate the database. A schema change needs `npx prisma db push` against Supabase
  before the code that uses it is deployed (see `DEPLOY.md`).
- Every API route that acts for a user must take the user from the JWT (`authenticateRequest`),
  never from a `userId` in the body or query string.
- Cron routes must check `CRON_SECRET` (`src/lib/cron.ts`).
- See `DEPLOY.md` for env vars and cron setup.
