import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable, Linking, Platform, DeviceEventEmitter, BackHandler } from "react-native";
import { useFocusEffect, useNavigation, useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAlert } from "@/contexts/AlertContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSounds } from "@/hooks/useAppSounds";
import { api } from "@/lib/api";
import { loadPlan, insights, type Insights } from "@/lib/quitPlan";
import { findGame, type GameDefinition } from "@/games";
import CravingJournal from "@/components/CravingJournal";
import VoiceMessages from "@/components/VoiceMessages";
import AlternativeActivities from "@/components/AlternativeActivities";
import GameLibrary from "@/components/GameLibrary";
import GameHost from "@/components/GameHost";
import CravingRescue from "@/components/CravingRescue";
import MoveBreak from "@/components/MoveBreak";
import SlipRecovery from "@/components/SlipRecovery";

type SOSView = "MENU" | "RESCUE" | "GAME" | "MOVE" | "SLIP" | "JOURNAL" | "VOICE_MSG" | "ACTIVITIES";
const VIEWS: SOSView[] = ["MENU", "RESCUE", "GAME", "MOVE", "SLIP", "JOURNAL", "VOICE_MSG", "ACTIVITIES"];

const TAB_BAR = {
  backgroundColor: "#f0fdfa",
  borderTopColor: "rgba(0,0,0,0.04)",
  borderTopWidth: 1,
  height: 65,
  paddingBottom: 8,
  paddingTop: 6,
};

export default function SOSScreen() {
  const { showAlert } = useAlert();
  const { user } = useAuth();
  const { playClick } = useAppSounds();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ view?: string; game?: string }>();
  const [currentView, setCurrentView] = useState<SOSView>("MENU");
  const [game, setGame] = useState<GameDefinition | null>(null);
  const [stats, setStats] = useState<Insights | null>(null);
  const router = useRouter();

  // Full-screen tools hide the tab bar
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: { ...TAB_BAR, display: currentView === "MENU" ? "flex" : "none" } } as any);
  }, [currentView, navigation]);

  const changeView = useCallback((v: SOSView) => {
    if (v === "MENU") {
      if (Platform.OS === "web" && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view")) {
        window.history.back();
      }
      setCurrentView("MENU");
      setGame(null);
    } else {
      if (Platform.OS === "web" && typeof window !== "undefined") window.history.pushState({}, "", `?view=${v}`);
      setCurrentView(v);
    }
  }, []);

  // Open straight into a view, e.g. /sos?view=RESCUE from the home screen. The param is cleared
  // afterwards so the next link with the same view opens it again.
  useEffect(() => {
    const v = (params.view || "").toUpperCase() as SOSView;
    if (!v || !VIEWS.includes(v) || v === "MENU") return;
    if (v === "GAME") {
      const g = findGame(params.game || "blocks");
      if (!g) return;
      setGame(g);
    }
    setCurrentView(v);
    router.setParams({ view: undefined, game: undefined } as any);
  }, [params.view, params.game, router]);

  // Browser back button returns to the menu
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onPop = () => {
      const v = (new URLSearchParams(window.location.search).get("view") || "MENU") as SOSView;
      setCurrentView(VIEWS.includes(v) ? v : "MENU");
      if (v === "MENU") setGame(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("reset_tab_sos", () => changeView("MENU"));
    return () => sub.remove();
  }, [changeView]);

  useFocusEffect(
    useCallback(() => {
      loadPlan(user?.id).then((p) => setStats(insights(p)));
      const onBack = () => {
        if (currentView !== "MENU") {
          changeView("MENU");
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [currentView, changeView, user?.id])
  );

  const openGame = (g: GameDefinition) => {
    playClick();
    setGame(g);
    changeView("GAME");
  };

  const handleFamilyAlert = async () => {
    try {
      await api.sendFamilyAlert();
      showAlert({ title: "ส่งแจ้งเตือนครอบครัวแล้ว", message: "แจ้งคนที่ติดตามคุณแล้วว่าตอนนี้ต้องการกำลังใจ", type: "success" });
    } catch {
      showAlert({ title: "ส่งไม่ได้", message: "ยังไม่มีครอบครัวที่ติดตามคุณ หรือเครือข่ายขัดข้อง", type: "error" });
    }
  };

  const handleQuickCall = () => {
    if (!user?.emergencyContact) {
      showAlert({ title: "ยังไม่มีเบอร์คนสนิท", message: "ตั้งค่าเบอร์คนสนิทได้ในหน้าโปรไฟล์", type: "warning" });
      return;
    }
    Linking.openURL(`tel:${user.emergencyContact.trim()}`);
  };

  // ── Full-screen views ─────────────────────────────────────────────────────
  if (currentView === "RESCUE") {
    return (
      <View style={styles.full}>
        <CravingRescue onClose={() => changeView("MENU")} />
      </View>
    );
  }
  if (currentView === "GAME" && game) {
    return (
      <View style={styles.full}>
        <GameHost game={game} onExit={() => changeView("MENU")} />
      </View>
    );
  }
  if (currentView === "MOVE" || currentView === "SLIP") {
    return (
      <LinearGradient colors={["#0b1027", "#1e1b4b", "#0f3b47"]} style={styles.full}>
        <View style={styles.darkHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.darkBack} accessibilityRole="button" accessibilityLabel="กลับ">
            <Feather name="chevron-left" size={22} color="#fff" />
            <Text style={styles.darkBackText}>กลับ</Text>
          </Pressable>
          <Text style={styles.darkTitle}>{currentView === "MOVE" ? "ขยับร่างกาย 4 นาที" : "เผลอสูบไป"}</Text>
          <View style={{ width: 70 }} />
        </View>
        {currentView === "MOVE" ? <MoveBreak onDone={() => changeView("MENU")} /> : <SlipRecovery onDone={() => changeView("MENU")} />}
      </LinearGradient>
    );
  }
  if (currentView === "JOURNAL" || currentView === "VOICE_MSG" || currentView === "ACTIVITIES") {
    const title = currentView === "JOURNAL" ? "บันทึกความอยาก" : currentView === "VOICE_MSG" ? "ข้อความให้กำลังใจ" : "กิจกรรมทดแทน";
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton} accessibilityRole="button">
            <Feather name="chevron-left" size={22} color="#0f766e" />
            <Text style={styles.backButtonText}>กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>{title}</Text>
        </View>
        {currentView === "ACTIVITIES" ? (
          <AlternativeActivities onClose={() => changeView("MENU")} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {currentView === "JOURNAL" ? (
              <CravingJournal onLogComplete={() => changeView("MENU")} />
            ) : (
              <VoiceMessages onClose={() => changeView("MENU")} />
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // ── Menu ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>ช่วยเหลือตอนอยากสูบ</Text>
        <Text style={styles.subtitle}>ความอยากแต่ละครั้งมักเบาลงภายในไม่กี่นาที เลือกวิธีที่ช่วยให้ผ่านช่วงนี้ไปได้</Text>

        <Pressable
          onPress={() => {
            playClick();
            changeView("RESCUE");
          }}
          style={({ pressed }) => [styles.heroWrap, pressed && { transform: [{ scale: 0.985 }] }]}
          accessibilityRole="button"
          accessibilityLabel="ฉันอยากสูบตอนนี้ เริ่มขั้นตอนรับมือ"
        >
          <LinearGradient colors={["#4f46e5", "#7c3aed", "#db2777"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroIcon}>
              <Feather name="life-buoy" size={30} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>ฉันอยากสูบตอนนี้</Text>
              <Text style={styles.heroSub}>ทำทีละขั้น วัดความอยากก่อน-หลัง ใช้เวลาราว 3–5 นาที</Text>
            </View>
            <Feather name="arrow-right" size={24} color="#fff" />
          </LinearGradient>
        </Pressable>

        {stats && stats.total > 0 ? (
          <View style={styles.statsRow}>
            <Stat value={`${stats.resisted}`} label="ครั้งที่ผ่านความอยาก" color="#0f766e" />
            <Stat value={stats.avgDrop !== null ? `−${stats.avgDrop.toFixed(1)}` : "–"} label="ความอยากลดลงเฉลี่ย" color="#7c3aed" />
            <Stat value={`${stats.thisWeek}`} label="ครั้งในสัปดาห์นี้" color="#db2777" />
          </View>
        ) : null}

        <Text style={styles.sectionHeader}>เกมเบี่ยงความสนใจ</Text>
        <GameLibrary onPlay={openGame} />

        <Text style={styles.sectionHeader}>เครื่องมืออื่นๆ</Text>
        <Row icon="activity" color="#14b8a6" title="ขยับร่างกาย 4 นาที" desc="6 ท่าง่ายๆ ในห้อง ออกกำลังสั้นๆ ช่วยลดความอยาก" onPress={() => { playClick(); changeView("MOVE"); }} />
        <Row icon="mic" color="#10b981" title="ข้อความให้กำลังใจ" desc="ฟังเสียงให้กำลังใจเมื่อรู้สึกท้อ" onPress={() => { playClick(); changeView("VOICE_MSG"); }} />
        <Row icon="edit-3" color="#0ea5e9" title="บันทึกความอยาก" desc="จดสิ่งกระตุ้นและความรู้สึก เพื่อรู้ทันตัวเอง" onPress={() => { playClick(); changeView("JOURNAL"); }} />
        <Row icon="coffee" color="#f59e0b" title="กิจกรรมทดแทน" desc="ไอเดียสิ่งที่ทำแทนการสูบ" onPress={() => { playClick(); changeView("ACTIVITIES"); }} />
        <Row icon="refresh-ccw" color="#f43f5e" title="เผลอสูบไป" desc="ไม่ต้องโทษตัวเอง มาวางแผนรับมือครั้งหน้ากัน" onPress={() => { playClick(); changeView("SLIP"); }} />

        <Text style={styles.sectionHeader}>คุยกับคน</Text>
        <Row icon="phone-call" color="#dc2626" title="โทร 1600 สายเลิกบุหรี่" desc="โทรฟรี ผู้เชี่ยวชาญช่วยวางแผนเลิกและให้กำลังใจ" onPress={() => Linking.openURL("tel:1600")} />
        <Row icon="smartphone" color="#3b82f6" title="โทรหาคนสนิท" desc="ผู้ติดต่อที่คุณตั้งไว้ในโปรไฟล์" onPress={() => { playClick(); handleQuickCall(); }} />
        <Row icon="bell" color="#ea580c" title="ขอกำลังใจจากครอบครัว" desc="ส่งแจ้งเตือนไปหาคนที่ติดตามคุณในแอป" onPress={() => { playClick(); handleFamilyAlert(); }} />
        <Row icon="heart" color="#8b5cf6" title="สายด่วนสุขภาพจิต 1323" desc="เครียด กังวล หรือรู้สึกไม่ไหว โทรฟรี" onPress={() => Linking.openURL("tel:1323")} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ icon, color, title, desc, onPress }: { icon: string; color: string; title: string; desc: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.sosCard, pressed && { opacity: 0.8 }]} onPress={onPress} accessibilityRole="button">
      <View style={[styles.sosIconContainer, { backgroundColor: color + "22" }]}>
        <Feather name={icon as any} size={22} color={color} />
      </View>
      <View style={styles.sosContent}>
        <Text style={styles.sosTitle}>{title}</Text>
        <Text style={styles.sosDesc}>{desc}</Text>
      </View>
      <Feather name="chevron-right" size={18} color="#94a3b8" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: "#f0fdfa" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: "800", color: "#1e293b", letterSpacing: -0.3, marginTop: 4 },
  subtitle: { fontSize: 14, color: "#475569", marginTop: 6, lineHeight: 21 },
  heroWrap: { marginTop: 18, borderRadius: 24, shadowColor: "#7c3aed", shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 20, borderRadius: 24 },
  heroIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#fff", fontSize: 21, fontWeight: "800" },
  heroSub: { color: "rgba(255,255,255,0.88)", fontSize: 13, marginTop: 3, lineHeight: 18 },
  statsRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  stat: { flex: 1, backgroundColor: "#fff", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  statValue: { fontSize: 22, fontWeight: "900" },
  statLabel: { fontSize: 11, color: "#64748b", marginTop: 2, lineHeight: 15 },
  sectionHeader: { fontSize: 18, fontWeight: "800", color: "#1e293b", marginTop: 28, marginBottom: 12 },
  sosCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    marginBottom: 10,
    gap: 14,
  },
  sosIconContainer: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sosContent: { flex: 1 },
  sosTitle: { fontSize: 15, fontWeight: "700", color: "#1e293b" },
  sosDesc: { fontSize: 12, color: "#64748b", marginTop: 3, lineHeight: 17 },
  subViewHeader: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" },
  backButton: { flexDirection: "row", alignItems: "center", padding: 6 },
  backButtonText: { color: "#0f766e", fontSize: 16, fontWeight: "700" },
  subViewTitle: { color: "#1e293b", fontSize: 18, fontWeight: "800", marginLeft: 10 },
  darkHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingTop: 10 },
  darkBack: { flexDirection: "row", alignItems: "center", padding: 8, width: 70 },
  darkBackText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  darkTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "800" },
});
