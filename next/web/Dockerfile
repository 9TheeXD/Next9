# NEXT9 website (Next.js) — built and run by `npm run rebuild` here, or `npm run rebuild:web` / `npm run rebuild` (everything) from the project root.
# Serves the site on :8092 (gateway), with Next.js on :8093 and the not-yet-migrated legacy pages
# on :8072. Runs with --network host so it reaches server.js (the next9-server container) on :8089.
# The project root is mounted read-only at /site for the legacy pages. Ports: scripts/ports.mjs.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV LEGACY_ROOT=/site
# On the VPS the production API is server.js on this same host (host network), not the public URL.
ENV PROD_API_ORIGIN=http://127.0.0.1:8089
EXPOSE 8092

CMD ["node", "scripts/start-all.mjs"]
