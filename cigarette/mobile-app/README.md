# Next Breath — mobile-app

Expo Router app, exported as a static PWA and hosted on Vercel.

```bash
npm install
EXPO_PUBLIC_API_URL=http://localhost:3000/api npx expo start --web
npm run build        # tsc --noEmit + expo export --platform web + service worker → dist/
```

Layout:

- `src/app/` — screens (expo-router). `(tabs)/sos.tsx` is the craving help hub, `rescue.tsx` the step-by-step craving flow.
- `src/games/` — the 22 games: plain TypeScript, Canvas 2D and Web Audio. Each game exports a `GameDefinition`
  (register it in `src/games/index.ts`, add a cover in `assets/images/games/` and to `COVERS` in
  `src/components/GameLibrary.tsx`). Shared art: `src/games/art/`.
  `src/components/GameHost.tsx` mounts a game in a `<canvas>` (web only).
  - `engine/economy.ts` — coins wallet (localStorage), shop items, boosters, unlimited upgrades.
    Coins come from finished games (`coins` on the `end` event) and from quit actions.
  - `engine/menu.ts`, `engine/duel.ts`, `engine/turnduel.ts` — setup screen (bot level / friend mode),
    player bars and a base class for two-player board games. `logic/chessRules.ts` is a full chess engine.
  - `engine/booster.ts` — in-game booster buttons. `shop.ts` is the coin shop (opened from the game list).
- `src/lib/quitPlan.ts` — the user's reasons, if-then plans and craving history (kept on the device).
- `src/lib/api.ts` — API client. `/api` is rewritten to admin-web by `vercel.json`.

Deploy notes: see [`../DEPLOY.md`](../DEPLOY.md).
