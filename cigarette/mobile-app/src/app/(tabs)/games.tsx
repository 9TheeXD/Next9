import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable, DeviceEventEmitter, BackHandler, Platform } from "react-native";
import { useFocusEffect, useNavigation } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAppSounds } from "@/hooks/useAppSounds";
import type { GameDefinition } from "@/games";
import GameLibrary from "@/components/GameLibrary";
import GameHost from "@/components/GameHost";
import VoiceMessages from "@/components/VoiceMessages";

type View_ = "MENU" | "GAME" | "VOICE_MSG";

const TAB_BAR = {
  backgroundColor: "#f0fdfa",
  borderTopColor: "rgba(0,0,0,0.04)",
  borderTopWidth: 1,
  height: 65,
  paddingBottom: 8,
  paddingTop: 6,
};

/** Games for family members: the same games the smoker has, to play together or to unwind. */
export default function GamesScreen() {
  const [currentView, setCurrentView] = useState<View_>("MENU");
  const [game, setGame] = useState<GameDefinition | null>(null);
  const navigation = useNavigation();
  const { playClick } = useAppSounds();

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: { ...TAB_BAR, display: currentView === "MENU" ? "flex" : "none" } } as any);
  }, [currentView, navigation]);

  const changeView = useCallback((v: View_) => {
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

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onPop = () => {
      const v = new URLSearchParams(window.location.search).get("view");
      if (!v) {
        setCurrentView("MENU");
        setGame(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("reset_tab_games", () => changeView("MENU"));
    return () => sub.remove();
  }, [changeView]);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (currentView !== "MENU") {
          changeView("MENU");
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [currentView, changeView])
  );

  if (currentView === "GAME" && game) {
    return <GameHost game={game} onExit={() => changeView("MENU")} />;
  }

  if (currentView === "VOICE_MSG") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton} accessibilityRole="button">
            <Feather name="chevron-left" size={22} color="#0f766e" />
            <Text style={styles.backButtonText}>กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>ข้อความให้กำลังใจ</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <VoiceMessages onClose={() => changeView("MENU")} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>เกมและพักใจ</Text>
        <Text style={styles.subtitle}>
          เกมชุดเดียวกับที่คนที่คุณดูแลใช้ตอนอยากสูบ ลองเล่นให้รู้จัก แล้วชวนเขาเล่นตอนที่เขาอยาก หรือใช้พักใจเมื่อคุณเครียดเองก็ได้
        </Text>
        <View style={{ height: 16 }} />
        <GameLibrary
          showWhy={false}
          onPlay={(g) => {
            playClick();
            setGame(g);
            changeView("GAME");
          }}
        />
        <Text style={styles.sectionHeader}>อื่นๆ</Text>
        <Pressable style={styles.card} onPress={() => { playClick(); changeView("VOICE_MSG"); }} accessibilityRole="button">
          <View style={[styles.icon, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
            <Feather name="mic" size={22} color="#10b981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>ข้อความให้กำลังใจ</Text>
            <Text style={styles.cardDesc}>ฟังเสียงให้กำลังใจ</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94a3b8" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f0fdfa" },
  scrollContent: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: "800", color: "#1e293b", marginTop: 4 },
  subtitle: { fontSize: 14, color: "#475569", marginTop: 6, lineHeight: 21 },
  sectionHeader: { fontSize: 18, fontWeight: "800", color: "#1e293b", marginTop: 26, marginBottom: 12 },
  card: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)", gap: 14 },
  icon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#1e293b" },
  cardDesc: { fontSize: 12, color: "#64748b", marginTop: 3 },
  subViewHeader: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" },
  backButton: { flexDirection: "row", alignItems: "center", padding: 6 },
  backButtonText: { color: "#0f766e", fontSize: 16, fontWeight: "700" },
  subViewTitle: { color: "#1e293b", fontSize: 18, fontWeight: "800", marginLeft: 10 },
});
