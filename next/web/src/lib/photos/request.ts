import { authToken, lsGet, lsSet } from "./util";

export class ApiError extends Error {
  status?: number;
}

// JSON request with the site password and, when given an album, that album's unlock token
// (folders.js api()).
export async function photosApi<T = Record<string, unknown>>(url: string, method = "GET", body?: unknown, albumId?: string | null): Promise<T> {
  const headers: Record<string, string> = { Authorization: authToken() };
  if (body) headers["Content-Type"] = "application/json";
  const t = albumId && lsGet("album_token_" + albumId);
  if (t) headers["X-Album-Token"] = t;
  const res = await fetch(url, { method, headers, credentials: "include", body: body ? JSON.stringify(body) : undefined });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok || data.success === false) {
    const err = new ApiError((data.message as string) || (res.status === 404 ? "ไม่พบข้อมูล หรือเซิร์ฟเวอร์ยังไม่อัปเดต" : "เกิดข้อผิดพลาด"));
    err.status = res.status;
    throw err;
  }
  return data as T;
}

// The home page's apiJson(): same, never cached.
export async function apiJson<T = Record<string, unknown>>(url: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Authorization: authToken() };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, credentials: "include", cache: "no-store", body: body ? JSON.stringify(body) : undefined });
  let d: Record<string, unknown> = {};
  try {
    d = await res.json();
  } catch {}
  if (!res.ok || d.success === false) throw new Error((d.message as string) || "เกิดข้อผิดพลาด");
  return d as T;
}

export function saveAlbumToken(albumId: string, token: string) {
  lsSet("album_token_" + albumId, token);
  document.cookie = "album_token_" + albumId + "=" + encodeURIComponent(token) + "; path=/; max-age=315360000; SameSite=Lax";
}
