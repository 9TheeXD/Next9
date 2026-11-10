import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView, TextInput, ActivityIndicator, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { Feather } from "@expo/vector-icons";

import AsyncStorage from "@react-native-async-storage/async-storage";

async function getDisplayId() {
  if (Platform.OS === 'web') {
    const match = document.cookie.match(/(^| )ciga_display_id=([^;]+)/);
    if (match) return match[2];
  }
  const stored = await AsyncStorage.getItem("ciga_display_id");
  if (stored) return stored;

  const newId = Math.floor(Math.random() * 9000 + 1000).toString();
  await AsyncStorage.setItem("ciga_display_id", newId);
  if (Platform.OS === 'web') {
    document.cookie = `ciga_display_id=${newId}; path=/; max-age=31536000`;
  }
  return newId;
}

export default function FollowScreen() {
  const router = useRouter();
  const { register, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState("");

  const handleFamilySelect = async () => {
    if (!targetId.trim() || targetId.trim().length !== 4) {
      setError("กรุณากรอกรหัส 4 หลักของผู้สูบให้ถูกต้อง");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const displayId = user?.displayId || await getDisplayId();
      await register({ displayId, role: "FAMILY", targetDisplayId: targetId.trim() });
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "รหัส 4 หลักไม่ถูกต้อง หรือไม่พบผู้ใช้งาน");
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Feather name="arrow-left" size={24} color="#1e293b" />
          </Pressable>
        </View>

        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Feather name="users" size={32} color="#38bdf8" />
          </View>
          <Text style={styles.appName}>ติดตามผู้สูบ</Text>
        </View>

        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.promptText}>กรุณาระบุรหัส 4 หลักของผู้สูบ</Text>
          
          <View style={styles.instructionBox}>
            <Feather name="info" size={20} color="#0284c7" style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.instructionTitle}>วิธีดูรหัส 4 หลัก:</Text>
              <Text style={styles.instructionText}>
                ให้ผู้สูบเปิดแอปพลิเคชัน ไปที่เมนู "โพรไฟล์" (มุมขวาล่าง) จากนั้นดูรหัส 4 หลักที่แสดงอยู่ใต้ชื่อผู้ใช้งาน
              </Text>
            </View>
          </View>
          
          <TextInput
            style={styles.input}
            placeholder="เช่น 1234"
            placeholderTextColor="#cbd5e1"
            value={targetId}
            onChangeText={setTargetId}
            keyboardType="numeric"
            maxLength={4}
          />

          <Pressable
            style={[styles.button, styles.primaryButton]}
            onPress={handleFamilySelect}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>ยืนยันเพื่อติดตาม</Text>}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f0fdfa" },
  container: { flex: 1, padding: 24, paddingTop: 40 },
  header: { marginBottom: 20 },
  backButton: { padding: 8, marginLeft: -8 },
  logoContainer: { alignItems: "center", marginBottom: 36 },
  logoCircle: { width: 72, height: 72, borderRadius: 22, backgroundColor: "rgba(56,189,248,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  appName: { fontSize: 28, fontWeight: "800", color: "#1e293b" },
  card: { backgroundColor: "#fff", padding: 24, borderRadius: 16, elevation: 4, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  promptText: { fontSize: 18, fontWeight: "600", color: "#1e293b", textAlign: "center", marginBottom: 16 },
  instructionBox: { flexDirection: "row", backgroundColor: "#e0f2fe", padding: 16, borderRadius: 12, marginBottom: 24 },
  instructionTitle: { fontSize: 14, fontWeight: "700", color: "#0369a1", marginBottom: 4 },
  instructionText: { fontSize: 14, color: "#0c4a6e", lineHeight: 20 },
  button: { paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  primaryButton: { backgroundColor: "#38bdf8" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  errorBox: { backgroundColor: "rgba(248,113,113,0.1)", padding: 12, borderRadius: 8, marginBottom: 16 },
  errorText: { color: "#ef4444", textAlign: "center", fontSize: 14 },
  input: { backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", padding: 16, borderRadius: 12, fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 24, letterSpacing: 4 }
});
