FROM node:20-alpine AS base

# Install dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite-dev

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --production=false

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV TZ="Asia/Bangkok"

# Install tzdata for timezone support
RUN apk add --no-cache tzdata

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.env ./.env

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
