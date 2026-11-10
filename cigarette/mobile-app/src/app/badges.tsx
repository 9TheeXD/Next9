import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Pressable,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import type { APIResponse } from "@/types";
import { useGamification } from "@/contexts/GamificationContext";
import WeeklyQuests from "@/components/WeeklyQuests";
import CircularProgress from "@/components/CircularProgress";

interface Badge {
  id: string;
  name: string;
  description: string;
  iconName: string;
  category: string;
  criteriaDays: number | null;
  criteriaValue: number | null;
}

interface UserBadge {
  id: string;
  badgeId: string;
  earnedAt: string;
}

interface BadgesResponse {
  badges: Badge[];
  earned: UserBadge[];
}

const getBadgeFeatherIcon = (iconName: string): keyof typeof Feather.glyphMap => {
  switch (iconName) {
    case "footprints": return "star";
    case "fire": return "zap";
    case "shield": return "shield";
    case "trophy": return "award";
    case "crown": return "award";
    case "lungs": return "wind";
    case "brain": return "activity";
    case "trending-down": return "trending-down";
    default: return "star";
  }
};

export default function BadgesScreen() {
  const router = useRouter();
  const { level, xp, nextLevelXP, progress, dailyMissions } = useGamification();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [earned, setEarned] = useState<UserBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);

  const fetchBadges = useCallback(async () => {
    try {
      const response = (await api.getBadges()) as APIResponse<BadgesResponse>;
      if (response.success && response.data) {
        setBadges(response.data.badges);
        setEarned(response.data.earned);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBadges();
  }, [fetchBadges]);

  const earnedIds = new Set(earned.map((e) => e.badgeId));
  const earnedCount = earned.length;
  const totalCount = badges.length;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Custom Header */}
      <View style={styles.headerBar}>
        <Pressable style={styles.backButton} onPress={() => router.replace("/(tabs)/profile" as any)}>
          <Feather name="arrow-left" size={24} color="#1e293b" />
        </Pressable>
        <Text style={styles.headerBarTitle}>เหรียญตราและภารกิจ</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        
      >
        {/* Total XP Section */}
        <View style={styles.xpCard}>
          <Text style={styles.xpTitle}>พลังใจรวมของคุณ</Text>
          <View style={styles.xpRow}>
            <Feather name="zap" size={32} color="#fbbf24" />
            <Text style={styles.xpValue}>{xp}</Text>
            <Text style={styles.xpLabel}>XP</Text>
          </View>
          <Text style={styles.levelText}>เลเวล {level}</Text>
          <View style={styles.levelProgressBg}>
            <View style={[styles.levelProgressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.levelNext}>เหลืออีก {nextLevelXP - xp} XP ถึงเลเวล {level + 1}</Text>
        </View>

        {/* Missions Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ภารกิจประจำวัน</Text>
        </View>

        <View style={styles.missionCard}>
          <View style={styles.missionInfo}>
            <Text style={styles.missionName}>ล็อกอินเข้าสู่ระบบ</Text>
            <View style={styles.rewardRow}>
              <Text style={styles.missionReward}>+10 XP</Text>
              <Text style={styles.progressTextInline}>{dailyMissions.login ? '1/1' : '0/1'}</Text>
            </View>
          </View>
          {dailyMissions.login ? (
            <Feather name="check-circle" size={28} color="#34d399" />
          ) : (
            <CircularProgress size={28} strokeWidth={3} progress={0} color="#7dd3fc" unfilledColor="rgba(0,0,0,0.1)" />
          )}
        </View>

        <View style={styles.missionCard}>
          <View style={styles.missionInfo}>
            <Text style={styles.missionName}>เล่นมินิเกมคลายเครียด</Text>
            <View style={styles.rewardRow}>
              <Text style={styles.missionReward}>+20 XP</Text>
              <Text style={styles.progressTextInline}>{dailyMissions.minigame ? '1/1' : '0/1'}</Text>
            </View>
          </View>
          {dailyMissions.minigame ? (
            <Feather name="check-circle" size={28} color="#34d399" />
          ) : (
            <CircularProgress size={28} strokeWidth={3} progress={0} color="#7dd3fc" unfilledColor="rgba(0,0,0,0.1)" />
          )}
        </View>

        <View style={styles.missionCard}>
          <View style={styles.missionInfo}>
            <Text style={styles.missionName}>อ่านความรู้ 1 บทความสมบูรณ์</Text>
            <View style={styles.rewardRow}>
              <Text style={styles.missionReward}>+50 XP</Text>
              <Text style={styles.progressTextInline}>{dailyMissions.article ? '1/1' : '0/1'}</Text>
            </View>
          </View>
          {dailyMissions.article ? (
            <Feather name="check-circle" size={28} color="#34d399" />
          ) : (
            <CircularProgress size={28} strokeWidth={3} progress={0} color="#7dd3fc" unfilledColor="rgba(0,0,0,0.1)" />
          )}
        </View>

        <WeeklyQuests />

        <View style={[styles.sectionHeader, { marginTop: 16 }]}>
          <Text style={styles.sectionTitle}>เหรียญตราความสำเร็จ</Text>
          <Text style={styles.subtitle}>ได้รับ {earnedCount} จาก {totalCount}</Text>
        </View>

        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: totalCount > 0 ? `${(earnedCount / totalCount) * 100}%` : "0%" },
            ]}
          />
        </View>

        {loading ? (
          <ActivityIndicator color="#7dd3fc" size="large" style={styles.loader} />
        ) : (
          <View style={styles.grid}>
            {badges.map((badge) => {
              const isEarned = earnedIds.has(badge.id);
              const earnedEntry = earned.find((e) => e.badgeId === badge.id);
              return (
                <Pressable
                  key={badge.id}
                  style={[styles.badgeCard, isEarned && styles.badgeCardEarned]}
                  onPress={() => setSelectedBadge(badge)}
                >
                  <View style={[styles.badgeIcon, !isEarned && styles.badgeIconLocked]}>
                    <Feather 
                      name={getBadgeFeatherIcon(badge.iconName)} 
                      size={36} 
                      color={isEarned ? "#7dd3fc" : "rgba(0,0,0,0.35)"} 
                    />
                  </View>
                  <Text
                    style={[styles.badgeName, !isEarned && styles.badgeNameLocked]}
                    numberOfLines={2}
                  >
                    {badge.name}
                  </Text>
                  {isEarned && earnedEntry ? (
                    <Text style={styles.badgeDate}>
                      {new Date(earnedEntry.earnedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Feather name="lock" size={10} color="#64748b" />
                      <Text style={styles.badgeLocked}>ยังไม่ปลดล็อค</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Badge detail modal */}
      <Modal
        visible={!!selectedBadge}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedBadge(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedBadge(null)}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Feather 
                name={getBadgeFeatherIcon(selectedBadge?.iconName ?? "")} 
                size={56} 
                color="#7dd3fc" 
              />
            </View>
            <Text style={styles.modalName}>{selectedBadge?.name}</Text>
            <Text style={styles.modalDesc}>{selectedBadge?.description}</Text>
            <View style={styles.modalDivider} />
            <Text style={styles.modalCriteria}>
              {selectedBadge?.criteriaDays
                ? `ต้องการ ${selectedBadge.criteriaDays} วัน`
                : selectedBadge?.criteriaValue
                ? `ต้องการความสำเร็จ ${selectedBadge.criteriaValue}%`
                : "เงื่อนไขพิเศษ"}
            </Text>
            <Text style={styles.modalCategory}>
              หมวดหมู่: {selectedBadge?.category}
            </Text>
            <Pressable
              style={styles.modalClose}
              onPress={() => setSelectedBadge(null)}
            >
              <Text style={styles.modalCloseText}>ปิด</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f0fdfa" },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  backButton: { padding: 8 },
  headerBarTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  
  xpCard: {
    backgroundColor: "rgba(251, 191, 36, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.2)",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    marginBottom: 32,
  },
  xpTitle: { fontSize: 14, color: "#475569", marginBottom: 8, fontWeight: "600" },
  xpRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 12 },
  xpValue: { fontSize: 48, fontWeight: "900", color: "#fbbf24", letterSpacing: -1 },
  xpLabel: { fontSize: 20, fontWeight: "700", color: "#fbbf24" },
  levelText: { fontSize: 16, fontWeight: "700", color: "#1e293b", marginBottom: 12 },
  levelProgressBg: { width: "100%", height: 8, backgroundColor: "rgba(0,0,0,0.1)", borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  levelProgressFill: { height: "100%", backgroundColor: "#fbbf24", borderRadius: 4 },
  levelNext: { fontSize: 12, color: "#475569" },

  sectionHeader: { marginBottom: 16 },
  sectionTitle: { fontSize: 22, fontWeight: "800", color: "#1e293b" },
  subtitle: { fontSize: 14, color: "#475569", marginTop: 4 },

  missionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  missionInfo: { flex: 1 },
  missionName: { fontSize: 16, fontWeight: "600", color: "#1e293b", marginBottom: 4 },
  missionReward: { fontSize: 13, color: "#fbbf24", fontWeight: "700" },
  rewardRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  progressTextInline: { fontSize: 12, color: "#94a3b8", fontWeight: "600" },

  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#f0fdfa",
    marginBottom: 24,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#7dd3fc",
  },

  loader: { marginTop: 40 },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  badgeCard: {
    width: "47%",
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    gap: 6,
  },
  badgeCardEarned: {
    backgroundColor: "rgba(167,139,250,0.08)",
    borderColor: "rgba(167,139,250,0.2)",
  },
  badgeIcon: { alignItems: "center", justifyContent: "center" },
  badgeIconLocked: { opacity: 0.3 },
  badgeName: { fontSize: 13, fontWeight: "700", color: "#1e293b", textAlign: "center" },
  badgeNameLocked: { color: "rgba(0,0,0,0.55)" },
  badgeDate: { fontSize: 10, color: "#34d399", fontWeight: "600" },
  badgeLocked: { fontSize: 10, color: "rgba(0,0,0,0.55)" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalCard: {
    width: "100%",
    borderRadius: 24,
    backgroundColor: "#f0fdfa",
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  modalIcon: { fontSize: 56, marginBottom: 12 },
  modalName: { fontSize: 22, fontWeight: "800", color: "#1e293b", marginBottom: 8 },
  modalDesc: { fontSize: 14, color: "#475569", textAlign: "center", lineHeight: 20 },
  modalDivider: { height: 1, backgroundColor: "rgba(0,0,0,0.06)", width: "100%", marginVertical: 16 },
  modalCriteria: { fontSize: 13, color: "#7dd3fc", fontWeight: "600" },
  modalCategory: { fontSize: 11, color: "#64748b", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 },
  modalClose: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.06)" },
  modalCloseText: { fontSize: 14, fontWeight: "600", color: "#1e293b" },
});
