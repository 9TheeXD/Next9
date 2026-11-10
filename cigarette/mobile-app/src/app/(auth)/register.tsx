import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { Feather } from "@expo/vector-icons";

function getOrGenerateDisplayId() {
  if (Platform.OS === 'web') {
    const match = document.cookie.match(/(^| )ciga_display_id=([^;]+)/);
    if (match) return match[2];
    const newId = Math.floor(Math.random() * 9000 + 1000).toString();
    document.cookie = `ciga_display_id=${newId}; path=/; max-age=31536000`;
    return newId;
  }
  return Math.floor(Math.random() * 9000 + 1000).toString();
}

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  
  const [role, setRole] = useState<"SMOKER" | "FAMILY">("SMOKER");
  const [targetDisplayId, setTargetDisplayId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {

    if (role === "FAMILY" && !targetDisplayId.trim()) {
      setError("กรุณากรอกรหัส 4 หลักของผู้สูบที่ต้องการติดตาม");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const displayId = getOrGenerateDisplayId();
      await register({
        displayId,
        role,
        targetDisplayId: role === "FAMILY" ? targetDisplayId.trim() : undefined,
      });
      router.replace("/(tabs)");
    } catch (err) {
      setError((err as Error).message || "การสมัครสมาชิกล้มเหลว กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Feather name="heart" size={32} color="#38bdf8" />
            </View>
            <Text style={styles.appName}>Next Breath</Text>
            <Text style={styles.tagline}>เริ่มการเดินทางเลิกบุหรี่ของคุณวันนี้</Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>สร้างบัญชี</Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}



            {/* Role Selection */}
            <View style={styles.roleContainer}>
              <Pressable
                style={[styles.roleButton, role === "SMOKER" && styles.roleButtonActive]}
                onPress={() => setRole("SMOKER")}
              >
                <Text style={[styles.roleButtonText, role === "SMOKER" && styles.roleButtonTextActive]}>ฉันคือผู้สูบ</Text>
              </Pressable>
              <Pressable
                style={[styles.roleButton, role === "FAMILY" && styles.roleButtonActive]}
                onPress={() => setRole("FAMILY")}
              >
                <Text style={[styles.roleButtonText, role === "FAMILY" && styles.roleButtonTextActive]}>ฉันคือครอบครัวผู้สูบ</Text>
              </Pressable>
            </View>





            {role === "SMOKER" ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.sectionDesc}>
                  ข้อมูลพฤติกรรมการสูบบุหรี่จะถูกดึงจากแบบสอบถามที่คุณเคยทำไว้
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>ติดตามผู้สูบ</Text>
                <Text style={styles.sectionDesc}>
                  ระบุรหัส 4 หลักของคนในครอบครัวที่คุณต้องการติดตาม
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>รหัส 4 หลักของผู้สูบ *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="เช่น 1234"
                    placeholderTextColor="#64748b"
                    value={targetDisplayId}
                    onChangeText={setTargetDisplayId}
                    keyboardType="numeric"
                    accessibilityLabel="Target Display ID"
                  />
                </View>
              </>
            )}

            <Pressable
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleRegister}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Create account"
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>สร้างบัญชี</Text>
              )}
            </Pressable>
          </View>

          {/* Login link */}
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>มีบัญชีผู้ใช้แล้วใช่ไหม? </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable>
                <Text style={styles.switchLink}>เข้าสู่ระบบ</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f0fdfa",
  },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(56,189,248,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  appName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1e293b",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    color: "#475569",
    marginTop: 4,
  },
  formCard: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    padding: 24,
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: "rgba(248,113,113,0.15)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
  },
  errorText: {
    color: "#f87171",
    fontSize: 13,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 14,
  },
  roleContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    backgroundColor: "#ffffff",
    alignItems: "center",
  },
  roleButtonActive: {
    borderColor: "#38bdf8",
    backgroundColor: "#38bdf8",
  },
  roleButtonText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600",
  },
  roleButtonTextActive: {
    color: "#ffffff",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 6,
  },
  input: {
    borderRadius: 14,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: "#1e293b",
  },
  divider: {
    height: 1,
    backgroundColor: "#f0fdfa",
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "rgba(0,0,0,0.6)",
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: "rgba(0,0,0,0.55)",
    marginBottom: 14,
  },
  rowInputs: {
    flexDirection: "row",
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  submitButton: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#38bdf8",
    alignItems: "center",
    shadowColor: "#38bdf8",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  switchText: {
    fontSize: 14,
    color: "#475569",
  },
  switchLink: {
    fontSize: 14,
    fontWeight: "700",
    color: "#7dd3fc",
  },
});
