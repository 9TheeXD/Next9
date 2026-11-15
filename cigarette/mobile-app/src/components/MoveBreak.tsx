import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Easing } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import ReadyGate from "@/components/ReadyGate";

/**
 * A guided 4-minute movement break. Even 5 minutes of light or seated isometric exercise lowers
 * cigarette cravings and withdrawal symptoms (Taylor, Ussher & Faulkner, Addiction 2007).
 * Every move can be done in a small room or at a desk.
 */

interface Move {
  name: string;
  how: string;
  /** What to do, shown on the ready screen before the timer starts. */
  steps: string[];
  seconds: number;
  icon: string;
}

const MOVES: Move[] = [
  {
    name: "ย่ำเท้าอยู่กับที่",
    how: "ยกเข่าสลับซ้าย-ขวา แกว่งแขนตามจังหวะ",
    steps: ["ยืนขึ้น เว้นที่ว่างรอบตัวสักหนึ่งก้าว", "ย่ำเท้ากับที่ ยกเข่าสลับซ้าย-ขวา", "แกว่งแขนตามจังหวะ หายใจตามสบาย ไม่ต้องกลั้น"],
    seconds: 45,
    icon: "activity",
  },
  {
    name: "หมุนไหล่",
    how: "หมุนไหล่ไปข้างหลังช้าๆ แล้วสลับไปข้างหน้า คลายความตึง",
    steps: ["ยืนหรือนั่งหลังตรง ปล่อยแขนไว้ข้างลำตัว", "หมุนไหล่ไปข้างหลังช้าๆ เป็นวงกว้าง", "ผ่านไปครึ่งเวลา สลับหมุนไปข้างหน้า"],
    seconds: 30,
    icon: "refresh-cw",
  },
  {
    name: "ดันกำแพง",
    how: "มือยันกำแพงระดับไหล่ งอศอกเข้าหากำแพงแล้วดันออกช้าๆ",
    steps: ["ยืนหันหน้าเข้ากำแพง ห่างราวหนึ่งช่วงแขน", "วางฝ่ามือบนกำแพงระดับไหล่", "งอศอกให้ตัวเข้าหากำแพง แล้วดันกลับช้าๆ ทำต่อเนื่อง"],
    seconds: 45,
    icon: "maximize",
  },
  {
    name: "ลุกนั่งเก้าอี้",
    how: "ลุกขึ้นยืนจากเก้าอี้ แล้วค่อยๆ นั่งลง ทำต่อเนื่อง",
    steps: ["นั่งบนเก้าอี้ที่มั่นคง เท้าวางราบกับพื้น", "ลุกขึ้นยืนให้สุด แล้วค่อยๆ นั่งลง", "ทำต่อเนื่องตามจังหวะของตัวเอง ใช้มือช่วยพยุงได้"],
    seconds: 45,
    icon: "chevrons-up",
  },
  {
    name: "พนมมือกดเกร็ง",
    how: "พนมมือระดับอก กดฝ่ามือเข้าหากันแรงๆ 10 วินาที แล้วคลาย ทำซ้ำ",
    steps: ["พนมมือระดับอก กางศอกออกเล็กน้อย", "กดฝ่ามือเข้าหากันแรงๆ ค้างไว้ราว 10 วินาที", "คลายมือ พักสั้นๆ แล้วทำซ้ำ หายใจปกติ อย่ากลั้น"],
    seconds: 40,
    icon: "pause",
  },
  {
    name: "ยืดตัวหายใจลึก",
    how: "ประสานมือเหนือศีรษะ ยืดตัวให้สุด หายใจเข้าลึก ผ่อนออกยาว",
    steps: ["ประสานมือแล้วยกขึ้นเหนือศีรษะ", "ยืดตัวขึ้นให้สุด หายใจเข้าลึกๆ ทางจมูก", "ค่อยๆ ผ่อนลมหายใจออกยาวทางปาก แล้วยืดซ้ำ"],
    seconds: 35,
    icon: "sun",
  },
];

const SIZE = 220;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export default function MoveBreak({ onDone }: { onDone: () => void }) {
  // `ready` is false while the ready screen for the current move is showing: the timer and the
  // pulse only start after the user has read what to do and tapped start.
  const [pos, setPos] = useState({ idx: 0, left: MOVES[0].seconds, done: false, ready: false });
  const [running, setRunning] = useState(true);
  const { idx, left, done, ready } = pos;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ready || done) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, ready, done]);

  useEffect(() => {
    if (!running || done || !ready) return;
    const t = setInterval(() => {
      setPos((p) => {
        if (p.done) return p;
        if (p.left > 1) return { ...p, left: p.left - 1 };
        if (p.idx + 1 < MOVES.length) return { idx: p.idx + 1, left: MOVES[p.idx + 1].seconds, done: false, ready: false };
        return { ...p, left: 0, done: true };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, done, ready]);

  const finished = done;
  const move = MOVES[idx];
  const progress = 1 - left / move.seconds;
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  const skip = () => {
    setPos((p) => (p.idx + 1 < MOVES.length ? { idx: p.idx + 1, left: MOVES[p.idx + 1].seconds, done: false, ready: false } : { ...p, left: 0, done: true }));
  };

  const start = () => {
    setRunning(true);
    setPos((p) => ({ ...p, left: MOVES[p.idx].seconds, ready: true }));
  };

  if (finished) {
    return (
      <View style={styles.center}>
        <View style={styles.doneBadge}>
          <Feather name="check" size={44} color="#fff" />
        </View>
        <Text style={styles.doneTitle}>ครบทุกท่าแล้ว</Text>
        <Text style={styles.doneText}>ร่างกายได้ขยับ หัวใจเต้นแรงขึ้นเล็กน้อย ความอยากมักเบาลงหลังออกกำลังกายสั้นๆ แบบนี้</Text>
        <Pressable style={styles.primary} onPress={onDone} accessibilityRole="button">
          <Text style={styles.primaryText}>ไปดูว่าความอยากเหลือเท่าไหร่</Text>
        </Pressable>
      </View>
    );
  }

  if (!ready) {
    const total = Math.round(MOVES.reduce((n, m) => n + m.seconds, 0) / 60);
    return (
      <ReadyGate
        key={idx}
        kicker={idx === 0 ? `${MOVES.length} ท่าง่ายๆ ราว ${total} นาที · ท่าที่ 1` : `ท่าต่อไป · ท่าที่ ${idx + 1} จาก ${MOVES.length}`}
        title={move.name}
        subtitle={`ทำต่อเนื่อง ${move.seconds} วินาที`}
        steps={move.steps}
        icon={move.icon}
        accent="#14b8a6"
        onStart={start}
        onCancel={onDone}
        cancelLabel={idx === 0 ? "ไม่ทำตอนนี้" : "พอแล้ว ไปต่อ"}
      />
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.step}>
        ท่าที่ {idx + 1} จาก {MOVES.length}
      </Text>
      <Animated.View style={{ transform: [{ scale }], marginVertical: 18 }}>
        <Svg width={SIZE} height={SIZE}>
          <Defs>
            <SvgGradient id="mv" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#5eead4" />
              <Stop offset="1" stopColor="#818cf8" />
            </SvgGradient>
          </Defs>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="rgba(255,255,255,0.12)" strokeWidth={STROKE} fill="none" />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke="url(#mv)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${C} ${C}`}
            strokeDashoffset={C * (1 - progress)}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </Svg>
        <View style={styles.ringInner}>
          <Feather name={move.icon as any} size={34} color="#a5f3fc" />
          <Text style={styles.seconds}>{left}</Text>
          <Text style={styles.secLabel}>วินาที</Text>
        </View>
      </Animated.View>
      <Text style={styles.moveName}>{move.name}</Text>
      <Text style={styles.moveHow}>{move.how}</Text>
      <View style={styles.dots}>
        {MOVES.map((_, i) => (
          <View key={i} style={[styles.dot, i < idx && styles.dotDone, i === idx && styles.dotNow]} />
        ))}
      </View>
      <View style={styles.row}>
        <Pressable style={styles.ghost} onPress={() => setRunning((r) => !r)} accessibilityRole="button">
          <Feather name={running ? "pause" : "play"} size={16} color="#fff" />
          <Text style={styles.ghostText}>{running ? "พัก" : "ต่อ"}</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={skip} accessibilityRole="button">
          <Feather name="skip-forward" size={16} color="#fff" />
          <Text style={styles.ghostText}>ท่าถัดไป</Text>
        </Pressable>
      </View>
      <Pressable onPress={onDone} style={{ marginTop: 14, padding: 8 }} accessibilityRole="button">
        <Text style={styles.link}>พอแล้ว ไปต่อ</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  step: { color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: "600" },
  ringInner: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  seconds: { color: "#fff", fontSize: 54, fontWeight: "800", marginTop: 2 },
  secLabel: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: -6 },
  moveName: { color: "#fff", fontSize: 24, fontWeight: "800", textAlign: "center" },
  moveHow: { color: "rgba(255,255,255,0.8)", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 8, maxWidth: 340 },
  dots: { flexDirection: "row", gap: 8, marginTop: 22 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.2)" },
  dotDone: { backgroundColor: "#5eead4" },
  dotNow: { backgroundColor: "#fff", width: 22 },
  row: { flexDirection: "row", gap: 12, marginTop: 24 },
  ghost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  ghostText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  link: { color: "rgba(255,255,255,0.75)", fontSize: 14, textDecorationLine: "underline" },
  doneBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#14b8a6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  doneTitle: { color: "#fff", fontSize: 26, fontWeight: "800" },
  doneText: { color: "rgba(255,255,255,0.8)", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 10, marginBottom: 26 },
  primary: { backgroundColor: "#14b8a6", paddingHorizontal: 26, paddingVertical: 15, borderRadius: 999 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
