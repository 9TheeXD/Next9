import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The user's personal quit plan, kept on the device:
 * - reasons to quit (re-read during a craving),
 * - if-then plans ("ถ้า [trigger] ฉันจะ [action]") — implementation intentions roughly doubled quit
 *   rates in a meta-analysis (McWilliams et al., Health Psychology 2019),
 * - each craving the user worked through (strength before / after, trigger, what helped),
 * - slips, so the app can help learn from them instead of resetting everything.
 */

export interface Trigger {
  id: string;
  label: string;
  icon: string; // Feather icon name
}

export const TRIGGERS: Trigger[] = [
  { id: "stress", label: "เครียด / กังวล", icon: "cloud-lightning" },
  { id: "after_meal", label: "หลังกินข้าว", icon: "coffee" },
  { id: "coffee", label: "กาแฟ / ชา", icon: "coffee" },
  { id: "alcohol", label: "ดื่มเหล้า / เบียร์", icon: "droplet" },
  { id: "friends", label: "เห็นคนอื่นสูบ", icon: "users" },
  { id: "bored", label: "เบื่อ / ว่าง", icon: "clock" },
  { id: "morning", label: "ตื่นนอน", icon: "sunrise" },
  { id: "break", label: "พักงาน / พักเรียน", icon: "pause-circle" },
  { id: "angry", label: "โกรธ / หงุดหงิด", icon: "zap" },
  { id: "travel", label: "ขับรถ / เดินทาง", icon: "navigation" },
  { id: "phone", label: "เล่นมือถือ", icon: "smartphone" },
  { id: "other", label: "อื่นๆ", icon: "more-horizontal" },
];

export interface CopingAction {
  id: string;
  label: string;
  icon: string;
}

export const ACTIONS: CopingAction[] = [
  { id: "game", label: "เล่นเกมในแอป 3 นาที", icon: "grid" },
  { id: "breathe", label: "หายใจช้าๆ 10 ครั้ง", icon: "wind" },
  { id: "walk", label: "ลุกเดินเร็ว 5 นาที", icon: "activity" },
  { id: "water", label: "ดื่มน้ำเย็นแก้วใหญ่", icon: "droplet" },
  { id: "gum", label: "เคี้ยวหมากฝรั่ง / อมลูกอม", icon: "smile" },
  { id: "brush", label: "แปรงฟัน / บ้วนปาก", icon: "star" },
  { id: "call", label: "ทักหรือโทรหาคนสนิท", icon: "phone" },
  { id: "leave", label: "ลุกออกจากที่นั้น", icon: "log-out" },
  { id: "delay", label: "รอ 10 นาทีก่อนตัดสินใจ", icon: "clock" },
  { id: "reasons", label: "อ่านเหตุผลที่อยากเลิก", icon: "heart" },
];

/** Sensible first suggestion for each trigger. */
export const SUGGESTED: Record<string, string> = {
  stress: "breathe",
  after_meal: "brush",
  coffee: "water",
  alcohol: "leave",
  friends: "leave",
  bored: "game",
  morning: "walk",
  break: "walk",
  angry: "breathe",
  travel: "gum",
  phone: "game",
  other: "delay",
};

export const REASON_IDEAS = [
  "สุขภาพดีขึ้น หายใจได้เต็มปอด",
  "เก็บเงินไว้ใช้สิ่งที่อยากได้",
  "เพื่อคนในครอบครัว",
  "ไม่อยากให้คนที่รักได้รับควันบุหรี่มือสอง",
  "มีแรงเล่นกีฬา วิ่งได้ไม่เหนื่อย",
  "กลิ่นปากและเสื้อผ้าหายเหม็น",
  "อยากเป็นแบบอย่างที่ดี",
  "พิสูจน์ว่าตัวเองทำได้",
];

export interface IfThenPlan {
  id: string;
  trigger: string; // Trigger id
  action: string; // CopingAction id
  createdAt: string;
}

export interface CravingEntry {
  at: string; // ISO time
  before: number; // 1..10
  after: number | null;
  trigger: string | null;
  tools: string[];
  smoked?: boolean;
}

export interface SlipEntry {
  at: string;
  trigger: string | null;
  plan: string | null; // action chosen for next time
}

export interface QuitPlan {
  reasons: string[];
  plans: IfThenPlan[];
  cravings: CravingEntry[];
  slips: SlipEntry[];
}

const EMPTY: QuitPlan = { reasons: [], plans: [], cravings: [], slips: [] };
const key = (userId: string | undefined) => `@nb_quit_plan_${userId || "guest"}`;

export async function loadPlan(userId: string | undefined): Promise<QuitPlan> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return { ...EMPTY };
    const p = JSON.parse(raw);
    return {
      reasons: Array.isArray(p.reasons) ? p.reasons.filter((r: unknown) => typeof r === "string") : [],
      plans: Array.isArray(p.plans) ? p.plans : [],
      cravings: Array.isArray(p.cravings) ? p.cravings : [],
      slips: Array.isArray(p.slips) ? p.slips : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function savePlan(userId: string | undefined, plan: QuitPlan): Promise<void> {
  const trimmed: QuitPlan = {
    reasons: plan.reasons.slice(0, 12),
    plans: plan.plans.slice(0, 20),
    cravings: plan.cravings.slice(-300),
    slips: plan.slips.slice(-100),
  };
  await AsyncStorage.setItem(key(userId), JSON.stringify(trimmed)).catch(() => {});
}

export async function updatePlan(userId: string | undefined, change: (p: QuitPlan) => QuitPlan): Promise<QuitPlan> {
  const next = change(await loadPlan(userId));
  await savePlan(userId, next);
  return next;
}

export const triggerLabel = (id: string | null | undefined) => TRIGGERS.find((t) => t.id === id)?.label ?? "";
export const actionLabel = (id: string | null | undefined) => ACTIONS.find((a) => a.id === id)?.label ?? "";
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export interface Insights {
  total: number;
  thisWeek: number;
  resisted: number;
  avgDrop: number | null; // average fall in strength, in points
  topTriggers: { id: string; count: number }[];
  bestTool: string | null;
  busiestHour: number | null;
}

export function insights(plan: QuitPlan): Insights {
  const now = Date.now();
  const week = 7 * 24 * 3600 * 1000;
  const c = plan.cravings;
  const rated = c.filter((x) => x.after !== null);
  const drops = rated.map((x) => x.before - (x.after as number));
  const trig = new Map<string, number>();
  const hours = new Array(24).fill(0);
  const toolGain = new Map<string, { sum: number; n: number }>();
  for (const x of c) {
    if (x.trigger) trig.set(x.trigger, (trig.get(x.trigger) || 0) + 1);
    const d = new Date(x.at);
    if (!isNaN(d.getTime())) hours[d.getHours()]++;
    if (x.after !== null) {
      for (const t of x.tools) {
        const g = toolGain.get(t) || { sum: 0, n: 0 };
        g.sum += x.before - x.after;
        g.n++;
        toolGain.set(t, g);
      }
    }
  }
  let bestTool: string | null = null;
  let bestAvg = 0;
  for (const [t, g] of toolGain) {
    const avg = g.sum / g.n;
    if (g.n >= 2 && avg > bestAvg) {
      bestAvg = avg;
      bestTool = t;
    }
  }
  const maxHour = Math.max(...hours);
  return {
    total: c.length,
    thisWeek: c.filter((x) => now - new Date(x.at).getTime() < week).length,
    resisted: c.filter((x) => !x.smoked).length,
    avgDrop: drops.length ? drops.reduce((s, v) => s + v, 0) / drops.length : null,
    topTriggers: Array.from(trig, ([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count).slice(0, 3),
    bestTool,
    busiestHour: maxHour > 1 ? hours.indexOf(maxHour) : null,
  };
}
