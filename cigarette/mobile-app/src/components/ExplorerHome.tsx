import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Platform, SafeAreaView } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { wallet } from "@/games/engine/economy";

const font = (web: string, native: string) => Platform.select({ web, default: native });

/** Home for "try the app" accounts: no quit data, just games and an easy way to pick a path later. */
export default function ExplorerHome() {
  const router = useRouter();
  const { user } = useAuth();
  const [coins, setCoins] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    setCoins(wallet.coins());
    return wallet.subscribe(setCoins);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.wrap}>
          <Text style={styles.hello}>ยินดีต้อนรับ</Text>
          <Text style={styles.sub}>
            คุณกำลังลองใช้งาน{user?.displayId ? ` · รหัส ${user.displayId}` : ""} ไม่ต้องตอบคำถามอะไรทั้งสิ้น
          </Text>

          <Pressable style={styles.hero} onPress={() => router.push("/(tabs)/games" as any)} accessibilityRole="button">
            <View style={styles.heroIcon}>
              <Feather name="play" size={28} color="#0f766e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>เล่นเกมผ่อนคลาย</Text>
              <Text style={styles.heroText}>เกมไขปริศนา หมากรุก เกมกับเพื่อน และอื่นๆ อีกหลายสิบเกม เล่นกับบอทหรือเพื่อนในเครื่องเดียวกันก็ได้</Text>
              {Platform.OS === "web" ? <Text style={styles.coins}>เหรียญของคุณ {coins.toLocaleString()}</Text> : null}
            </View>
            <Feather name="chevron-right" size={22} color="#0f766e" />
          </Pressable>

          <Text style={styles.label}>พร้อมแล้วค่อยเลือก ไม่ต้องรีบ</Text>

          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: "/onboarding", params: { as: "smoker" } } as any)}
            accessibilityRole="button"
          >
            <View style={[styles.rowIcon, { backgroundColor: "#e0f2fe" }]}>
              <Feather name="wind" size={22} color="#0369a1" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>อยากเริ่มเลิกสูบ</Text>
              <Text style={styles.rowText}>ตั้งแผนและติดตามวันที่ไม่สูบ เหรียญและความคืบหน้าที่มีอยู่จะอยู่ต่อ</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#94a3b8" />
          </Pressable>

          <Pressable
            style={styles.row}
            onPress={() => router.push({ pathname: "/onboarding", params: { as: "follower" } } as any)}
            accessibilityRole="button"
          >
            <View style={[styles.rowIcon, { backgroundColor: "#fce7f3" }]}>
              <Feather name="heart" size={22} color="#be185d" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>อยากช่วยคนใกล้ตัว</Text>
              <Text style={styles.rowText}>ส่งกำลังใจให้คนที่คุณห่วงด้วยรหัส 4 หลักของเขา</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#94a3b8" />
          </Pressable>

          <View style={styles.note}>
            <Feather name="phone-call" size={18} color="#115e59" style={{ marginTop: 2 }} />
            <Text style={styles.noteText}>ถ้าคนรอบตัวอยากเลิกบุหรี่ สายด่วนเลิกบุหรี่ 1600 โทรฟรี มีผู้ให้คำปรึกษา</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f0fdfa" },
  scroll: { alignItems: "center", paddingHorizontal: 20, paddingTop: 28, paddingBottom: 110 },
  wrap: { width: "100%", maxWidth: 520 },
  hello: { fontFamily: font("'Kanit', sans-serif", "Kanit"), fontSize: 28, fontWeight: "800", color: "#0f172a" },
  sub: { fontFamily: font("'Prompt', sans-serif", "Prompt"), fontSize: 14, color: "#64748b", marginTop: 4, marginBottom: 18, lineHeight: 21 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#ccfbf1",
    borderRadius: 20,
    padding: 18,
    marginBottom: 22,
  },
  heroIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: font("'Kanit', sans-serif", "Kanit"), fontSize: 20, fontWeight: "700", color: "#0f766e" },
  heroText: { fontFamily: font("'Prompt', sans-serif", "Prompt"), fontSize: 13, color: "#115e59", marginTop: 2, lineHeight: 19 },
  coins: { fontFamily: font("'Prompt', sans-serif", "Prompt"), fontSize: 13, fontWeight: "700", color: "#0f766e", marginTop: 6 },
  label: { fontFamily: font("'Prompt', sans-serif", "Prompt"), fontSize: 14, fontWeight: "600", color: "#64748b", marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rowIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontFamily: font("'Kanit', sans-serif", "Kanit"), fontSize: 16, fontWeight: "700", color: "#0f172a" },
  rowText: { fontFamily: font("'Prompt', sans-serif", "Prompt"), fontSize: 13, color: "#64748b", marginTop: 1, lineHeight: 19 },
  note: { flexDirection: "row", gap: 10, backgroundColor: "rgba(15,118,110,0.08)", borderRadius: 14, padding: 14, marginTop: 8 },
  noteText: { flex: 1, fontFamily: font("'Prompt', sans-serif", "Prompt"), fontSize: 13, lineHeight: 20, color: "#115e59" },
});
