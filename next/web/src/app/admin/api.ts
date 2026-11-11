"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

// Calls to /api/admin/* with the admin token (kept in this browser after signing in).
export const TOKEN_KEY = "next9_admin_token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export class AuthError extends Error {}

export async function adminFetch(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(init.headers || {}) },
    cache: "no-store",
  });
  let body: any = {};
  try {
    body = await res.json();
  } catch {}
  if (res.status === 401) throw new AuthError(body.message || "กรุณาเข้าสู่ระบบใหม่");
  if (!res.ok || body.success === false) throw new Error(body.message || `HTTP ${res.status}`);
  return body;
}
