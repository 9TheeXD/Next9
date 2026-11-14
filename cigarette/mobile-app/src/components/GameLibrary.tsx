import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ImageBackground, ImageSourcePropType, ScrollView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { GAMES, type GameDefinition } from "@/games";
import type { GameCategory } from "@/games/engine/types";
import { shopScreen } from "@/games/shop";
import { wallet } from "@/games/engine/economy";

const COVERS: Record<string, ImageSourcePropType> = {
  blocks: require("../../assets/images/games/cover_blocks.jpg"),
  gems: require("../../assets/images/games/cover_gems.jpg"),
  stars: require("../../assets/images/games/cover_stars.jpg"),
  lantern: require("../../assets/images/games/cover_lantern.jpg"),
  blast: require("../../assets/images/games/cover_blast.jpg"),
  merge: require("../../assets/images/games/cover_merge.jpg"),
  tiles: require("../../assets/images/games/cover_tiles.jpg"),
  slice: require("../../assets/images/games/cover_slice.jpg"),
  bubbles: require("../../assets/images/games/cover_bubbles.jpg"),
  sudoku: require("../../assets/images/games/cover_sudoku.jpg"),
  shooter: require("../../assets/images/games/cover_shooter.jpg"),
  pulse: require("../../assets/images/games/cover_pulse.jpg"),
  snake: require("../../assets/images/games/cover_snake.jpg"),
  defense: require("../../assets/images/games/cover_defense.jpg"),
  party: require("../../assets/images/games/cover_party.jpg"),
  hockey: require("../../assets/images/games/cover_hockey.jpg"),
  dots: require("../../assets/images/games/cover_dots.jpg"),
  chess: require("../../assets/images/games/cover_chess.jpg"),
  xo: require("../../assets/images/games/cover_xo.jpg"),
  connect4: require("../../assets/images/games/cover_connect4.jpg"),
  checkers: require("../../assets/images/games/cover_checkers.jpg"),
  othello: require("../../assets/images/games/cover_othello.jpg"),
};

const SHELVES: { id: GameCategory | "all"; label: string; icon: string }[] = [
  { id: "all", label: "ทั้งหมด", icon: "grid" },
  { id: "puzzle", label: "ปริศนา", icon: "box" },
  { id: "action", label: "แอ็กชัน", icon: "zap" },
  { id: "duel", label: "สู้บอท/เพื่อน", icon: "users" },
  { id: "party", label: "ปาร์ตี้หลายคน", icon: "smile" },
  { id: "brain", label: "ฝึกสมอง", icon: "cpu" },
  { id: "calm", label: "ผ่อนคลาย", icon: "wind" },
];

interface Props {
  onPlay: (game: GameDefinition) => void;
  /** Show the "why it helps" line on every card (the SOS hub does; the family tab does not). */
  showWhy?: boolean;
  /** Game ids to show; defaults to all. */
  only?: string[];
}

export default function GameLibrary({ onPlay, showWhy = true, only }: Props) {
  const [shelf, setShelf] = useState<GameCategory | "all">("all");
  const pool = only ? GAMES.filter((g) => only.includes(g.id)) : GAMES;
  const games = shelf === "all" ? pool : pool.filter((g) => g.category === shelf);
  const [featured, ...rest] = games;
  const [coins, setCoins] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    setCoins(wallet.coins());
    return wallet.subscribe(setCoins);
  }, []);
  return (
    <View style={styles.wrap}>
      {Platform.OS === "web" ? (
        <Pressable
          onPress={() => onPlay(shopScreen)}
          style={({ pressed }) => [styles.shop, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`ร้านค้าเหรียญ มี ${coins} เหรียญ`}
        >
          <LinearGradient colors={["#312e81", "#7c3aed"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.shopCoin}>
            <Feather name="star" size={18} color="#92400e" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.shopTitle}>ร้านค้า · {coins.toLocaleString()} เหรียญ</Text>
            <Text style={styles.shopText}>สกิน ตัวช่วย อัปเกรดตัวละครไม่จำกัด · ได้เหรียญจากการเล่นและการไม่สูบ</Text>
          </View>
          <Feather name="shopping-bag" size={22} color="#fde68a" />
        </Pressable>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelves}>
        {SHELVES.filter((s) => s.id === "all" || pool.some((g) => g.category === s.id)).map((s) => {
          const on = shelf === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => setShelf(s.id)}
              style={[styles.shelf, on && styles.shelfOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Feather name={s.icon as any} size={13} color={on ? "#fff" : "#475569"} />
              <Text style={[styles.shelfText, on && styles.shelfTextOn]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {featured ? (
        <GameCard game={featured} onPlay={onPlay} showWhy={showWhy} big badge={shelf === "all" ? "แนะนำตอนอยากสูบ" : undefined} />
      ) : null}
      <View style={styles.grid}>
        {rest.map((g) => (
          <GameCard key={g.id} game={g} onPlay={onPlay} showWhy={false} />
        ))}
      </View>
    </View>
  );
}

function GameCard({
  game,
  onPlay,
  showWhy,
  big,
  badge,
}: {
  game: GameDefinition;
  onPlay: (g: GameDefinition) => void;
  showWhy: boolean;
  big?: boolean;
  badge?: string;
}) {
  return (
    <Pressable
      onPress={() => onPlay(game)}
      style={({ pressed }) => [styles.card, big ? styles.cardBig : styles.cardSmall, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`เล่น ${game.title}`}
    >
      <ImageBackground source={COVERS[game.id]} style={styles.cover} imageStyle={styles.coverImage} resizeMode="cover">
        <LinearGradient
          colors={["rgba(5,7,28,0)", "rgba(5,7,28,0.25)", "rgba(5,7,28,0.88)"]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        {badge ? (
          <View style={styles.badge}>
            <Feather name="star" size={11} color="#1e1b4b" />
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
        <View style={styles.minutes}>
          <Feather name="clock" size={11} color="#fff" />
          <Text style={styles.minutesText}>{game.minutes}</Text>
        </View>
        <View style={styles.info}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, big && styles.titleBig]} numberOfLines={big ? 1 : 2}>
              {game.title}
            </Text>
            {big ? (
              <Text style={styles.tagline} numberOfLines={2}>
                {game.tagline}
              </Text>
            ) : null}
          </View>
          <View style={[styles.play, !big && styles.playSmall, { backgroundColor: game.palette[1] }]}>
            <Feather name="play" size={big ? 20 : 14} color="#fff" style={{ marginLeft: 2 }} />
          </View>
        </View>
      </ImageBackground>
      {showWhy ? (
        <View style={styles.why}>
          <Feather name="info" size={13} color="#64748b" style={{ marginTop: 2 }} />
          <Text style={styles.whyText}>{game.why}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  shop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, overflow: "hidden" },
  shopCoin: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#fbbf24", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#fde68a" },
  shopTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  shopText: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2, lineHeight: 16 },
  shelves: { gap: 8, paddingRight: 8 },
  shelf: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  shelfOn: { backgroundColor: "#4f46e5", borderColor: "#4f46e5" },
  shelfText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  shelfTextOn: { color: "#ffffff" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  card: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#0b0f2e",
    shadowColor: "#1e1b4b",
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  cardBig: { width: "100%" },
  cardSmall: { width: "48.5%" },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.95 },
  cover: { width: "100%", aspectRatio: 1.5, justifyContent: "flex-end" },
  coverImage: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  info: { flexDirection: "row", alignItems: "flex-end", padding: 12, gap: 10 },
  title: { color: "#fff", fontSize: 15, fontWeight: "800" },
  titleBig: { fontSize: 21 },
  tagline: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2, lineHeight: 16 },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.6)",
  },
  playSmall: { width: 32, height: 32, borderRadius: 16 },
  badge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fde68a",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#1e1b4b" },
  minutes: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  minutesText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  why: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: "#ffffff" },
  whyText: { flex: 1, fontSize: 12, lineHeight: 18, color: "#475569" },
});
