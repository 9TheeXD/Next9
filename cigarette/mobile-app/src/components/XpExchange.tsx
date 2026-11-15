import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification, XP_BUY_COST, XP_SELL_PER_COIN } from "@/contexts/GamificationContext";
import { wallet } from "@/games/engine/economy";

const PACKS = [10, 50, 100];

/** Trade coins for XP and back. Only for people on the quit plan (the others have no XP). */
export default function XpExchange() {
  const { user } = useAuth();
  const { xp, buyXP, sellXP } = useGamification();
  const [open, setOpen] = useState(false);
  const [coins, setCoins] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    setCoins(wallet.coins());
    return wallet.subscribe(setCoins);
  }, []);

  if (Platform.OS !== "web" || user?.role !== "SMOKER") return null;

  const buy = (n: number) => {
    setNote(buyXP(n) ? `ได้ ${n} XP แล้ว` : `เหรียญไม่พอ ต้องใช้ ${(n * XP_BUY_COST).toLocaleString()} เหรียญ`);
  };
  const sell = (n: number) => {
    const got = sellXP(n);
    setNote(got > 0 ? `ได้ ${got} เหรียญแล้ว` : `XP ไม่พอ ต้องมีอย่างน้อย ${n} XP`);
  };

  return (
    <View style={styles.card}>
      <Pressable style={styles.head} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Feather name="repeat" size={18} color="#4338ca" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>แลกเหรียญ ⇄ XP</Text>
          <Text style={styles.sub}>
            มี {coins.toLocaleString()} เหรียญ · {xp.toLocaleString()} XP
          </Text>
        </View>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={20} color="#64748b" />
      </Pressable>
      {open ? (
        <View style={{ marginTop: 10, gap: 10 }}>
          <Text style={styles.rate}>
            ซื้อ XP: {XP_BUY_COST} เหรียญต่อ 1 XP · ขาย XP: {XP_SELL_PER_COIN} XP ได้ 1 เหรียญ
          </Text>
          <View style={styles.row}>
            {PACKS.map((n) => (
              <Pressable key={`b${n}`} style={[styles.btn, styles.buy]} onPress={() => buy(n)} accessibilityRole="button">
                <Text style={styles.btnTop}>+{n} XP</Text>
                <Text style={styles.btnSub}>{(n * XP_BUY_COST).toLocaleString()} เหรียญ</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.row}>
            {PACKS.map((n) => (
              <Pressable key={`s${n * 2}`} style={[styles.btn, styles.sell]} onPress={() => sell(n * 2)} accessibilityRole="button">
                <Text style={[styles.btnTop, { color: "#92400e" }]}>+{n} เหรียญ</Text>
                <Text style={[styles.btnSub, { color: "#b45309" }]}>ใช้ {(n * XP_SELL_PER_COIN).toLocaleString()} XP</Text>
              </Pressable>
            ))}
          </View>
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <Text style={styles.hint}>XP บอกระดับความตั้งใจเลิกบุหรี่ ขาย XP แล้วระดับอาจลดลง</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#eef2ff", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "#c7d2fe" },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 15, fontWeight: "800", color: "#312e81" },
  sub: { fontSize: 12, color: "#64748b", marginTop: 1 },
  rate: { fontSize: 12, color: "#475569" },
  row: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  buy: { backgroundColor: "#e0e7ff" },
  sell: { backgroundColor: "#fef3c7" },
  btnTop: { fontSize: 14, fontWeight: "800", color: "#3730a3" },
  btnSub: { fontSize: 11, color: "#4f46e5", marginTop: 2 },
  note: { fontSize: 13, fontWeight: "700", color: "#0f766e", textAlign: "center" },
  hint: { fontSize: 11, color: "#94a3b8", textAlign: "center" },
});
