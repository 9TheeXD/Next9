import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useGamification } from '@/contexts/GamificationContext';
import CircularProgress from '@/components/CircularProgress';

export default function WeeklyQuests() {
  const { 
    weeklyMissions, 
    thisWeekCigs, 
    weeklyGoalCigs,
    cravingDays,
    knowledgeDays,
    loggedDays,
    claimWeeklyMission 
  } = useGamification();

  const hasGoal = weeklyGoalCigs !== null;
  const reductionMet = hasGoal && thisWeekCigs <= (weeklyGoalCigs as number);
  const reductionClaimed = weeklyMissions.reduction;

  const renderQuestItem = (
    title: string, 
    desc: string, 
    xp: number, 
    isMet: boolean, 
    isClaimed: boolean, 
    onClaim: () => void,
    progressText: string,
    progressPercent: number
  ) => (
    <View style={styles.missionCard}>
      <View style={styles.missionInfo}>
        <Text style={styles.missionName}>{title}</Text>
        <Text style={styles.missionDesc}>{desc}</Text>
        <View style={styles.rewardRow}>
          <Text style={styles.missionReward}>+{xp} XP</Text>
          <Text style={styles.progressTextInline}>{progressText}</Text>
        </View>
      </View>
      
      {isClaimed ? (
        <Feather name="check-circle" size={28} color="#34d399" />
      ) : isMet ? (
        <Pressable style={styles.claimButton} onPress={onClaim}>
          <Text style={styles.claimButtonText}>รับรางวัล</Text>
        </Pressable>
      ) : (
        <CircularProgress size={28} strokeWidth={3} progress={progressPercent} color="#7dd3fc" unfilledColor="rgba(0,0,0,0.1)" />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>ภารกิจประจำสัปดาห์</Text>
      </View>

      {renderQuestItem(
        "นักสู้ผู้มุ่งมั่น",
        hasGoal ? `ลดสูบให้เหลือไม่เกิน ${weeklyGoalCigs} มวน` : "กำลังรวบรวมข้อมูลสัปดาห์ก่อน",
        1000,
        reductionMet,
        reductionClaimed,
        () => claimWeeklyMission('reduction'),
        hasGoal ? `${thisWeekCigs} / ${weeklyGoalCigs} มวน` : `0 / 0 มวน`,
        hasGoal ? Math.min(1, thisWeekCigs / Math.max(1, weeklyGoalCigs as number)) : 0
      )}

      {renderQuestItem(
        "ยอดมนุษย์ใจแข็ง",
        "เอาชนะความอยากสูบด้วย SOS (5 ครั้ง/สัปดาห์)",
        300,
        cravingDays >= 5, 
        weeklyMissions.craving,
        () => claimWeeklyMission('craving'),
        `${Math.min(5, cravingDays)} / 5 วัน`,
        Math.min(1, cravingDays / 5)
      )}

      {renderQuestItem(
        "นักเรียนรู้ตัวยง",
        "ทำภารกิจรายวัน อ่านบทความ/แบบทดสอบ (5 วัน)",
        400,
        knowledgeDays >= 5, 
        weeklyMissions.knowledge,
        () => claimWeeklyMission('knowledge'),
        `${Math.min(5, knowledgeDays)} / 5 วัน`,
        Math.min(1, knowledgeDays / 5)
      )}

      {renderQuestItem(
        "ความสม่ำเสมอคือพลัง",
        "บันทึกพฤติกรรมประจำวัน ครบ 7 วัน",
        500,
        loggedDays >= 7, 
        weeklyMissions.consistency,
        () => claimWeeklyMission('consistency'),
        `${Math.min(7, loggedDays)} / 7 วัน`,
        Math.min(1, loggedDays / 7)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 0,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
  },
  missionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  missionInfo: {
    flex: 1,
    paddingRight: 16,
  },
  missionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  missionDesc: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 6,
  },
  missionReward: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fbbf24',
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTextInline: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  claimButton: {
    backgroundColor: '#34d399',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  claimButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
});
