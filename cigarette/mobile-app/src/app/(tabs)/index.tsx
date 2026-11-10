import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable, ActivityIndicator, BackHandler, ToastAndroid, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import DailyTracker from "@/components/DailyTracker";
import BadgeCelebration from "@/components/BadgeCelebration";
import DailyQuotePopup from "@/components/DailyQuotePopup";
import CheerNotification, { CheerData } from "@/components/CheerNotification";
import { useDailyLog } from "@/hooks/useDailyLog";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { useAppSounds } from "@/hooks/useAppSounds";
import { calculateStreak, calculateMoneySaved, formatCurrency, getBangkokDateString } from "@/utils/calculations";
import { api } from "@/lib/api";
import type { APIResponse } from "@/types";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import FamilyDashboard from "@/components/FamilyDashboard";
import { LinearGradient } from "expo-linear-gradient";
import MissionBubble from "@/components/MissionBubble";
import DailyMissionModal from "@/components/DailyMissionModal";
import { useAdaptiveMission } from "@/hooks/useAdaptiveMission";

export default function TrackerScreen() {
  const { user } = useAuth();
  const { level, xp, nextLevelXP, progress, completeDailyMission } = useGamification();
  const { playClick } = useAppSounds();
  const { todayLog, recentLogs, isSaving, saveLog, isLoading: isLogsLoading } = useDailyLog();
  const { mission, completeMission, failMission, submitMicroSurvey } = useAdaptiveMission(recentLogs);
  const [showMissionModal, setShowMissionModal] = useState(false);
  const [earnedBadgesQueue, setEarnedBadgesQueue] = useState<any[]>([]);
  const [activeCheer, setActiveCheer] = useState<CheerData | null>(null);
  const [showQuote, setShowQuote] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();
  const exitAppRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let timeout: any;
      const onBackPress = () => {
        if (exitAppRef.current) {
          BackHandler.exitApp();
          return true;
        }
        exitAppRef.current = true;
        if (Platform.OS === 'android') {
          ToastAndroid.show('กดอีกครั้งเพื่อออกจากแอป', ToastAndroid.SHORT);
        }
        timeout = setTimeout(() => {
          exitAppRef.current = false;
        }, 2000);
        return true;
      };

      let sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => {
        sub.remove();
        if (timeout) clearTimeout(timeout);
      };
    }, [])
  );

  useEffect(() => {
    async function checkCheersAndQuote() {
      try {
        const response = (await api.getCheers(1)) as APIResponse<CheerData[]>;
        if (response.success && response.data && response.data.length > 0) {
          setActiveCheer(response.data[0]);
        }
      } catch {
        // fail silently
      }

      try {
        const today = getBangkokDateString();
        const lastQuoteDate = await AsyncStorage.getItem("@ciga_last_quote_date");
        if (lastQuoteDate !== today) {
          setShowQuote(true);
          await AsyncStorage.setItem("@ciga_last_quote_date", today);
        }
      } catch (e) {
        setShowQuote(true);
      }
    }
    checkCheersAndQuote();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      async function checkUnread() {
        try {
          const lastReadId = await AsyncStorage.getItem("@ciga_last_read_message_id");
          // If we want exact count after a specific message, the API currently takes a date string.
          // For simplicity, we just fetch chat messages and count how many are newer than the lastReadId locally, 
          // or we can use the API if we had lastReadCreatedAt.
          // Since we modified API to support `/chat/unread`, let's just fetch recent messages and calculate locally
          // because we don't have the exact date of lastReadId stored easily without another request.
          // Wait, actually, let's just use the `api.getChatMessages` and find the index.
          const res = await api.getChatMessages(undefined, 50) as APIResponse<any[]>;
          if (res.success && res.data) {
            if (!lastReadId) {
              setUnreadCount(res.data.length);
              return;
            }
            // Reverse because API returns oldest first now. Newest are at the end.
            const reversed = [...res.data].reverse();
            const index = reversed.findIndex(m => m.id === lastReadId);
            if (index === -1) {
              setUnreadCount(reversed.length); // All 50 are unread
            } else {
              setUnreadCount(index);
            }
          }
        } catch (e) {}
      }
      checkUnread();
    }, [])
  );

  if (user?.role === "FAMILY") {
    return <FamilyDashboard />;
  }

  // Removed full screen loading to allow skeleton loading states

  const baseline = user?.cigarettesPerDay ?? null;
  const { currentStreak } = calculateStreak(recentLogs);

  // Calculate total cigarettes avoided and money saved
  const totalAvoided = recentLogs.reduce((sum, log) => {
    const dayAvoided = Math.max(0, (baseline ?? 0) - log.cigarettesSmoked);
    return sum + dayAvoided;
  }, 0);

  const moneySaved = calculateMoneySaved(
    totalAvoided,
    user?.pricePerPack ?? 0,
    user?.cigarettesPerPack ?? 20
  );

  const handleSaveLog = async (count: number) => {
    const newBadges = await saveLog(count);
    completeDailyMission('dailyLog');
    if (newBadges && newBadges.length > 0) {
      setEarnedBadgesQueue(newBadges);
    }
  };

  const handleCloseBadge = () => {
    setEarnedBadgesQueue(prev => prev.slice(1));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        
      >
        {/* XP & Level Progress */}
        <View style={styles.levelCardContainer}>
          <LinearGradient
            colors={['#38bdf8', '#34d399']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.levelCard}
          >
            <View style={styles.levelHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>Lv {level}</Text>
                </View>
                <Text style={styles.levelTitle}>ระดับพลังใจ</Text>
              </View>
              {isLogsLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.xpText}>{xp} / {nextLevelXP} XP</Text>
              )}
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.levelDesc}>สะสม XP จากการเล่นเกมและบันทึกพฤติกรรมเพื่อปลดล็อครางวัล</Text>
          </LinearGradient>
        </View>

        <DailyTracker
          baseline={baseline}
          onSave={handleSaveLog}
          initialCount={todayLog?.cigarettesSmoked ?? 0}
          isSaving={isSaving}
          isLoading={isLogsLoading}
          smokingType={user?.smokingType}
        />

        {/* Streak indicator */}
        <View style={styles.streakCard}>
          <View style={styles.streakRow}>
            <View style={styles.streakItem}>
              {isLogsLoading ? (
                <ActivityIndicator size="small" color="#38bdf8" style={{ marginVertical: 2 }} />
              ) : (
                <Text style={styles.streakValue}>{currentStreak}</Text>
              )}
              <Text style={styles.streakLabel}>สตรีค (วัน)</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.streakItem}>
              {isLogsLoading ? (
                <ActivityIndicator size="small" color="#38bdf8" style={{ marginVertical: 2 }} />
              ) : (
                <Text style={styles.streakValue}>{totalAvoided}</Text>
              )}
              <Text style={styles.streakLabel}>{user?.smokingType === "POD" ? "พัฟที่ลดได้" : "มวนที่ลดได้"}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.streakItem}>
              {isLogsLoading ? (
                <ActivityIndicator size="small" color="#34d399" style={{ marginVertical: 2 }} />
              ) : (
                <Text style={[styles.streakValue, { color: '#34d399' }]}>{formatCurrency(moneySaved)}</Text>
              )}
              <Text style={styles.streakLabel}>ประหยัด (฿)</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Floating Mission Bubble (Top Left) */}
      {user?.role === "SMOKER" && (
        <MissionBubble
          mission={mission}
          onPress={() => {
            playClick();
            setShowMissionModal(true);
          }}
        />
      )}

      {/* Floating Chat Icon (Bottom Right) */}
      <Pressable 
        style={styles.chatFloatingButton}
        onPress={() => { playClick(); router.push('/chat' as any); }}
      >
        <Feather name="message-circle" size={20} color="#ffffff" />
        <Text style={styles.chatFloatingButtonText}>Open Chat</Text>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </Pressable>

      {/* Adaptive Daily Mission Modal */}
      <DailyMissionModal
        visible={showMissionModal}
        mission={mission}
        onClose={() => setShowMissionModal(false)}
        onCompleteMission={completeMission}
        onFailMission={failMission}
        onSubmitMicroSurvey={submitMicroSurvey}
      />

      {/* Badge Celebration Modal Queue */}
      <BadgeCelebration 
        badge={earnedBadgesQueue.length > 0 ? earnedBadgesQueue[0] : null} 
        onClose={handleCloseBadge} 
      />
      {activeCheer && (
        <CheerNotification cheer={activeCheer} onDismiss={() => setActiveCheer(null)} />
      )}

      {/* Daily Quote Popup */}
      <DailyQuotePopup 
        visible={showQuote} 
        onClose={() => setShowQuote(false)} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f0fdfa",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  levelCardContainer: {
    marginHorizontal: 24,
    marginTop: 24,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  levelCard: {
    padding: 16,
  },
  levelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  levelBadge: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  levelBadgeText: {
    color: '#38bdf8',
    fontWeight: '800',
    fontSize: 12,
  },
  levelTitle: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  xpText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 4,
  },
  levelDesc: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
  },
  streakCard: {
    marginHorizontal: 24,
    marginTop: 24,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  streakItem: {
    alignItems: "center",
    flex: 1,
  },
  streakValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1e293b",
  },
  streakLabel: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "600",
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  chatFloatingButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#34d399',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 100,
  },
  chatFloatingButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
  unreadBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#f0fdfa',
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  }
});
