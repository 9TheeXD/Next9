"use client";

import { useEffect, useState } from "react";

// The legacy photos pages authenticate with a `photos_token` cookie (also mirrored in storage).
// Keeping the same cookie means signing in on either the old or the new page signs in both.
const COOKIE = "photos_token";

function readCookie(name: string) {
  const m = document.cookie.match(`(^|;) ?${name}=([^;]*)(;|$)`);
  return m ? decodeURIComponent(m[2]) : null;
}

export function readToken() {
  try {
    return readCookie(COOKIE) || localStorage.getItem(COOKIE) || "";
  } catch {
    return readCookie(COOKIE) || "";
  }
}

export async function signIn(password: string): Promise<"ok" | "wrong" | "offline"> {
  try {
    const res = await fetch("/api/photos/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!data.success) return "wrong";
    document.cookie = `${COOKIE}=${encodeURIComponent(password)}; path=/; max-age=31536000`;
    try {
      localStorage.setItem(COOKIE, password);
      sessionStorage.setItem(COOKIE, password);
    } catch {
      /* cookie alone is enough */
    }
    return "ok";
  } catch {
    return "offline";
  }
}

// A saved password stops working when the site password changes; drop it everywhere it is kept.
export function clearToken() {
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
  try {
    localStorage.removeItem(COOKIE);
    sessionStorage.removeItem(COOKIE);
  } catch {
    /* nothing stored */
  }
}

// "checking" on the server render and first client frame, so neither the login card nor the app
// flashes before the cookie has been read.
export function useAuth() {
  const [state, setState] = useState<"checking" | "in" | "out">("checking");
  useEffect(() => {
    // Reading document.cookie is only possible after mount; this runs once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(readToken() ? "in" : "out");
  }, []);
  return {
    state,
    markSignedIn: () => setState("in"),
    signOut: () => {
      clearToken();
      setState("out");
    },
  };
}
