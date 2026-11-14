import * as SecureStore from "expo-secure-store";
import { Platform, DeviceEventEmitter } from "react-native";
import type { APIResponse, AuthResponse } from "@/types";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000/api";

const TOKEN_KEY = "auth_token";

/**
 * Secure token storage — uses SecureStore on native (encrypted),
 * falls back to in-memory on web (no localStorage for tokens).
 * TODO(security): Add OAuth provider support for production
 */
let inMemoryToken: string | null = null;

async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/**
 * Core HTTP request helper.
 * Attaches JWT from secure storage.
 * All API communication uses HTTPS in production.
 */
async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<APIResponse<T>> {
  const token = await getToken();

  let fetchUrl = `${API_BASE_URL}${endpoint}`;
  if (!options?.method || options.method.toUpperCase() === "GET") {
    const separator = fetchUrl.includes("?") ? "&" : "?";
    fetchUrl += `${separator}_t=${Date.now()}`;
  }

  const res = await fetch(fetchUrl, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  const json: APIResponse<T> = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      await clearToken();
      if (Platform.OS === "web") {
        localStorage.removeItem("auth_token");
      }
      DeviceEventEmitter.emit("auth_error");
    }
    throw new Error(`${res.status}: ${json?.error || 'Request failed'}`);
  }

  return json;
}

export const api = {
  // ── Family ─────────────────────────────────────────
  sendFamilyAlert: () => request("/sos/ping", { method: "POST" }),
  
  // ── Auth ─────────────────────────────────────────
  register: (data: {
    displayId: string;
    role: string;
    targetDisplayId?: string;
    deviceKey?: string;
  }) => request("/auth/register", { method: "POST", body: JSON.stringify(data) }),

  claimDeviceKey: (deviceKey: string) =>
    request("/auth/device-key", { method: "POST", body: JSON.stringify({ deviceKey }) }),

  login: (data: { phoneNumber: string }) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(data) }),

  // ── Profile ──────────────────────────────────────
  getProfile: () => request("/profile"),

  updateProfile: (data: {
    displayName?: string;
    smokingType?: "CIGARETTE" | "POD";
    cigarettesPerDay?: number;
    pricePerPack?: number;
    cigarettesPerPack?: number;
    quitDate?: string | null;
    emergencyContact?: string | null;
  }) => request("/profile", { method: "PUT", body: JSON.stringify(data) }),

  postXP: (data: { amount: number }) => request<{ xp: number }>("/profile/xp", { method: "POST", body: JSON.stringify(data) }),

  // ── Game progress (coins, shop, best scores) ─────
  getGameState: () => request<{ state: unknown; updatedAt: string | null }>("/game-state"),

  putGameState: (data: unknown) =>
    request<{ updatedAt: string }>("/game-state", { method: "PUT", body: JSON.stringify(data) }),

  // Switch a "try the app" account to quitter or supporter (after the matching survey was sent).
  upgradeRole: (data: { role: "SMOKER" | "FAMILY"; targetDisplayId?: string }) =>
    request<AuthResponse>("/profile/role", { method: "POST", body: JSON.stringify(data) }),

  getRank: (userId: string) => request<{ rank: number }>(`/profile/rank?userId=${userId}`),

  updateFcmToken: (fcmToken: string) => request("/profile/fcm-token", { method: "POST", body: JSON.stringify({ fcmToken }) }),

  // ── Daily Logs ───────────────────────────────────
  getLogs: (limit = 50, skip = 0) => request(`/logs?limit=${limit}&skip=${skip}`),

  postLog: (data: {
    cigarettesSmoked?: number;
    cravingCount?: number;
    mood?: string;
    notes?: string;
    articlesRead?: number;
    gamesPlayed?: number;
    soundsListened?: number;
  }) => request("/logs", { method: "POST", body: JSON.stringify(data) }),

  postActionLog: (data: {
    action: string;
    details: string;
    metadata?: any;
  }) => request("/actions", { method: "POST", body: JSON.stringify(data) }),

  // ── Badges ───────────────────────────────────────
  getBadges: () => request("/badges"),

  checkBadges: () => request("/badges/check", { method: "POST" }),

  // ── Cheers (Family Support) ──────────────────────
  getCheers: (limit = 30) => request(`/cheers?limit=${limit}`),

  postCheer: (data: { message: string }) =>
    request("/cheers", { method: "POST", body: JSON.stringify(data) }),

  linkFamily: (data: { smokerPhoneNumber: string }) =>
    request("/family/link", { method: "POST", body: JSON.stringify(data) }),

  getFamilySummary: (targetSmokerId?: string) => {
    let url = "/family/summary";
    if (targetSmokerId) url += `?targetSmokerId=${targetSmokerId}`;
    return request(url);
  },
  getFamilyHistory: (limit: number = 50, skip: number = 0, targetSmokerId?: string) => {
    let url = `/family/history?limit=${limit}&skip=${skip}`;
    if (targetSmokerId) url += `&targetSmokerId=${targetSmokerId}`;
    return request(url);
  },

  // ── Quizzes ──────────────────────────────────────
  getQuizResults: () => request("/quizzes"),

  postQuizResult: (data: {
    quizId: string;
    score: number;
    maxScore: number;
  }) => request("/quizzes", { method: "POST", body: JSON.stringify(data) }),

  submitQuiz: (data: { topicId: string; score: number; totalQuestions: number }) =>
    request("/quiz", { method: "POST", body: JSON.stringify(data) }),

  // ── Community / Chat ─────────────────────────────
  getChatMessages: (cursor?: string, take: number = 30) => {
    let url = `/chat?take=${take}`;
    if (cursor) url += `&cursor=${cursor}`;
    return request(url);
  },

  postChatMessage: (data: { userId: string; content: string; alias?: string }) =>
    request("/chat", { method: "POST", body: JSON.stringify(data) }),

  editChatMessage: (id: string, data: { userId: string; content: string }) =>
    request(`/chat/${id}`, { method: "PUT", body: JSON.stringify(data) }),

  deleteChatMessage: (id: string, userId: string) =>
    request(`/chat/${id}?userId=${userId}`, { method: "DELETE" }),

  getUnreadChatCount: (after?: string) => {
    let url = "/chat/unread";
    if (after) url += `?after=${encodeURIComponent(after)}`;
    return request<{ count: number }>(url);
  },

  // ── Sounds ───────────────────────────────────────
  getSounds: (category?: string) => {
    let url = "/mobile/sounds";
    if (category) url += `?category=${category}`;
    return request<any[]>(url);
  },
};
