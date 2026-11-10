import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";

interface RememberedAccount {
  displayId: string;
  displayName: string;
  role: string;
  followedSmokerDisplayId?: string | null;
}

async function getNewDisplayId(): Promise<string> {
  const newId = Math.floor(Math.random() * 9000 + 1000).toString();
  await AsyncStorage.setItem("ciga_display_id", newId);
  if (Platform.OS === "web" && typeof document !== "undefined") {
    document.cookie = `ciga_display_id=${newId}; path=/; max-age=31536000`;
  }
  return newId;
}

async function getRememberedAccount(): Promise<RememberedAccount | null> {
  try {
    const raw = await AsyncStorage.getItem("@ciga_remembered_account");
    if (raw) return JSON.parse(raw);

    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      const webRaw = localStorage.getItem("ciga_remembered_account");
      if (webRaw) return JSON.parse(webRaw);
    }
  } catch (e) {
    console.warn("Failed to read remembered account:", e);
  }
  return null;
}

export default function LoginScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberedAccount, setRememberedAccount] = useState<RememberedAccount | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);

  useEffect(() => {
    getRememberedAccount().then((acc) => {
      setRememberedAccount(acc);
    });
  }, []);

  const handleStartPress = async () => {
    setError(null);
    const existing = await getRememberedAccount();
    if (existing && existing.displayId) {
      setRememberedAccount(existing);
      setShowAccountModal(true);
      return;
    }

    // First time user: generate ID and route to onboarding
    await proceedWithNewAccount();
  };

  const proceedWithPreviousAccount = async (account: RememberedAccount) => {
    setLoading(true);
    setError(null);
    setShowAccountModal(false);
    try {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        document.cookie = `ciga_display_id=${account.displayId}; path=/; max-age=31536000`;
      }
      await AsyncStorage.setItem("ciga_display_id", account.displayId);

      await register({
        displayId: account.displayId,
        role: account.role || "SMOKER",
        targetDisplayId: account.followedSmokerDisplayId || undefined,
      });

      // Clear remembered state after successful re-login
      await AsyncStorage.removeItem("@ciga_remembered_account");
      if (Platform.OS === "web" && typeof localStorage !== "undefined") {
        localStorage.removeItem("ciga_remembered_account");
      }

      router.replace("/(tabs)");
    } catch (err: any) {
      if (err.message?.includes("SURVEY_REQUIRED") || err.message?.includes("ACCOUNT_DELETED")) {
        router.push("/onboarding" as any);
      } else {
        setError(err.message || "เกิดข้อผิดพลาดในการเข้าสู่ระบบ");
      }
    } finally {
      setLoading(false);
    }
  };

  const proceedWithNewAccount = async () => {
    setLoading(true);
    setError(null);
    setShowAccountModal(false);
    try {
      // Generate a new display ID without deleting previous account in DB
      // We keep @ciga_remembered_account so if onboarding is canceled/refreshed, the previous account is not lost
      const newDisplayId = await getNewDisplayId();

      try {
        await register({ displayId: newDisplayId, role: "SMOKER" });
        router.replace("/(tabs)");
      } catch (err: any) {
        if (err.message?.includes("SURVEY_REQUIRED") || err.message?.includes("ACCOUNT_DELETED")) {
          router.push("/onboarding" as any);
        } else {
          setError(err.message || "เกิดข้อผิดพลาด");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={["#72a9d8", "#a8d1ee", "#79b0dc"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.gradient}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          {/* App Icon */}
          <View style={styles.iconWrapper}>
            <Image
              source={require("../../../assets/images/icon.png")}
              style={styles.appIcon}
            />
          </View>

          {/* Welcome Text */}
          <Text style={styles.welcomeText}>
            {"ยินดีต้อนรับสู่ Next Breath"}
          </Text>

          {/* Main Title 1 */}
          <Text style={styles.mainTitle1}>
            {"หายใจครั้งต่อไป"}
          </Text>

          {/* Main Title 2 (Accent) */}
          <Text style={styles.mainTitle2}>
            {"ที่ไร้ควัน"}
          </Text>

          {/* Description */}
          <Text style={styles.description}>
            {"แอปพลิเคชันช่วยเลิกบุหรี่\nด้วยการติดตามพฤติกรรม\nเกมเสริมกำลังใจ และแรงสนับสนุน\nจากคนที่คุณรัก"}
          </Text>

          {/* Error Notification */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Start Button */}
          <Pressable
            style={({ pressed }) => [
              styles.startButton,
              pressed && styles.startButtonPressed,
            ]}
            onPress={handleStartPress}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#38bdf8" size="small" />
            ) : (
              <Text style={styles.startButtonText}>เริ่มต้น</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* Remembered Account Modal */}
      <Modal
        visible={showAccountModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAccountModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconCircle}>
              <Feather name="user-check" size={32} color="#0284c7" />
            </View>

            <Text style={styles.modalTitle}>คุณเคยมีบัญชีอยู่แล้ว</Text>

            <View style={styles.accountInfoBox}>
              <Text style={styles.accountInfoLabel}>รหัสประจำตัวของคุณ</Text>
              <Text style={styles.accountDisplayId}>{rememberedAccount?.displayId}</Text>
              {rememberedAccount?.followedSmokerDisplayId ? (
                <View style={styles.followerTag}>
                  <Feather name="link" size={13} color="#0284c7" style={{ marginRight: 4 }} />
                  <Text style={styles.followerTagText}>
                    มีผู้ติดตาม ของรหัส {rememberedAccount.followedSmokerDisplayId}
                  </Text>
                </View>
              ) : null}
            </View>

            <Pressable
              style={styles.btnPreviousAccount}
              onPress={() => rememberedAccount && proceedWithPreviousAccount(rememberedAccount)}
            >
              <Feather name="log-in" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.btnPreviousAccountText}>
                เข้าใช้งานด้วยรหัส {rememberedAccount?.displayId}
              </Text>
            </Pressable>

            <Pressable style={styles.btnNewAccount} onPress={proceedWithNewAccount}>
              <Feather name="user-plus" size={18} color="#0284c7" style={{ marginRight: 8 }} />
              <Text style={styles.btnNewAccountText}>สร้างบัญชีใหม่</Text>
            </Pressable>

            <Pressable style={styles.btnCancel} onPress={() => setShowAccountModal(false)}>
              <Text style={styles.btnCancelText}>ยกเลิก</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 48,
  },
  container: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "rgba(14, 165, 233, 0.2)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 8,
  },
  appIcon: {
    width: 92,
    height: 92,
    borderRadius: 20,
  },
  welcomeText: {
    fontFamily: Platform.select({
      web: "'Prompt', 'Kanit', sans-serif",
      default: "Prompt",
    }),
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 10,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  mainTitle1: {
    fontFamily: Platform.select({
      web: "'DawnoraTH', 'Chonburi', 'Fahkwang', 'Kanit', sans-serif",
      default: "Kanit",
    }),
    fontSize: 44,
    fontWeight: "900",
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 56,
    textShadowColor: "rgba(0, 0, 0, 0.08)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  mainTitle2: {
    fontFamily: Platform.select({
      web: "'DawnoraTH', 'Chonburi', 'Fahkwang', 'Kanit', sans-serif",
      default: "Kanit",
    }),
    fontSize: 44,
    fontWeight: "900",
    color: "#0284c7",
    textAlign: "center",
    lineHeight: 56,
    marginBottom: 18,
    textShadowColor: "rgba(255, 255, 255, 0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  description: {
    fontFamily: Platform.select({
      web: "'Prompt', 'Sarabun', sans-serif",
      default: "Prompt",
    }),
    fontSize: 17,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.95)",
    textAlign: "center",
    lineHeight: 28,
    marginBottom: 36,
    textShadowColor: "rgba(0, 0, 0, 0.06)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  errorBox: {
    backgroundColor: "rgba(248,113,113,0.15)",
    padding: 14,
    borderRadius: 14,
    marginBottom: 20,
    width: "100%",
    maxWidth: 340,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  errorText: {
    color: "#ef4444",
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Sarabun",
    fontWeight: "600",
  },
  startButton: {
    backgroundColor: "#ffffff",
    paddingVertical: 18,
    paddingHorizontal: 64,
    borderRadius: 50,
    width: "100%",
    maxWidth: 290,
    alignItems: "center",
    shadowColor: "rgba(0, 0, 0, 0.08)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 6,
  },
  startButtonPressed: {
    transform: [{ scale: 0.97 }],
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  startButtonText: {
    fontFamily: Platform.select({
      web: "'Prompt', 'Kanit', sans-serif",
      default: "Prompt",
    }),
    fontSize: 24,
    fontWeight: "700",
    color: "#0284c7",
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 28,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  modalIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#e0f2fe",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: Platform.select({
      web: "'Prompt', 'Kanit', sans-serif",
      default: "Prompt",
    }),
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 16,
    textAlign: "center",
  },
  accountInfoBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    padding: 16,
    width: "100%",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  accountInfoLabel: {
    fontFamily: "Sarabun",
    fontSize: 13,
    color: "#64748b",
    marginBottom: 4,
  },
  accountDisplayId: {
    fontFamily: Platform.select({
      web: "'Prompt', 'Kanit', sans-serif",
      default: "Prompt",
    }),
    fontSize: 32,
    fontWeight: "800",
    color: "#0284c7",
    letterSpacing: 2,
  },
  followerTag: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  followerTagText: {
    fontFamily: "Sarabun",
    fontSize: 12,
    fontWeight: "600",
    color: "#0369a1",
  },
  btnPreviousAccount: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0284c7",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 16,
    width: "100%",
    marginBottom: 12,
    shadowColor: "#0284c7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPreviousAccountText: {
    fontFamily: Platform.select({
      web: "'Prompt', 'Kanit', sans-serif",
      default: "Prompt",
    }),
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  btnNewAccount: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#0284c7",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    width: "100%",
    marginBottom: 16,
  },
  btnNewAccountText: {
    fontFamily: Platform.select({
      web: "'Prompt', 'Kanit', sans-serif",
      default: "Prompt",
    }),
    color: "#0284c7",
    fontSize: 16,
    fontWeight: "700",
  },
  btnCancel: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  btnCancelText: {
    fontFamily: "Sarabun",
    fontSize: 14,
    color: "#94a3b8",
    fontWeight: "600",
  },
});
