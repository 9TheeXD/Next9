import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, RefreshControl, Dimensions } from "react-native";
import { api } from "@/lib/api";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { DailyLog } from "@/types";
import { SkeletonCard, Skeleton } from "@/components/Skeleton";

interface FamilySummary {
  smokerName: string;
  targetCigarettes: number | null;
  xp: number;
  cigarettesSmoked: number;
  cravingCount: number;
  mood: string;
  notes: string;
  followedSmokers?: { id: string; displayId: string; displayName: string }[];
  currentSmokerId?: string;
}

export default function FamilyDashboard() {
  const [summary, setSummary] = useState<FamilySummary | null>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetSmokerId, setTargetSmokerId] = useState<string | undefined>(undefined);
  const router = useRouter();

  const fetchSummary = async (isBackground = false) => {
    try {
      if (!isBackground) setError(null);
      const [resSummary, resHistory] = await Promise.all([
        api.getFamilySummary(targetSmokerId) as any,
        api.getFamilyHistory(7, 0, targetSmokerId) as any
      ]);
      
      if (resSummary.success && resSummary.data) {
        setSummary(resSummary.data);
        if (!targetSmokerId && resSummary.data.currentSmokerId) {
          setTargetSmokerId(resSummary.data.currentSmokerId);
        }
      } else {
        setError(resSummary.error || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
      }
      
      if (resHistory.success && resHistory.data) {
        setRecentLogs(resHistory.data.logs.reverse()); // Reverse to show oldest left, newest right
      }
      
      // Check for PWA updates when user manually refreshes
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => reg.update()).catch(console.error);
      }
    } catch (err) {
      setError((err as Error).message || "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(() => {
      fetchSummary(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [targetSmokerId]);

  if (loading && !summary) {
    return (
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={{ marginBottom: 24, marginTop: 12 }}>
          <Skeleton width="60%" height={26} borderRadius={8} style={{ marginBottom: 8 }} />
          <Skeleton width="40%" height={16} borderRadius={6} />
        </View>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  if (error) {
    const isNotLinked = error.includes("No linked smoker found") || error.includes("404");
    return (
      <View style={styles.center}>
        <Feather name={isNotLinked ? "link" : "alert-circle"} size={48} color={isNotLinked ? "#38bdf8" : "#f87171"} style={{ marginBottom: 16 }} />
        <Text style={[styles.errorText, isNotLinked && { color: "#1e293b", fontSize: 18, fontWeight: "600", marginBottom: 8 }]}>
          {isNotLinked ? "คุณยังไม่ได้เชื่อมต่อกับผู้สูบ" : error}
        </Text>
        {isNotLinked && (
          <>
            <Text style={{ textAlign: "center", color: "#64748b", marginBottom: 24, paddingHorizontal: 32 }}>
              กรุณาเชื่อมต่อรหัสประจำตัวของผู้สูบ เพื่อเริ่มติดตามข้อมูล
            </Text>
            <Pressable 
              style={{ backgroundColor: "#38bdf8", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
              onPress={() => router.push("/(auth)/follow" as any)}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>ไปที่หน้าเชื่อมต่อ</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  if (!summary) return null;

  return (
    <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchSummary} tintColor="#38bdf8" />}
    >
      {summary.followedSmokers && summary.followedSmokers.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.smokerList}>
          {summary.followedSmokers.map((s) => (
            <Pressable 
              key={s.id} 
              style={[styles.smokerChip, targetSmokerId === s.id && styles.smokerChipActive]}
              onPress={() => setTargetSmokerId(s.id)}
            >
              <Text style={[styles.smokerChipText, targetSmokerId === s.id && styles.smokerChipTextActive]}>
                {s.displayName}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.header}>
        <Text style={styles.title}>ติดตามผลของ {summary.smokerName || "ผู้สูบ"}</Text>
        <Text style={styles.subtitle}>นี่คือข้อมูลสรุปของวันนี้</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Feather name="activity" size={24} color="#38bdf8" />
          <Text style={styles.cardTitle}>จำนวนบุหรี่ที่สูบวันนี้</Text>
        </View>
        <Text style={styles.bigValue}>
          {summary.cigarettesSmoked}
          {summary.targetCigarettes ? <Text style={styles.targetText}> / {summary.targetCigarettes} มวน</Text> : <Text style={styles.targetText}> มวน</Text>}
        </Text>
      </View>

      <View style={styles.rowCards}>
        <View style={[styles.card, styles.halfCard]}>
          <Feather name="star" size={20} color="#fcd34d" style={{ marginBottom: 8 }} />
          <Text style={styles.cardTitle}>XP สะสม</Text>
          <Text style={styles.cardValue}>{summary.xp} XP</Text>
        </View>
        <View style={[styles.card, styles.halfCard]}>
          <Feather name="alert-triangle" size={20} color="#f87171" style={{ marginBottom: 8 }} />
          <Text style={styles.cardTitle}>ความอยากสูบ</Text>
          <Text style={styles.cardValue}>{summary.cravingCount} ครั้ง</Text>
        </View>
      </View>
      <View style={styles.rowCards}>
        <View style={[styles.card, { flex: 1, marginBottom: 0 }]}>
          <Feather name="smile" size={20} color="#34d399" style={{ marginBottom: 8 }} />
          <Text style={styles.cardTitle}>อารมณ์/ความรู้สึก</Text>
          <Text style={styles.cardValue}>{summary.mood}</Text>
        </View>
      </View>

      {summary.notes ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="file-text" size={20} color="#7dd3fc" />
            <Text style={styles.cardTitle}>โน้ตจากผู้สูบ</Text>
          </View>
          <Text style={styles.noteText}>{summary.notes}</Text>
        </View>
      ) : null}

      {/* Simple Bar Chart for recent 7 days */}
      {recentLogs.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="bar-chart-2" size={20} color="#8b5cf6" />
            <Text style={styles.cardTitle}>แนวโน้ม 7 วันล่าสุด (มวน)</Text>
          </View>
          <View style={styles.chartContainer}>
            {recentLogs.map((log, index) => {
              const maxVal = Math.max(...recentLogs.map(l => l.cigarettesSmoked), summary.targetCigarettes || 10, 1);
              const heightPct = Math.min((log.cigarettesSmoked / maxVal) * 100, 100);
              const dateObj = new Date(log.logDate);
              const dateStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;
              const isOverTarget = summary.targetCigarettes && log.cigarettesSmoked > summary.targetCigarettes;
              
              return (
                <View key={index} style={styles.barCol}>
                  <Text style={styles.barValue}>{log.cigarettesSmoked}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: `${heightPct}%`, backgroundColor: isOverTarget ? '#f87171' : '#38bdf8' }]} />
                  </View>
                  <Text style={styles.barDate}>{dateStr}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Floating Chat Icon (Bottom Right) */}
      <Pressable 
        style={styles.chatFloatingButton}
        onPress={() => router.push('/chat' as any)}
      >
        <Feather name="message-circle" size={24} color="#ffffff" />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0fdfa",
    padding: 24,
  },
  errorText: {
    color: "#f87171",
    fontSize: 16,
    textAlign: "center",
  },
  smokerList: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  smokerChip: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  smokerChipActive: {
    backgroundColor: '#38bdf8',
    borderColor: '#0284c7',
  },
  smokerChipText: {
    color: '#0369a1',
    fontWeight: '600',
    fontSize: 14,
  },
  smokerChipTextActive: {
    color: '#ffffff',
  },
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: "#f0fdfa",
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#475569",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    color: "#475569",
    fontWeight: "500",
  },
  bigValue: {
    fontSize: 48,
    fontWeight: "800",
    color: "#1e293b",
  },
  targetText: {
    fontSize: 20,
    color: "#475569",
    fontWeight: "600",
  },
  rowCards: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  halfCard: {
    flex: 1,
    marginBottom: 0,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1e293b",
  },
  noteText: {
    fontSize: 16,
    color: "#475569",
    lineHeight: 24,
    fontStyle: "italic",
    backgroundColor: "#f8fafc",
    padding: 16,
    borderRadius: 12,
  },
  chatFloatingButton: {
    position: "absolute",
    bottom: 24,
    right: 24,
    backgroundColor: "#38bdf8",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 16,
    height: 180,
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
  },
  barTrack: {
    height: 120,
    width: 20,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginVertical: 6,
  },
  barFill: {
    width: '100%',
    borderRadius: 10,
  },
  barValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  barDate: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  barWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    width: 30,
  },
  bar: {
    width: 24,
    borderRadius: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  barLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 4,
  }
});
