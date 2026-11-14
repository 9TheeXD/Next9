import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { TRIGGERS, ACTIONS, SUGGESTED, updatePlan, loadPlan, insights, newId, triggerLabel, actionLabel } from "@/lib/quitPlan";

/**
 * After a slip: no blame, find the trigger, make an if-then plan for next time, start again now.
 * Follows smokefree.gov guidance on slips: a slip is not failure and not back to square one,
 * restart right away, learn what triggered it.
 */
export default function SlipRecovery({ onDone, presetTrigger }: { onDone: () => void; presetTrigger?: string | null }) {
  const { user } = useAuth();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [trigger, setTrigger] = useState<string | null>(presetTrigger ?? null);
  const [action, setAction] = useState<string | null>(presetTrigger ? SUGGESTED[presetTrigger] ?? null : null);
  const [resisted, setResisted] = useState(0);

  useEffect(() => {
    loadPlan(user?.id).then((p) => setResisted(insights(p).resisted));
  }, [user?.id]);

  const save = async () => {
    await updatePlan(user?.id, (p) => ({
      ...p,
      slips: [...p.slips, { at: new Date().toISOString(), trigger, plan: action }],
      plans:
        trigger && action && !p.plans.some((x) => x.trigger === trigger && x.action === action)
          ? [...p.plans, { id: newId(), trigger, action, createdAt: new Date().toISOString() }]
          : p.plans,
    }));
    api
      .postActionLog({
        action: "SLIP",
        details: `เผลอสูบ${trigger ? ` (${triggerLabel(trigger)})` : ""} · แผนครั้งหน้า: ${actionLabel(action) || "-"}`,
        metadata: { trigger, plan: action },
      })
      .catch(() => {});
    setStep(3);
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      {step === 0 && (
        <View>
          <View style={styles.hug}>
            <Feather name="heart" size={34} color="#fda4af" />
          </View>
          <Text style={styles.h1}>เผลอสูบไป ไม่ได้แปลว่าล้มเหลว</Text>
          <Text style={styles.p}>
            คนส่วนใหญ่ต้องลองหลายครั้งกว่าจะเลิกได้ การเผลอสูบหนึ่งสองมวนไม่ได้ทำให้คุณกลับไปเริ่มที่ศูนย์ และไม่ได้แปลว่าต้องกลับไปสูบเหมือนเดิม
          </Text>
          <Text style={styles.p}>
            สิ่งสำคัญคือเริ่มใหม่ทันที วันนี้เลย แล้วใช้ครั้งนี้เป็นบทเรียนว่าอะไรทำให้เผลอ
          </Text>
          {resisted > 0 ? (
            <View style={styles.stat}>
              <Feather name="award" size={18} color="#fde68a" />
              <Text style={styles.statText}>คุณเคยผ่านความอยากมาแล้ว {resisted} ครั้ง ความพยายามนั้นยังนับอยู่</Text>
            </View>
          ) : null}
          <Pressable style={styles.primary} onPress={() => setStep(1)} accessibilityRole="button">
            <Text style={styles.primaryText}>มาวางแผนกันใหม่</Text>
          </Pressable>
        </View>
      )}

      {step === 1 && (
        <View>
          <Text style={styles.h2}>อะไรทำให้เผลอสูบ?</Text>
          <Text style={styles.sub}>เลือกสถานการณ์ที่ใกล้ที่สุด</Text>
          <View style={styles.chips}>
            {TRIGGERS.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => {
                  setTrigger(t.id);
                  setAction(SUGGESTED[t.id] ?? null);
                }}
                style={[styles.chip, trigger === t.id && styles.chipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: trigger === t.id }}
              >
                <Feather name={t.icon as any} size={14} color={trigger === t.id ? "#1e1b4b" : "#e2e8f0"} />
                <Text style={[styles.chipText, trigger === t.id && styles.chipTextOn]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.primary, !trigger && styles.disabled]} disabled={!trigger} onPress={() => setStep(2)} accessibilityRole="button">
            <Text style={styles.primaryText}>ต่อไป</Text>
          </Pressable>
        </View>
      )}

      {step === 2 && (
        <View>
          <Text style={styles.h2}>ครั้งหน้าถ้า{triggerLabel(trigger)} ฉันจะ…</Text>
          <Text style={styles.sub}>แผนแบบ "ถ้า…ฉันจะ…" ช่วยให้รับมือได้ทันทีโดยไม่ต้องคิดใหม่</Text>
          <View style={{ gap: 8, marginTop: 6 }}>
            {ACTIONS.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => setAction(a.id)}
                style={[styles.option, action === a.id && styles.optionOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: action === a.id }}
              >
                <Feather name={a.icon as any} size={18} color={action === a.id ? "#5eead4" : "#94a3b8"} />
                <Text style={styles.optionText}>{a.label}</Text>
                {action === a.id ? <Feather name="check-circle" size={18} color="#5eead4" /> : null}
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.primary, !action && styles.disabled]} disabled={!action} onPress={save} accessibilityRole="button">
            <Text style={styles.primaryText}>บันทึกแผนนี้</Text>
          </Pressable>
        </View>
      )}

      {step === 3 && (
        <View>
          <View style={[styles.hug, { backgroundColor: "rgba(94,234,212,0.15)" }]}>
            <Feather name="sunrise" size={34} color="#5eead4" />
          </View>
          <Text style={styles.h1}>เริ่มใหม่ตั้งแต่ตอนนี้</Text>
          {trigger && action ? (
            <View style={styles.planCard}>
              <Text style={styles.planLabel}>แผนใหม่ของคุณ</Text>
              <Text style={styles.planText}>
                ถ้า<Text style={styles.bold}>{triggerLabel(trigger)}</Text> ฉันจะ<Text style={styles.bold}>{actionLabel(action)}</Text>
              </Text>
            </View>
          ) : null}
          <View style={{ gap: 10, marginTop: 6 }}>
            <Tip icon="trash-2" text="ทิ้งบุหรี่ ไฟแช็ก หรือพอตที่เหลือ ไม่ให้อยู่ใกล้มือ" />
            <Tip icon="activity" text="ถ้าใช้หมากฝรั่งหรือแผ่นแปะนิโคตินอยู่ ใช้ต่อได้ ไม่ต้องหยุดเพราะเผลอสูบ" />
            <Tip icon="users" text="บอกคนที่ไว้ใจ ให้ช่วยดูแลในช่วงที่เสี่ยง" />
          </View>
          <Pressable style={styles.callCard} onPress={() => Linking.openURL("tel:1600")} accessibilityRole="button">
            <Feather name="phone-call" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={styles.callTitle}>คุยกับผู้เชี่ยวชาญ โทร 1600</Text>
              <Text style={styles.callSub}>สายเลิกบุหรี่ ฟรี ช่วยวางแผนเลิกใหม่ได้</Text>
            </View>
          </Pressable>
          <Pressable style={styles.primary} onPress={onDone} accessibilityRole="button">
            <Text style={styles.primaryText}>ไปต่อ</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function Tip({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.tip}>
      <Feather name={icon as any} size={16} color="#a5b4fc" style={{ marginTop: 2 }} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, paddingBottom: 48 },
  hug: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(253,164,175,0.15)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 18,
    marginTop: 8,
  },
  h1: { color: "#fff", fontSize: 24, fontWeight: "800", textAlign: "center", marginBottom: 14, lineHeight: 32 },
  h2: { color: "#fff", fontSize: 21, fontWeight: "800", lineHeight: 29 },
  sub: { color: "rgba(255,255,255,0.65)", fontSize: 14, marginTop: 4, marginBottom: 14, lineHeight: 20 },
  p: { color: "rgba(255,255,255,0.85)", fontSize: 15, lineHeight: 24, marginBottom: 12, textAlign: "center" },
  stat: { flexDirection: "row", gap: 10, alignItems: "center", backgroundColor: "rgba(253,230,138,0.1)", padding: 14, borderRadius: 14, marginVertical: 8 },
  statText: { flex: 1, color: "#fde68a", fontSize: 14, lineHeight: 20, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  chipOn: { backgroundColor: "#c7d2fe", borderColor: "#c7d2fe" },
  chipText: { color: "#e2e8f0", fontSize: 14, fontWeight: "600" },
  chipTextOn: { color: "#1e1b4b" },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  optionOn: { borderColor: "#5eead4", backgroundColor: "rgba(94,234,212,0.1)" },
  optionText: { flex: 1, color: "#fff", fontSize: 15, fontWeight: "600" },
  primary: { backgroundColor: "#6366f1", paddingVertical: 16, borderRadius: 999, alignItems: "center", marginTop: 22 },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.4 },
  planCard: { backgroundColor: "rgba(94,234,212,0.1)", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(94,234,212,0.35)", marginBottom: 14 },
  planLabel: { color: "#5eead4", fontSize: 12, fontWeight: "800", marginBottom: 4 },
  planText: { color: "#fff", fontSize: 17, lineHeight: 26 },
  bold: { fontWeight: "800" },
  tip: { flexDirection: "row", gap: 10 },
  tipText: { flex: 1, color: "rgba(255,255,255,0.82)", fontSize: 14, lineHeight: 21 },
  callCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#be123c", padding: 16, borderRadius: 16, marginTop: 18 },
  callTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  callSub: { color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 2 },
});
