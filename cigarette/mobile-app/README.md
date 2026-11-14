# Next Breath — mobile-app

Expo Router app, exported as a static PWA and hosted on Vercel.

```bash
npm install
EXPO_PUBLIC_API_URL=http://localhost:3000/api npx expo start --web
npm run build        # tsc --noEmit + expo export --platform web + service worker → dist/
```

Layout:

- `src/app/` — screens (expo-router). `(tabs)/sos.tsx` is the craving help hub, `rescue.tsx` the step-by-step craving flow.
- `src/games/` — the games: plain TypeScript, Canvas 2D and Web Audio. Each game exports a `GameFactory`.
  `src/components/GameHost.tsx` mounts a game in a `<canvas>` (web only).
- `src/lib/quitPlan.ts` — the user's reasons, if-then plans and craving history (kept on the device).
- `src/lib/api.ts` — API client. `/api` is rewritten to admin-web by `vercel.json`.

Deploy notes: see [`../DEPLOY.md`](../DEPLOY.md).
