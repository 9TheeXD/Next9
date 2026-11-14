import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { APIResponse } from "@/types";

// Game progress for the signed-in user: one JSON document { wallet, store }.
//   wallet: coins, lifetime, owned[], equipped{}, boosters{}, upgrades{}, daily{}, ts
//   store:  "nb_game_<game>_<key>" -> short string (best scores, unlocked level, settings)
// The body is rebuilt field by field, so only known shapes and sane sizes reach the database.

const MAX_BYTES = 64 * 1024;
const MAX_COINS = 1e12;
const STORE_KEY = /^nb_game_[a-z0-9_.\-]{1,80}$/i;
const ID = /^[a-z0-9_.\-:]{1,60}$/i;

function int(v: unknown, max = MAX_COINS): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
}

function numMap(v: unknown, max = 1e9): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 300)) {
    if (ID.test(k)) out[k] = int(val, max);
  }
  return out;
}

function strMap(v: unknown, keyRe: RegExp, maxLen: number): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 600)) {
    if (keyRe.test(k) && typeof val === "string" && val.length <= maxLen) out[k] = val;
  }
  return out;
}

function clean(body: unknown) {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, any>;
  const w = (b.wallet && typeof b.wallet === "object" ? b.wallet : {}) as Record<string, any>;
  return {
    wallet: {
      coins: int(w.coins),
      lifetime: int(w.lifetime),
      owned: Array.isArray(w.owned)
        ? Array.from(new Set(w.owned.filter((x: unknown) => typeof x === "string" && ID.test(x)))).slice(0, 500)
        : [],
      equipped: strMap(w.equipped, ID, 60),
      boosters: numMap(w.boosters),
      upgrades: numMap(w.upgrades, 10000),
      daily: strMap(w.daily, ID, 20),
      ts: int(w.ts, 1e14),
    },
    store: strMap(b.store, STORE_KEY, 200),
  };
}

const unauthorized = () =>
  NextResponse.json<APIResponse<never>>({ success: false, error: "Authentication required" }, { status: 401 });

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) return unauthorized();
  try {
    const row = await prisma.gameSave.findUnique({ where: { userId: auth.userId } });
    return NextResponse.json<APIResponse<{ state: unknown; updatedAt: string | null }>>({
      success: true,
      data: { state: row?.data ?? null, updatedAt: row?.updatedAt.toISOString() ?? null },
    });
  } catch (error: any) {
    console.error("Get game state error:", error.message);
    return NextResponse.json<APIResponse<never>>({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (!auth) return unauthorized();
  try {
    const text = await request.text();
    if (text.length > MAX_BYTES) {
      return NextResponse.json<APIResponse<never>>({ success: false, error: "Payload too large" }, { status: 413 });
    }
    const data = clean(JSON.parse(text || "{}"));
    const row = await prisma.gameSave.upsert({
      where: { userId: auth.userId },
      create: { userId: auth.userId, data },
      update: { data },
    });
    return NextResponse.json<APIResponse<{ updatedAt: string }>>({
      success: true,
      data: { updatedAt: row.updatedAt.toISOString() },
    });
  } catch (error: any) {
    console.error("Put game state error:", error.message);
    if (error.code === "P2003" || error.code === "P2025") {
      return NextResponse.json<APIResponse<never>>({ success: false, error: "User not found" }, { status: 404 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json<APIResponse<never>>({ success: false, error: "Invalid JSON" }, { status: 400 });
    }
    return NextResponse.json<APIResponse<never>>({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
