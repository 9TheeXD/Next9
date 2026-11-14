import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSounds } from "@/hooks/useAppSounds";
import { useNetwork } from "@/contexts/NetworkContext";
import { getBangkokDateString } from "@/utils/calculations";

interface ToastData {
  id: string;
  amount: number;
  message: string;
}

export type DailyMissionType = 'login' | 'minigame' | 'article' | 'quiz' | 'dailyLog';
export type WeeklyMissionType = 'reduction' | 'craving' | 'knowledge' | 'consistency';

interface GamificationContextType {
  xp: number;
  level: number;
  nextLevelXP: number;
  progress: number; // 0 to 1
  addXP: (amount: number, message: string) => void;
  activeToast: ToastData | null;
  clearToast: () => void;
  perfectQuizzes: string[];
  markQuizPerfect: (quizId: string) => void;
  dailyMissions: Record<DailyMissionType, boolean>;
  completeDailyMission: (mission: DailyMissionType) => void;
  weeklyMissions: Record<WeeklyMissionType, boolean>;
  reductionPercent: number | null;
  thisWeekCigs: number;
  weeklyGoalCigs: number | null;
  cravingDays: number;
  knowledgeDays: number;
  loggedDays: number;
  claimWeeklyMission: (mission: WeeklyMissionType) => void;
}

const GamificationContext = createContext<GamificationContextType | undefined>(undefined);

const XP_STORAGE_KEY = "@ciga_user_xp";
const XP_PENDING_KEY = "@ciga_pending_xp";
const XP_TIMESTAMP_KEY = "@ciga_xp_timestamp";
const PERFECT_QUIZ_KEY = "@ciga_perfect_quizzes";
const DAILY_MISSIONS_DATE_KEY = "@ciga_daily_missions_date";
const DAILY_MISSIONS_STATE_KEY = "@ciga_daily_missions_state";

export function useGamification(): GamificationContextType {
  const context = useContext(GamificationContext);
  if (!context) {
    throw new Error("useGamification must be used within a GamificationProvider");
  }
  return context;
}

export function GamificationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const { playXP, playBadge } = useAppSounds();
  const { isOnline } = useNetwork();
  const [xp, setXp] = useState(0);
  const [activeToast, setActiveToast] = useState<ToastData | null>(null);
  const [perfectQuizzes, setPerfectQuizzes] = useState<string[]>([]);
  const [weeklyMissions, setWeeklyMissions] = useState<Record<WeeklyMissionType, boolean>>({
    reduction: false, craving: false, knowledge: false, consistency: false
  });
  const [reductionPercent, setReductionPercent] = useState<number | null>(null);
  const [thisWeekCigs, setThisWeekCigs] = useState<number>(0);
  const [weeklyGoalCigs, setWeeklyGoalCigs] = useState<number | null>(null);
  const [cravingDays, setCravingDays] = useState(0);
  const [knowledgeDays, setKnowledgeDays] = useState(0);
  const [loggedDays, setLoggedDays] = useState(0);
  const [dailyMissions, setDailyMissions] = useState<Record<DailyMissionType, boolean>>({
    login: false,
    minigame: false,
    article: false,
    quiz: false,
    dailyLog: false,
  });

  // ───── Network-First XP Loading ─────
  // Strategy: Try API first (Network First). 
  // If online → fetch from server, store locally.
  // If offline → load from AsyncStorage.
  useEffect(() => {
    const loadXP = async () => {
      if (!isAuthenticated) return;
      try {
        // ── NETWORK FIRST ──
        let serverXP = 0;
        try {
          const response = await api.getProfile();
          if (response.success && response.data) {
            serverXP = (response.data as any).xp || 0;
            const localXPStr = await AsyncStorage.getItem(XP_STORAGE_KEY);
            const localXP = localXPStr ? parseInt(localXPStr, 10) : 0;
            
            const pendingStr = await AsyncStorage.getItem(XP_PENDING_KEY);
            const pendingXP = pendingStr ? parseInt(pendingStr, 10) : 0;
            
            if (pendingXP > 0) {
              try {
                await api.postXP({ amount: pendingXP });
                await AsyncStorage.removeItem(XP_PENDING_KEY);
                const syncedXP = serverXP + pendingXP;
                setXp(syncedXP);
                await AsyncStorage.setItem(XP_STORAGE_KEY, syncedXP.toString());
                await AsyncStorage.setItem(XP_TIMESTAMP_KEY, Date.now().toString());
              } catch (e: any) {
                if (e.message && (e.message.includes('401') || e.message.includes('404') || e.message.includes('User not found'))) {
                  await AsyncStorage.removeItem(XP_PENDING_KEY);
                  throw e;
                }
                setXp(serverXP + pendingXP);
              }
            } else {
              setXp(serverXP); // OVERWRITE CACHE, don't use Math.max
              await AsyncStorage.setItem(XP_STORAGE_KEY, serverXP.toString());
              await AsyncStorage.setItem(XP_TIMESTAMP_KEY, Date.now().toString());
            }
          }
          
          const quizResp = await api.getQuizResults();
          if (quizResp.success && quizResp.data) {
            const results = quizResp.data as any[]; 
            const perfectIds = results
              .filter((r) => r.score === r.maxScore)
              .map((r) => r.quizId);
            setPerfectQuizzes([...new Set(perfectIds)]);
            await AsyncStorage.setItem(PERFECT_QUIZ_KEY, JSON.stringify([...new Set(perfectIds)]));
          }
        } catch (networkErr: any) {
          if (networkErr.message && (networkErr.message.includes('401') || networkErr.message.includes('404') || networkErr.message.includes('User not found'))) {
            return; // Exit and let AuthContext handle global logout
          }
          throw networkErr; // trigger fallback
        }
      } catch (fallback) {
        // ── OFFLINE FALLBACK ──
        const localXPStr = await AsyncStorage.getItem(XP_STORAGE_KEY);
        if (localXPStr) setXp(parseInt(localXPStr, 10));
        
        const savedQuizzes = await AsyncStorage.getItem(PERFECT_QUIZ_KEY);
        if (savedQuizzes) setPerfectQuizzes(JSON.parse(savedQuizzes));
      }
        
        // Load Daily Missions (always local)
        const todayStr = getBangkokDateString();
        const savedDate = await AsyncStorage.getItem(DAILY_MISSIONS_DATE_KEY);
        let currentMissions = { login: false, minigame: false, article: false, quiz: false, dailyLog: false };
        if (savedDate === todayStr) {
          const savedState = await AsyncStorage.getItem(DAILY_MISSIONS_STATE_KEY);
          if (savedState) currentMissions = JSON.parse(savedState);
        } else {
          // Reset for new day
          await AsyncStorage.setItem(DAILY_MISSIONS_DATE_KEY, todayStr);
          await AsyncStorage.setItem(DAILY_MISSIONS_STATE_KEY, JSON.stringify(currentMissions));
        }
        
        setDailyMissions(currentMissions);
        
        // Auto-complete login mission
        if (!currentMissions.login) {
          const next = { ...currentMissions, login: true };
          setDailyMissions(next);
          AsyncStorage.setItem(DAILY_MISSIONS_STATE_KEY, JSON.stringify(next)).catch(console.error);
          
          const xpAmount = 10;
          setXp((currentXp) => {
            const newXp = currentXp + xpAmount;
            // Save locally
            AsyncStorage.setItem(XP_STORAGE_KEY, newXp.toString()).catch(console.error);
            // Try to sync to server
            api.postXP({ amount: xpAmount }).catch((err: any) => {
              if (err.message && (err.message.includes('401') || err.message.includes('404') || err.message.includes('User not found'))) {
                return;
              }
              AsyncStorage.getItem(XP_PENDING_KEY).then((pendingStr) => {
                const currentPending = pendingStr ? parseInt(pendingStr, 10) : 0;
                AsyncStorage.setItem(XP_PENDING_KEY, (currentPending + xpAmount).toString());
              });
            });
            return newXp;
          });
          setActiveToast({
            id: Date.now().toString(),
            amount: xpAmount,
            message: `ภารกิจสำเร็จ: ล็อกอินเข้าสู่ระบบ`,
          });
        }
    };

    if (isAuthenticated) {
      loadXP();
    } else {
      setXp(0);
      setPerfectQuizzes([]);
      setDailyMissions({ login: false, minigame: false, article: false, quiz: false, dailyLog: false });
    }
  }, [isAuthenticated, isOnline]);


  // ───── Weekly Missions Loading ─────
  useEffect(() => {
    const loadWeekly = async () => {
      if (!isAuthenticated || (user?.role === "FAMILY" || user?.role === "EXPLORER")) return;
      try {
        const todayStr = getBangkokDateString();
        // A simple way to track week is just the week number or start of week
        // We'll calculate rolling 7 days.
        const logsResp = await api.getLogs(14, 0) as any;
        if (logsResp.success && logsResp.data) {
          const logs = logsResp.data;
          const now = new Date();
          now.setHours(0,0,0,0);
          
          let thisWeekCount = 0;
          let lastWeekCount = 0;
          let cravingResisted = 0; // count cravingCount > 0 but cigarettesSmoked == 0 ? Or we just count games played and sounds listened? 
          // Wait, "ใช้งานฟีเจอร์ SOS และเอาชนะความอยากได้" -> let's count days where cravingCount > 0 and gamesPlayed/soundsListened > 0.
          // For simplicity, let's just count total gamesPlayed in the week >= 5 for craving survivor?
          let cDays = 0;
          let kDays = 0;
          let lDays = 0;

          logs.forEach((log: any) => {
            const logDate = new Date(log.logDate);
            logDate.setHours(0,0,0,0);
            const diffTime = Math.abs(now.getTime() - logDate.getTime());
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 7) {
              thisWeekCount += log.cigarettesSmoked || 0;
              if (log.gamesPlayed > 0 || log.soundsListened > 0) cDays++;
              if (log.articlesRead > 0 || log.quizScore !== undefined) kDays++;
              lDays++;
            } else if (diffDays < 14) {
              lastWeekCount += log.cigarettesSmoked || 0;
            }
          });
          
          setCravingDays(cDays);
          setKnowledgeDays(kDays);
          setLoggedDays(lDays);

          setThisWeekCigs(thisWeekCount);
          if (lastWeekCount > 0) {
            const goal = Math.floor(lastWeekCount * 0.8);
            setWeeklyGoalCigs(goal);
            if (thisWeekCount <= goal) {
              setReductionPercent(Math.floor(((lastWeekCount - thisWeekCount) / lastWeekCount) * 100));
            } else {
              setReductionPercent(null);
            }
          }

          const savedWeekly = await AsyncStorage.getItem("@ciga_weekly_missions");
          const claimed = savedWeekly ? JSON.parse(savedWeekly) : {};
          
          setWeeklyMissions({
            reduction: claimed.reduction || false,
            craving: claimed.craving || false,
            knowledge: claimed.knowledge || false,
            consistency: claimed.consistency || false,
          });

          // Auto-check if conditions met but NOT claimed. We keep them false until claimed, 
          // or we can auto-claim. Let's let user claim them. Actually, UI should show them as claimable if condition is met.
          // Wait, we need to know if they are MET vs CLAIMED.
          // If we use boolean, true = claimed.
          // The UI will check the conditions itself to show "Claim" button.
        }
      } catch (e) {
        console.warn("Weekly fetch error", e);
      }
    };
    loadWeekly();
  }, [isAuthenticated, isOnline]);


  // ───── Sync pending XP when coming back online ─────
  useEffect(() => {
    if (!isOnline || !isAuthenticated) return;
    
    const syncPending = async () => {
      const pendingStr = await AsyncStorage.getItem(XP_PENDING_KEY);
      const pendingXP = pendingStr ? parseInt(pendingStr, 10) : 0;
      if (pendingXP > 0) {
        try {
          await api.postXP({ amount: pendingXP });
          await AsyncStorage.removeItem(XP_PENDING_KEY);
          console.log(`Synced ${pendingXP} pending XP to server`);
        } catch (e) {
          console.warn("Failed to sync pending XP:", e);
        }
      }
    };
    
    syncPending();
  }, [isOnline, isAuthenticated]);

  const addXP = useCallback((amount: number, message: string) => {
    // **Disable XP for FAMILY role**
    if ((user?.role === "FAMILY" || user?.role === "EXPLORER")) return;

    setXp((prev) => {
      const newXp = prev + amount;
      // Always save locally
      AsyncStorage.setItem(XP_STORAGE_KEY, newXp.toString()).catch(console.error);
      return newXp;
    });
    setActiveToast({
      id: Date.now().toString(),
      amount,
      message,
    });
    playXP();
    
    // Try to sync to server, queue if offline
    if (isOnline) {
      api.postXP({ amount }).catch(console.error);
      api.postActionLog({
        action: "XP_GAIN",
        details: `ได้รับ ${amount} XP จาก: ${message}`
      }).catch(() => {});
    } else {
      AsyncStorage.getItem(XP_PENDING_KEY).then(pending => {
        const p = pending ? parseInt(pending, 10) : 0;
        AsyncStorage.setItem(XP_PENDING_KEY, (p + amount).toString()).catch(console.error);
      });
    }
  }, [isOnline, user?.role]);

  const claimWeeklyMission = useCallback((mission: WeeklyMissionType) => {
    if ((user?.role === "FAMILY" || user?.role === "EXPLORER")) return;
    setWeeklyMissions(prev => {
      if (prev[mission]) return prev;
      const next = { ...prev, [mission]: true };
      AsyncStorage.setItem("@ciga_weekly_missions", JSON.stringify(next)).catch(console.error);
      
      let xpAmount = 0;
      let title = "";
      if (mission === 'reduction') { xpAmount = 1000; title = "นักสู้ผู้มุ่งมั่น"; }
      if (mission === 'craving') { xpAmount = 300; title = "ยอดมนุษย์ใจแข็ง"; }
      if (mission === 'knowledge') { xpAmount = 400; title = "นักเรียนรู้ตัวยง"; }
      if (mission === 'consistency') { xpAmount = 500; title = "ความสม่ำเสมอคือพลัง"; }

      if (xpAmount > 0) {
        addXP(xpAmount, `ภารกิจสัปดาห์: ${title}`);
      }
      return next;
    });
  }, [user?.role, addXP]);

  const clearToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  const markQuizPerfect = useCallback(async (quizId: string) => {
    setPerfectQuizzes((prev) => {
      if (prev.includes(quizId)) return prev;
      playBadge();
      const next = [...prev, quizId];
      AsyncStorage.setItem(PERFECT_QUIZ_KEY, JSON.stringify(next)).catch(console.error);
      return next;
    });
  }, [playBadge]);

  const completeDailyMission = useCallback(async (mission: DailyMissionType) => {
    // **Disable missions for FAMILY role**
    if ((user?.role === "FAMILY" || user?.role === "EXPLORER")) return;

    setDailyMissions((prev) => {
      if (prev[mission]) return prev; // Already completed
      
      const next = { ...prev, [mission]: true };
      AsyncStorage.setItem(DAILY_MISSIONS_STATE_KEY, JSON.stringify(next)).catch(console.error);
      
      // Give XP based on mission
      let xpAmount = 0;
      let title = "";
      if (mission === 'login') { xpAmount = 10; title = "ล็อกอินเข้าสู่ระบบ"; }
      if (mission === 'minigame') { xpAmount = 15; title = "เล่นมินิเกมคลายเครียด"; }
      if (mission === 'article') { xpAmount = 10; title = "อ่านบทความ 1 บทความ"; }
      if (mission === 'quiz') { xpAmount = 15; title = "ทำแบบทดสอบ 1 ชุด"; }
      if (mission === 'dailyLog') { xpAmount = 20; title = "บันทึกพฤติกรรมประจำวัน"; }
      
      if (xpAmount > 0) {
        setXp((currentXp) => {
          const newXp = currentXp + xpAmount;
          AsyncStorage.setItem(XP_STORAGE_KEY, newXp.toString()).catch(console.error);
          if (isOnline) {
            api.postXP({ amount: xpAmount }).catch(console.error);
          } else {
            AsyncStorage.getItem(XP_PENDING_KEY).then(pending => {
              const p = pending ? parseInt(pending, 10) : 0;
              AsyncStorage.setItem(XP_PENDING_KEY, (p + xpAmount).toString()).catch(console.error);
            });
          }
          return newXp;
        });
        setActiveToast({
          id: Date.now().toString(),
          amount: xpAmount,
          message: `ภารกิจสำเร็จ: ${title}`,
        });
        playBadge();
      }
      
      return next;
    });
  }, [isOnline]);

  // Level formula: Level 1 = 0-99, Level 2 = 100-249, Level 3 = 250-449...
  // Let's use a simple formula: level = floor(sqrt(XP / 50)) + 1
  // Lvl 1: 0 XP
  // Lvl 2: 50 XP
  // Lvl 3: 200 XP
  // Lvl 4: 450 XP
  const level = Math.floor(Math.sqrt(xp / 50)) + 1;
  const currentLevelBaseXP = 50 * Math.pow(level - 1, 2);
  const nextLevelXP = 50 * Math.pow(level, 2);
  
  const xpIntoCurrentLevel = xp - currentLevelBaseXP;
  const xpNeededForNextLevel = nextLevelXP - currentLevelBaseXP;
  const progress = Math.min(1, Math.max(0, xpIntoCurrentLevel / xpNeededForNextLevel));

  return (
    <GamificationContext.Provider
      value={{
        xp,
        level,
        nextLevelXP,
        progress,
        addXP,
        activeToast,
        clearToast,
        perfectQuizzes,
        markQuizPerfect,
        dailyMissions,
        completeDailyMission,
        weeklyMissions,
        reductionPercent,
        thisWeekCigs,
        weeklyGoalCigs,
        cravingDays,
        knowledgeDays,
        loggedDays,
        claimWeeklyMission,
      }}
    >
      {children}
    </GamificationContext.Provider>
  );
}
