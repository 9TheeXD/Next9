import re
import sys

def modify_profile():
    with open("src/app/(tabs)/profile.tsx", "r") as f:
        content = f.read()

    # 1. Imports
    imports = """import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { useGamification } from "@/contexts/GamificationContext";
import { api } from "@/lib/api";"""
    content = content.replace('import { useRouter } from "expo-router";\nimport { Feather } from "@expo/vector-icons";\nimport { useAuth } from "@/contexts/AuthContext";\nimport { api } from "@/lib/api";', imports)
    
    # 2. Add Modal to react-native imports
    content = content.replace("  Platform,\n} from \"react-native\";", "  Platform,\n  Modal,\n} from \"react-native\";")

    # 3. Add types and icon function
    types = """import type { APIResponse, UserProfile } from "@/types";

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
"""
    content = content.replace('import type { APIResponse, UserProfile } from "@/types";', types)

    # 4. Add state inside ProfileScreen
    hooks = """  const { currentStreak, longestStreak } = calculateStreak(recentLogs);

  const { level } = useGamification();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [earned, setEarned] = useState<UserBadge[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(true);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);

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
"""
    content = content.replace('  const { currentStreak, longestStreak } = calculateStreak(recentLogs);', hooks)

    # 5. Add UI section before Settings
    badges_ui = """
        {/* Badges Section */}
        <View style={styles.settingsCard}>
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.settingsTitle}>เหรียญตราความสำเร็จ</Text>
            <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
              ได้รับ {earnedCount} จาก {totalCount} เหรียญตรา
            </Text>
          </View>

          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: totalCount > 0 ? `${(earnedCount / totalCount) * 100}%` : "0%" },
              ]}
            />
          </View>

          {loadingBadges ? (
            <ActivityIndicator color="#a78bfa" size="large" style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.grid}>
              {badges.map((badge) => {
                const isEarned = earnedIds.has(badge.id);
                const earnedEntry = earned.find((e) => e.badgeId === badge.id);
                return (
                  <Pressable
                    key={badge.id}
                    style={[styles.badgeCard, isEarned && styles.badgeCardEarned]}
                    onPress={() => setSelectedBadge(badge)}
                  >
                    <View style={[styles.badgeIcon, !isEarned && styles.badgeIconLocked]}>
                      <Feather 
                        name={getBadgeFeatherIcon(badge.iconName)} 
                        size={32} 
                        color={isEarned ? "#a78bfa" : "rgba(255,255,255,0.35)"} 
                      />
                    </View>
                    <Text
                      style={[styles.badgeName, !isEarned && styles.badgeNameLocked]}
                      numberOfLines={2}
                    >
                      {badge.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Smoking settings */}"""
    content = content.replace('        {/* Smoking settings */}', badges_ui)

    # 6. Add Modal before </SafeAreaView>
    modal = """
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
                color="#a78bfa" 
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
    </SafeAreaView>"""
    content = content.replace('    </SafeAreaView>', modal)

    # 7. Add Badge styles
    styles_code = """
  logoutButtonText: { fontSize: 14, fontWeight: "700", color: "#f87171" },

  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 20,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#a78bfa",
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
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    gap: 6,
  },
  badgeCardEarned: {
    backgroundColor: "rgba(167,139,250,0.08)",
    borderColor: "rgba(167,139,250,0.2)",
  },
  badgeIcon: { alignItems: "center", justifyContent: "center" },
  badgeIconLocked: { opacity: 0.3 },
  badgeName: { fontSize: 13, fontWeight: "700", color: "#fff", textAlign: "center" },
  badgeNameLocked: { color: "rgba(255,255,255,0.35)" },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalCard: {
    width: "100%",
    borderRadius: 24,
    backgroundColor: "#1a1f2e",
    padding: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  modalIcon: { marginBottom: 12 },
  modalName: { fontSize: 22, fontWeight: "800", color: "#fff", marginBottom: 8 },
  modalDesc: { fontSize: 14, color: "rgba(255,255,255,0.6)", textAlign: "center", lineHeight: 20 },
  modalDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", width: "100%", marginVertical: 16 },
  modalCriteria: { fontSize: 13, color: "#a78bfa", fontWeight: "600" },
  modalCategory: { fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 },
  modalClose: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)" },
  modalCloseText: { fontSize: 14, fontWeight: "600", color: "#fff" },
});"""
    content = content.replace('  logoutButtonText: { fontSize: 14, fontWeight: "700", color: "#f87171" },\n});', styles_code)

    with open("src/app/(tabs)/profile.tsx", "w") as f:
        f.write(content)

modify_profile()
