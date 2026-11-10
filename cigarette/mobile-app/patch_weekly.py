import os
import re

# 1. Update GamificationContext.tsx
gami_file = "src/contexts/GamificationContext.tsx"
with open(gami_file, "r") as f:
    content = f.read()

# Add WeeklyMissionType
content = content.replace("export type DailyMissionType = 'login' | 'minigame' | 'article' | 'quiz' | 'dailyLog';",
"""export type DailyMissionType = 'login' | 'minigame' | 'article' | 'quiz' | 'dailyLog';
export type WeeklyMissionType = 'reduction' | 'craving' | 'knowledge' | 'consistency';""")

# Update GamificationContextType
content = content.replace("  completeDailyMission: (mission: DailyMissionType) => void;\n}",
"""  completeDailyMission: (mission: DailyMissionType) => void;
  weeklyMissions: Record<WeeklyMissionType, boolean>;
  reductionPercent: number | null;
  thisWeekCigs: number;
  weeklyGoalCigs: number | null;
  claimWeeklyMission: (mission: WeeklyMissionType) => void;
}""")

# Add state
state_code = """  const [perfectQuizzes, setPerfectQuizzes] = useState<string[]>([]);
  const [weeklyMissions, setWeeklyMissions] = useState<Record<WeeklyMissionType, boolean>>({
    reduction: false, craving: false, knowledge: false, consistency: false
  });
  const [reductionPercent, setReductionPercent] = useState<number | null>(null);
  const [thisWeekCigs, setThisWeekCigs] = useState<number>(0);
  const [weeklyGoalCigs, setWeeklyGoalCigs] = useState<number | null>(null);"""
content = content.replace("  const [perfectQuizzes, setPerfectQuizzes] = useState<string[]>([]);", state_code)

# Add weekly evaluate in loadXP
# Right after: const savedState = await AsyncStorage.getItem(DAILY_MISSIONS_STATE_KEY);
# we can fetch logs if we want. But wait, getting logs inside `loadXP` could slow it down.
# Let's add a separate useEffect for weekly missions.

weekly_effect = """
  // ───── Weekly Missions Loading ─────
  useEffect(() => {
    const loadWeekly = async () => {
      if (!isAuthenticated || user?.role === "FAMILY") return;
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
          // Let's count days in last 7 days with (gamesPlayed > 0 || soundsListened > 0)
          let cravingDays = 0;
          let knowledgeDays = 0;
          let loggedDays = 0;

          logs.forEach((log: any) => {
            const logDate = new Date(log.logDate);
            logDate.setHours(0,0,0,0);
            const diffTime = Math.abs(now.getTime() - logDate.getTime());
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 7) {
              thisWeekCount += log.cigarettesSmoked || 0;
              if (log.gamesPlayed > 0 || log.soundsListened > 0) cravingDays++;
              if (log.articlesRead > 0 || log.quizScore !== undefined) knowledgeDays++;
              loggedDays++;
            } else if (diffDays < 14) {
              lastWeekCount += log.cigarettesSmoked || 0;
            }
          });

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

  const claimWeeklyMission = useCallback((mission: WeeklyMissionType) => {
    if (user?.role === "FAMILY") return;
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
"""
content = content.replace("  // ───── Sync pending XP when coming back online ─────", weekly_effect + "\n  // ───── Sync pending XP when coming back online ─────")

content = content.replace("completeDailyMission,", "completeDailyMission,\n        weeklyMissions,\n        reductionPercent,\n        thisWeekCigs,\n        weeklyGoalCigs,\n        claimWeeklyMission,")

with open(gami_file, "w") as f:
    f.write(content)


# 2. Update DailyQuotePopup.tsx
popup_file = "src/components/DailyQuotePopup.tsx"
with open(popup_file, "r") as f:
    pcontent = f.read()

pcontent = pcontent.replace("import { useAppSounds } from '@/hooks/useAppSounds';", "import { useAppSounds } from '@/hooks/useAppSounds';\nimport { GENERAL_QUOTES, COMPLIMENT_QUOTES } from '@/constants/quotes';\nimport { useGamification } from '@/contexts/GamificationContext';")

pcontent = re.sub(r'const QUOTES = \[[^\]]+\];', '', pcontent)

pcontent = pcontent.replace("  const { playClick, playCorrect } = useAppSounds();", "  const { playClick, playCorrect } = useAppSounds();\n  const { reductionPercent } = useGamification();")

pcontent = pcontent.replace("setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);", 
"""if (reductionPercent !== null && reductionPercent >= 20) {
        const rawQuote = COMPLIMENT_QUOTES[Math.floor(Math.random() * COMPLIMENT_QUOTES.length)];
        setQuote(rawQuote.replace('{percent}', reductionPercent.toString()));
      } else {
        setQuote(GENERAL_QUOTES[Math.floor(Math.random() * GENERAL_QUOTES.length)]);
      }""")

with open(popup_file, "w") as f:
    f.write(pcontent)

print("Patched Gamification and Popup")
