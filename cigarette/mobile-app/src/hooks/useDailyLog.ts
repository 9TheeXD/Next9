import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { DailyLog, APIResponse } from "@/types";
import { getBangkokDateString } from "@/utils/calculations";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface UseDailyLogReturn {
  todayLog: DailyLog | null;
  recentLogs: DailyLog[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  hasMore: boolean;
  saveLog: (cigarettesSmoked: number) => Promise<any[]>;
  refresh: () => Promise<void>;
  loadMoreLogs: () => Promise<void>;
}

export function useDailyLog(): UseDailyLogReturn {
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null);
  const [recentLogs, setRecentLogs] = useState<DailyLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      try {
        // Sync pending logs first if online
        const pendingLogsStr = await AsyncStorage.getItem("@ciga_pending_logs");
        if (pendingLogsStr) {
          const pendingLogs = JSON.parse(pendingLogsStr);
          if (pendingLogs.length > 0) {
            const latestLog = pendingLogs[pendingLogs.length - 1];
            try {
              await api.postLog({ cigarettesSmoked: latestLog.cigarettesSmoked });
              await AsyncStorage.removeItem("@ciga_pending_logs");
            } catch (e: any) {
              if (e.message && (e.message.includes('401') || e.message.includes('404') || e.message.includes('User not found'))) {
                await AsyncStorage.removeItem("@ciga_pending_logs");
                throw e;
              }
            }
          }
        }

        const response = (await api.getLogs(limit, 0)) as APIResponse<DailyLog[]>;
        const logs = response.data || [];
        setRecentLogs(logs);
        setHasMore(logs.length === limit);

        const todayStr = getBangkokDateString();
        const today = logs.find((log) => log.logDate.startsWith(todayStr));
        setTodayLog(today || null);

        await AsyncStorage.setItem("@ciga_recent_logs", JSON.stringify(logs));
      } catch (networkErr: any) {
        if (networkErr.message && (networkErr.message.includes('401') || networkErr.message.includes('404') || networkErr.message.includes('User not found'))) {
          throw networkErr;
        }
        
        const cachedStr = await AsyncStorage.getItem("@ciga_recent_logs");
        if (cachedStr) {
          const logs = JSON.parse(cachedStr);
          setRecentLogs(logs);
          setHasMore(false);
          const todayStr = getBangkokDateString();
          const today = logs.find((log: any) => log.logDate.startsWith(todayStr));
          setTodayLog(today || null);
        } else {
          setRecentLogs([]);
          setTodayLog(null);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMoreLogs = useCallback(async () => {
    if (!hasMore || isLoading) return;
    try {
      setIsLoading(true);
      const skip = recentLogs.length;
      const response = (await api.getLogs(limit, skip)) as APIResponse<DailyLog[]>;
      const newLogs = response.data || [];
      if (newLogs.length < limit) {
        setHasMore(false);
      }
      setRecentLogs((prev) => [...prev, ...newLogs]);
    } catch (err) {
      console.error("Failed to load more logs:", err);
    } finally {
      setIsLoading(false);
    }
  }, [hasMore, isLoading, recentLogs.length]);

  const saveLog = useCallback(
    async (cigarettesSmoked: number): Promise<any[]> => {
      try {
        setIsSaving(true);
        setError(null);

        let saved: DailyLog | null = null;
        let newBadges: any[] = [];

        try {
          const response = (await api.postLog({
            cigarettesSmoked,
          })) as APIResponse<DailyLog>;
          saved = response.data || null;

          try {
            const badgeResponse = (await api.checkBadges()) as APIResponse<{ newBadges: any[] }>;
            if (badgeResponse.success && badgeResponse.data?.newBadges) {
              newBadges = badgeResponse.data.newBadges;
            }
          } catch (badgeErr) {}
        } catch (networkErr: any) {
          if (networkErr.message && (networkErr.message.includes('401') || networkErr.message.includes('404') || networkErr.message.includes('User not found'))) {
            throw networkErr;
          }
          
          const todayStr = getBangkokDateString();
          saved = {
            id: `offline-${Date.now()}`,
            userId: "offline",
            logDate: todayStr + "T00:00:00.000Z",
            cigarettesSmoked,
            cravingCount: 0,
            mood: null,
            notes: null,
            articlesRead: 0,
            gamesPlayed: 0,
            soundsListened: 0,
            createdAt: new Date().toISOString(),
          };
          
          const pendingLogsStr = await AsyncStorage.getItem("@ciga_pending_logs");
          const pendingLogs = pendingLogsStr ? JSON.parse(pendingLogsStr) : [];
          pendingLogs.push({ cigarettesSmoked, timestamp: Date.now() });
          await AsyncStorage.setItem("@ciga_pending_logs", JSON.stringify(pendingLogs));
        }

        if (saved) {
          setTodayLog(saved);
          
          setRecentLogs(prev => {
            const newLogs = [...prev];
            const idx = newLogs.findIndex(l => l.logDate.startsWith(getBangkokDateString()));
            if (idx >= 0) newLogs[idx] = saved!;
            else newLogs.unshift(saved!);
            AsyncStorage.setItem("@ciga_recent_logs", JSON.stringify(newLogs)).catch(() => {});
            return newLogs;
          });
        }
        
        return newBadges;
      } catch (err) {
        setError((err as Error).message);
        throw err; // Re-throw so the UI can handle it
      } finally {
        setIsSaving(false);
      }
    },
    [fetchLogs]
  );

  useEffect(() => {
    AsyncStorage.getItem("@ciga_recent_logs").then(str => {
      if (str) {
        try {
          const logs = JSON.parse(str);
          setRecentLogs(logs);
          const todayStr = getBangkokDateString();
          const today = logs.find((log: any) => log.logDate.startsWith(todayStr));
          if (today) {
            setTodayLog((prev) => prev ? prev : today);
          }
        } catch (e) {}
      }
    });
    fetchLogs();
  }, [fetchLogs]);

  return {
    todayLog,
    recentLogs,
    isLoading,
    isSaving,
    error,
    hasMore,
    saveLog,
    refresh: fetchLogs,
    loadMoreLogs,
  };
}
