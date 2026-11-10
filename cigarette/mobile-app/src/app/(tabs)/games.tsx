import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable, DeviceEventEmitter, BackHandler, Platform } from "react-native";
import { useFocusEffect, useRouter, useNavigation } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import BreathingExercise from "@/components/BreathingExercise";
import DistractionGame from "@/components/DistractionGame";
import MemoryMatchGame from "@/components/MemoryMatchGame";
import MathRushGame from "@/components/MathRushGame";
import DinoRunnerGame from "@/components/DinoRunnerGame";
import TapChallengeGame from "@/components/TapChallengeGame";
import TetrisGame from "@/components/TetrisGame";
import { useAppSounds } from "@/hooks/useAppSounds";
import TapReactionGame from "@/components/TapReactionGame";
import VoiceMessages from "@/components/VoiceMessages";

type SOSView = "MENU" | "BREATHING" | "GAME_STROOP" | "GAME_MEMORY" | "GAME_MATH" | "GAME_REACTION" | "GAME_DINO" | "GAME_TAP_CHALLENGE" | "GAME_TETRIS" | "VOICE_MSG";

export default function GamesScreen() {
  const [currentView, setCurrentView] = useState<SOSView>("MENU");
  const router = useRouter();
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: { 
        display: currentView === "MENU" ? "flex" : "none",
        backgroundColor: "#f0fdfa",
        borderTopColor: "rgba(0,0,0,0.04)",
        borderTopWidth: 1,
        height: 65,
        paddingBottom: 8,
        paddingTop: 6,
      }
    });
  }, [currentView, navigation]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handlePop = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const v = urlParams.get('view') as SOSView;
        setCurrentView(v || "MENU");
      };
      window.addEventListener('popstate', handlePop);
      return () => window.removeEventListener('popstate', handlePop);
    }
  }, []);

  const changeView = (v: SOSView) => {
    if (v === "MENU") {
      if (Platform.OS === 'web' && currentView !== "MENU") {
        window.history.back();
      } else {
        setCurrentView("MENU");
      }
    } else {
      if (Platform.OS === 'web') {
        window.history.pushState({}, "", `?view=${v}`);
      }
      setCurrentView(v);
    }
  };

  const { playClick } = useAppSounds();

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('reset_tab_games', () => {
      if (currentView !== "MENU") router.replace('/games' as any);
    });
    return () => sub.remove();
  }, [currentView, router]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (currentView !== "MENU") {
          changeView("MENU");
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [currentView, router])
  );

  if (currentView === "BREATHING") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>การฝึกหายใจ</Text>
        </View>
        <BreathingExercise />
      </SafeAreaView>
    );
  }

  if (currentView === "GAME_STROOP") return <SafeAreaView style={styles.safeArea}><View style={styles.subViewHeader}><Pressable onPress={() => changeView("MENU")} style={styles.backButton}><Text style={styles.backButtonText}>← กลับ</Text></Pressable><Text style={styles.subViewTitle}>เกมแยกประสาทสี (Stroop)</Text></View><View style={{flex: 1}}><DistractionGame /></View></SafeAreaView>;
  if (currentView === "GAME_MEMORY") return <SafeAreaView style={styles.safeArea}><View style={styles.subViewHeader}><Pressable onPress={() => changeView("MENU")} style={styles.backButton}><Text style={styles.backButtonText}>← กลับ</Text></Pressable><Text style={styles.subViewTitle}>เกมจับคู่ความจำ</Text></View><View style={{flex: 1}}><MemoryMatchGame /></View></SafeAreaView>;
  if (currentView === "GAME_MATH") return <SafeAreaView style={styles.safeArea}><View style={styles.subViewHeader}><Pressable onPress={() => changeView("MENU")} style={styles.backButton}><Text style={styles.backButtonText}>← กลับ</Text></Pressable><Text style={styles.subViewTitle}>เกมคณิตคิดเร็ว</Text></View><View style={{flex: 1}}><MathRushGame /></View></SafeAreaView>;
  if (currentView === "GAME_REACTION") return <SafeAreaView style={styles.safeArea}><View style={styles.subViewHeader}><Pressable onPress={() => changeView("MENU")} style={styles.backButton}><Text style={styles.backButtonText}>← กลับ</Text></Pressable><Text style={styles.subViewTitle}>เกมทดสอบปฏิกิริยา</Text></View><View style={{flex: 1}}><TapReactionGame /></View></SafeAreaView>;
  if (currentView === "GAME_DINO") return <SafeAreaView style={styles.safeArea}><View style={styles.subViewHeader}><Pressable onPress={() => changeView("MENU")} style={styles.backButton}><Text style={styles.backButtonText}>← กลับ</Text></Pressable><Text style={styles.subViewTitle}>ไดโนวิ่ง</Text></View><View style={{flex: 1}}><DinoRunnerGame /></View></SafeAreaView>;
  if (currentView === "GAME_TAP_CHALLENGE") return <SafeAreaView style={styles.safeArea}><View style={styles.subViewHeader}><Pressable onPress={() => changeView("MENU")} style={styles.backButton}><Text style={styles.backButtonText}>← กลับ</Text></Pressable><Text style={styles.subViewTitle}>ชาเลนจ์แตะ</Text></View><View style={{flex: 1}}><TapChallengeGame /></View></SafeAreaView>;
  if (currentView === "GAME_TETRIS") return <SafeAreaView style={styles.safeArea}><View style={styles.subViewHeader}><Pressable onPress={() => changeView("MENU")} style={styles.backButton}><Text style={styles.backButtonText}>← กลับ</Text></Pressable><Text style={styles.subViewTitle}>Tetris</Text></View><View style={{flex: 1}}><TetrisGame /></View></SafeAreaView>;
  
  if (currentView === "VOICE_MSG") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>กำลังใจจากเรา</Text>
        </View>
        <ScrollView>
          <VoiceMessages onClose={() => changeView("MENU")} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>เกมผ่อนคลาย</Text>
          <Text style={styles.subtitle}>
            ผ่อนคลายความเครียดด้วยเกมและกิจกรรมต่างๆ
          </Text>
        </View>

        <Text style={styles.sectionHeader}>เครื่องมือช่วยเหลือ</Text>

        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("BREATHING"); }}>
          <View style={styles.sosIconContainer}>
            <Feather name="wind" size={24} color="#7dd3fc" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>ฝึกหายใจ 1 นาที</Text>
            <Text style={styles.sosDesc}>ทำตามการฝึกหายใจเพื่อสงบจิตใจ</Text>
          </View>
        </Pressable>

        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("VOICE_MSG"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(16, 185, 129, 0.15)" }]}>
            <Feather name="mic" size={24} color="#10b981" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>ข้อความให้กำลังใจ</Text>
            <Text style={styles.sosDesc}>ฟังเสียงให้กำลังใจ</Text>
          </View>
        </Pressable>

        <Text style={styles.sectionHeader}>มินิเกม</Text>

        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("GAME_STROOP"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(251,191,36,0.15)" }]}>
            <Feather name="aperture" size={24} color="#fbbf24" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>เกมแยกประสาทสี (Stroop)</Text>
          </View>
        </Pressable>

        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("GAME_MEMORY"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(52, 211, 153, 0.15)" }]}>
            <Feather name="grid" size={24} color="#34d399" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>เกมจับคู่ความจำ (Memory)</Text>
          </View>
        </Pressable>

        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("GAME_MATH"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(244, 114, 182, 0.15)" }]}>
            <Feather name="hash" size={24} color="#f472b6" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>เกมคณิตคิดเร็ว (Math Rush)</Text>
          </View>
        </Pressable>

        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("GAME_REACTION"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(167, 139, 250, 0.15)" }]}>
            <Feather name="zap" size={24} color="#7dd3fc" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>ทดสอบปฏิกิริยา (Reaction)</Text>
          </View>
        </Pressable>

        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("GAME_DINO"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(34, 197, 94, 0.15)" }]}>
            <MaterialCommunityIcons name="google-downasaur" size={24} color="#22c55e" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>ไดโนวิ่ง (Dino Runner)</Text>
          </View>
        </Pressable>

        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("GAME_TAP_CHALLENGE"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
            <Feather name="target" size={24} color="#ef4444" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>ชาเลนจ์แตะ (Tap Challenge)</Text>
          </View>
        </Pressable>

        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("GAME_TETRIS"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(168, 85, 247, 0.15)" }]}>
            <MaterialCommunityIcons name="wall" size={24} color="#a855f7" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>Tetris</Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f0fdfa" },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: "800", color: "#1e293b", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: "#475569", marginTop: 4, lineHeight: 20 },
  sectionHeader: { fontSize: 18, fontWeight: "700", color: "#1e293b", marginTop: 24, marginBottom: 16, letterSpacing: -0.3 },
  sosCard: { flexDirection: "row", alignItems: "center", padding: 18, borderRadius: 16, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", marginBottom: 12, gap: 16 },
  sosIconContainer: { width: 52, height: 52, borderRadius: 14, backgroundColor: "rgba(56,189,248,0.15)", alignItems: "center", justifyContent: "center" },
  sosContent: { flex: 1 },
  sosTitle: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  sosDesc: { fontSize: 12, color: "#475569", marginTop: 4, lineHeight: 17 },
  subViewHeader: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" },
  backButton: { padding: 8 },
  backButtonText: { color: "#7dd3fc", fontSize: 16, fontWeight: "600" },
  subViewTitle: { color: "#1e293b", fontSize: 18, fontWeight: "700", marginLeft: 16 },
});
