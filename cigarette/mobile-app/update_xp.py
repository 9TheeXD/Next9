import re
import os

def update_quiz():
    with open("src/app/quiz/[id].tsx", "r") as f:
        content = f.read()

    # Add Gamification context
    content = content.replace(
        'import { api } from "@/lib/api";',
        'import { api } from "@/lib/api";\nimport { useGamification } from "@/contexts/GamificationContext";'
    )

    # Add hook usage
    content = content.replace(
        '  const { id } = useLocalSearchParams<{ id: string }>();',
        '  const { id } = useLocalSearchParams<{ id: string }>();\n  const { addXP } = useGamification();'
    )

    # Update submit logic
    submit_logic_old = """      // Finish quiz
      setSubmitting(true);
      try {
        await api.postQuizResult({
          quizId: quiz.id,
          score: selectedOption === question.correctAnswerIndex ? score + 1 : score,
          maxScore: quiz.questions.length,
        });
      } catch (err) {
        // fail silently for now
      } finally {
        setSubmitting(false);
        setIsFinished(true);
      }"""
    
    submit_logic_new = """      // Finish quiz
      setSubmitting(true);
      const finalScore = selectedOption === question.correctAnswerIndex ? score + 1 : score;
      try {
        await api.postQuizResult({
          quizId: quiz.id,
          score: finalScore,
          maxScore: quiz.questions.length,
        });
        if (finalScore === quiz.questions.length) {
          addXP(100, "ตอบคำถามถูกต้องทั้งหมด! รับ XP พิเศษ");
        }
      } catch (err) {
        // fail silently for now
      } finally {
        setSubmitting(false);
        setIsFinished(true);
      }"""
    
    content = content.replace(submit_logic_old, submit_logic_new)

    # Change Back button text and route
    content = content.replace(
        '          <Pressable style={styles.button} onPress={() => router.back()}>\n            <Text style={styles.buttonText}>Back to Health</Text>\n          </Pressable>',
        '          <Pressable style={styles.button} onPress={() => router.replace("/(tabs)/knowledge")}>\n            <Text style={styles.buttonText}>กลับไปที่ความรู้</Text>\n          </Pressable>'
    )
    
    content = content.replace("Quiz Completed!", "ทำแบบทดสอบเสร็จสิ้น!")
    content = content.replace("You scored {score} out of {quiz.questions.length}", "คุณได้คะแนน {score} จาก {quiz.questions.length}")
    content = content.replace(
        '            {score === quiz.questions.length\n              ? "Perfect score! You might have earned a new badge!"\n              : "Great job learning more about your journey."}',
        '            {score === quiz.questions.length\n              ? "ยอดเยี่ยม! คุณตอบถูกหมดเลย รับโบนัส 100 XP"\n              : "เก่งมาก! ความรู้จะช่วยให้คุณเลิกบุหรี่ได้สำเร็จ"}'
    )

    with open("src/app/quiz/[id].tsx", "w") as f:
        f.write(content)

def update_profile():
    with open("src/app/(tabs)/profile.tsx", "r") as f:
        content = f.read()

    # We want to replace the whole Badge Section with a button
    
    badges_section_start = content.find('{/* Badges Section */}')
    badges_section_end = content.find('{/* Smoking settings */}')
    
    if badges_section_start != -1 and badges_section_end != -1:
        new_badges_section = """{/* Badges Section */}
        <Pressable 
          style={[styles.settingsCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
          onPress={() => router.push('/badges')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(167, 139, 250, 0.15)', justifyContent: 'center', alignItems: 'center' }}>
              <Feather name="award" size={20} color="#a78bfa" />
            </View>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>เหรียญตราและภารกิจ</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>ดูความสำเร็จและภารกิจของคุณ</Text>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.3)" />
        </Pressable>

        """
        content = content[:badges_section_start] + new_badges_section + content[badges_section_end:]

    with open("src/app/(tabs)/profile.tsx", "w") as f:
        f.write(content)

def create_badges_screen():
    code = """import React, { useEffect, useState, useCallback } from "react";
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
  const { level, xp, nextLevelXP, progress } = useGamification();
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
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerBarTitle}>เหรียญตราและภารกิจ</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
            <Text style={styles.missionReward}>+10 XP</Text>
          </View>
          <Feather name="check-circle" size={24} color="#34d399" />
        </View>

        <View style={styles.missionCard}>
          <View style={styles.missionInfo}>
            <Text style={styles.missionName}>เล่นมินิเกมคลายเครียด</Text>
            <Text style={styles.missionReward}>+20 XP</Text>
          </View>
          <Feather name="circle" size={24} color="rgba(255,255,255,0.3)" />
        </View>

        <View style={styles.missionCard}>
          <View style={styles.missionInfo}>
            <Text style={styles.missionName}>อ่านความรู้ 1 บทความสมบูรณ์</Text>
            <Text style={styles.missionReward}>+50 XP (โบนัส!)</Text>
          </View>
          <Feather name="circle" size={24} color="rgba(255,255,255,0.3)" />
        </View>

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
          <ActivityIndicator color="#a78bfa" size="large" style={styles.loader} />
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
                      color={isEarned ? "#a78bfa" : "rgba(255,255,255,0.35)"} 
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
                      <Feather name="lock" size={10} color="rgba(255,255,255,0.25)" />
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
                color="#a78bfa" 
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
  safeArea: { flex: 1, backgroundColor: "#0b0f1a" },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  backButton: { padding: 8 },
  headerBarTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  
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
  xpTitle: { fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 8, fontWeight: "600" },
  xpRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 12 },
  xpValue: { fontSize: 48, fontWeight: "900", color: "#fbbf24", letterSpacing: -1 },
  xpLabel: { fontSize: 20, fontWeight: "700", color: "#fbbf24" },
  levelText: { fontSize: 16, fontWeight: "700", color: "#fff", marginBottom: 12 },
  levelProgressBg: { width: "100%", height: 8, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  levelProgressFill: { height: "100%", backgroundColor: "#fbbf24", borderRadius: 4 },
  levelNext: { fontSize: 12, color: "rgba(255,255,255,0.4)" },

  sectionHeader: { marginBottom: 16 },
  sectionTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  subtitle: { fontSize: 14, color: "rgba(255,255,255,0.45)", marginTop: 4 },

  missionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  missionInfo: { flex: 1 },
  missionName: { fontSize: 16, fontWeight: "600", color: "#fff", marginBottom: 4 },
  missionReward: { fontSize: 13, color: "#fbbf24", fontWeight: "700" },

  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 24,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#a78bfa",
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
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    gap: 6,
  },
  badgeCardEarned: {
    backgroundColor: "rgba(167,139,250,0.08)",
    borderColor: "rgba(167,139,250,0.2)",
  },
  badgeIcon: { alignItems: "center", justifyContent: "center" },
  badgeIconLocked: { opacity: 0.3 },
  badgeName: { fontSize: 13, fontWeight: "700", color: "#fff", textAlign: "center" },
  badgeNameLocked: { color: "rgba(255,255,255,0.35)" },
  badgeDate: { fontSize: 10, color: "#34d399", fontWeight: "600" },
  badgeLocked: { fontSize: 10, color: "rgba(255,255,255,0.25)" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalCard: {
    width: "100%",
    borderRadius: 24,
    backgroundColor: "#1a1f2e",
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  modalIcon: { fontSize: 56, marginBottom: 12 },
  modalName: { fontSize: 22, fontWeight: "800", color: "#fff", marginBottom: 8 },
  modalDesc: { fontSize: 14, color: "rgba(255,255,255,0.6)", textAlign: "center", lineHeight: 20 },
  modalDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", width: "100%", marginVertical: 16 },
  modalCriteria: { fontSize: 13, color: "#a78bfa", fontWeight: "600" },
  modalCategory: { fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 },
  modalClose: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)" },
  modalCloseText: { fontSize: 14, fontWeight: "600", color: "#fff" },
});
"""
    with open("src/app/badges.tsx", "w") as f:
        f.write(code)

update_quiz()
update_profile()
create_badges_screen()
