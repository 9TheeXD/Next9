import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Easing, Platform, AccessibilityInfo, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";

/**
 * "Read first, then start" screen for every timed helper (movement break, breathing, quiz…).
 * Shows what to do, waits for a tap, then counts 3 → 2 → 1 → "เริ่ม!" before calling onStart,
 * so the timer never starts while the user is still reading or getting into position.
 */

export interface ReadyGateProps {
  title: string;
  /** Short, concrete instructions, one action per line. */
  steps: string[];
  /** Small label above the title, e.g. "ท่าที่ 2 จาก 6". */
  kicker?: string;
  /** One line under the title, e.g. how long it takes. */
  subtitle?: string;
  /** Feather icon name. */
  icon?: string;
  accent?: string;
  startLabel?: string;
  /** Seconds to count down after the tap. 0 starts right away. */
  countdown?: number;
  /** "dark" for the full-screen gradient helpers, "light" for the mint app screens. */
  tone?: "dark" | "light";
  onStart: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
}

const font = (web: string, native: string) => Platform.select({ web, default: native });
const HEADING = font("'Kanit', 'Prompt', sans-serif", "Kanit");
const BODY = font("'Prompt', 'Sarabun', sans-serif", "Prompt");
const NATIVE_DRIVER = Platform.OS !== "web";
const GO_MS = 650;
const TICK_MS = 1000;

export default function ReadyGate({
  title,
  steps,
  kicker,
  subtitle,
  icon = "play-circle",
  accent = "#14b8a6",
  startLabel = "พร้อมแล้ว แตะเพื่อเริ่ม",
  countdown = 3,
  tone = "dark",
  onStart,
  onCancel,
  cancelLabel = "ยังไม่ทำตอนนี้",
}: ReadyGateProps) {
  // null = reading the instructions; a number = counting down; 0 = "เริ่ม!"
  const [count, setCount] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const anim = useRef(new Animated.Value(1)).current;
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  const light = tone === "light";

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v: boolean) => {
        if (alive) setReduceMotion(!!v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (count === null) return;
    if (reduceMotion) {
      anim.setValue(1);
    } else {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.6)), useNativeDriver: NATIVE_DRIVER }).start();
    }
    const t = setTimeout(() => {
      if (count > 0) setCount(count - 1);
      else onStartRef.current();
    }, count > 0 ? TICK_MS : GO_MS);
    return () => clearTimeout(t);
  }, [count, reduceMotion, anim]);

  const begin = () => {
    if (countdown > 0) setCount(countdown);
    else onStartRef.current();
  };

  const c = light ? lightColors : darkColors;

  if (count !== null) {
    const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
    const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" });
    const go = count === 0;
    return (
      <View style={styles.countWrap}>
        <Text style={[styles.countTitle, { color: c.muted }]}>{title}</Text>
        <Animated.View
          style={[styles.countCircle, { borderColor: accent, backgroundColor: c.circle, opacity, transform: [{ scale }] }]}
          accessibilityLiveRegion="assertive"
          accessibilityLabel={go ? "เริ่ม" : `${count}`}
        >
          <Text style={[go ? styles.goText : styles.countText, { color: go ? accent : c.text }]}>{go ? "เริ่ม!" : count}</Text>
        </Animated.View>
        <Text style={[styles.countHint, { color: c.muted }]}>{go ? "ไปกันเลย" : "เตรียมตัวให้พร้อม"}</Text>
        {!go ? (
          <Pressable onPress={() => setCount(null)} style={styles.linkBtn} accessibilityRole="button">
            <Text style={[styles.link, { color: c.muted }]}>รอก่อน</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <View style={[styles.iconWrap, { backgroundColor: accent + (light ? "1f" : "33") }]}>
        <Feather name={icon as any} size={34} color={light ? accent : "#fff"} />
      </View>
      {kicker ? <Text style={[styles.kicker, { color: accent }]}>{kicker}</Text> : null}
      <Text style={[styles.title, { color: c.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: c.muted }]}>{subtitle}</Text> : null}

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.cardLabel, { color: c.muted }]}>ทำแบบนี้</Text>
        {steps.map((s, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={[styles.stepNum, { backgroundColor: accent }]}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepText, { color: c.text }]}>{s}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={begin}
        style={({ pressed }) => [styles.start, { backgroundColor: accent }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
        accessibilityRole="button"
        accessibilityHint={countdown > 0 ? `นับถอยหลัง ${countdown} วินาทีแล้วเริ่ม` : undefined}
      >
        <Feather name="play" size={18} color="#fff" />
        <Text style={styles.startText}>{startLabel}</Text>
      </Pressable>
      {countdown > 0 ? <Text style={[styles.note, { color: c.muted }]}>แตะแล้วจะนับ {Array.from({ length: countdown }, (_, i) => countdown - i).join(" ")} ก่อนเริ่ม</Text> : null}
      {onCancel ? (
        <Pressable onPress={onCancel} style={styles.linkBtn} accessibilityRole="button">
          <Text style={[styles.link, { color: c.muted }]}>{cancelLabel}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const darkColors = {
  text: "#fff",
  muted: "rgba(255,255,255,0.7)",
  card: "rgba(255,255,255,0.07)",
  border: "rgba(255,255,255,0.12)",
  circle: "rgba(255,255,255,0.06)",
};

const lightColors = {
  text: "#1e293b",
  muted: "#64748b",
  card: "#ffffff",
  border: "rgba(0,0,0,0.08)",
  circle: "#ffffff",
};

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: "center", alignItems: "stretch", paddingHorizontal: 24, paddingVertical: 28, width: "100%", maxWidth: 520, alignSelf: "center" },
  iconWrap: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 14 },
  kicker: { fontFamily: BODY, fontSize: 13, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  title: { fontFamily: HEADING, fontSize: 26, fontWeight: "700", textAlign: "center", lineHeight: 34 },
  subtitle: { fontFamily: BODY, fontSize: 14, textAlign: "center", marginTop: 4, lineHeight: 20 },
  card: { borderRadius: 20, borderWidth: 1, padding: 16, marginTop: 20, gap: 12 },
  cardLabel: { fontFamily: BODY, fontSize: 12, fontWeight: "700" },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 1 },
  stepNumText: { fontFamily: HEADING, color: "#fff", fontSize: 14, fontWeight: "700" },
  stepText: { flex: 1, fontFamily: BODY, fontSize: 16, lineHeight: 24 },
  start: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", paddingVertical: 17, borderRadius: 999, marginTop: 24 },
  startText: { fontFamily: HEADING, color: "#fff", fontSize: 18, fontWeight: "700" },
  note: { fontFamily: BODY, fontSize: 12, textAlign: "center", marginTop: 10 },
  linkBtn: { alignSelf: "center", padding: 12, marginTop: 4 },
  link: { fontFamily: BODY, fontSize: 14, textDecorationLine: "underline" },
  countWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 28 },
  countTitle: { fontFamily: BODY, fontSize: 16, fontWeight: "600", textAlign: "center" },
  countCircle: { width: 190, height: 190, borderRadius: 95, borderWidth: 6, alignItems: "center", justifyContent: "center", marginVertical: 26 },
  countText: { fontFamily: HEADING, fontSize: 96, fontWeight: "700", lineHeight: 112 },
  goText: { fontFamily: HEADING, fontSize: 52, fontWeight: "700", lineHeight: 64 },
  countHint: { fontFamily: BODY, fontSize: 15, textAlign: "center" },
});
