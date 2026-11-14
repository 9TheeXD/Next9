// Keeps the player's game progress (coins, shop items, upgrades, best scores, unlocked levels) on
// their account, so it survives a new phone or cleared browser data. The games keep reading and
// writing localStorage exactly as before; this module copies that data to and from the server.
//
// Flow: on sign-in, download the server copy, merge it with what is on the device, keep the merged
// result locally and upload it. After that, any change schedules an upload a few seconds later.
// Merging never loses progress: higher lifetime coins win, owned items are unioned, upgrade levels
// and best scores take the larger value. Without a network the device keeps working and uploads
// the next time the app opens.

import { api } from "@/lib/api";
import { wallet, WALLET_KEY, type WalletData } from "@/games/engine/economy";
import { STORE_PREFIX } from "@/games/engine/runtime";
import { syncBus } from "@/games/engine/syncbus";

const UID_KEY = "nb_sync_uid";
const DIRTY_KEY = "nb_sync_dirty";
const PUSH_DELAY = 4000;

type Store = Record<string, string>;
interface Snapshot {
  wallet: WalletData;
  store: Store;
}

const hasStorage = () => {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
};

function readStore(): Store {
  const out: Store = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(STORE_PREFIX)) {
      const v = localStorage.getItem(k);
      if (v !== null) out[k] = v;
    }
  }
  return out;
}

function snapshot(): Snapshot {
  return { wallet: wallet.data(), store: readStore() };
}

function wipeLocal() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith(STORE_PREFIX) || k === WALLET_KEY)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

function maxMap(a: Record<string, number>, b: Record<string, number>) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] || 0, v || 0);
  return out;
}

export function mergeWallet(a: WalletData, b: WalletData): WalletData {
  // The copy with more lifetime coins (else the newer one) is the base for coins, boosters and
  // equipped skins; things that only ever grow are combined from both sides.
  const aBase = a.lifetime !== b.lifetime ? a.lifetime > b.lifetime : (a.ts || 0) >= (b.ts || 0);
  const [base, other] = aBase ? [a, b] : [b, a];
  const owned = Array.from(new Set([...base.owned, ...other.owned]));
  const equipped: Record<string, string> = {};
  for (const [slot, id] of Object.entries(base.equipped)) if (owned.includes(id)) equipped[slot] = id;
  return {
    coins: base.coins,
    lifetime: Math.max(a.lifetime, b.lifetime),
    owned,
    equipped,
    boosters: { ...base.boosters },
    upgrades: maxMap(a.upgrades, b.upgrades),
    daily: { ...other.daily, ...base.daily },
    ts: Math.max(a.ts || 0, b.ts || 0),
  };
}

// Keys that only go up (best scores, wins, unlocked levels) are combined with max; settings such as
// difficulty are taken from the device when it changed since the last sync, otherwise from the server.
const GROWING = /(^|_)(best(_.*)?|unlocked|wins?(_.*)?|.*_wins?)$/;

export function mergeStore(local: Store, remote: Store, localDirty: boolean): Store {
  const out: Store = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[k];
    const r = remote[k];
    if (l === undefined) out[k] = r;
    else if (r === undefined) out[k] = l;
    else {
      const ln = parseFloat(l);
      const rn = parseFloat(r);
      if (GROWING.test(k) && Number.isFinite(ln) && Number.isFinite(rn)) out[k] = ln >= rn ? l : r;
      else out[k] = localDirty ? l : r;
    }
  }
  return out;
}

function apply(s: Snapshot) {
  wallet.replace(s.wallet);
  for (const [k, v] of Object.entries(s.store)) {
    if (k.startsWith(STORE_PREFIX)) localStorage.setItem(k, v);
  }
}

function same(a: Snapshot, b: Snapshot) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseRemote(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  const w = r.wallet || {};
  return {
    wallet: {
      coins: Number(w.coins) || 0,
      lifetime: Number(w.lifetime) || 0,
      owned: Array.isArray(w.owned) ? w.owned : [],
      equipped: w.equipped || {},
      boosters: w.boosters || {},
      upgrades: w.upgrades || {},
      daily: w.daily || {},
      ts: Number(w.ts) || 0,
    },
    store: r.store && typeof r.store === "object" ? r.store : {},
  };
}

let userId: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let started = false;

async function push() {
  if (!userId || pushing || !hasStorage()) return;
  pushing = true;
  try {
    await api.putGameState(snapshot());
    localStorage.setItem(DIRTY_KEY, "0");
  } catch {
    localStorage.setItem(DIRTY_KEY, "1"); // offline or server problem: try again on the next change/start
  } finally {
    pushing = false;
  }
}

function schedule() {
  if (!userId || !hasStorage()) return;
  try {
    localStorage.setItem(DIRTY_KEY, "1");
  } catch {
    /* storage blocked */
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(push, PUSH_DELAY);
}

function onHide() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden" && timer) {
    clearTimeout(timer);
    timer = null;
    void push();
  }
}

/** Call once the user is signed in. Safe to call again for the same user. */
export async function startGameSync(id: string) {
  if (!hasStorage() || (userId === id && started)) return;
  userId = id;
  started = true;
  try {
    // A different account used this device before: do not hand its coins to this one.
    const prev = localStorage.getItem(UID_KEY);
    if (prev && prev !== id) {
      wipeLocal();
      localStorage.setItem(DIRTY_KEY, "0");
    }
    localStorage.setItem(UID_KEY, id);

    const res = await api.getGameState();
    const remote = parseRemote(res.data?.state);
    const local = snapshot();
    const dirty = localStorage.getItem(DIRTY_KEY) === "1";
    const merged: Snapshot = remote
      ? { wallet: mergeWallet(local.wallet, remote.wallet), store: mergeStore(local.store, remote.store, dirty) }
      : local;
    if (!same(merged, local)) apply(merged);
    if (!remote || !same(merged, remote)) await api.putGameState(merged);
    localStorage.setItem(DIRTY_KEY, "0");
  } catch {
    // Offline: keep playing on the device, upload when something changes later.
    try {
      localStorage.setItem(DIRTY_KEY, "1");
    } catch {
      /* ignore */
    }
  }
  if (userId !== id) return; // signed out while the first sync was running
  syncBus.set(schedule);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onHide);
}

/** Uploads right away if a change is waiting (used just before sign-out, while the token is still valid). */
export async function flushGameSync() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    await push();
  }
}

/** Call on sign-out. The device copy stays, so the next sign-in of the same account merges cleanly. */
export function stopGameSync() {
  userId = null;
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
  syncBus.set(null);
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onHide);
}
