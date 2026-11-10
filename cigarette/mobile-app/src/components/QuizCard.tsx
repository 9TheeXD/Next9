import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";

interface QuizCardProps {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  questionCount: number;
}

export default function QuizCard({ id, title, description, icon, color, questionCount }: QuizCardProps) {
  return (
    <Link href={`/quiz/${id}`} asChild>
      <Pressable style={styles.card}>
        <View style={[styles.iconContainer, { backgroundColor: `${color}25` }]}>
          <Feather name={icon as any} size={24} color={color} />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color }]}>{questionCount} คำถาม</Text>
          </View>
        </View>
        <View style={styles.arrowContainer}>
          <Text style={styles.arrow}>→</Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    marginBottom: 12,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(56,189,248,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  icon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 16,
  },
  footer: {
    marginTop: 8,
  },
  footerText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#7dd3fc",
    textTransform: "uppercase",
  },
  arrowContainer: {
    paddingLeft: 12,
  },
  arrow: {
    fontSize: 20,
    color: "rgba(0,0,0,0.3)",
  },
});
