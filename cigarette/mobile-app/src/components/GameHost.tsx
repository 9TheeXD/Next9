import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GameDefinition, GameEvent } from "@/games";
import { mountGame, type GameHandle } from "@/games/engine/runtime";
import { wallet } from "@/games/engine/economy";
import { useGamification } from "@/contexts/GamificationContext";
import { api } from "@/lib/api";

const MUTE_KEY = "@nb_games_muted";

interface Props {
  game: GameDefinition;
  onExit: () => void;
  /** Called with every event the game sends (start, score, end). */
  onEvent?: (e: GameEvent) => void;
  /** Label of the exit button, e.g. "เสร็จแล้ว" inside the craving flow. */
  exitLabel?: string;
}

/**
 * Full-screen frame for one game: a top bar (back, title, sound, pause) and the canvas the game
 * draws into. Games run on the web build (the app is a PWA); native builds show a short note.
 */
export default function GameHost({ game, onExit, onEvent, exitLabel }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const startedRef = useRef(false);
  const rewardsRef = useRef(0);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [coins, setCoins] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    setCoins(wallet.coins());
    return wallet.subscribe(setCoins);
  }, []);
  const { addXP, completeDailyMission } = useGamification();
  const onEventRef = useRef(onEvent);

  // Context functions change identity between renders; keep the latest in a ref so the game is
  // mounted once and never restarted mid-round.
  const gamification = useRef({ addXP, completeDailyMission });
  useEffect(() => {
    onEventRef.current = onEvent;
    gamification.current = { addXP, completeDailyMission };
  });

  const handleEvent = useCallback(
    (e: GameEvent) => {
      const g = gamification.current;
      if (e.type === "start" && !startedRef.current) {
        startedRef.current = true;
        g.completeDailyMission("minigame");
        api.postLog({ gamesPlayed: 1 }).catch(() => {});
        api.postActionLog({ action: "GAME_PLAYED", details: `เล่นเกม${game.title}`, metadata: { gameId: game.id } }).catch(() => {});
      }
      if (e.type === "end") {
        wallet.add(e.coins ?? 10);
        // XP for the first three finished rounds per visit, so the game is rewarding but not farmable.
        if (rewardsRef.current < 3) {
          rewardsRef.current++;
          g.addXP(15, `เล่น${game.title}จบรอบ`);
        }
        api
          .postActionLog({
            action: "GAME_FINISHED",
            details: `${game.title}: ${e.summary}`,
            metadata: { gameId: game.id, score: e.score, best: e.best, ...(e.stats || {}) },
          })
          .catch(() => {});
      }
      onEventRef.current?.(e);
    },
    [game]
  );

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(MUTE_KEY)
      .then((v) => {
        if (cancelled) return;
        const m = v === "1";
        setMuted(m);
        handleRef.current?.setMuted(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || !hostRef.current) return;
    const handle = mountGame(game, hostRef.current, {
      onEvent: handleEvent,
      onAutoPause: () => setPaused(true),
      muted,
    });
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
    };
    // Mount once per game; mute changes go through setMuted below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, handleEvent]);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    handleRef.current?.setMuted(m);
    AsyncStorage.setItem(MUTE_KEY, m ? "1" : "0").catch(() => {});
  };

  const togglePause = () => {
    const h = handleRef.current;
    if (!h) return;
    if (h.paused) {
      h.resume();
      setPaused(false);
    } else {
      h.pause();
      setPaused(true);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: game.palette[0] }]}>
      <View style={styles.bar}>
        <Pressable onPress={onExit} style={styles.barBtn} accessibilityRole="button" accessibilityLabel="ออกจากเกม">
          <Feather name="chevron-left" size={22} color="#fff" />
          <Text style={styles.barBtnText}>{exitLabel || "ออก"}</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {game.title}
        </Text>
        <View style={styles.barRight}>
          <View style={styles.coinPill} accessibilityLabel={`เหรียญ ${coins}`}>
            <View style={styles.coinDot} />
            <Text style={styles.coinText}>{coins.toLocaleString()}</Text>
          </View>
          <Pressable onPress={toggleMute} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={muted ? "เปิดเสียง" : "ปิดเสียง"}>
            <Feather name={muted ? "volume-x" : "volume-2"} size={19} color="#fff" />
          </Pressable>
          <Pressable onPress={togglePause} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="พักเกม">
            <Feather name={paused ? "play" : "pause"} size={19} color="#fff" />
          </Pressable>
        </View>
      </View>

      <View style={styles.stage}>
        {Platform.OS === "web" ? (
          React.createElement("div", {
            ref: hostRef,
            style: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" },
          })
        ) : (
          <View style={styles.native}>
            <Feather name="monitor" size={40} color="rgba(255,255,255,0.6)" />
            <Text style={styles.nativeText}>เกมนี้เล่นได้ในแอปเวอร์ชันเว็บ (ติดตั้งจากเบราว์เซอร์)</Text>
          </View>
        )}

        {paused && (
          <View style={styles.pauseOverlay}>
            <Text style={styles.pauseTitle}>พักเกมไว้</Text>
            <Text style={styles.pauseText}>หายใจลึกๆ สักครั้ง แล้วกลับมาเล่นต่อ</Text>
            <Pressable style={styles.pausePrimary} onPress={togglePause} accessibilityRole="button">
              <Feather name="play" size={18} color="#fff" />
              <Text style={styles.pausePrimaryText}>เล่นต่อ</Text>
            </Pressable>
            <Pressable style={styles.pauseSecondary} onPress={onExit} accessibilityRole="button">
              <Text style={styles.pauseSecondaryText}>{exitLabel || "ออกจากเกม"}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  barBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingRight: 10, minWidth: 64 },
  barBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  title: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
  barRight: { flexDirection: "row", minWidth: 64, justifyContent: "flex-end" },
  coinPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.3)", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, marginRight: 4 },
  coinDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: "#ffc93c", borderWidth: 2, borderColor: "#c98a0b" },
  coinText: { color: "#ffe08a", fontWeight: "800", fontSize: 13 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  stage: { flex: 1, position: "relative", overflow: "hidden" },
  native: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  nativeText: { color: "rgba(255,255,255,0.8)", textAlign: "center", fontSize: 15 },
  pauseOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(5,7,28,0.82)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  pauseTitle: { color: "#fff", fontSize: 26, fontWeight: "800", marginBottom: 6 },
  pauseText: { color: "rgba(255,255,255,0.75)", fontSize: 15, marginBottom: 28, textAlign: "center" },
  pausePrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#7c5cff",
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 999,
    marginBottom: 12,
  },
  pausePrimaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  pauseSecondary: { paddingVertical: 12, paddingHorizontal: 24 },
  pauseSecondaryText: { color: "rgba(255,255,255,0.8)", fontSize: 15, fontWeight: "600" },
});
