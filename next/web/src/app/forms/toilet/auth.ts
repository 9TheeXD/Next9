// The toilet system's password: same localStorage key and check as the old manage/admin pages.
export const TOILET_PW_KEY = "toilet_pw";

export async function verifyToilet(password: string): Promise<"ok" | "bad" | "offline"> {
  try {
    const res = await fetch("/api/toilet/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) return (await res.json()).success ? "ok" : "bad";
    return "bad";
  } catch {
    return "offline";
  }
}

export type Room = { id: string; name: string };
export type ToiletConfig = { rooms: Room[]; problems: string[] };
export type Submission = {
  id: string;
  roomId: string;
  roomName?: string;
  role: string;
  problem: string;
  timestamp: number;
  closed: boolean;
  closedAt: number | null;
};

export function formatTime(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
