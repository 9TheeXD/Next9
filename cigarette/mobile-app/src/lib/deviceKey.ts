import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/**
 * Each account is bound to the device that created it by a random key kept here. The server stores
 * only a hash of it and asks for the key whenever someone signs in by the 4-digit display ID, so
 * the ID alone is no longer enough to open somebody's account.
 *
 * The key is kept in AsyncStorage (localStorage on web) and, on web, mirrored into a cookie the same
 * way the display ID already is, so clearing one of them does not lock the user out.
 */

const STORE_KEY = "@ciga_device_keys";
const cookieName = (displayId: string) => `ciga_dk_${displayId}`;

function randomKey(): string {
  const bytes = new Uint8Array(32);
  const c: Crypto | undefined = typeof globalThis !== "undefined" ? (globalThis as any).crypto : undefined;
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function readAll(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readCookie(displayId: string): string | null {
  if (Platform.OS !== "web" || typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${cookieName(displayId)}=([0-9a-f]{64})`));
  return m ? m[1] : null;
}

function writeCookie(displayId: string, key: string) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  document.cookie = `${cookieName(displayId)}=${key}; path=/; max-age=315360000; SameSite=Strict${
    location.protocol === "https:" ? "; Secure" : ""
  }`;
}

/** The key for this display ID on this device, created on first use. */
export async function getDeviceKey(displayId: string): Promise<string> {
  const all = await readAll();
  let key = all[displayId] || readCookie(displayId);
  if (!key) key = randomKey();
  if (all[displayId] !== key) {
    all[displayId] = key;
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(all)).catch(() => {});
  }
  writeCookie(displayId, key);
  return key;
}

const CLAIMED_KEY = "@ciga_device_key_claimed";

/** For accounts made before device keys: bind the signed-in account to this device once. */
export async function claimDeviceKeyOnce(
  displayId: string,
  send: (key: string) => Promise<unknown>
): Promise<void> {
  try {
    const claimed = await AsyncStorage.getItem(CLAIMED_KEY);
    if (claimed === displayId) return;
    await send(await getDeviceKey(displayId));
    await AsyncStorage.setItem(CLAIMED_KEY, displayId);
  } catch {
    // Try again on the next start.
  }
}

/** Turns server error codes from sign-in into a message for the user. */
export function authErrorMessage(message: string): string {
  if (message.includes("DEVICE_KEY_MISMATCH")) {
    return "บัญชีนี้ผูกกับเครื่องที่สร้างบัญชีไว้ จึงเข้าจากเครื่องนี้ไม่ได้ เริ่มบัญชีใหม่ได้เลย";
  }
  return message;
}
