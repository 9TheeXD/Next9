import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useDailyLog } from "@/hooks/useDailyLog";
import { calculateStreak } from "@/utils/calculations";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import type { DailyLog } from "@/types";
import { LinearGradient } from "expo-linear-gradient";

interface TrendPoint {
  date: string;
  cigarettesSmoked: number;
  cravingCount: number;
}

interface FamilySummary {
  totalLoggedDays: number;
  totalCravings: number;
  totalArticlesRead: number;
  totalQuizzesDone: number;
  totalGamesPlayed: number;
  totalSoundsListened: number;
  xp: number;
  targetCigarettes: number | null;
  smokingType: string;
  totalAvoided: number;
  totalMoneySaved: number;
  currentStreak: number;
  badgesEarned: number;
}

function FamilyHistoryView() {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [summary, setSummary] = useState<FamilySummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<'summary' | 'timeline' | 'trend'>('summary');
  const limit = 50;

  const fetchHistory = async (pageNum: number, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const skip = (pageNum - 1) * limit;
      const res = await api.getFamilyHistory(limit, skip) as any;
      if (res.success && res.data) {
        setLogs(prev => pageNum === 1 ? res.data!.logs : [...prev, ...res.data!.logs]);
        setHasMore((res.data.logs || []).length === limit);
        if (pageNum === 1 && res.data.summary) {
          setSummary(res.data.summary);
        }
        if (pageNum === 1 && res.data.trend) {
          setTrend(res.data.trend);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!isRefresh) setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchHistory(1, true);
    
    // Check for PWA updates when user manually refreshes
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => reg.update()).catch(console.error);
    }
  }, []);

  React.useEffect(() => {
    fetchHistory(page);
  }, [page]);

  if (loading && logs.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  // Trend analysis
  const getTrendAnalysis = () => {
    if (trend.length < 2) return { text: 'ข้อมูลยังไม่เพียงพอ', color: '#64748b', icon: 'minus' as const };
    const half = Math.floor(trend.length / 2);
    const firstHalf = trend.slice(0, half);
    const secondHalf = trend.slice(half);
    const firstAvg = firstHalf.reduce((sum, t) => sum + t.cigarettesSmoked, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, t) => sum + t.cigarettesSmoked, 0) / secondHalf.length;
    
    if (firstAvg === 0 && secondAvg === 0) return { text: 'ไม่มีข้อมูลการสูบ', color: '#64748b', icon: 'minus' as const };
    
    const changePercent = firstAvg === 0 ? 100 : Math.round(((secondAvg - firstAvg) / firstAvg) * 100);
    
    if (changePercent < -5) return { text: `ลดลง ${Math.abs(changePercent)}%`, color: '#10b981', icon: 'trending-down' as const };
    if (changePercent > 5) return { text: `เพิ่มขึ้น ${Math.abs(changePercent)}%`, color: '#f43f5e', icon: 'trending-up' as const };
    return { text: 'คงที่', color: '#f59e0b', icon: 'minus' as const };
  };

  const trendAnalysis = getTrendAnalysis();
  const maxCig = trend.length > 0 ? Math.max(...trend.map(t => t.cigarettesSmoked), 1) : 1;

  const tabs = [
    { key: 'summary' as const, label: 'สรุป', icon: 'grid' as const },
    { key: 'timeline' as const, label: 'ประวัติ', icon: 'clock' as const },
    { key: 'trend' as const, label: 'แนวโน้ม', icon: 'trending-up' as const },
  ];

  return (
    <ScrollView 
      showsVerticalScrollIndicator={false} 
      style={styles.scroll} 
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#38bdf8']} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>ประวัติผู้สูบ</Text>
        <Text style={styles.subtitle}>ข้อมูลและกิจกรรมทั้งหมดของผู้สูบ</Text>
      </View>

      {/* Tab Navigation */}
      <View style={familyStyles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[familyStyles.tab, activeSection === tab.key && familyStyles.tabActive]}
            onPress={() => setActiveSection(tab.key)}
          >
            <Feather name={tab.icon} size={16} color={activeSection === tab.key ? '#0284c7' : '#94a3b8'} />
            <Text style={[familyStyles.tabText, activeSection === tab.key && familyStyles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ======= พาร์ท 1: Summary Grid ======= */}
      {activeSection === 'summary' && summary && (
        <View>
          {/* XP Banner */}
          <LinearGradient
            colors={['#38bdf8', '#34d399']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={familyStyles.xpBanner}
          >
            <View style={familyStyles.xpLeft}>
              <Feather name="award" size={28} color="#ffffff" />
              <View>
                <Text style={[familyStyles.xpLabel, { color: '#ffffff', opacity: 0.8 }]}>XP สะสมทั้งหมด</Text>
                <Text style={[familyStyles.xpValue, { color: '#ffffff' }]}>{summary.xp.toLocaleString()} XP</Text>
              </View>
            </View>
            <View style={[familyStyles.xpBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={[familyStyles.xpBadgeText, { color: '#ffffff' }]}>Lv.{Math.floor(summary.xp / 100) + 1}</Text>
            </View>
          </LinearGradient>

          <Text style={styles.sectionHeader}>สรุปกิจกรรมทั้งหมด</Text>
          <View style={familyStyles.summaryGrid}>
            {[
              { icon: 'flame' as const, value: `${summary.currentStreak} วัน`, label: 'สตรีคปัจจุบัน', color: '#f97316', bg: '#ffedd5' },
              { icon: 'minus-circle' as const, value: summary.totalAvoided.toLocaleString(), label: `ลดได้ (${summary.smokingType === 'POD' ? 'พัฟ' : 'มวน'})`, color: '#10b981', bg: '#d1fae5' },
              { icon: 'dollar-sign' as const, value: `฿${summary.totalMoneySaved.toLocaleString()}`, label: 'ประหยัดเงิน', color: '#f59e0b', bg: '#fef3c7' },
              { icon: 'award' as const, value: summary.badgesEarned, label: 'เหรียญตรา', color: '#8b5cf6', bg: '#ede9fe' },
              { icon: 'check-square' as const, value: summary.totalQuizzesDone, label: 'แบบทดสอบ', color: '#38bdf8', bg: '#e0f2fe' },
              { icon: 'alert-triangle' as const, value: summary.totalCravings, label: 'ความอยาก', color: '#ef4444', bg: '#fee2e2' },
              { icon: 'calendar' as const, value: summary.totalLoggedDays, label: 'กรอกบุหรี่ (วัน)', color: '#64748b', bg: '#f1f5f9' },
              { icon: 'book-open' as const, value: summary.totalArticlesRead, label: 'อ่านคู่มือ', color: '#14b8a6', bg: '#ccfbf1' },
              { icon: 'play-circle' as const, value: summary.totalGamesPlayed, label: 'เล่นเกม', color: '#f43f5e', bg: '#fce7f3' },
              { icon: 'mic' as const, value: summary.totalSoundsListened, label: 'ฟังเสียง', color: '#06b6d4', bg: '#cffafe' },
            ].map((item, i) => (
              <View key={i} style={[familyStyles.summaryBox, { backgroundColor: item.bg }]}>
                <View style={[familyStyles.summaryIconCircle, { backgroundColor: `${item.color}22` }]}>
                  <Feather name={item.icon as any} size={22} color={item.color} />
                </View>
                <Text style={familyStyles.summaryBoxValue}>{item.value}</Text>
                <Text style={familyStyles.summaryBoxLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ======= พาร์ท 2: Paginated Timeline ======= */}
      {activeSection === 'timeline' && (
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={[styles.sectionHeader, { marginBottom: 0 }]}>รายการประวัติ</Text>
            <Text style={styles.pageText}>
              หน้า {page} ({(page - 1) * limit + 1}-{Math.min(page * limit, (page - 1) * limit + logs.length)})
            </Text>
          </View>

          {logs.length === 0 ? (
            <View style={familyStyles.emptyState}>
              <Feather name="inbox" size={48} color="#cbd5e1" />
              <Text style={familyStyles.emptyText}>ยังไม่มีประวัติการบันทึก</Text>
            </View>
          ) : (
            logs.map((log) => (
              <View key={log.id} style={styles.logCard}>
                <View style={styles.logHeader}>
                  <Text style={styles.logDate}>
                    {new Date(log.logDate).toLocaleDateString("th-TH", {
                      year: "numeric", month: "short", day: "numeric"
                    })}
                  </Text>
                  {log.mood && <Text style={styles.logMood}>{log.mood}</Text>}
                </View>
                <View style={styles.logBody}>
                  <View style={styles.logStat}>
                    <Feather name="minus-circle" size={16} color="#ef4444" />
                    <Text style={styles.logStatText}>สูบไป {log.cigarettesSmoked} มวน</Text>
                  </View>
                  <View style={styles.logStat}>
                    <Feather name="activity" size={16} color="#f59e0b" />
                    <Text style={styles.logStatText}>ความอยาก {log.cravingCount} ครั้ง</Text>
                  </View>
                </View>
                {log.notes ? (
                  <Text style={styles.logNotes}>{log.notes}</Text>
                ) : null}
                
                {(log.articlesRead > 0 || log.gamesPlayed > 0 || log.soundsListened > 0) && (
                  <View style={styles.activityBadges}>
                    {log.articlesRead > 0 && <Text style={styles.activityBadge}><Feather name="book-open" size={12}/> อ่านคู่มือ {log.articlesRead}</Text>}
                    {log.gamesPlayed > 0 && <Text style={styles.activityBadge}><Feather name="play-circle" size={12}/> เล่นเกม {log.gamesPlayed}</Text>}
                    {log.soundsListened > 0 && <Text style={styles.activityBadge}><Feather name="mic" size={12}/> ฟังเสียง {log.soundsListened}</Text>}
                  </View>
                )}
              </View>
            ))
          )}

          <View style={styles.paginationControls}>
            <Pressable 
              style={[styles.pageButton, page === 1 && styles.pageButtonDisabled]}
              onPress={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              <Feather name="chevron-left" size={24} color={page === 1 ? "#cbd5e1" : "#0ea5e9"} />
              <Text style={[styles.pageButtonText, page === 1 && {color: "#cbd5e1"}]}>ก่อนหน้า</Text>
            </Pressable>
            
            {loading && <ActivityIndicator size="small" color="#38bdf8" />}

            <Pressable 
              style={[styles.pageButton, !hasMore && styles.pageButtonDisabled]}
              onPress={() => setPage(p => p + 1)}
              disabled={!hasMore || loading}
            >
              <Text style={[styles.pageButtonText, !hasMore && {color: "#cbd5e1"}]}>ถัดไป</Text>
              <Feather name="chevron-right" size={24} color={!hasMore ? "#cbd5e1" : "#0ea5e9"} />
            </Pressable>
          </View>
        </View>
      )}

      {/* ======= พาร์ท 3: Trend Chart + XP ======= */}
      {activeSection === 'trend' && (
        <View>
          {/* Trend Status Card */}
          <View style={familyStyles.trendCard}>
            <View style={familyStyles.trendHeader}>
              <Feather name={trendAnalysis.icon} size={24} color={trendAnalysis.color} />
              <Text style={[familyStyles.trendStatus, { color: trendAnalysis.color }]}>{trendAnalysis.text}</Text>
            </View>
            <Text style={familyStyles.trendSubtext}>เปรียบเทียบครึ่งแรก vs ครึ่งหลังของ 30 วันล่าสุด</Text>
          </View>

          {/* Chart */}
          <View style={familyStyles.chartCard}>
            <Text style={familyStyles.chartTitle}>แนวโน้มการสูบ (30 วันล่าสุด)</Text>
            {trend.length === 0 ? (
              <View style={familyStyles.emptyState}>
                <Feather name="bar-chart" size={48} color="#cbd5e1" />
                <Text style={familyStyles.emptyText}>ยังไม่มีข้อมูลสำหรับแสดงกราฟ</Text>
              </View>
            ) : (
              <View>
                {/* Y-axis labels */}
                <View style={familyStyles.yAxisLabels}>
                  <Text style={familyStyles.yLabel}>{maxCig}</Text>
                  <Text style={familyStyles.yLabel}>{Math.round(maxCig / 2)}</Text>
                  <Text style={familyStyles.yLabel}>0</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={familyStyles.chartScroll}>
                  <View style={familyStyles.barsContainer}>
                    {trend.map((point, index) => {
                      const heightPct = Math.max((point.cigarettesSmoked / maxCig) * 100, 3);
                      const isOverTarget = summary?.targetCigarettes && point.cigarettesSmoked > summary.targetCigarettes;
                      const dayLabel = new Date(point.date).toLocaleDateString("th-TH", { day: 'numeric' });

                      return (
                        <View key={index} style={familyStyles.barCol}>
                          <Text style={familyStyles.barTopValue}>{point.cigarettesSmoked}</Text>
                          <View style={[
                            familyStyles.chartBar, 
                            { 
                              height: `${heightPct}%`,
                              backgroundColor: isOverTarget ? '#f43f5e' : '#38bdf8',
                            }
                          ]} />
                          <Text style={familyStyles.barBottomLabel}>{dayLabel}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
                {summary?.targetCigarettes && (
                  <View style={familyStyles.legendRow}>
                    <View style={[familyStyles.legendDot, { backgroundColor: '#38bdf8' }]} />
                    <Text style={familyStyles.legendText}>ไม่เกินเป้า</Text>
                    <View style={[familyStyles.legendDot, { backgroundColor: '#f43f5e', marginLeft: 12 }]} />
                    <Text style={familyStyles.legendText}>เกินเป้า ({summary.targetCigarettes} มวน)</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* XP Summary */}
          {summary && (
            <LinearGradient
              colors={['#38bdf8', '#34d399']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={familyStyles.xpSummaryCard}
            >
              <View style={familyStyles.xpSummaryTop}>
                <Feather name="award" size={32} color="#ffffff" />
                <View style={{ marginLeft: 12 }}>
                  <Text style={familyStyles.xpSummaryLabel}>XP สะสม</Text>
                  <Text style={familyStyles.xpSummaryValue}>{summary.xp.toLocaleString()} XP</Text>
                </View>
              </View>
              <View style={familyStyles.xpProgressBar}>
                <View style={[familyStyles.xpProgressFill, { width: `${Math.min((summary.xp % 100), 100)}%` }]} />
              </View>
              <Text style={familyStyles.xpProgressText}>
                อีก {100 - (summary.xp % 100)} XP จะขึ้นเลเวล {Math.floor(summary.xp / 100) + 2}
              </Text>
            </LinearGradient>
          )}

          {/* Quick Stats */}
          {summary && (
            <View style={familyStyles.quickStats}>
              <View style={familyStyles.quickStatItem}>
                <Text style={familyStyles.quickStatValue}>
                  {trend.length > 0 ? (trend.reduce((s, t) => s + t.cigarettesSmoked, 0) / trend.length).toFixed(1) : '0'}
                </Text>
                <Text style={familyStyles.quickStatLabel}>เฉลี่ย/วัน</Text>
              </View>
              <View style={familyStyles.quickStatDivider} />
              <View style={familyStyles.quickStatItem}>
                <Text style={familyStyles.quickStatValue}>
                  {trend.length > 0 ? Math.min(...trend.map(t => t.cigarettesSmoked)) : 0}
                </Text>
                <Text style={familyStyles.quickStatLabel}>น้อยสุด</Text>
              </View>
              <View style={familyStyles.quickStatDivider} />
              <View style={familyStyles.quickStatItem}>
                <Text style={familyStyles.quickStatValue}>
                  {trend.length > 0 ? Math.max(...trend.map(t => t.cigarettesSmoked)) : 0}
                </Text>
                <Text style={familyStyles.quickStatLabel}>มากสุด</Text>
              </View>
              <View style={familyStyles.quickStatDivider} />
              <View style={familyStyles.quickStatItem}>
                <Text style={familyStyles.quickStatValue}>{trend.length}</Text>
                <Text style={familyStyles.quickStatLabel}>วันที่มีข้อมูล</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

export default function HistoryScreen() {
  const { user } = useAuth();
  const { recentLogs, isLoading, hasMore, loadMoreLogs } = useDailyLog();
  const { currentStreak, longestStreak } = calculateStreak(recentLogs);

  if (user?.role === "FAMILY") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <FamilyHistoryView />
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>ประวัติ</Text>
          <Text style={styles.subtitle}>ภาพรวมและการบันทึกประวัติ</Text>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{currentStreak}</Text>
              <Text style={styles.statLabel}>วันที่ต่อเนื่อง</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{longestStreak}</Text>
              <Text style={styles.statLabel}>ต่อเนื่องนานที่สุด</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{recentLogs.length}</Text>
              <Text style={styles.statLabel}>วันที่บันทึกทั้งหมด</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionHeader}>ประวัติย้อนหลัง</Text>

        {recentLogs.map((log) => (
          <View key={log.id} style={styles.logCard}>
            <View style={styles.logHeader}>
              <Text style={styles.logDate}>
                {new Date(log.logDate).toLocaleDateString("th-TH", {
                  year: "numeric", month: "short", day: "numeric"
                })}
              </Text>
              {log.mood && <Text style={styles.logMood}>{log.mood}</Text>}
            </View>
            <View style={styles.logBody}>
              <View style={styles.logStat}>
                <Feather name="minus-circle" size={16} color="#ef4444" />
                <Text style={styles.logStatText}>สูบไป {log.cigarettesSmoked} มวน</Text>
              </View>
              <View style={styles.logStat}>
                <Feather name="activity" size={16} color="#f59e0b" />
                <Text style={styles.logStatText}>ความอยาก {log.cravingCount} ครั้ง</Text>
              </View>
            </View>
            {log.notes ? (
              <Text style={styles.logNotes}>{log.notes}</Text>
            ) : null}
          </View>
        ))}

        {hasMore && (
          <Pressable 
            style={styles.nextButton}
            onPress={() => loadMoreLogs()}
          >
            <Text style={styles.nextButtonText}>โหลดเพิ่มเติม</Text>
          </Pressable>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f0fdfa" },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: "800", color: "#1e293b", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: "#475569", marginTop: 4, lineHeight: 20 },
  
  statsCard: { padding: 18, borderRadius: 20, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", marginBottom: 24 },
  statRow: { flexDirection: "row", alignItems: "center" },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "800", color: "#1e293b" },
  statLabel: { fontSize: 10, color: "rgba(0,0,0,0.55)", fontWeight: "600", marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: "rgba(0,0,0,0.06)" },

  sectionHeader: { fontSize: 18, fontWeight: "700", color: "#1e293b", marginBottom: 16 },
  logCard: { backgroundColor: "#ffffff", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", marginBottom: 12 },
  logHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  logDate: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  logMood: { fontSize: 14 },
  logBody: { flexDirection: "row", gap: 16, marginBottom: 8 },
  logStat: { flexDirection: "row", alignItems: "center", gap: 6 },
  logStatText: { fontSize: 14, color: "#475569" },
  logNotes: { fontSize: 13, color: "#64748b", fontStyle: "italic", marginTop: 8 },
  
  nextButton: { paddingVertical: 14, backgroundColor: "rgba(56,189,248,0.1)", borderRadius: 12, alignItems: "center", marginTop: 12, borderWidth: 1, borderColor: "rgba(56,189,248,0.3)" },
  nextButtonText: { color: "#0284c7", fontWeight: "700" },
  
  // Family view specific styles
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  summaryItem: { width: "30%", alignItems: "center", marginBottom: 16 },
  summaryValue: { fontSize: 18, fontWeight: "800", color: "#1e293b", marginTop: 4 },
  summaryLabel: { fontSize: 10, color: "#64748b", textAlign: "center", marginTop: 2 },
  pageText: { fontSize: 13, color: "#64748b", fontWeight: "600" },
  paginationControls: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingHorizontal: 16 },
  pageButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "#e0f2fe", borderRadius: 8 },
  pageButtonDisabled: { backgroundColor: "#f1f5f9" },
  pageButtonText: { color: "#0ea5e9", fontWeight: "600" },
  activityBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.04)" },
  activityBadge: { backgroundColor: "#f1f5f9", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontSize: 11, color: "#475569", fontWeight: "500", overflow: "hidden" },
});

const familyStyles = StyleSheet.create({
  // Tab Navigation
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: '#e0f2fe',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  tabTextActive: {
    color: '#0284c7',
  },

  // XP Banner
  xpBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  xpLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  xpLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  xpValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fcd34d',
  },
  xpBadge: {
    backgroundColor: 'rgba(252,211,77,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  xpBadgeText: {
    color: '#fcd34d',
    fontWeight: '800',
    fontSize: 14,
  },

  // Summary Grid
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryBox: {
    width: '47%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  summaryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryBoxValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 2,
  },
  summaryBoxLabel: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
    textAlign: 'center',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 12,
    color: '#94a3b8',
    fontSize: 14,
  },

  // Trend Card
  trendCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  trendStatus: {
    fontSize: 20,
    fontWeight: '800',
  },
  trendSubtext: {
    fontSize: 12,
    color: '#94a3b8',
  },

  // Chart
  chartCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  yAxisLabels: {
    position: 'absolute',
    left: 0,
    top: 40,
    bottom: 20,
    width: 24,
    justifyContent: 'space-between',
    zIndex: 1,
  },
  yLabel: {
    fontSize: 9,
    color: '#94a3b8',
    textAlign: 'right',
  },
  chartScroll: {
    marginLeft: 28,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 160,
    gap: 4,
    paddingTop: 24,
  },
  barCol: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 28,
    height: '100%',
  },
  barTopValue: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 2,
  },
  chartBar: {
    width: 20,
    borderRadius: 4,
    minHeight: 4,
  },
  barBottomLabel: {
    fontSize: 9,
    color: '#94a3b8',
    marginTop: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    color: '#64748b',
  },

  // XP Summary Card
  xpSummaryCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  xpSummaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  xpSummaryLabel: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.9,
  },
  xpSummaryValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
  },
  xpProgressBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  xpProgressFill: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 4,
  },
  xpProgressText: {
    fontSize: 12,
    color: '#ffffff',
    opacity: 0.9,
    textAlign: 'center',
  },

  // Quick Stats
  quickStats: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  quickStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
  },
  quickStatLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignSelf: 'center',
  },
});
