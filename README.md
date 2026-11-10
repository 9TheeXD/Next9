# Next9 — SDH Council workspace

Monorepo for the SDH Council systems. Three independent projects live side by side; each has its own `package.json`.

| Folder | What it is | Stack |
|---|---|---|
| [`next/`](next) | Main "next9" platform: Node server (port 8089), Next.js web (`next/web`), forms (building, inert, pinkbook, toilet), LINE bot, Discord bot | Node 20, Express-style `server.js`, better-sqlite3, Next.js 16, Docker |
| [`assessRow/`](assessRow) | Assessment ("assess-row") app with per-term results and Word export | Next.js 16, React 19, better-sqlite3 |
| [`cigarette/`](cigarette) | Cigarette-quitting app: `admin-web` (API + admin, port 7011) and `mobile-app` (Expo / web PWA) | Next.js 16, Prisma, PostgreSQL, Firebase, Expo 54 |

## Not in this repo

- `ShiftManager/` — separate repo (`DARWINZY/ShiftManager`).
- Secrets and data: `.env`, `service-account.json`, `serviceAccountKey.json`, chatbot key JSON, `data/`, `*.db`, `students.json`, `inspectors.json`, toilet JSON files.
- Build output and archives: `node_modules`, `.next`, `*.tar.gz`, `*.zip`, `*.apk`, `final/`.

Create the secret and data files yourself (see below) before running anything.

## Getting started

### next (main platform)

```bash
cd next
npm install
# create .env with required secrets (not committed)
npm run test                # syntax check
node server.js              # http://localhost:8089 (PORT overrides)
```

- Web (Next.js): `cd next/web && npm run dev` / `npm run build && npm start`
- LINE bot: `next/lineBot` (default port 8090). Discord bot: `next/discordBot`.
- Production runs in Docker: `npm run rebuild` (all), or `rebuild:server`, `rebuild:web`, `rebuild:line-bot`, `rebuild:discord-bot`. `npm run restart` restarts containers.
- Runtime data goes in `next/data/` (SQLite: `building.db`, `pinkbook.db`, `photos.db`, config JSON). Not committed.

### assessRow

```bash
cd assessRow
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

SQLite DB lives in `assessRow/data/` (not committed). `seed.js` / `seed.sql` seed initial data.

### cigarette

```bash
cd cigarette/admin-web && npm install && npm run dev      # API/admin
cd cigarette/mobile-app && npm install && npm start       # Expo
```

Production runs in Docker only (no PM2 / `next start` directly). See [`cigarette/DEPLOY.md`](cigarette/DEPLOY.md).

## Notes

- `next/`, `cigarette/` and `cigarette/mobile-app/` also have their own local `.git` history that is not part of this repo's history.
- Project history and term-change status: [`next/CHAT_HISTORY_AND_STATUS_REPORT.md`](next/CHAT_HISTORY_AND_STATUS_REPORT.md).
