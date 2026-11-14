import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable, Platform, DeviceEventEmitter, BackHandler } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import QuizCard from "@/components/QuizCard";
import { QUIZ_BANK } from "@/utils/quizBank";
import { ACTION_STEPS, ARTICLES, RECOVERY_TIMELINE } from "@/utils/planContent";
import { useAppSounds } from "@/hooks/useAppSounds";
import QuitToolkit from "@/components/QuitToolkit";

type PlanTab = "MINE" | "PLAN" | "QUIZ";
const PLAN_TABS: PlanTab[] = ["MINE", "PLAN", "QUIZ"];

export default function PlanDashboardScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<PlanTab>(
    PLAN_TABS.includes(params.tab?.toUpperCase() as PlanTab) ? (params.tab!.toUpperCase() as PlanTab) : "MINE"
  );
  const router = useRouter();

  useEffect(() => {
    if (params.tab) {
      const t = params.tab.toUpperCase();
      if (PLAN_TABS.includes(t as PlanTab)) {
        setActiveTab(t as PlanTab);
      }
    }
  }, [params.tab]);

  const changeTab = (v: PlanTab) => {
    setActiveTab(v);
    router.setParams({ tab: v });
  };

  const { playClick } = useAppSounds();

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('reset_tab_knowledge', () => {
      if (activeTab !== "MINE") changeTab("MINE");
    });
    return () => sub.remove();
  }, [activeTab]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (activeTab !== "MINE") {
          changeTab("MINE");
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [activeTab])
  );

  // Filter articles by category
  const truthArticles = ARTICLES.filter(a => a.category === "TRUTH" || a.category === "BRAIN_TRICKS" || a.category === "DANGER_TIMES");
  const storyArticles = ARTICLES.filter(a => a.category === "STORY");

  const renderActionSteps = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>เริ่มยังไงดี (Practical Steps)</Text>
      <Text style={styles.sectionDesc}>ทำตาม 5 ขั้นตอนนี้เพื่อเตรียมพร้อมสำหรับชีวิตไร้ควัน</Text>
      
      <View style={styles.stepContainer}>
        {ACTION_STEPS.map((step, index) => (
          <Pressable 
            key={step.id} 
            style={styles.stepCard}
            onPress={() => { playClick(); router.push(`/article/${step.id}` as any); }}
          >
            <View style={styles.stepNumberContainer}>
              <Text style={styles.stepNumber}>{step.stepNumber}</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepShortDesc}>{step.shortDesc}</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#6b7280" />
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderTimeline = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Timeline ร่างกายของคุณ</Text>
      <Text style={styles.sectionDesc}>ดูว่าร่างกายคุณฟื้นฟูอย่างไรบ้างเมื่อเวลาผ่านไป</Text>
      
      <View style={styles.timelineContainer}>
        {RECOVERY_TIMELINE.map((event, index) => (
          <View key={event.id} style={styles.timelineEvent}>
            <View style={styles.timelineLine}>
              <View style={[styles.timelineDot, event.milestone && styles.timelineDotActive]} />
              {index < RECOVERY_TIMELINE.length - 1 && <View style={styles.timelineLineVertical} />}
            </View>
            <View style={styles.timelineEventContent}>
              <Text style={[styles.timelineTime, event.milestone && { color: '#10b981' }]}>{event.time}</Text>
              <Text style={styles.timelineTitle}>{event.title}</Text>
              <Text style={styles.timelineDesc}>{event.description}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderArticleList = (title: string, desc: string, articles: typeof ARTICLES) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionDesc}>{desc}</Text>
      
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
        {articles.map(article => (
          <Pressable 
            key={article.id} 
            style={[styles.articleCard, { borderTopColor: article.color }]}
            onPress={() => { playClick(); router.push(`/article/${article.id}` as any); }}
          >
            <View style={[styles.articleIconBg, { backgroundColor: article.color + '20' }]}>
              <Feather name={article.icon as any} size={24} color={article.color} />
            </View>
            <Text style={styles.articleTitle} numberOfLines={2}>{article.title}</Text>
            <Text style={styles.articleExcerpt} numberOfLines={3}>{article.excerpt}</Text>
          </Pressable>
        ))}
        {/* Empty view for padding at the end of horizontal scroll */}
        <View style={{ width: 20 }} />
      </ScrollView>
    </View>
  );

  const renderQuiz = () => (
    <View style={styles.quizList}>
      <Text style={styles.sectionTitle}>แบบทดสอบความรู้</Text>
      <Text style={styles.sectionDesc}>ทดสอบความเข้าใจและรับเหรียญรางวัล</Text>
      {QUIZ_BANK.map((topic) => (
        <QuizCard
          key={topic.id}
          id={topic.id}
          title={topic.title}
          description={topic.description}
          icon={topic.icon}
          color={topic.color}
          questionCount={topic.questions.length}
        />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Feather name="compass" size={28} color="#38bdf8" />
          <Text style={styles.title}>แผนลงมือทำ</Text>
        </View>
        <Text style={styles.subtitle}>คู่มือสุขภาพจิตวิทยาเพื่ออิสรภาพของคุณ</Text>
        
        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tab, activeTab === "MINE" && styles.activeTab]}
            onPress={() => { playClick(); changeTab("MINE"); }}
          >
            <Text style={[styles.tabText, activeTab === "MINE" && styles.activeTabText]}>แผนของฉัน</Text>
          </Pressable>
          <Pressable 
            style={[styles.tab, activeTab === "PLAN" && styles.activeTab]} 
            onPress={() => { playClick(); changeTab("PLAN"); }}
          >
            <Text style={[styles.tabText, activeTab === "PLAN" && styles.activeTabText]}>คู่มือ</Text>
          </Pressable>
          <Pressable 
            style={[styles.tab, activeTab === "QUIZ" && styles.activeTab]} 
            onPress={() => { playClick(); changeTab("QUIZ"); }}
          >
            <Text style={[styles.tabText, activeTab === "QUIZ" && styles.activeTabText]}>แบบทดสอบ</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {activeTab === "MINE" ? (
          <QuitToolkit onStartRescue={() => router.push("/sos?view=RESCUE" as any)} />
        ) : activeTab === "PLAN" ? (
          <>
            {renderActionSteps()}
            {renderArticleList("ความจริงที่คนไม่พูดถึง", "รู้ทันกลลวงของสมองและอันตรายที่มองไม่เห็น", truthArticles)}
            {renderTimeline()}
            {renderArticleList("แรงบันดาลใจ", "เรื่องราวจากคนที่ทำสำเร็จ คุณไม่ได้สู้คนเดียว", storyArticles)}
          </>
        ) : (
          renderQuiz()
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f0fdfa" },
  header: { 
    padding: 24, 
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.04)"
  },
  title: { fontSize: 28, fontWeight: "800", color: "#1e293b", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: "#475569", marginTop: 4 },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 12,
    padding: 4,
    marginTop: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: "#38bdf8",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  activeTabText: {
    color: "#ffffff",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  
  // Section Styles
  section: {
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e293b",
    paddingHorizontal: 24,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 14,
    color: "#475569",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  
  // Step Styles
  stepContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  stepCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  stepNumberContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(56,189,248, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#38bdf8",
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 2,
  },
  stepShortDesc: {
    fontSize: 13,
    color: "#475569",
  },
  
  // Article Card Styles
  horizontalScroll: {
    paddingLeft: 24,
  },
  articleCard: {
    width: 240,
    backgroundColor: "#ffffff",
    padding: 20,
    borderRadius: 16,
    marginRight: 16,
    borderTopWidth: 4,
  },
  articleIconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  articleTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 8,
    lineHeight: 22,
  },
  articleExcerpt: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 20,
  },
  
  // Timeline Styles
  timelineContainer: {
    paddingHorizontal: 24,
    marginTop: 8,
  },
  timelineEvent: {
    flexDirection: "row",
    marginBottom: 4,
  },
  timelineLine: {
    width: 30,
    alignItems: "center",
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#4b5563",
    marginTop: 4,
  },
  timelineDotActive: {
    backgroundColor: "#10b981",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  timelineLineVertical: {
    flex: 1,
    width: 2,
    backgroundColor: "rgba(0,0,0,0.08)",
    marginVertical: 4,
  },
  timelineEventContent: {
    flex: 1,
    paddingBottom: 24,
  },
  timelineTime: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 4,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 4,
  },
  timelineDesc: {
    fontSize: 14,
    color: "rgba(0,0,0,0.6)",
    lineHeight: 22,
  },
  
  // Quiz
  quizList: { 
    padding: 24,
    gap: 12 
  },
});
