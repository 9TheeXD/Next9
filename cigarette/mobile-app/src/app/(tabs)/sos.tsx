import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable, Linking, Alert, Platform, DeviceEventEmitter, BackHandler } from "react-native";
import { useFocusEffect, useRouter, useNavigation } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAlert } from "@/contexts/AlertContext";
import BreathingExercise from "@/components/BreathingExercise";
import DistractionGame from "@/components/DistractionGame";
import MemoryMatchGame from "@/components/MemoryMatchGame";
import MathRushGame from "@/components/MathRushGame";
import DinoRunnerGame from "@/components/DinoRunnerGame";
import TapChallengeGame from "@/components/TapChallengeGame";
import TetrisGame from "@/components/TetrisGame";
import { useAppSounds } from "@/hooks/useAppSounds";
import TapReactionGame from "@/components/TapReactionGame";
import CravingJournal from "@/components/CravingJournal";
import VoiceMessages from "@/components/VoiceMessages";
import { api } from "@/lib/api";
import AlternativeActivities from "@/components/AlternativeActivities";

import { useGamification } from "@/contexts/GamificationContext";
import { useAuth } from "@/contexts/AuthContext";

type SOSView = "MENU" | "BREATHING" | "GAME_STROOP" | "GAME_MEMORY" | "GAME_MATH" | "GAME_REACTION" | "GAME_DINO" | "GAME_TAP_CHALLENGE" | "GAME_TETRIS" | "JOURNAL" | "VOICE_MSG" | "ACTIVITIES";

export default function SOSScreen() {
  const { showAlert } = useAlert();
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

  // Handle hardware back on Web (popstate)
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handlePop = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const v = urlParams.get('view') as SOSView;
        changeView(v || "MENU");
      };
      window.addEventListener('popstate', handlePop);
      return () => window.removeEventListener('popstate', handlePop);
    }
  }, []);

  const changeView = (v: SOSView) => {
    if (v === "MENU") {
      if (Platform.OS === 'web' && currentView !== "MENU") {
        window.history.back();
      }
      setCurrentView("MENU");
    } else {
      if (Platform.OS === 'web') {
        window.history.pushState({}, "", `?view=${v}`);
      }
      setCurrentView(v);
    }
  };

  const { playClick, playNav } = useAppSounds();
  const { completeDailyMission } = useGamification();
  const { user } = useAuth();

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('reset_tab_sos', () => {
      if (currentView !== "MENU") changeView("MENU");
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

  if (currentView === "GAME_STROOP") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>เกมแยกประสาทสี (Stroop)</Text>
        </View>
        <View style={{flex: 1}}><DistractionGame /></View>
      </SafeAreaView>
    );
  }

  if (currentView === "GAME_MEMORY") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>เกมจับคู่ความจำ</Text>
        </View>
        <View style={{flex: 1}}><MemoryMatchGame /></View>
      </SafeAreaView>
    );
  }

  if (currentView === "GAME_MATH") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>เกมคณิตคิดเร็ว</Text>
        </View>
        <View style={{flex: 1}}><MathRushGame /></View>
      </SafeAreaView>
    );
  }

  if (currentView === "GAME_REACTION") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>เกมทดสอบปฏิกิริยา</Text>
        </View>
        <View style={{flex: 1}}><TapReactionGame /></View>
      </SafeAreaView>
    );
  }

  if (currentView === "GAME_DINO") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>ไดโนวิ่ง</Text>
        </View>
        <View style={{flex: 1}}>
          <DinoRunnerGame />
        </View>
      </SafeAreaView>
    );
  }

  if (currentView === "GAME_TAP_CHALLENGE") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>ชาเลนจ์แตะ</Text>
        </View>
        <View style={{flex: 1}}>
          <TapChallengeGame />
        </View>
      </SafeAreaView>
    );
  }

  if (currentView === "GAME_TETRIS") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>Tetris</Text>
        </View>
        <View style={{flex: 1}}>
          <TetrisGame />
        </View>
      </SafeAreaView>
    );
  }

  if (currentView === "JOURNAL") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>บันทึกพฤติกรรม</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} >
          <CravingJournal onLogComplete={() => changeView("MENU")} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (currentView === "VOICE_MSG") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>กำลังใจจากเรา</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} >
          <VoiceMessages onClose={() => changeView("MENU")} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (currentView === "ACTIVITIES") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.subViewHeader}>
          <Pressable onPress={() => changeView("MENU")} style={styles.backButton}>
            <Text style={styles.backButtonText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.subViewTitle}>กิจกรรมเบี่ยงเบนความสนใจ</Text>
        </View>
        <AlternativeActivities onClose={() => changeView("MENU")} />
      </SafeAreaView>
    );
  }

  const handleFamilyAlert = async () => {
    try {
      await api.sendFamilyAlert();
      showAlert({ title: "ส่งแจ้งเตือนครอบครัวแล้ว", message: "ระบบได้ส่งข้อความขอความช่วยเหลือไปยังผู้ติดต่อฉุกเฉินของคุณเรียบร้อยแล้ว", type: "success" });
    } catch (e) {
      showAlert({ title: "เกิดข้อผิดพลาด", message: "ไม่สามารถส่งแจ้งเตือนได้ หรือยังไม่มีผู้ติดตาม", type: "error" });
    }
  };

  const handleQuickCall = () => {
    playClick();
    if (!user?.emergencyContact) {
      showAlert({ 
        title: "ยังไม่มีเบอร์ติดต่อ", 
        message: "กรุณาตั้งค่าเบอร์คนสนิทในหน้า Profile ก่อนครับ", 
        type: "warning" 
      });
      return;
    };
    Linking.openURL(`tel:${user.emergencyContact.trim()}`);
  };

  const handle1600Call = () => {
    Linking.openURL('tel:1600');
  };

  const handle1323Call = () => {
    Linking.openURL('tel:1323');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name="alert-triangle" size={28} color="#f59e0b" />
            <Text style={styles.title}>ช่วยเหลือฉุกเฉิน (SOS)</Text>
          </View>
          <Text style={styles.subtitle}>
            เลือกวิธีรับมือกับความอยากบุหรี่ที่เหมาะกับคุณในตอนนี้
          </Text>
        </View>

        <Text style={styles.sectionHeader}>เครื่องมือช่วยเหลือ</Text>

        {/* Breathing Exercise */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("BREATHING"); }}>
          <View style={styles.sosIconContainer}>
            <Feather name="wind" size={24} color="#7dd3fc" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>ฝึกหายใจ 1 นาที</Text>
            <Text style={styles.sosDesc}>
              ทำตามการฝึกหายใจเพื่อสงบความอยาก
            </Text>
          </View>
        </Pressable>

        {/* Voice Messages */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("VOICE_MSG"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(16, 185, 129, 0.15)" }]}>
            <Feather name="mic" size={24} color="#10b981" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>ข้อความให้กำลังใจ</Text>
            <Text style={styles.sosDesc}>
              ฟังเสียงให้กำลังใจเมื่อคุณรู้สึกท้อแท้
            </Text>
          </View>
        </Pressable>

        <Text style={styles.sectionHeader}>เบี่ยงเบนความสนใจ</Text>

        {/* Distraction: Stroop */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); completeDailyMission('minigame'); api.postLog({ gamesPlayed: 1 }).catch(() => {}); changeView("GAME_STROOP"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(251,191,36,0.15)" }]}>
            <Feather name="aperture" size={24} color="#fbbf24" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>เกมแยกประสาทสี (Stroop)</Text>
            <Text style={styles.sosDesc}>
              เบี่ยงเบนความคิดด้วยเกมจิตวิทยาที่ต้องใช้สมาธิสูง
            </Text>
          </View>
        </Pressable>

        {/* Distraction: Memory */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); completeDailyMission('minigame'); api.postLog({ gamesPlayed: 1 }).catch(() => {}); api.postActionLog({ action: "GAME_PLAYED", details: `เล่นเกมเพื่อเบี่ยงเบนความสนใจ` }).catch(() => {}); changeView("GAME_MEMORY"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(52, 211, 153, 0.15)" }]}>
            <Feather name="grid" size={24} color="#34d399" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>เกมจับคู่ความจำ (Memory)</Text>
            <Text style={styles.sosDesc}>
              ฝึกความจำระยะสั้น ดึงจุดโฟกัสออกจากความอยากบุหรี่
            </Text>
          </View>
        </Pressable>

        {/* Distraction: Math */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); completeDailyMission('minigame'); api.postLog({ gamesPlayed: 1 }).catch(() => {}); api.postActionLog({ action: "GAME_PLAYED", details: `เล่นเกมเพื่อเบี่ยงเบนความสนใจ` }).catch(() => {}); changeView("GAME_MATH"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(244, 114, 182, 0.15)" }]}>
            <Feather name="hash" size={24} color="#f472b6" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>เกมคณิตคิดเร็ว (Math Rush)</Text>
            <Text style={styles.sosDesc}>
              กระตุ้นสมองซีกซ้ายด้วยการบวกเลขแบบรวดเร็ว
            </Text>
          </View>
        </Pressable>

        {/* Distraction: Reaction */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); completeDailyMission('minigame'); api.postLog({ gamesPlayed: 1 }).catch(() => {}); api.postActionLog({ action: "GAME_PLAYED", details: `เล่นเกมเพื่อเบี่ยงเบนความสนใจ` }).catch(() => {}); changeView("GAME_REACTION"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(167, 139, 250, 0.15)" }]}>
            <Feather name="zap" size={24} color="#7dd3fc" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>ทดสอบปฏิกิริยา (Reaction)</Text>
            <Text style={styles.sosDesc}>
              วัดความไวในการตอบสนอง ช่วยเบี่ยงเบนความสนใจได้ดีเยี่ยม
            </Text>
          </View>
        </Pressable>

        {/* Distraction: Dino Runner */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); completeDailyMission('minigame'); api.postLog({ gamesPlayed: 1 }).catch(() => {}); api.postActionLog({ action: "GAME_PLAYED", details: `เล่นเกมเพื่อเบี่ยงเบนความสนใจ` }).catch(() => {}); changeView("GAME_DINO"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(34, 197, 94, 0.15)" }]}>
            <MaterialCommunityIcons name="google-downasaur" size={24} color="#22c55e" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>ไดโนวิ่ง (Dino Runner)</Text>
            <Text style={styles.sosDesc}>
              กระโดดหลบสิ่งกีดขวาง! เกมในตำนานของ Chrome
            </Text>
          </View>
        </Pressable>

        {/* Distraction: Tap Challenge */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); completeDailyMission('minigame'); api.postLog({ gamesPlayed: 1 }).catch(() => {}); api.postActionLog({ action: "GAME_PLAYED", details: `เล่นเกมเพื่อเบี่ยงเบนความสนใจ` }).catch(() => {}); changeView("GAME_TAP_CHALLENGE"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
            <Feather name="target" size={24} color="#ef4444" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>ชาเลนจ์แตะ (Tap Challenge)</Text>
            <Text style={styles.sosDesc}>
              กดปุ่มตามคำสั่งให้ถูกต้อง! ฝึกสมาธิและความจำ
            </Text>
          </View>
        </Pressable>

        {/* Distraction: Tetris */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); completeDailyMission('minigame'); api.postLog({ gamesPlayed: 1 }).catch(() => {}); api.postActionLog({ action: "GAME_PLAYED", details: `เล่นเกมเพื่อเบี่ยงเบนความสนใจ` }).catch(() => {}); changeView("GAME_TETRIS"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(168, 85, 247, 0.15)" }]}>
            <MaterialCommunityIcons name="wall" size={24} color="#a855f7" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>Tetris</Text>
            <Text style={styles.sosDesc}>
              ต่อบล็อกทำลายแถว คลาสสิกและเพลินสุดๆ
            </Text>
          </View>
        </Pressable>



        {/* Alternative Activities */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("ACTIVITIES"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(245, 158, 11, 0.15)" }]}>
            <Feather name="coffee" size={24} color="#f59e0b" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>กิจกรรมทางเลือกอื่นๆ</Text>
            <Text style={styles.sosDesc}>
              คำแนะนำการทำกิจกรรมต่างๆ ทดแทนการสูบบุหรี่
            </Text>
          </View>
        </Pressable>

        <Text style={styles.sectionHeader}>ติดต่อฉุกเฉิน</Text>
        <Pressable style={styles.sosCard} onPress={() => { playClick(); changeView("JOURNAL"); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(56, 189, 248, 0.15)" }]}>
            <Feather name="edit-3" size={24} color="#38bdf8" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>บันทึกความอยาก (Journal)</Text>
            <Text style={styles.sosDesc}>
              จดบันทึกตัวกระตุ้นและความรู้สึกเพื่อทำความเข้าใจตัวเอง
            </Text>
          </View>
        </Pressable>

        {/* 1600 Call */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); handle1600Call(); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(220, 38, 38, 0.15)" }]}>
            <Feather name="phone-call" size={24} color="#dc2626" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>โทรสายด่วน 1600</Text>
            <Text style={styles.sosDesc}>
              สายด่วนเลิกบุหรี่แห่งชาติ โทรฟรี 
            </Text>
          </View>
        </Pressable>

        {/* 1323 Call */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); handle1323Call(); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(139, 92, 246, 0.15)" }]}>
            <Feather name="heart" size={24} color="#8b5cf6" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>สายด่วนสุขภาพจิต 1323</Text>
            <Text style={styles.sosDesc}>
              ปรึกษาปัญหาความเครียดและสุขภาพจิต โทรฟรี
            </Text>
          </View>
        </Pressable>

        {/* Quick Call */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); handleQuickCall(); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(59, 130, 246, 0.15)" }]}>
            <Feather name="smartphone" size={24} color="#3b82f6" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>โทรด่วนคนสนิท</Text>
            <Text style={styles.sosDesc}>
              โทรหาผู้ติดต่อฉุกเฉินที่คุณตั้งไว้ในโปรไฟล์
            </Text>
          </View>
        </Pressable>

        {/* Family Alert */}
        <Pressable style={styles.sosCard} onPress={() => { playClick(); handleFamilyAlert(); }}>
          <View style={[styles.sosIconContainer, { backgroundColor: "rgba(239, 68, 68, 0.15)" }]}>
            <Feather name="alert-circle" size={24} color="#ef4444" />
          </View>
          <View style={styles.sosContent}>
            <Text style={styles.sosTitle}>ส่งแจ้งเตือนครอบครัว</Text>
            <Text style={styles.sosDesc}>
              ส่งข้อความขอความช่วยเหลือไปยังครอบครัว
            </Text>
          </View>
        </Pressable>

      </ScrollView>
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
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1e293b",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#475569",
    marginTop: 4,
    lineHeight: 20,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginTop: 24,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  sosCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    marginBottom: 12,
    gap: 16,
  },
  sosIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(56,189,248,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  sosContent: {
    flex: 1,
  },
  sosTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
  },
  sosDesc: {
    fontSize: 12,
    color: "#475569",
    marginTop: 4,
    lineHeight: 17,
  },
  subViewHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: "#7dd3fc",
    fontSize: 16,
    fontWeight: "600",
  },
  subViewTitle: {
    color: "#1e293b",
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 16,
  },
});
