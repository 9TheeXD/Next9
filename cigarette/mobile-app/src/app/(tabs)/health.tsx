import React from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { getHealthTimeline } from "@/utils/healthTimeline";
import { useDailyLog } from "@/hooks/useDailyLog";
import { calculateMoneySaved, formatCurrency } from "@/utils/calculations";

export default function HealthScreen() {
  const { user } = useAuth();
  const { recentLogs } = useDailyLog();

  const milestones = getHealthTimeline(user?.quitDate ?? null);

  const baseline = user?.cigarettesPerDay ?? 0;
  const totalAvoided = recentLogs.reduce((sum, log) => {
    return sum + Math.max(0, baseline - log.cigarettesSmoked);
  }, 0);
  const moneySaved = calculateMoneySaved(
    totalAvoided,
    user?.pricePerPack ?? 0,
    user?.cigarettesPerPack ?? 20
  );

  // Equivalency for fun
  const coffeesEquiv = Math.floor(moneySaved / 5);
  const movieTicketsEquiv = Math.floor(moneySaved / 15);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        
      >
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name="heart" size={28} color="#ef4444" />
            <Text style={styles.title}>สุขภาพและการเงิน</Text>
          </View>
          <Text style={styles.subtitle}>การเดินทางฟื้นฟูร่างกายของคุณ</Text>
        </View>

        {/* Money Saved Card */}
        <View style={styles.moneySavedCard}>
          <Text style={styles.moneyLabel}>ประหยัดเงินได้ทั้งหมด</Text>
          <Text style={styles.moneyValue}>{formatCurrency(moneySaved)}</Text>
          <View style={styles.equivRow}>
            <View style={styles.equivItem}>
              <Feather name="coffee" size={20} color="#ea580c" style={{ marginBottom: 4 }} />
              <Text style={styles.equivValue}>{coffeesEquiv}</Text>
              <Text style={styles.equivLabel}>กาแฟ</Text>
            </View>
            <View style={styles.equivItem}>
              <Feather name="film" size={20} color="#6366f1" style={{ marginBottom: 4 }} />
              <Text style={styles.equivValue}>{movieTicketsEquiv}</Text>
              <Text style={styles.equivLabel}>ดูหนัง</Text>
            </View>
            <View style={styles.equivItem}>
              <Feather name="minus-circle" size={20} color="#e11d48" style={{ marginBottom: 4 }} />
              <Text style={styles.equivValue}>{totalAvoided}</Text>
              <Text style={styles.equivLabel}>ลดบุหรี่ได้</Text>
            </View>
          </View>
        </View>

        {/* Health Recovery Timeline */}
        <Text style={styles.timelineTitle}>ไทม์ไลน์การฟื้นฟู</Text>
        <View style={styles.timeline}>
          {milestones.map((milestone, i) => (
            <View key={i} style={styles.milestoneRow}>
              {/* Line connector */}
              <View style={styles.lineColumn}>
                <View
                  style={[
                    styles.dot,
                    milestone.achieved ? styles.dotAchieved : styles.dotLocked,
                  ]}
                >
                  {milestone.achieved ? (
                    <Feather name="check" size={14} color="#10b981" />
                  ) : (
                    <Feather name={milestone.icon as keyof typeof Feather.glyphMap} size={12} color={milestone.color + "99"} />
                  )}
                </View>
                {i < milestones.length - 1 && (
                  <View
                    style={[
                      styles.line,
                      milestone.achieved ? styles.lineAchieved : styles.lineLocked,
                    ]}
                  />
                )}
              </View>

              {/* Content */}
              <View
                style={[
                  styles.milestoneCard,
                  milestone.achieved && styles.milestoneCardAchieved,
                ]}
              >
                <View style={styles.milestoneTitleContainer}>
                  <Feather 
                    name={milestone.icon as keyof typeof Feather.glyphMap} 
                    size={16} 
                    color={milestone.achieved ? milestone.color : milestone.color + "99"} 
                  />
                  <Text
                    style={[
                      styles.milestoneTitle,
                      !milestone.achieved && styles.milestoneTitleLocked,
                    ]}
                  >
                    {milestone.title}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.milestoneDesc,
                    !milestone.achieved && styles.milestoneDescLocked,
                  ]}
                >
                  {milestone.description}
                </Text>
              </View>
            </View>
          ))}
        </View>



      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f0fdfa" },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: "800", color: "#1e293b", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: "#475569", marginTop: 4 },

  moneySavedCard: {
    padding: 24,
    borderRadius: 24,
    backgroundColor: "rgba(56,189,248,0.12)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.25)",
    marginBottom: 28,
    alignItems: "center",
  },
  moneyLabel: { fontSize: 12, color: "#475569", fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 },
  moneyValue: { fontSize: 44, fontWeight: "900", color: "#10b981", marginVertical: 8 },
  equivRow: { flexDirection: "row", gap: 24, marginTop: 8 },
  equivItem: { alignItems: "center" },
  equivValue: { fontSize: 18, fontWeight: "800", color: "#1e293b" },
  equivLabel: { fontSize: 10, color: "#64748b", fontWeight: "600" },

  timelineTitle: { fontSize: 18, fontWeight: "700", color: "#1e293b", marginBottom: 16 },
  timeline: { paddingLeft: 4 },
  milestoneRow: { flexDirection: "row", minHeight: 80 },
  lineColumn: { width: 32, alignItems: "center" },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dotAchieved: { backgroundColor: "rgba(16,185,129,0.15)", borderWidth: 2, borderColor: "#10b981" },
  dotLocked: { backgroundColor: "#f0fdfa", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  line: { width: 2, flex: 1 },
  lineAchieved: { backgroundColor: "rgba(16,185,129,0.3)" },
  lineLocked: { backgroundColor: "rgba(0,0,0,0.06)" },
  milestoneCard: {
    flex: 1,
    marginLeft: 12,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  milestoneCardAchieved: {
    backgroundColor: "rgba(16,185,129,0.05)",
    borderColor: "rgba(16,185,129,0.2)",
  },
  milestoneTitleContainer: { flexDirection: "row", alignItems: "center", gap: 6 },
  milestoneTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  milestoneTitleLocked: { color: "#475569" },
  milestoneDesc: { fontSize: 12, color: "#475569", marginTop: 4, lineHeight: 17 },
  milestoneDescLocked: { color: "rgba(0,0,0,0.6)" },

});
