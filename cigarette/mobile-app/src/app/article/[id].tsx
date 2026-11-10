import React, { useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { ARTICLES, ACTION_STEPS } from "@/utils/planContent";
import { useGamification } from "@/contexts/GamificationContext";
import { api } from "@/lib/api";

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { completeDailyMission, addXP } = useGamification();

  // Find either an article or an action step
  const articleData = ARTICLES.find((a) => a.id === id);
  const stepData = ACTION_STEPS.find((s) => s.id === id);

  const title = articleData ? articleData.title : (stepData ? `Step ${stepData.stepNumber}: ${stepData.title}` : "ไม่พบเนื้อหา");
  const content = articleData ? articleData.content : (stepData ? stepData.content : "");
  const color = articleData ? articleData.color : "#38bdf8";

  // Grant XP for reading an article
  useEffect(() => {
    if (articleData || stepData) {
      completeDailyMission('article');
      addXP(5, `อ่านบทความ: ${(articleData?.title || stepData?.title || '').substring(0, 20)}...`);
      api.postLog({ articlesRead: 1 }).catch(() => {});
      api.postActionLog({ action: "READ_ARTICLE", details: `อ่านบทความ/คำแนะนำ: ${articleData?.title || stepData?.title}` }).catch(() => {});
    }
  }, [id]);

  // Simple Markdown-like renderer for the content
  const renderContent = (text: string) => {
    if (!text) return null;
    
    return text.split('\n').map((line, index) => {
      // Bold text (e.g., **text**)
      const parts = line.split(/(\*\*.*?\*\*)/g);
      
      return (
        <Text key={index} style={[styles.paragraph, line.startsWith('-') ? styles.listItem : null]}>
          {parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <Text key={i} style={styles.boldText}>{part.slice(2, -2)}</Text>;
            }
            return <Text key={i}>{part}</Text>;
          })}
        </Text>
      );
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topNav}>
        <Pressable onPress={() => router.replace('/(tabs)/knowledge')} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#1e293b" />
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.headerIconContainer, { backgroundColor: color + '20' }]}>
          <Feather 
            name={(articleData?.icon || stepData?.icon || "file-text") as any} 
            size={40} 
            color={color} 
          />
        </View>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.divider, { backgroundColor: color }]} />
        <View style={styles.contentContainer}>
          {renderContent(content)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f0fdfa" },
  topNav: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 60 },
  headerIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: "800", color: "#1e293b", marginBottom: 16, lineHeight: 36 },
  divider: { height: 4, width: 40, borderRadius: 2, marginBottom: 24 },
  contentContainer: {
    backgroundColor: "#ffffff",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)"
  },
  paragraph: {
    fontSize: 16,
    color: "rgba(0,0,0,0.6)",
    lineHeight: 28,
    marginBottom: 12,
  },
  listItem: {
    paddingLeft: 12,
    marginLeft: 8,
  },
  boldText: {
    fontWeight: "bold",
    color: "#1e293b",
  }
});
