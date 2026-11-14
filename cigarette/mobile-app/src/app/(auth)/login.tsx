import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, Image, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";

interface RememberedAccount {
  displayId: string;
  displayName: string;
  role: string;
  followedSmokerDisplayId?: string | null;
}

async function getNewDisplayId(): Promise<string> {
  const newId = Math.floor(Math.random() * 9000 + 1000).toString();
  await AsyncStorage.setItem("ciga_display_id", newId);
  if (Platform.OS === "web" && typeof document !== "undefined") {
    document.cookie = `ciga_display_id=${newId}; path=/; max-age=31536000`;
  }
  return newId;
}

async function getRememberedAccount(): Promise<RememberedAccount | null> {
  try {
    const raw = await AsyncStorage.getItem("@ciga_remembered_account");
    if (raw) return JSON.parse(raw);
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      const webRaw = localStorage.getItem("ciga_remembered_account");
      if (webRaw) return JSON.parse(webRaw);
    }
  } catch (e) {
    console.warn("Failed to read remembered account:", e);
  }
  return null;
}

type Path = "try" | "quit" | "help";

const PATHS: { id: Path; icon: keyof typeof Feather.glyphMap; title: string; text: string; tint: string; bg: string }[] = [
  {
    id: "try",
    icon: "play-circle",
    title: "ลองใช้งานเลย",
    text: "ไม่ต้องตอบคำถามใดๆ เล่นเกม ผ่อนคลาย และดูว่าแอปเป็นยังไง เหมาะกับทุกคน ไม่ต้องสูบก็ใช้ได้",
    tint: "#0f766e",
    bg: "#ccfbf1",
  },
  {
    id: "quit",
    icon: "wind",
    title: "ฉันอยากเลิกสูบ",
    text: "ตั้งแผนของตัวเอง ดูจำนวนวันและเงินที่ประหยัดได้ มีปุ่มช่วยตอนอยากสูบ ตอบสั้นๆ ข้ามได้ทุกข้อ",
    tint: "#0369a1",
    bg: "#e0f2fe",
  },
  {
    id: "help",
    icon: "heart",
    title: "ฉันอยากช่วยคนใกล้ตัว",
    text: "ส่งกำลังใจและดูความก้าวหน้าของคนที่คุณห่วง ถ้ามีรหัส 4 หลักของเขาก็ใส่ได้ ไม่มีก็ข้ามไปก่อน",
    tint: "#be185d",
    bg: "#fce7f3",
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const params = useLocalSearchParams<{ start?: string }>();
  const [busy, setBusy] = useState<Path | "back" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remembered, setRemembered] = useState<RememberedAccount | null>(null);
  const [ready, setReady] = useState(false);
  const autoStarted = useRef(false);

  useEffect(() => {
    getRememberedAccount().then((acc) => {
      setRemembered(acc);
      setReady(true);
    });
  }, []);

  // Links from the website can say which path to open (?start=try | quit | help).
  useEffect(() => {
    if (!ready || autoStarted.current || remembered) return;
    const s = params.start;
    if (s === "try" || s === "quit" || s === "help") {
      autoStarted.current = true;
      void choose(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, remembered, params.start]);

  const choose = async (path: Path) => {
    setError(null);
    setBusy(path);
    try {
      await getNewDisplayId();
      if (path === "try") {
        const id = (await AsyncStorage.getItem("ciga_display_id")) as string;
        await register({ displayId: id, role: "EXPLORER" });
        router.replace("/(tabs)");
      } else {
        router.push({ pathname: "/onboarding", params: { as: path === "quit" ? "smoker" : "follower" } } as any);
      }
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    } finally {
      setBusy(null);
    }
  };

  const resume = async (account: RememberedAccount) => {
    setError(null);
    setBusy("back");
    try {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        document.cookie = `ciga_display_id=${account.displayId}; path=/; max-age=31536000`;
      }
      await AsyncStorage.setItem("ciga_display_id", account.displayId);
      await register({
        displayId: account.displayId,
        role: account.role || "SMOKER",
        targetDisplayId: account.followedSmokerDisplayId || undefined,
      });
      await AsyncStorage.removeItem("@ciga_remembered_account");
      if (Platform.OS === "web" && typeof localStorage !== "undefined") {
        localStorage.removeItem("ciga_remembered_account");
      }
      router.replace("/(tabs)");
    } catch (err: any) {
      if (err.message?.includes("SURVEY_REQUIRED") || err.message?.includes("ACCOUNT_DELETED")) {
        router.push("/onboarding" as any);
      } else {
        setError(err.message || "เข้าใช้งานไม่สำเร็จ");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <LinearGradient colors={["#e0f2fe", "#f0fdfa", "#ecfdf5"]} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
          <Image source={require("../../../assets/images/icon.png")} style={styles.icon} />
          <Text style={styles.brand}>Next Breath</Text>
          <Text style={styles.headline}>หายใจครั้งต่อไป ที่ไร้ควัน</Text>
          <Text style={styles.lead}>
            แอปที่ช่วยคนอยากเลิกบุหรี่ และเปิดให้ทุกคนลองเล่นเกมผ่อนคลายได้ฟรี เลือกทางที่ตรงกับคุณได้เลย เปลี่ยนใจทีหลังได้
          </Text>

          {remembered ? (
            <Pressable style={styles.resume} onPress={() => resume(remembered)} disabled={busy !== null}>
              {busy === "back" ? (
                <ActivityIndicator color="#0369a1" />
              ) : (
                <>
                  <Feather name="log-in" size={20} color="#0369a1" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resumeTitle}>กลับเข้าบัญชีเดิม</Text>
                    <Text style={styles.resumeText}>รหัสของคุณ {remembered.displayId}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color="#0369a1" />
                </>
              )}
            </Pressable>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>{remembered ? "หรือเริ่มใหม่" : "คุณอยากทำอะไร?"}</Text>

          {PATHS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => choose(p.id)}
              disabled={busy !== null}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
              accessibilityRole="button"
              accessibilityLabel={p.title}
            >
              <View style={[styles.cardIcon, { backgroundColor: p.bg }]}>
                {busy === p.id ? (
                  <ActivityIndicator color={p.tint} />
                ) : (
                  <Feather name={p.icon} size={26} color={p.tint} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: p.tint }]}>{p.title}</Text>
                <Text style={styles.cardText}>{p.text}</Text>
              </View>
              <Feather name="chevron-right" size={22} color="#94a3b8" />
            </Pressable>
          ))}

          <View style={styles.privacy}>
            <Feather name="shield" size={18} color="#0f766e" style={{ marginTop: 2 }} />
            <Text style={styles.privacyText}>
              ไม่ต้องใช้ชื่อจริง เบอร์โทร หรืออีเมล แอปสุ่มรหัส 4 หลักให้คุณ ตอบคำถามเท่าที่สบายใจ ข้อไหนไม่อยากตอบก็ข้ามได้
            </Text>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const font = (web: string, native: string) => Platform.select({ web, default: native });

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: "center", paddingHorizontal: 20, paddingTop: 48, paddingBottom: 40 },
  container: { width: "100%", maxWidth: 460 },
  icon: { width: 76, height: 76, borderRadius: 18, alignSelf: "center", marginBottom: 12 },
  brand: {
    fontFamily: font("'Kanit', sans-serif", "Kanit"),
    fontSize: 18,
    fontWeight: "700",
    color: "#0369a1",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  headline: {
    fontFamily: font("'Kanit', 'Prompt', sans-serif", "Kanit"),
    fontSize: 30,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 40,
  },
  lead: {
    fontFamily: font("'Prompt', 'Sarabun', sans-serif", "Prompt"),
    fontSize: 15,
    lineHeight: 23,
    color: "#475569",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  sectionLabel: {
    fontFamily: font("'Prompt', sans-serif", "Prompt"),
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 10,
    marginTop: 4,
  },
  resume: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: "#7dd3fc",
    marginBottom: 18,
    minHeight: 64,
  },
  resumeTitle: { fontFamily: font("'Prompt', sans-serif", "Prompt"), fontSize: 16, fontWeight: "700", color: "#0f172a" },
  resumeText: { fontFamily: font("'Prompt', sans-serif", "Prompt"), fontSize: 13, color: "#64748b", marginTop: 2 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: font("'Kanit', 'Prompt', sans-serif", "Kanit"), fontSize: 18, fontWeight: "700" },
  cardText: {
    fontFamily: font("'Prompt', 'Sarabun', sans-serif", "Prompt"),
    fontSize: 13,
    lineHeight: 19,
    color: "#64748b",
    marginTop: 2,
  },
  privacy: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(15,118,110,0.08)",
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
  },
  privacyText: { flex: 1, fontFamily: font("'Prompt', sans-serif", "Prompt"), fontSize: 13, lineHeight: 20, color: "#115e59" },
  errorBox: { backgroundColor: "#fef2f2", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#fecaca" },
  errorText: { color: "#b91c1c", fontSize: 14, textAlign: "center" },
});
