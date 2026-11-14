// Coins, items and upgrades shared by every game and the shop. Kept on the device (localStorage) and
// copied to the signed-in user's account by lib/gameSync.ts, like best scores. Coins come from finishing games and, worth more, from real quit actions
// (getting through a craving, a logged smoke-free day), so the game economy rewards quitting.

import { syncBus } from "./syncbus";

export const WALLET_KEY = "nb_wallet_v1";
const KEY = WALLET_KEY;
const EVENT = "nb-wallet";

export interface WalletData {
  coins: number;
  lifetime: number;
  owned: string[];
  equipped: Record<string, string>;
  boosters: Record<string, number>;
  upgrades: Record<string, number>;
  daily: Record<string, string>; // reward id -> yyyy-mm-dd last given
  ts?: number; // last local change (ms), used to pick the newer copy when syncing
}

const EMPTY: WalletData = { coins: 0, lifetime: 0, owned: [], equipped: {}, boosters: {}, upgrades: {}, daily: {} };

function load(): WalletData {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return { ...EMPTY, owned: [], equipped: {}, boosters: {}, upgrades: {}, daily: {} };
    const d = JSON.parse(raw);
    return {
      coins: Math.max(0, Math.floor(Number(d.coins) || 0)),
      lifetime: Math.max(0, Math.floor(Number(d.lifetime) || 0)),
      owned: Array.isArray(d.owned) ? d.owned.filter((x: unknown) => typeof x === "string") : [],
      equipped: d.equipped && typeof d.equipped === "object" ? d.equipped : {},
      boosters: d.boosters && typeof d.boosters === "object" ? d.boosters : {},
      upgrades: d.upgrades && typeof d.upgrades === "object" ? d.upgrades : {},
      daily: d.daily && typeof d.daily === "object" ? d.daily : {},
      ts: Math.max(0, Math.floor(Number(d.ts) || 0)),
    };
  } catch {
    return { ...EMPTY, owned: [], equipped: {}, boosters: {}, upgrades: {}, daily: {} };
  }
}

function save(d: WalletData, silent = false) {
  if (!silent) d.ts = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage blocked */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: d.coins }));
  } catch {
    /* no window (static render) */
  }
  if (!silent) syncBus.changed();
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export const wallet = {
  data(): WalletData {
    return load();
  },
  /** Replaces the wallet with a copy that came from the server (does not trigger an upload). */
  replace(d: WalletData) {
    save({ ...d }, true);
  },
  coins(): number {
    return load().coins;
  },
  add(n: number): number {
    const d = load();
    const k = Math.max(0, Math.floor(n));
    d.coins += k;
    d.lifetime += k;
    save(d);
    return d.coins;
  },
  /** Gives a reward at most once per day. Returns the coins given (0 if already given today). */
  addDaily(id: string, n: number): number {
    const d = load();
    if (d.daily[id] === today()) return 0;
    d.daily[id] = today();
    d.coins += n;
    d.lifetime += n;
    save(d);
    return n;
  },
  spend(n: number): boolean {
    const d = load();
    if (d.coins < n) return false;
    d.coins -= n;
    save(d);
    return true;
  },
  owns(id: string): boolean {
    const item = ITEMS.find((i) => i.id === id);
    return !!item && (item.price === 0 || load().owned.includes(id));
  },
  buy(id: string): boolean {
    const item = ITEMS.find((i) => i.id === id);
    if (!item) return false;
    const d = load();
    if (item.kind === "booster") {
      if (d.coins < item.price) return false;
      d.coins -= item.price;
      d.boosters[id] = (d.boosters[id] || 0) + (item.pack || 1);
      save(d);
      return true;
    }
    if (item.price === 0 || d.owned.includes(id)) return true;
    if (d.coins < item.price) return false;
    d.coins -= item.price;
    d.owned.push(id);
    if (item.slot) d.equipped[item.slot] = id;
    save(d);
    return true;
  },
  equip(id: string) {
    const item = ITEMS.find((i) => i.id === id);
    if (!item || !item.slot || !wallet.owns(id)) return;
    const d = load();
    d.equipped[item.slot] = id;
    save(d);
  },
  /** Equipped item id for a slot, or the slot's free default. */
  equipped(slot: string): string {
    const id = load().equipped[slot];
    if (id && wallet.owns(id)) return id;
    return ITEMS.find((i) => i.slot === slot && i.price === 0)?.id ?? "";
  },
  boosters(id: string): number {
    return load().boosters[id] || 0;
  },
  /** Uses one booster if the player has one. */
  useBooster(id: string): boolean {
    const d = load();
    if (!d.boosters[id]) return false;
    d.boosters[id]--;
    save(d);
    return true;
  },
  /** Uses a booster, or buys one on the spot with coins if none is left. */
  useOrBuy(id: string): boolean {
    if (wallet.useBooster(id)) return true;
    const item = ITEMS.find((i) => i.id === id);
    if (!item) return false;
    return wallet.spend(Math.ceil(item.price / (item.pack || 1)));
  },
  level(id: string): number {
    return load().upgrades[id] || 0;
  },
  upgradeCost(id: string): number {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u) return Infinity;
    return Math.round(u.base * Math.pow(u.growth, wallet.level(id)));
  },
  upgrade(id: string): boolean {
    const cost = wallet.upgradeCost(id);
    const d = load();
    if (d.coins < cost) return false;
    d.coins -= cost;
    d.upgrades[id] = (d.upgrades[id] || 0) + 1;
    save(d);
    return true;
  },
  subscribe(fn: (coins: number) => void): () => void {
    if (typeof window === "undefined") return () => {};
    const h = () => fn(load().coins);
    window.addEventListener(EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(EVENT, h);
      window.removeEventListener("storage", h);
    };
  },
};

/** Coins for a finished round: score / divisor, kept between min and max. */
export function coinsFor(score: number, divisor: number, min = 5, max = 120) {
  return Math.max(min, Math.min(max, Math.round(score / divisor)));
}

// ── Catalog ────────────────────────────────────────────────────────────────

export interface ShopItem {
  id: string;
  kind: "skin" | "booster";
  slot?: string; // skins: which look it changes
  name: string;
  desc: string;
  price: number;
  pack?: number; // boosters: how many per purchase
  game?: string; // game id it belongs to
}

export const ITEMS: ShopItem[] = [
  // Block skins (ต่อบล็อกดวงดาว, สวนบล็อก 8×8)
  { id: "block_classic", kind: "skin", slot: "blockSkin", name: "เยลลี่ใส", desc: "บล็อกแบบดั้งเดิม", price: 0 },
  { id: "block_neon", kind: "skin", slot: "blockSkin", name: "นีออน", desc: "ขอบเรืองแสงในความมืด", price: 300 },
  { id: "block_candy", kind: "skin", slot: "blockSkin", name: "ลูกกวาด", desc: "ลายทางสีพาสเทล", price: 400 },
  { id: "block_pixel", kind: "skin", slot: "blockSkin", name: "พิกเซล 8 บิต", desc: "สไตล์เกมยุคเก่า", price: 500 },
  { id: "block_gold", kind: "skin", slot: "blockSkin", name: "ทองคำ", desc: "เงาวาวระดับตำนาน", price: 1500 },
  // Blade trails (หั่นผลไม้)
  { id: "blade_classic", kind: "skin", slot: "bladeSkin", name: "ใบมีดเงิน", desc: "แสงสีขาว", price: 0, game: "slice" },
  { id: "blade_fire", kind: "skin", slot: "bladeSkin", name: "ดาบไฟ", desc: "ทิ้งประกายไฟ", price: 350, game: "slice" },
  { id: "blade_ice", kind: "skin", slot: "bladeSkin", name: "ดาบน้ำแข็ง", desc: "เกล็ดน้ำแข็งระยิบ", price: 350, game: "slice" },
  { id: "blade_rainbow", kind: "skin", slot: "bladeSkin", name: "รุ้ง", desc: "เปลี่ยนสีตลอดเวลา", price: 800, game: "slice" },
  // Ships (ยานพิทักษ์ดาว)
  { id: "ship_falcon", kind: "skin", slot: "shipSkin", name: "ฟอลคอน", desc: "ยานเริ่มต้นสีฟ้า", price: 0, game: "shooter" },
  { id: "ship_phoenix", kind: "skin", slot: "shipSkin", name: "ฟีนิกซ์", desc: "ปีกเพลิงสีส้มแดง", price: 600, game: "shooter" },
  { id: "ship_viper", kind: "skin", slot: "shipSkin", name: "ไวเปอร์", desc: "ยานล่องหนสีเขียวมรกต", price: 900, game: "shooter" },
  { id: "ship_nova", kind: "skin", slot: "shipSkin", name: "โนวา", desc: "ยานทองคำเรืองแสง", price: 2000, game: "shooter" },
  // Snakes (งูแสง)
  { id: "snake_mint", kind: "skin", slot: "snakeSkin", name: "มิ้นต์", desc: "งูสีเขียวมิ้นต์", price: 0, game: "snake" },
  { id: "snake_tiger", kind: "skin", slot: "snakeSkin", name: "ลายเสือ", desc: "ส้มสลับดำ", price: 400, game: "snake" },
  { id: "snake_galaxy", kind: "skin", slot: "snakeSkin", name: "กาแล็กซี", desc: "ม่วงน้ำเงินมีดาว", price: 700, game: "snake" },
  { id: "snake_rainbow", kind: "skin", slot: "snakeSkin", name: "สายรุ้ง", desc: "ไล่สีทุกสี", price: 1200, game: "snake" },
  // Boosters
  { id: "boost_hammer", kind: "booster", name: "ค้อนทุบ", desc: "สวนบล็อก: ทุบบล็อกรอบจุดที่แตะทิ้ง 3×3", price: 60, game: "blast" },
  { id: "boost_reroll", kind: "booster", name: "สุ่มบล็อกใหม่", desc: "สวนบล็อก: เปลี่ยนบล็อก 3 ชิ้นด้านล่าง", price: 40, game: "blast" },
  { id: "boost_rainbow", kind: "booster", name: "บับเบิลสายรุ้ง", desc: "บับเบิล: ลูกที่เข้ากับทุกสี", price: 50, game: "bubbles" },
  { id: "boost_bomb", kind: "booster", name: "บับเบิลระเบิด", desc: "บับเบิล: ระเบิดลูกรอบๆ ทั้งหมด", price: 70, game: "bubbles" },
  { id: "boost_shake", kind: "booster", name: "เขย่าโถ", desc: "รวมผลไม้: เขย่าให้ผลไม้ขยับเข้าที่", price: 40, game: "merge" },
  { id: "boost_pick", kind: "booster", name: "หยิบผลไม้ออก", desc: "รวมผลไม้: เอาผลไม้ลูกเล็กที่สุดออก 3 ลูก", price: 60, game: "merge" },
  { id: "boost_hint", kind: "booster", name: "คำใบ้ x3", desc: "ซูโดกุ: คำใบ้เพิ่ม 3 ครั้ง", price: 45, pack: 3, game: "sudoku" },
  { id: "boost_slot", kind: "booster", name: "ช่องถาดพิเศษ", desc: "จับคู่สาม: ถาดมี 8 ช่องในด่านนั้น", price: 80, game: "tiles" },
];

export interface Upgrade {
  id: string;
  game: string;
  name: string;
  desc: string;
  base: number;
  growth: number;
}

/** Permanent upgrades with no level cap; cost grows by `growth` per level. */
export const UPGRADES: Upgrade[] = [
  { id: "ship_damage", game: "shooter", name: "พลังยิง", desc: "+15% ความแรงกระสุนต่อขั้น", base: 60, growth: 1.32 },
  { id: "ship_rate", game: "shooter", name: "ยิงเร็ว", desc: "ยิงถี่ขึ้น (ลดลงเรื่อยๆ ไม่มีที่สิ้นสุด)", base: 70, growth: 1.35 },
  { id: "ship_hp", game: "shooter", name: "เกราะ", desc: "+20 พลังชีวิตต่อขั้น", base: 50, growth: 1.3 },
  { id: "ship_guns", game: "shooter", name: "ปืนเพิ่ม", desc: "เพิ่มลำกล้องทุก 2 ขั้น ยิงกระจายกว้างขึ้น", base: 150, growth: 1.55 },
  { id: "ship_magnet", game: "shooter", name: "แม่เหล็ก", desc: "ดูดเหรียญจากระยะไกลขึ้น", base: 40, growth: 1.28 },
  { id: "ship_drone", game: "shooter", name: "โดรนคู่หู", desc: "โดรนช่วยยิง แรงขึ้นทุกขั้น", base: 200, growth: 1.45 },
  { id: "snake_start", game: "snake", name: "ตัวยาวตั้งต้น", desc: "เริ่มเกมด้วยความยาวมากขึ้น", base: 50, growth: 1.3 },
  { id: "snake_boost", game: "snake", name: "พลังพุ่ง", desc: "พุ่งได้นานขึ้น เสียความยาวน้อยลง", base: 60, growth: 1.32 },
  { id: "snake_magnet", game: "snake", name: "ดูดแสง", desc: "ดูดเม็ดแสงจากระยะไกลขึ้น", base: 50, growth: 1.3 },
  { id: "td_gold", game: "defense", name: "ทองตั้งต้น", desc: "+40 ทองตอนเริ่มเกม", base: 50, growth: 1.3 },
  { id: "td_power", game: "defense", name: "ป้อมแรงขึ้น", desc: "+10% ความแรงป้อมทุกชนิด", base: 70, growth: 1.33 },
  { id: "td_lives", game: "defense", name: "ต้นไม้แข็งแรง", desc: "+3 พลังชีวิตต้นไม้", base: 60, growth: 1.35 },
];
