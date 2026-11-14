import React from "react";
import { View, Text, Pressable, StyleSheet, ImageBackground, ImageSourcePropType } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { GAMES, type GameDefinition } from "@/games";

const COVERS: Record<string, ImageSourcePropType> = {
  blocks: require("../../assets/images/games/cover_blocks.jpg"),
  gems: require("../../assets/images/games/cover_gems.jpg"),
  stars: require("../../assets/images/games/cover_stars.jpg"),
  lantern: require("../../assets/images/games/cover_lantern.jpg"),
};

interface Props {
  onPlay: (game: GameDefinition) => void;
  /** Show the "why it helps" line on every card (the SOS hub does; the family tab does not). */
  showWhy?: boolean;
  /** Game ids to show; defaults to all. */
  only?: string[];
}

export default function GameLibrary({ onPlay, showWhy = true, only }: Props) {
  const games = only ? GAMES.filter((g) => only.includes(g.id)) : GAMES;
  const [featured, ...rest] = games;
  if (!featured) return null;
  return (
    <View style={styles.wrap}>
      <GameCard game={featured} onPlay={onPlay} showWhy={showWhy} big badge="แนะนำตอนอยากสูบ" />
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
