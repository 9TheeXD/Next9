import React, { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import {
  TRIGGERS, ACTIONS, SUGGESTED, REASON_IDEAS, loadPlan, updatePlan, insights, newId, triggerLabel, actionLabel, type QuitPlan,
} from "@/lib/quitPlan";

/**
 * "แผนของฉัน": the user's reasons, if-then plans and what their craving log shows, plus the
 * withdrawal timeline and where to get proven help (quitline, medication). Apps work best together
 * with medication and counselling (Guo et al., JMIR 2023), so the help section is not an afterthought.
 */
export default function QuitToolkit({ onStartRescue }: { onStartRescue?: () => void }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<QuitPlan | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [adding, setAdding] = useState(false);
  const [newTrigger, setNewTrigger] = useState<string | null>(null);
  const [newAction, setNewAction] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadPlan(user?.id).then(setPlan);
    }, [user?.id])
  );

  const change = async (fn: (p: QuitPlan) => QuitPlan) => setPlan(await updatePlan(user?.id, fn));

  if (!plan) return null;
  const ins = insights(plan);
  const isPod = user?.smokingType === "POD";

  const addReason = (r: string) => {
    const v = r.trim();
    if (!v || plan.reasons.includes(v)) return;
    change((p) => ({ ...p, reasons: [...p.reasons, v] }));
    setReasonText("");
  };

  const savePlan = () => {
    if (!newTrigger || !newAction) return;
    change((p) => ({
      ...p,
      plans: [...p.plans.filter((x) => x.trigger !== newTrigger), { id: newId(), trigger: newTrigger, action: newAction, createdAt: new Date().toISOString() }],
    }));
    setAdding(false);
    setNewTrigger(null);
    setNewAction(null);
  };

  return (
    <View style={styles.wrap}>
      {/* What the craving log shows */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Feather name="bar-chart-2" size={18} color="#7c3aed" />
          <Text style={styles.cardTitle}>สิ่งที่เรียนรู้จากความอยากของคุณ</Text>
        </View>
        {ins.total === 0 ? (
          <>
            <Text style={styles.muted}>ทุกครั้งที่อยากสูบ กดปุ่ม "ฉันอยากสูบตอนนี้" แอปจะช่วยรับมือ แล้วสรุปให้ว่าอะไรกระตุ้นคุณบ่อย และวิธีไหนได้ผลกับคุณที่สุด</Text>
            {onStartRescue ? (
              <Pressable style={styles.inlineBtn} onPress={onStartRescue} accessibilityRole="button">
                <Feather name="life-buoy" size={16} color="#fff" />
                <Text style={styles.inlineBtnText}>ลองตอนนี้</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.statRow}>
              <Stat n={`${ins.resisted}`} label="ครั้งที่ผ่านไปได้" />
              <Stat n={ins.avgDrop !== null ? `−${ins.avgDrop.toFixed(1)}` : "–"} label="ความอยากลดลงเฉลี่ย" />
              <Stat n={`${ins.thisWeek}`} label="ครั้งในสัปดาห์นี้" />
            </View>
            {ins.topTriggers.length ? (
              <Text style={styles.line}>
                ตัวกระตุ้นบ่อยที่สุด: <Text style={styles.bold}>{ins.topTriggers.map((t) => triggerLabel(t.id)).join(", ")}</Text>
              </Text>
            ) : null}
            {ins.busiestHour !== null ? (
              <Text style={styles.line}>
                ช่วงเวลาเสี่ยง: <Text style={styles.bold}>{ins.busiestHour}:00–{ins.busiestHour + 1}:00 น.</Text> ลองวางแผนกิจกรรมอื่นไว้ช่วงนี้
              </Text>
            ) : null}
            {ins.bestTool ? (
              <Text style={styles.line}>
                วิธีที่ได้ผลกับคุณที่สุด: <Text style={styles.bold}>{actionLabel(ins.bestTool) || ins.bestTool}</Text>
              </Text>
            ) : null}
          </>
        )}
      </View>

      {/* Reasons */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Feather name="heart" size={18} color="#e11d48" />
          <Text style={styles.cardTitle}>เหตุผลที่ฉันอยากเลิก</Text>
        </View>
        <Text style={styles.muted}>แอปจะยกเหตุผลเหล่านี้ขึ้นมาให้อ่านตอนที่คุณอยากสูบ</Text>
        {plan.reasons.map((r) => (
          <View key={r} style={styles.reason}>
            <Text style={styles.reasonText}>{r}</Text>
            <Pressable
              onPress={() => change((p) => ({ ...p, reasons: p.reasons.filter((x) => x !== r) }))}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`ลบ ${r}`}
            >
              <Feather name="x" size={16} color="#94a3b8" />
            </Pressable>
          </View>
        ))}
        <View style={styles.addRow}>
          <TextInput
            value={reasonText}
            onChangeText={setReasonText}
            placeholder="เพิ่มเหตุผลของคุณ"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            onSubmitEditing={() => addReason(reasonText)}
            maxLength={80}
          />
          <Pressable style={styles.addBtn} onPress={() => addReason(reasonText)} accessibilityRole="button" accessibilityLabel="เพิ่ม">
            <Feather name="plus" size={18} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.chips}>
          {REASON_IDEAS.filter((r) => !plan.reasons.includes(r))
            .slice(0, 5)
            .map((r) => (
              <Pressable key={r} style={styles.chip} onPress={() => addReason(r)} accessibilityRole="button">
                <Feather name="plus" size={11} color="#475569" />
                <Text style={styles.chipText}>{r}</Text>
              </Pressable>
            ))}
        </View>
      </View>

      {/* If-then plans */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Feather name="git-branch" size={18} color="#0f766e" />
          <Text style={styles.cardTitle}>แผน "ถ้า…ฉันจะ…"</Text>
        </View>
        <Text style={styles.muted}>คิดคำตอบไว้ก่อนเจอสถานการณ์เสี่ยง พอเจอจริงจะทำได้ทันทีโดยไม่ต้องสู้กับความอยาก งานวิจัยพบว่าแผนแบบนี้ช่วยให้เลิกได้มากขึ้น</Text>
        {plan.plans.map((p) => (
          <View key={p.id} style={styles.planRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.planText}>
                ถ้า<Text style={styles.bold}>{triggerLabel(p.trigger)}</Text>
              </Text>
              <Text style={styles.planThen}>→ ฉันจะ{actionLabel(p.action)}</Text>
            </View>
            <Pressable onPress={() => change((x) => ({ ...x, plans: x.plans.filter((y) => y.id !== p.id) }))} hitSlop={10} accessibilityRole="button" accessibilityLabel="ลบแผน">
              <Feather name="trash-2" size={16} color="#94a3b8" />
            </Pressable>
          </View>
        ))}
        {adding ? (
          <View style={styles.builder}>
            <Text style={styles.builderLabel}>ถ้า…</Text>
            <View style={styles.chips}>
              {TRIGGERS.map((t) => (
                <Pressable
                  key={t.id}
                  style={[styles.chip, newTrigger === t.id && styles.chipOn]}
                  onPress={() => {
                    setNewTrigger(t.id);
                    if (!newAction) setNewAction(SUGGESTED[t.id] ?? null);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: newTrigger === t.id }}
                >
                  <Text style={[styles.chipText, newTrigger === t.id && styles.chipTextOn]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.builderLabel, { marginTop: 12 }]}>ฉันจะ…</Text>
            <View style={styles.chips}>
              {ACTIONS.map((a) => (
                <Pressable
                  key={a.id}
                  style={[styles.chip, newAction === a.id && styles.chipOn]}
                  onPress={() => setNewAction(a.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: newAction === a.id }}
                >
                  <Text style={[styles.chipText, newAction === a.id && styles.chipTextOn]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Pressable style={[styles.inlineBtn, { flex: 1, justifyContent: "center" }, (!newTrigger || !newAction) && { opacity: 0.4 }]} disabled={!newTrigger || !newAction} onPress={savePlan} accessibilityRole="button">
                <Text style={styles.inlineBtnText}>บันทึกแผน</Text>
              </Pressable>
              <Pressable style={styles.ghostBtn} onPress={() => setAdding(false)} accessibilityRole="button">
                <Text style={styles.ghostBtnText}>ยกเลิก</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.addPlan} onPress={() => setAdding(true)} accessibilityRole="button">
            <Feather name="plus-circle" size={18} color="#0f766e" />
            <Text style={styles.addPlanText}>เพิ่มแผน</Text>
          </Pressable>
        )}
      </View>

      {/* Withdrawal timeline */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Feather name="trending-down" size={18} color="#ea580c" />
          <Text style={styles.cardTitle}>อาการถอนนิโคตินที่ควรรู้</Text>
        </View>
        <Text style={styles.muted}>อาการเหล่านี้เป็นสัญญาณว่าร่างกายกำลังปรับตัว ไม่อันตราย และจะค่อยๆ ดีขึ้น</Text>
        <Phase when="ไม่กี่ชั่วโมงแรก" what="เริ่มอยากสูบ กระสับกระส่าย สมาธิสั้น" />
        <Phase when="วันที่ 2–3" what="ช่วงที่หนักที่สุด อาจหงุดหงิด ปวดหัว นอนไม่ค่อยหลับ ผ่านช่วงนี้ไปได้จะเบาลงชัดเจน" strong />
        <Phase when="สัปดาห์แรก" what="อาการทางกายเริ่มลดลง แต่ความอยากตามสถานการณ์ยังมา ช่วงสองสัปดาห์แรกคือช่วงที่คนกลับไปสูบมากที่สุด" />
        <Phase when="สัปดาห์ที่ 2–4" what="อาการส่วนใหญ่หายไป หายใจโล่งขึ้น รับรสและกลิ่นได้ดีขึ้น" />
        <Phase when="หลังจากนั้น" what="ความอยากยังโผล่มาเป็นครั้งคราว สั้นและเบากว่าเดิมมาก" last />
      </View>

      {/* Proven help */}
      <View style={[styles.card, { borderColor: "rgba(220,38,38,0.25)" }]}>
        <View style={styles.cardHead}>
          <Feather name="shield" size={18} color="#dc2626" />
          <Text style={styles.cardTitle}>ตัวช่วยที่ได้ผลจริง</Text>
        </View>
        <Text style={styles.muted}>แอปช่วยได้มากที่สุดเมื่อใช้ร่วมกับการปรึกษาผู้เชี่ยวชาญหรือยาช่วยเลิก</Text>
        <Pressable style={styles.help} onPress={() => Linking.openURL("tel:1600")} accessibilityRole="button">
          <View style={[styles.helpIcon, { backgroundColor: "#dc2626" }]}>
            <Feather name="phone-call" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.helpTitle}>สายเลิกบุหรี่ 1600</Text>
            <Text style={styles.helpText}>โทรฟรี ผู้ให้คำปรึกษาช่วยวางแผนเลิก และโทรติดตามให้ ใช้สิทธิบัตรทองได้</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94a3b8" />
        </Pressable>
        <View style={styles.help}>
          <View style={[styles.helpIcon, { backgroundColor: "#0ea5e9" }]}>
            <Feather name="plus-square" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.helpTitle}>ยาช่วยเลิก ปรึกษาเภสัชกรหรือแพทย์</Text>
            <Text style={styles.helpText}>
              • นิโคตินทดแทน (หมากฝรั่ง แผ่นแปะ) ช่วยลดอาการถอน ใช้ร่วมกันสองแบบได้ผลกว่าแบบเดียว{"\n"}• ไซทิซีน (ผลิตโดยองค์การเภสัชกรรม) มีที่ร้านยาที่มีเภสัชกร{"\n"}• วาเรนิคลีน และยาอื่นๆ ต้องให้แพทย์สั่ง
            </Text>
            <Text style={styles.helpNote}>ยาแต่ละตัวมีข้อห้ามต่างกัน เช่น ตั้งครรภ์ โรคหัวใจ ควรถามเภสัชกรหรือแพทย์ก่อนใช้</Text>
          </View>
        </View>
        <Pressable style={styles.help} onPress={() => Linking.openURL("tel:1323")} accessibilityRole="button">
          <View style={[styles.helpIcon, { backgroundColor: "#8b5cf6" }]}>
            <Feather name="heart" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.helpTitle}>สายด่วนสุขภาพจิต 1323</Text>
            <Text style={styles.helpText}>ถ้าช่วงเลิกทำให้เครียด เศร้า หรือรู้สึกไม่ไหว โทรคุยได้ฟรี</Text>
          </View>
          <Feather name="chevron-right" size={18} color="#94a3b8" />
        </Pressable>
        {isPod ? (
          <View style={styles.podNote}>
            <Feather name="alert-triangle" size={16} color="#b45309" />
            <Text style={styles.podText}>บุหรี่ไฟฟ้าก็มีนิโคตินและทำให้ติดเหมือนกัน แผนและเครื่องมือทั้งหมดในแอปใช้กับการเลิกพอตได้เช่นเดียวกัน</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

function Phase({ when, what, strong, last }: { when: string; what: string; strong?: boolean; last?: boolean }) {
  return (
    <View style={styles.phase}>
      <View style={styles.phaseRail}>
        <View style={[styles.phaseDot, strong && { backgroundColor: "#ea580c", width: 14, height: 14, borderRadius: 7 }]} />
        {!last ? <View style={styles.phaseLine} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
        <Text style={[styles.phaseWhen, strong && { color: "#ea580c" }]}>{when}</Text>
        <Text style={styles.phaseWhat}>{what}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, gap: 14 },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: 17, fontWeight: "800", color: "#1e293b" },
  muted: { fontSize: 13, color: "#64748b", lineHeight: 20, marginBottom: 10 },
  line: { fontSize: 14, color: "#334155", lineHeight: 22, marginTop: 6 },
  bold: { fontWeight: "800", color: "#1e293b" },
  statRow: { flexDirection: "row", gap: 8, marginVertical: 4 },
  stat: { flex: 1, backgroundColor: "#f5f3ff", borderRadius: 14, padding: 10 },
  statN: { fontSize: 22, fontWeight: "900", color: "#6d28d9" },
  statL: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  inlineBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#7c3aed", paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, alignSelf: "flex-start" },
  inlineBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  ghostBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1", justifyContent: "center" },
  ghostBtnText: { color: "#475569", fontWeight: "700" },
  reason: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff1f2", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  reasonText: { flex: 1, fontSize: 15, color: "#1e293b", fontWeight: "600" },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 2 },
  input: { flex: 1, backgroundColor: "#f8fafc", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: "#e2e8f0", color: "#1e293b" },
  addBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: "#e11d48", alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0" },
  chipOn: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  chipText: { fontSize: 12, color: "#475569", fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  planRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#f0fdfa", borderRadius: 12, padding: 12, marginBottom: 8 },
  planText: { fontSize: 14, color: "#334155" },
  planThen: { fontSize: 14, color: "#0f766e", fontWeight: "700", marginTop: 2 },
  builder: { backgroundColor: "#f8fafc", borderRadius: 14, padding: 12, marginTop: 4 },
  builderLabel: { fontSize: 14, fontWeight: "800", color: "#1e293b" },
  addPlan: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  addPlanText: { color: "#0f766e", fontWeight: "800", fontSize: 14 },
  phase: { flexDirection: "row", gap: 12 },
  phaseRail: { width: 14, alignItems: "center" },
  phaseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#fdba74", marginTop: 5 },
  phaseLine: { flex: 1, width: 2, backgroundColor: "#fed7aa", marginTop: 4 },
  phaseWhen: { fontSize: 14, fontWeight: "800", color: "#1e293b" },
  phaseWhat: { fontSize: 13, color: "#475569", lineHeight: 20, marginTop: 2 },
  help: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  helpIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  helpTitle: { fontSize: 15, fontWeight: "800", color: "#1e293b" },
  helpText: { fontSize: 13, color: "#475569", lineHeight: 20, marginTop: 2 },
  helpNote: { fontSize: 12, color: "#94a3b8", lineHeight: 18, marginTop: 6 },
  podNote: { flexDirection: "row", gap: 8, backgroundColor: "#fffbeb", padding: 12, borderRadius: 12, marginTop: 6 },
  podText: { flex: 1, fontSize: 13, color: "#92400e", lineHeight: 19 },
});
