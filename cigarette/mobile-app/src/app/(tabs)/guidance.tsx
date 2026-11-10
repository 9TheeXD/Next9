import React from "react";
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

export default function GuidanceScreen() {
  const router = useRouter();

  const guidanceItems = [
    {
      title: "ให้กำลังใจ ไม่จับผิด",
      desc: "การเลิกบุหรี่เป็นเรื่องยาก ผู้สูบมักจะมีความเครียดสูง ควรให้กำลังใจในวันที่เขาทำได้ดี และไม่ตำหนิในวันที่เขาพลาดสูบไปบ้าง ให้มองว่าเป็นการเริ่มต้นใหม่",
      icon: "heart",
      color: "#f43f5e"
    },
    {
      title: "ชวนทำกิจกรรมเบี่ยงเบนความสนใจ",
      desc: "เมื่อผู้สูบมีอาการอยากบุหรี่ ให้ชวนไปทำกิจกรรมอื่น เช่น เดินเล่น ออกกำลังกาย ดื่มน้ำเย็น หรือชวนคุยเรื่องอื่นเพื่อดึงความสนใจออกจากความอยาก",
      icon: "activity",
      color: "#3b82f6"
    },
    {
      title: "จัดสภาพแวดล้อมให้เหมาะสม",
      desc: "ช่วยเก็บอุปกรณ์การสูบบุหรี่ เช่น ที่เขี่ยบุหรี่ ไฟแช็ก ออกจากสายตา และพยายามหลีกเลี่ยงการพาไปในสถานที่ที่มีคนสูบบุหรี่เยอะๆ",
      icon: "home",
      color: "#10b981"
    },
    {
      title: "รับฟังด้วยความเข้าใจ",
      desc: "บางครั้งผู้สูบอาจมีอารมณ์หงุดหงิดง่ายจากการขาดนิโคติน ให้พยายามรับฟังด้วยความใจเย็น ไม่โต้เถียง และเข้าใจว่าเป็นอาการชั่วคราว",
      icon: "headphones",
      color: "#8b5cf6"
    },
    {
      title: "ชื่นชมกับความสำเร็จเล็กๆ",
      desc: "เมื่อเขาสามารถลดจำนวนบุหรี่ลงได้ หรือไม่สูบเลยในแต่ละวัน ให้ชื่นชมและให้รางวัลเล็กๆ น้อยๆ เพื่อสร้างแรงจูงใจในการเลิกต่อไป",
      icon: "star",
      color: "#f59e0b"
    }
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>คำแนะนำสำหรับผู้ติดตาม</Text>
          <Text style={styles.subtitle}>แนวทางในการดูแลและช่วยเหลือผู้ที่กำลังเลิกบุหรี่</Text>
        </View>

        <View style={styles.contentContainer}>
          {guidanceItems.map((item, index) => (
            <View key={index} style={styles.card}>
              <View style={[styles.iconContainer, { backgroundColor: `${item.color}20` }]}>
                <Feather name={item.icon as any} size={28} color={item.color} />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.bottomSection}>
          <Text style={styles.bottomText}>
            ความอดทนและความเข้าใจจากคนรอบข้าง คือพลังสำคัญที่จะช่วยให้เขาเลิกบุหรี่ได้สำเร็จ!
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f0fdfa",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
    lineHeight: 24,
  },
  contentContainer: {
    gap: 16,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 15,
    color: "#475569",
    lineHeight: 22,
  },
  bottomSection: {
    marginTop: 32,
    padding: 20,
    backgroundColor: "#e0f2fe",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  bottomText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0284c7",
    textAlign: "center",
    lineHeight: 24,
  }
});
