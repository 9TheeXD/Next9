import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, setToken, clearToken } from "@/lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNetwork } from "@/contexts/NetworkContext";
import type { UserProfile, APIResponse, AuthResponse, UserRole } from "@/types";
import { Alert, Platform, DeviceEventEmitter } from "react-native";
import { getDeviceKey, claimDeviceKeyOnce, authErrorMessage } from "@/lib/deviceKey";

const OFFLINE_USER_KEY = "@ciga_offline_user";

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (phoneNumber: string) => Promise<void>;
  register: (data: {
    displayId: string;
    role: string;
    targetDisplayId?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isOfflineMode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const { isOnline } = useNetwork();

  const aggressivelyClearCache = async () => {
    if (typeof caches !== 'undefined') {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      } catch (e) {
        console.error("Failed to clear PWA cache", e);
      }
    }
  };

  const fetchProfile = useCallback(async (isRetry = false) => {
    try {
      // 1. NETWORK FIRST
      const response = (await api.getProfile()) as APIResponse<UserProfile>;
      if (response.success && response.data) {
        if (response.data.isDeleted) {
          if (Platform.OS === 'web') {
            window.alert('บัญชีของคุณถูกลบออกจากระบบแล้ว กรุณาลงทะเบียนใหม่');
            document.cookie = 'ciga_display_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          } else {
            Alert.alert('แจ้งเตือน', 'บัญชีของคุณถูกลบออกจากระบบแล้ว กรุณาลงทะเบียนใหม่');
          }
          setUser(null);
          await clearToken();
          await AsyncStorage.removeItem(OFFLINE_USER_KEY);
          await AsyncStorage.removeItem("ciga_display_id");
          await aggressivelyClearCache();
          return;
        }

        setUser(response.data);
        AsyncStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(response.data)).catch(console.error);
        setIsOfflineMode(false); // Reset offline mode
        if (response.data.displayId && response.data.role !== "ADMIN") {
          claimDeviceKeyOnce(response.data.displayId, (deviceKey) => api.claimDeviceKey(deviceKey));
        }
      } else {
        // Real unauthorized error from server
        setUser(null);
        await clearToken();
        await AsyncStorage.removeItem(OFFLINE_USER_KEY);
        await aggressivelyClearCache();
      }
    } catch (err: any) {
      if (err.message && (err.message.includes('401') || err.message.includes('404') || err.message.includes('User not found'))) {
        setUser(null);
        await clearToken();
        await AsyncStorage.removeItem(OFFLINE_USER_KEY);
        await aggressivelyClearCache();
        return;
      }
      
      // 2. OFFLINE FALLBACK
      setIsOfflineMode(true);
      if (!isRetry) { // Only load from cache if it's the initial load or explicit refresh, not background polling
        try {
          const cached = await AsyncStorage.getItem(OFFLINE_USER_KEY);
          if (cached) {
            setUser(JSON.parse(cached));
          } else {
            setUser(null);
            await clearToken();
          }
        } catch (err: any) {
          await AsyncStorage.removeItem(OFFLINE_USER_KEY);
          await aggressivelyClearCache();
          return;
        }
      }
    }
  }, []);

  // Background retry when offline
  useEffect(() => {
    let interval: any;
    if (isOfflineMode) {
      interval = setInterval(() => {
        fetchProfile(true); // pass isRetry=true
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOfflineMode, fetchProfile]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("auth_error", async () => {
      setUser(null);
      await clearToken();
      await AsyncStorage.removeItem(OFFLINE_USER_KEY);
      await aggressivelyClearCache();
      setIsOfflineMode(false);
    });
    return () => sub.remove();
  }, []);

  // On mount: try to restore session from stored token
  useEffect(() => {
    async function init() {
      try {
        await fetchProfile();
      } catch (err: any) {
      if (err.message && (err.message.includes('401') || err.message.includes('404') || err.message.includes('User not found'))) {
        setUser(null);
        await clearToken();
        await AsyncStorage.removeItem(OFFLINE_USER_KEY);
        await aggressivelyClearCache();
        return;
      }
        // No valid token stored — user needs to log in
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [fetchProfile]);

  const login = useCallback(async (phoneNumber: string) => {
    const response = (await api.login({ phoneNumber })) as APIResponse<AuthResponse>;
    if (!response.success || !response.data) {
      throw new Error(response.error || "Login failed");
    }
    await setToken(response.data.token);
    setUser(response.data.user);
    AsyncStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(response.data.user)).catch(console.error);
  }, []);

  const register = useCallback(
    async (data: {
      displayId: string;
      role: string;
      targetDisplayId?: string;
    }) => {
      let response: APIResponse<AuthResponse>;
      try {
        const deviceKey = await getDeviceKey(data.displayId);
        response = (await api.register({ ...data, deviceKey })) as APIResponse<AuthResponse>;
      } catch (e: any) {
        throw new Error(authErrorMessage(e?.message || "Registration failed"));
      }
      if (!response.success || !response.data) {
        throw new Error(authErrorMessage(response.error || "Registration failed"));
      }
      await setToken(response.data.token);
      setUser(response.data.user);
      AsyncStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(response.data.user)).catch(console.error);
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      if (user) {
        const rememberedAccount = {
          displayId: user.displayId,
          displayName: user.displayName || `ผู้ใช้งาน ${user.displayId}`,
          role: user.role,
          followedSmokerDisplayId: user.followedSmokers && user.followedSmokers.length > 0 ? (user.followedSmokers[0] as any).displayId : null,
        };
        await AsyncStorage.setItem("@ciga_remembered_account", JSON.stringify(rememberedAccount));
        if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
          localStorage.setItem("ciga_remembered_account", JSON.stringify(rememberedAccount));
        }
      }
    } catch (e) {
      console.warn("Failed to remember account on logout:", e);
    }

    await clearToken();
    await AsyncStorage.removeItem(OFFLINE_USER_KEY);
    await AsyncStorage.removeItem("ciga_display_id");
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.cookie = 'ciga_display_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
    await aggressivelyClearCache();
    setUser(null);
  }, [user]);

  const refreshProfile = useCallback(async () => {
    await fetchProfile();
  }, [fetchProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshProfile,
        isOfflineMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
