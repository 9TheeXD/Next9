import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Linking, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { useAlert } from "@/contexts/AlertContext";
import { api } from "@/lib/api";
import { findGame, type GameDefinition } from "@/games";
import GameHost from "@/components/GameHost";
import MoveBreak from "@/components/MoveBreak";
import SlipRecovery from "@/components/SlipRecovery";
import {
  TRIGGERS, ACTIONS, REASON_IDEAS, loadPlan, updatePlan, triggerLabel, actionLabel, type QuitPlan,
} from "@/lib/quitPlan";

/**
 * Craving rescue: rate the craving → pick a way through it (game, slow breathing, a movement break,
 * your own reasons, a person to talk to) → rate it again. Seeing the number drop is the point: it
 * shows the craving passes, which builds confidence for the next one.
 */

type Step = "rate" | "tools" | "game" | "move" | "reasons" | "talk" | "after" | "result" | "slip";

const WAVE_SECONDS = 300;

function strengthColor(n: number) {
  const stops = ["#34d399", "#a3e635", "#facc15", "#fb923c", "#f87171"];
  return stops[Math.min(4, Math.floor((n - 1) / 2))];
}

export default function CravingRescue({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { addXP, completeDailyMission } = useGamification();
  const { showAlert } = useAlert();
  const router = useRouter();
  const [step, setStep] = useState<Step>("rate");
  const [before, setBefore] = useState<number | null>(null);
  const [after, setAfter] = useState<number | null>(null);
  const [trigger, setTrigger] = useState<string | null>(null);
  const [tools, setTools] = useState<string[]>([]);
  const [game, setGame] = useState<GameDefinition | null>(null);
  const [plan, setPlan] = useState<QuitPlan | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(Date.now());
  const savedRef = useRef(false);

  useEffect(() => {
    loadPlan(user?.id).then(setPlan);
  }, [user?.id]);

  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const markTool = (id: string) => setTools((t) => (t.includes(id) ? t : [...t, id]));

  const myPlan = useMemo(() => (trigger && plan ? plan.plans.find((p) => p.trigger === trigger) : undefined), [trigger, plan]);

  // One craving = one entry. Rating again after trying another tool updates the same entry.
  const xpGiven = useRef(false);
  const save = async (afterValue: number | null, smoked = false) => {
    if (before === null) return;
    const entry = { at: new Date(startedAt.current).toISOString(), before, after: afterValue, trigger, tools, smoked };
    const first = !savedRef.current;
    savedRef.current = true;
    const next = await updatePlan(user?.id, (p) => {
      const cravings = [...p.cravings];
      const i = first ? -1 : cravings.findIndex((c) => c.at === entry.at);
      if (i >= 0) cravings[i] = entry;
      else cravings.push(entry);
      return { ...p, cravings };
    });
    setPlan(next);
    if (first) api.postLog({ cravingCount: 1 }).catch(() => {});
    api
      .postActionLog({
        action: smoked ? "CRAVING_SLIP" : "CRAVING_RESCUE",
        details: `ความอยาก ${before}${afterValue !== null ? ` → ${afterValue}` : ""}${trigger ? ` · ${triggerLabel(trigger)}` : ""}`,
        metadata: { ...entry, seconds: Math.round((Date.now() - startedAt.current) / 1000) },
      })
      .catch(() => {});
    if (!xpGiven.current && afterValue !== null && afterValue < before && !smoked) {
      xpGiven.current = true;
      addXP(20, "ผ่านความอยากไปได้");
      completeDailyMission("minigame");
    }
  };

  const close = () => {
    if (before !== null && !savedRef.current) save(null);
    onClose();
  };


  // ── Sub-screens that take the whole area ──────────────────────────────────
  if (step === "game" && game) {
    return (
      <GameHost
        game={game}
        exitLabel="เสร็จแล้ว"
        onExit={() => {
          setGame(null);
          setStep("after");
        }}
      />
    );
  }

  return (
    <LinearGradient colors={["#0b1027", "#1e1b4b", "#0f3b47"]} style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={close} style={styles.close} accessibilityRole="button" accessibilityLabel="ปิด">
          <Feather name="x" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.topTitle}>ผ่านความอยากไปด้วยกัน</Text>
        <View style={styles.timerPill}>
          <Feather name="clock" size={12} color="#a5f3fc" />
          <Text style={styles.timerText}>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </Text>
        </View>
      </View>

      {step === "move" ? (
        <MoveBreak onDone={() => setStep("after")} />
      ) : step === "slip" ? (
        <SlipRecovery presetTrigger={trigger} onDone={onClose} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {step === "rate" && (
            <View>
              <Text style={styles.h1}>ตอนนี้อยากสูบแค่ไหน?</Text>
              <Text style={styles.lead}>ความอยากเหมือนคลื่น มันจะขึ้นสูงสุดแล้วค่อยๆ ลดลงเองภายในไม่กี่นาที เราจะช่วยให้คุณผ่านช่วงนี้ไป</Text>
              <Scale value={before} onChange={setBefore} />
              <Text style={styles.h3}>อะไรกระตุ้นให้อยาก? (ไม่ต้องเลือกก็ได้)</Text>
              <View style={styles.chips}>
                {TRIGGERS.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => setTrigger(trigger === t.id ? null : t.id)}
                    style={[styles.chip, trigger === t.id && styles.chipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: trigger === t.id }}
                  >
                    <Feather name={t.icon as any} size={13} color={trigger === t.id ? "#1e1b4b" : "#cbd5e1"} />
                    <Text style={[styles.chipText, trigger === t.id && styles.chipTextOn]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={[styles.primary, before === null && styles.disabled]}
                disabled={before === null}
                onPress={() => setStep("tools")}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>ไปต่อ</Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </Pressable>
            </View>
          )}

          {step === "tools" && (
            <View>
              <UrgeWave seconds={elapsed} />
              {myPlan ? (
                <View style={styles.planCard}>
                  <Text style={styles.planLabel}>แผนที่คุณวางไว้</Text>
                  <Text style={styles.planText}>
                    ถ้า{triggerLabel(myPlan.trigger)} ฉันจะ<Text style={{ fontWeight: "800" }}>{actionLabel(myPlan.action)}</Text>
                  </Text>
                </View>
              ) : null}
              <Text style={styles.h2}>เลือกสิ่งที่จะทำตอนนี้</Text>
              <ToolCard
                icon="grid"
                color="#8b5cf6"
                title="เล่นเกม 3 นาที"
                desc="เกมต่อบล็อกช่วยลดความอยากได้ในงานวิจัย"
                onPress={() => {
                  markTool("game");
                  setGame(findGame("blocks") ?? null);
                  setStep("game");
                }}
                extra={
                  <View style={styles.miniRow}>
                    {["gems", "stars"].map((id) => {
                      const g = findGame(id);
                      if (!g) return null;
                      return (
                        <Pressable
                          key={id}
                          style={styles.mini}
                          onPress={() => {
                            markTool("game");
                            setGame(g);
                            setStep("game");
                          }}
                          accessibilityRole="button"
                        >
                          <Text style={styles.miniText}>{g.title}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                }
              />
              <ToolCard
                icon="wind"
                color="#f59e0b"
                title="หายใจช้าๆ 2 นาที"
                desc="หายใจเข้า 4 ออก 6 ร่างกายจะสงบลง"
                onPress={() => {
                  markTool("breathe");
                  setGame(findGame("lantern") ?? null);
                  setStep("game");
                }}
              />
              <ToolCard
                icon="activity"
                color="#14b8a6"
                title="ขยับร่างกาย 4 นาที"
                desc="6 ท่าง่ายๆ ทำในห้องได้ ออกกำลังสั้นๆ ช่วยลดความอยาก"
                onPress={() => {
                  markTool("walk");
                  setStep("move");
                }}
              />
              <ToolCard
                icon="heart"
                color="#f43f5e"
                title="เหตุผลที่ฉันอยากเลิก"
                desc="อ่านทวนสิ่งที่สำคัญกับคุณ"
                onPress={() => {
                  markTool("reasons");
                  setStep("reasons");
                }}
              />
              <ToolCard
                icon="phone"
                color="#0ea5e9"
                title="คุยกับใครสักคน"
                desc="สายเลิกบุหรี่ 1600 · คนสนิท · ครอบครัว"
                onPress={() => {
                  markTool("call");
                  setStep("talk");
                }}
              />
              <View style={styles.quickRow}>
                <QuickTip icon="droplet" text="ดื่มน้ำเย็นช้าๆ" onPress={() => markTool("water")} active={tools.includes("water")} />
                <QuickTip icon="smile" text="เคี้ยวหมากฝรั่ง" onPress={() => markTool("gum")} active={tools.includes("gum")} />
                <QuickTip icon="log-out" text="ลุกออกจากที่นี่" onPress={() => markTool("leave")} active={tools.includes("leave")} />
              </View>
              <Pressable style={styles.secondary} onPress={() => setStep("after")} accessibilityRole="button">
                <Feather name="check" size={18} color="#fff" />
                <Text style={styles.secondaryText}>ความอยากเบาลงแล้ว</Text>
              </Pressable>
            </View>
          )}

          {step === "reasons" && (
            <Reasons
              plan={plan}
              onChange={async (reasons) => setPlan(await updatePlan(user?.id, (p) => ({ ...p, reasons })))}
              onBack={() => setStep("tools")}
            />
          )}

          {step === "talk" && (
            <View>
              <Text style={styles.h1}>ไม่ต้องผ่านมันคนเดียว</Text>
              <Pressable style={[styles.talkCard, { backgroundColor: "#be123c" }]} onPress={() => Linking.openURL("tel:1600")} accessibilityRole="button">
                <Feather name="phone-call" size={24} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.talkTitle}>โทร 1600 สายเลิกบุหรี่</Text>
                  <Text style={styles.talkSub}>โทรฟรี มีผู้เชี่ยวชาญช่วยวางแผนและให้กำลังใจ</Text>
                </View>
              </Pressable>
              <Pressable
                style={styles.talkCard}
                onPress={() => {
                  if (user?.emergencyContact) Linking.openURL(`tel:${user.emergencyContact.trim()}`);
                  else showAlert({ title: "ยังไม่มีเบอร์คนสนิท", message: "ตั้งค่าเบอร์คนสนิทได้ในหน้าโปรไฟล์", type: "warning" });
                }}
                accessibilityRole="button"
              >
                <Feather name="user" size={22} color="#a5f3fc" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.talkTitle}>โทรหาคนสนิท</Text>
                  <Text style={styles.talkSub}>{user?.emergencyContact ? user.emergencyContact : "ยังไม่ได้ตั้งค่า"}</Text>
                </View>
              </Pressable>
              <Pressable
                style={styles.talkCard}
                onPress={async () => {
                  try {
                    await api.sendFamilyAlert();
                    showAlert({ title: "ส่งแล้ว", message: "แจ้งครอบครัวที่ติดตามคุณแล้วว่าตอนนี้ต้องการกำลังใจ", type: "success" });
                  } catch {
                    showAlert({ title: "ส่งไม่ได้", message: "ยังไม่มีครอบครัวที่ติดตามคุณ หรือเครือข่ายขัดข้อง", type: "error" });
                  }
                }}
                accessibilityRole="button"
              >
                <Feather name="bell" size={22} color="#fde68a" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.talkTitle}>ขอกำลังใจจากครอบครัว</Text>
                  <Text style={styles.talkSub}>ส่งแจ้งเตือนไปหาคนที่ติดตามคุณในแอป</Text>
                </View>
              </Pressable>
              <Pressable style={styles.talkCard} onPress={() => router.push("/chat" as any)} accessibilityRole="button">
                <Feather name="message-circle" size={22} color="#c4b5fd" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.talkTitle}>คุยในชุมชน</Text>
                  <Text style={styles.talkSub}>เพื่อนที่กำลังเลิกเหมือนกัน</Text>
                </View>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => setStep("tools")} accessibilityRole="button">
                <Feather name="arrow-left" size={18} color="#fff" />
                <Text style={styles.secondaryText}>กลับไปเลือกวิธีอื่น</Text>
              </Pressable>
            </View>
          )}

          {step === "after" && (
            <View>
              <Text style={styles.h1}>ตอนนี้ความอยากเหลือเท่าไหร่?</Text>
              <Text style={styles.lead}>ก่อนหน้านี้คุณให้ไว้ {before}/10</Text>
              <Scale value={after} onChange={setAfter} />
              <Pressable
                style={[styles.primary, after === null && styles.disabled]}
                disabled={after === null}
                onPress={() => {
                  save(after);
                  setStep("result");
                }}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>ดูผล</Text>
              </Pressable>
              <Pressable style={styles.linkBtn} onPress={() => setStep("tools")} accessibilityRole="button">
                <Text style={styles.link}>ยังอยากอยู่ ลองวิธีอื่นก่อน</Text>
              </Pressable>
            </View>
          )}

          {step === "result" && before !== null && after !== null && (
            <Result
              before={before}
              after={after}
              seconds={elapsed}
              onTryMore={() => {
                setAfter(null);
                setStep("tools");
              }}
              onSlip={() => {
                save(after, true);
                setStep("slip");
              }}
              onDone={onClose}
            />
          )}
        </ScrollView>
      )}
    </LinearGradient>
  );
}

function Scale({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  return (
    <View style={styles.scaleWrap}>
      <View style={styles.scale}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const on = value === n;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              style={[styles.scaleItem, { borderColor: strengthColor(n) }, on && { backgroundColor: strengthColor(n), transform: [{ scale: 1.12 }] }]}
              accessibilityRole="button"
              accessibilityLabel={`ระดับ ${n}`}
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.scaleText, on && styles.scaleTextOn]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.scaleLabels}>
        <Text style={styles.scaleLabel}>นิดหน่อย</Text>
        <Text style={styles.scaleLabel}>มากที่สุด</Text>
      </View>
    </View>
  );
}

/** Urge-surfing picture: a wave that peaks and falls, with a dot for "you are here". */
function UrgeWave({ seconds }: { seconds: number }) {
  const W = 320;
  const H = 110;
  const f = (x: number) => {
    // Quick rise, peak around 25%, slow fall
    const peak = 0.25;
    const y = x < peak ? Math.sin((x / peak) * (Math.PI / 2)) : Math.exp(-Math.pow((x - peak) / 0.32, 2));
    return H - 14 - y * (H - 30);
  };
  let d = `M 0 ${f(0)}`;
  for (let i = 1; i <= 60; i++) {
    const x = i / 60;
    d += ` L ${x * W} ${f(x)}`;
  }
  const k = Math.min(1, seconds / WAVE_SECONDS);
  const left = Math.max(0, WAVE_SECONDS - seconds);
  return (
    <View style={styles.waveCard}>
      <Text style={styles.waveTitle}>{k < 0.25 ? "คลื่นกำลังขึ้น อดทนอีกนิด" : k < 1 ? "ผ่านจุดสูงสุดแล้ว กำลังลดลง" : "คลื่นลูกนี้ผ่านไปแล้ว"}</Text>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <SvgGradient id="wv" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#fb923c" />
            <Stop offset="0.3" stopColor="#f472b6" />
            <Stop offset="1" stopColor="#5eead4" />
          </SvgGradient>
        </Defs>
        <Path d={`${d} L ${W} ${H} L 0 ${H} Z`} fill="rgba(94,234,212,0.08)" />
        <Path d={d} stroke="url(#wv)" strokeWidth={4} fill="none" strokeLinecap="round" />
        <Circle cx={k * W} cy={f(k)} r={9} fill="#fff" />
        <Circle cx={k * W} cy={f(k)} r={15} fill="rgba(255,255,255,0.2)" />
      </Svg>
      <Text style={styles.waveSub}>
        {left > 0 ? `ความอยากส่วนใหญ่เบาลงภายในไม่กี่นาที · อีกราว ${Math.ceil(left / 60)} นาที` : "เก่งมาก คุณอยู่กับมันได้จนมันผ่านไป"}
      </Text>
    </View>
  );
}

function ToolCard({ icon, color, title, desc, onPress, extra }: { icon: string; color: string; title: string; desc: string; onPress: () => void; extra?: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tool, pressed && { opacity: 0.85 }]} accessibilityRole="button">
      <View style={styles.toolRow}>
        <View style={[styles.toolIcon, { backgroundColor: color }]}>
          <Feather name={icon as any} size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.toolTitle}>{title}</Text>
          <Text style={styles.toolDesc}>{desc}</Text>
        </View>
        <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.5)" />
      </View>
      {extra}
    </Pressable>
  );
}

function QuickTip({ icon, text, onPress, active }: { icon: string; text: string; onPress: () => void; active: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.quick, active && styles.quickOn]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Feather name={(active ? "check" : icon) as any} size={16} color={active ? "#5eead4" : "#e2e8f0"} />
      <Text style={styles.quickText}>{text}</Text>
    </Pressable>
  );
}

function Reasons({ plan, onChange, onBack }: { plan: QuitPlan | null; onChange: (r: string[]) => void; onBack: () => void }) {
  const [text, setText] = useState("");
  const reasons = plan?.reasons ?? [];
  const add = (r: string) => {
    const v = r.trim();
    if (!v || reasons.includes(v)) return;
    onChange([...reasons, v]);
    setText("");
  };
  return (
    <View>
      <Text style={styles.h1}>ฉันเลิกเพราะ…</Text>
      {reasons.length ? (
        <View style={{ gap: 10, marginBottom: 16 }}>
          {reasons.map((r) => (
            <View key={r} style={styles.reason}>
              <Feather name="heart" size={18} color="#fda4af" />
              <Text style={styles.reasonText}>{r}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.lead}>ยังไม่ได้เขียนเหตุผลไว้ ลองเลือกหรือพิมพ์เหตุผลของคุณเอง เหตุผลที่เป็นของเราเองช่วยดึงใจได้ดีกว่าคำแนะนำทั่วไป</Text>
      )}
      <View style={styles.addRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="พิมพ์เหตุผลของคุณ"
          placeholderTextColor="rgba(255,255,255,0.4)"
          style={styles.input}
          onSubmitEditing={() => add(text)}
          maxLength={80}
        />
        <Pressable style={styles.addBtn} onPress={() => add(text)} accessibilityRole="button" accessibilityLabel="เพิ่มเหตุผล">
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>
      <View style={[styles.chips, { marginTop: 12 }]}>
        {REASON_IDEAS.filter((r) => !reasons.includes(r)).map((r) => (
          <Pressable key={r} style={styles.chip} onPress={() => add(r)} accessibilityRole="button">
            <Feather name="plus" size={12} color="#cbd5e1" />
            <Text style={styles.chipText}>{r}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.secondary} onPress={onBack} accessibilityRole="button">
        <Feather name="arrow-left" size={18} color="#fff" />
        <Text style={styles.secondaryText}>กลับไปเลือกวิธีรับมือ</Text>
      </Pressable>
    </View>
  );
}

function Result({ before, after, seconds, onTryMore, onSlip, onDone }: { before: number; after: number; seconds: number; onTryMore: () => void; onSlip: () => void; onDone: () => void }) {
  const dropped = after < before;
  const mins = Math.max(1, Math.round(seconds / 60));
  return (
    <View style={{ alignItems: "center" }}>
      <View style={[styles.resultBadge, { backgroundColor: dropped ? "#14b8a6" : "#6366f1" }]}>
        <Feather name={dropped ? "trending-down" : "anchor"} size={40} color="#fff" />
      </View>
      <Text style={styles.h1c}>{dropped ? "คุณผ่านมันมาได้!" : "คุณยังไม่ได้สูบ และนั่นสำคัญที่สุด"}</Text>
      <View style={styles.compare}>
        <View style={styles.compareItem}>
          <Text style={[styles.compareNum, { color: strengthColor(before) }]}>{before}</Text>
          <Text style={styles.compareLabel}>ตอนเริ่ม</Text>
        </View>
        <Feather name="arrow-right" size={26} color="rgba(255,255,255,0.6)" />
        <View style={styles.compareItem}>
          <Text style={[styles.compareNum, { color: strengthColor(after) }]}>{after}</Text>
          <Text style={styles.compareLabel}>ตอนนี้</Text>
        </View>
      </View>
      <Text style={styles.leadC}>
        {dropped
          ? `ใช้เวลาราว ${mins} นาที ความอยากลดลง ${before - after} ระดับ ครั้งหน้าที่อยาก จำไว้ว่ามันผ่านไปได้แบบนี้`
          : "บางคลื่นใช้เวลานานกว่า ลองอีกวิธี หรือโทรคุยกับ 1600 ก็ได้ คุณไม่ต้องสู้คนเดียว"}
      </Text>
      <Pressable style={[styles.primary, { alignSelf: "stretch" }]} onPress={dropped ? onDone : onTryMore} accessibilityRole="button">
        <Text style={styles.primaryText}>{dropped ? "เสร็จแล้ว" : "ลองวิธีอื่น"}</Text>
      </Pressable>
      {!dropped ? (
        <Pressable style={styles.linkBtn} onPress={onDone} accessibilityRole="button">
          <Text style={styles.link}>ปิดไปก่อน</Text>
        </Pressable>
      ) : null}
      <Pressable style={styles.linkBtn} onPress={onSlip} accessibilityRole="button">
        <Text style={[styles.link, { color: "rgba(253,164,175,0.9)" }]}>ฉันเผลอสูบไปแล้ว</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  topTitle: { flex: 1, color: "rgba(255,255,255,0.85)", fontSize: 15, fontWeight: "700", textAlign: "center" },
  timerPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(165,243,252,0.12)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, minWidth: 64, justifyContent: "center" },
  timerText: { color: "#a5f3fc", fontWeight: "700", fontSize: 13 },
  scroll: { padding: 22, paddingBottom: 60 },
  h1: { color: "#fff", fontSize: 26, fontWeight: "800", lineHeight: 34, marginTop: 6 },
  h1c: { color: "#fff", fontSize: 24, fontWeight: "800", lineHeight: 32, textAlign: "center", marginTop: 8 },
  h2: { color: "#fff", fontSize: 19, fontWeight: "800", marginTop: 18, marginBottom: 12 },
  h3: { color: "rgba(255,255,255,0.9)", fontSize: 15, fontWeight: "700", marginTop: 26, marginBottom: 10 },
  lead: { color: "rgba(255,255,255,0.75)", fontSize: 15, lineHeight: 23, marginTop: 8, marginBottom: 18 },
  leadC: { color: "rgba(255,255,255,0.8)", fontSize: 15, lineHeight: 23, marginTop: 14, textAlign: "center" },
  scaleWrap: { marginTop: 6 },
  scale: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  scaleItem: { width: "18%", aspectRatio: 1, maxWidth: 58, borderRadius: 999, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.04)" },
  scaleText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  scaleTextOn: { color: "#0b1027" },
  scaleLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  scaleLabel: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  chipOn: { backgroundColor: "#c7d2fe", borderColor: "#c7d2fe" },
  chipText: { color: "#e2e8f0", fontSize: 13, fontWeight: "600" },
  chipTextOn: { color: "#1e1b4b" },
  primary: { flexDirection: "row", gap: 8, backgroundColor: "#6366f1", paddingVertical: 16, borderRadius: 999, alignItems: "center", justifyContent: "center", marginTop: 26 },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  disabled: { opacity: 0.35 },
  secondary: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingVertical: 15, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", marginTop: 18 },
  secondaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  linkBtn: { alignSelf: "center", padding: 12, marginTop: 4 },
  link: { color: "rgba(255,255,255,0.7)", fontSize: 14, textDecorationLine: "underline" },
  waveCard: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  waveTitle: { color: "#fff", fontSize: 17, fontWeight: "800", marginBottom: 6 },
  waveSub: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 6, lineHeight: 19 },
  planCard: { backgroundColor: "rgba(94,234,212,0.1)", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(94,234,212,0.35)", marginTop: 14 },
  planLabel: { color: "#5eead4", fontSize: 12, fontWeight: "800", marginBottom: 3 },
  planText: { color: "#fff", fontSize: 16, lineHeight: 24 },
  tool: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  toolRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  toolIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  toolTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  toolDesc: { color: "rgba(255,255,255,0.65)", fontSize: 13, marginTop: 2, lineHeight: 18 },
  miniRow: { flexDirection: "row", gap: 8, marginTop: 12, marginLeft: 60 },
  mini: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(139,92,246,0.25)" },
  miniText: { color: "#ddd6fe", fontSize: 12, fontWeight: "700" },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  quick: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  quickOn: { borderColor: "#5eead4", backgroundColor: "rgba(94,234,212,0.08)" },
  quickText: { color: "#e2e8f0", fontSize: 12, fontWeight: "600", textAlign: "center" },
  talkCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.07)", marginTop: 12 },
  talkTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  talkSub: { color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 2 },
  reason: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(253,164,175,0.1)", padding: 14, borderRadius: 14 },
  reasonText: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "600", lineHeight: 23 },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { flex: 1, backgroundColor: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  addBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: "#f43f5e", alignItems: "center", justifyContent: "center" },
  resultBadge: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center", marginTop: 12 },
  compare: { flexDirection: "row", alignItems: "center", gap: 26, marginTop: 20, backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 28, paddingVertical: 16, borderRadius: 20 },
  compareItem: { alignItems: "center" },
  compareNum: { fontSize: 48, fontWeight: "900" },
  compareLabel: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
});
