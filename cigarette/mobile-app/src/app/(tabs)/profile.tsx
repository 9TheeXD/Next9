import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  Modal,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useAlert } from "@/contexts/AlertContext";
import { useGamification } from "@/contexts/GamificationContext";
import { useAppSounds } from "@/hooks/useAppSounds";
import { api } from "@/lib/api";
import { useDailyLog } from "@/hooks/useDailyLog";
import { calculateStreak } from "@/utils/calculations";
import type { APIResponse, UserProfile } from "@/types";
import QRCode from "react-native-qrcode-svg";

interface Badge {
  id: string;
  name: string;
  description: string;
  iconName: string;
  category: string;
  criteriaDays: number | null;
  criteriaValue: number | null;
}

interface UserBadge {
  id: string;
  badgeId: string;
  earnedAt: string;
}

interface BadgesResponse {
  badges: Badge[];
  earned: UserBadge[];
}

const getBadgeFeatherIcon = (iconName: string): keyof typeof Feather.glyphMap => {
  switch (iconName) {
    case "footprints": return "star";
    case "fire": return "zap";
    case "shield": return "shield";
    case "trophy": return "award";
    case "crown": return "award";
    case "lungs": return "wind";
    case "brain": return "activity";
    case "trending-down": return "trending-down";
    default: return "star";
  }
};


export default function ProfileScreen() {
  const { user, logout, refreshProfile } = useAuth();
  const { showAlert, showConfirm } = useAlert();
  const { recentLogs } = useDailyLog();
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cigarettesPerDay, setCigarettesPerDay] = useState(
    user?.cigarettesPerDay?.toString() ?? ""
  );
  const [pricePerPack, setPricePerPack] = useState(
    user?.pricePerPack?.toString() ?? ""
  );
  const [emergencyContact, setEmergencyContact] = useState(user?.emergencyContact ?? "");

  const { currentStreak, longestStreak } = calculateStreak(recentLogs);

  const { level } = useGamification();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [earned, setEarned] = useState<UserBadge[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const { playClick, playNav } = useAppSounds();

  const fetchBadges = useCallback(async () => {
    try {
      const response = (await api.getBadges()) as APIResponse<BadgesResponse>;
      if (response.success && response.data) {
        setBadges(response.data.badges);
        setEarned(response.data.earned);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingBadges(false);
    }
  }, []);

  React.useEffect(() => {
    fetchBadges();
  }, [fetchBadges]);

  const earnedIds = new Set(earned.map((e) => e.badgeId));
  const earnedCount = earned.length;
  const totalCount = badges.length;


  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.updateProfile({
        cigarettesPerDay: cigarettesPerDay ? parseInt(cigarettesPerDay, 10) : undefined,
        pricePerPack: pricePerPack ? parseFloat(pricePerPack) : undefined,
        emergencyContact: emergencyContact.trim() || null,
      });
      await refreshProfile();
      setEditing(false);
    } catch (err) {
      showAlert({ title: "ข้อผิดพลาด", message: (err as Error).message || "บันทึกโปรไฟล์ล้มเหลว", type: "error" });
    } finally {
      setSaving(false);
    }
  }, [cigarettesPerDay, pricePerPack, emergencyContact, refreshProfile]);

  const handleLogout = async () => {
    const isConfirmed = await showConfirm({
      title: "ออกจากระบบ",
      message: "คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?",
      confirmText: "ออกจากระบบ",
      isDanger: true
    });
    if (isConfirmed) {
      await logout();
      router.replace('/(auth)/login');
    }
  };

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        
      >
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name="user" size={28} color="#3b82f6" />
            <Text style={styles.title}>โปรไฟล์</Text>
          </View>
        </View>

        {/* User card */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>
              🚬
            </Text>
          </View>
          <Text style={styles.userName}>{user?.displayId}</Text>
          <Text style={styles.userEmail}>รหัสประจำตัวผู้สูบ</Text>
          <Text style={styles.memberSince}>เป็นสมาชิกตั้งแต่ {memberSince}</Text>
        </View>

        {user?.role !== "FAMILY" && (
          <>
            {/* Stats */}
            <View style={styles.statsCard}>
              <View style={styles.statRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{currentStreak}</Text>
                  <Text style={styles.statLabel}>วันที่ต่อเนื่อง</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{longestStreak}</Text>
                  <Text style={styles.statLabel}>ต่อเนื่องนานที่สุด</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{recentLogs.length}</Text>
                  <Text style={styles.statLabel}>วันที่บันทึกทั้งหมด</Text>
                </View>
              </View>
            </View>

            {/* Badges Section */}
            <Pressable 
              style={[styles.settingsCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              onPress={() => { playClick(); router.push('/badges'); }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(167, 139, 250, 0.15)', justifyContent: 'center', alignItems: 'center' }}>
                  <Feather name="award" size={20} color="#7dd3fc" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b' }}>เหรียญตราและภารกิจ</Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>ดูความสำเร็จและภารกิจของคุณ</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.3)" />
            </Pressable>
          </>
        )}

        {user?.role !== "FAMILY" && (
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>การตั้งค่าการสูบบุหรี่</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>จำนวนบุหรี่/วัน (พื้นฐาน)</Text>
              {editing ? (
                <TextInput
                  style={styles.settingInput}
                  value={cigarettesPerDay}
                  onChangeText={setCigarettesPerDay}
                  keyboardType="numeric"
                  accessibilityLabel="Cigarettes per day"
                />
              ) : (
                <Text style={styles.settingValue}>{user?.cigarettesPerDay ?? "–"}</Text>
              )}
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>ราคา/ซอง (บาท)</Text>
              {editing ? (
                <TextInput
                  style={styles.settingInput}
                  value={pricePerPack}
                  onChangeText={setPricePerPack}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Price per pack"
                />
              ) : (
                <Text style={styles.settingValue}>
                  {user?.pricePerPack ? `${user.pricePerPack} บาท` : "–"}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Emergency Contact setting */}
        {user?.role !== "FAMILY" && (
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>ติดต่อฉุกเฉิน</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>เบอร์คนสนิท</Text>
              {editing ? (
                <TextInput
                  style={styles.settingInput}
                  value={emergencyContact}
                  onChangeText={setEmergencyContact}
                  keyboardType="phone-pad"
                  placeholder="เช่น 0812345678"
                  accessibilityLabel="Emergency contact"
                />
              ) : (
                <Text style={styles.settingValue}>
                  {user?.emergencyContact || "ไม่ได้ตั้งค่า"}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* QR Code Section */}
        <View style={styles.settingsCard}>
          <Text style={styles.settingsTitle}>สแกนเพื่อติดตาม</Text>
          <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 16, textAlign: 'center' }}>
            {user?.role === "FAMILY" 
              ? "ให้ผู้สูบสแกน QR Code นี้เพื่อเพิ่มคุณเป็นผู้ติดตาม"
              : "ให้ผู้ติดตามสแกน QR Code นี้เพื่อเพิ่มคุณ"}
          </Text>
          <View style={{ alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12 }}>
            <QRCode 
              value={`${typeof window !== "undefined" && window.location?.origin?.startsWith("http") ? window.location.origin : process.env.EXPO_PUBLIC_APP_URL || "https://next9-ciga-app.vercel.app"}/?target=${user?.displayId}`}
              size={150}
            />
          </View>
        </View>

        {/* LINE OA Contact */}
        <Pressable
          style={styles.lineOaButton}
          onPress={() => {
            playClick();
            Linking.openURL('https://lin.ee/xwrSHNg');
          }}
        >
          <View style={styles.lineIconCircle}>
            <Feather name="message-circle" size={20} color="#ffffff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.lineOaText}>คุยกับเจ้าหน้าที่ช่วยเหลือ</Text>
            <Text style={styles.lineOaSubText}>ผ่าน LINE Official Account</Text>
          </View>
          <Feather name="external-link" size={16} color="#06C755" />
        </Pressable>

        {/* Action buttons */}
        {editing ? (
          <View style={styles.editActions}>
            <Pressable
              style={[styles.actionButton, styles.saveButton]}
              onPress={() => { playClick(); handleSave(); }}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>บันทึกการเปลี่ยนแปลง</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.cancelButton]}
              onPress={() => {
                playClick();
                setEditing(false);
                setCigarettesPerDay(user?.cigarettesPerDay?.toString() ?? "");
                setPricePerPack(user?.pricePerPack?.toString() ?? "");
                setEmergencyContact(user?.emergencyContact ?? "");
              }}
            >
              <Text style={styles.cancelButtonText}>ยกเลิก</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.actionButton, styles.editButton, { flexDirection: "row", justifyContent: "center", gap: 8 }]}
            onPress={() => {
              playClick();
              setCigarettesPerDay(user?.cigarettesPerDay?.toString() ?? "");
              setPricePerPack(user?.pricePerPack?.toString() ?? "");
              setEmergencyContact(user?.emergencyContact ?? "");
              setEditing(true);
            }}
          >
            <Feather name="edit-2" size={16} color="#7dd3fc" />
            <Text style={styles.editButtonText}>แก้ไขโปรไฟล์</Text>
          </Pressable>
        )}

        <Pressable style={[styles.actionButton, styles.logoutButton]} onPress={() => { playClick(); handleLogout(); }}>
          <Text style={styles.logoutButtonText}>ออกจากระบบ</Text>
        </Pressable>
      </ScrollView>

      {/* Badge detail modal */}
      <Modal
        visible={!!selectedBadge}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedBadge(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedBadge(null)}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Feather 
                name={getBadgeFeatherIcon(selectedBadge?.iconName ?? "")} 
                size={56} 
                color="#7dd3fc" 
              />
            </View>
            <Text style={styles.modalName}>{selectedBadge?.name}</Text>
            <Text style={styles.modalDesc}>{selectedBadge?.description}</Text>
            <View style={styles.modalDivider} />
            <Text style={styles.modalCriteria}>
              {selectedBadge?.criteriaDays
                ? `ต้องการ ${selectedBadge.criteriaDays} วัน`
                : selectedBadge?.criteriaValue
                ? `ต้องการความสำเร็จ ${selectedBadge.criteriaValue}%`
                : "เงื่อนไขพิเศษ"}
            </Text>
            <Text style={styles.modalCategory}>
              หมวดหมู่: {selectedBadge?.category}
            </Text>
            <Pressable
              style={styles.modalClose}
              onPress={() => setSelectedBadge(null)}
            >
              <Text style={styles.modalCloseText}>ปิด</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f0fdfa" },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 28, fontWeight: "800", color: "#1e293b", letterSpacing: -0.5 },

  userCard: {
    alignItems: "center",
    padding: 24,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    marginBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(56,189,248,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarEmoji: { fontSize: 28, fontWeight: "800", color: "#7dd3fc" },
  userName: { fontSize: 20, fontWeight: "800", color: "#1e293b" },
  userEmail: { fontSize: 13, color: "#475569", marginTop: 2 },
  memberSince: { fontSize: 11, color: "rgba(0,0,0,0.3)", marginTop: 4 },
  editContainer: { width: "100%", marginTop: 8 },

  statsCard: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    marginBottom: 16,
  },
  statRow: { flexDirection: "row", alignItems: "center" },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "800", color: "#1e293b" },
  statLabel: { fontSize: 10, color: "rgba(0,0,0,0.55)", fontWeight: "600", marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: "rgba(0,0,0,0.06)" },

  settingsCard: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    marginBottom: 20,
  },
  settingsTitle: { fontSize: 15, fontWeight: "700", color: "rgba(0,0,0,0.6)", marginBottom: 14 },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  settingLabel: { fontSize: 13, color: "#475569" },
  settingValue: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  settingInput: {
    borderRadius: 10,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#1e293b",
    width: 100,
    textAlign: "right",
  },

  input: {
    borderRadius: 14,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1e293b",
  },

  editActions: { flexDirection: "row", gap: 12, marginBottom: 12 },
  actionButton: { paddingVertical: 14, borderRadius: 16, alignItems: "center" },
  editButton: { backgroundColor: "rgba(56,189,248,0.15)", borderWidth: 1, borderColor: "rgba(56,189,248,0.3)" },
  editButtonText: { fontSize: 14, fontWeight: "700", color: "#7dd3fc" },
  saveButton: { flex: 1, backgroundColor: "#38bdf8" },
  saveButtonText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
  cancelButton: { flex: 1, backgroundColor: "#f0fdfa" },
  cancelButtonText: { fontSize: 14, fontWeight: "700", color: "#475569" },
  logoutButton: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    marginTop: 4,
  },

  logoutButtonText: { fontSize: 14, fontWeight: "700", color: "#f87171" },

  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#f0fdfa",
    marginBottom: 20,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#7dd3fc",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  badgeCard: {
    width: "47%",
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    gap: 6,
  },
  badgeCardEarned: {
    backgroundColor: "rgba(167,139,250,0.08)",
    borderColor: "rgba(167,139,250,0.2)",
  },
  badgeIcon: { alignItems: "center", justifyContent: "center" },
  badgeIconLocked: { opacity: 0.3 },
  badgeName: { fontSize: 13, fontWeight: "700", color: "#1e293b", textAlign: "center" },
  badgeNameLocked: { color: "rgba(0,0,0,0.55)" },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalCard: {
    width: "100%",
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  modalIcon: { marginBottom: 12 },
  modalName: { fontSize: 22, fontWeight: "800", color: "#1e293b", marginBottom: 8 },
  modalDesc: { fontSize: 14, color: "#475569", textAlign: "center", lineHeight: 20 },
  modalDivider: { height: 1, backgroundColor: "rgba(0,0,0,0.06)", width: "100%", marginVertical: 16 },
  modalCriteria: { fontSize: 13, color: "#7dd3fc", fontWeight: "600" },
  modalCategory: { fontSize: 11, color: "#64748b", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 },
  modalClose: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.06)" },
  modalCloseText: { fontSize: 14, fontWeight: "600", color: "#1e293b" },
  lineOaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 20,
    backgroundColor: "rgba(6, 199, 85, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(6, 199, 85, 0.2)",
    marginBottom: 20,
  },
  lineIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#06C755",
    justifyContent: "center",
    alignItems: "center",
  },
  lineOaText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e293b",
  },
  lineOaSubText: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
});
