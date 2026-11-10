import React, { useState, useCallback } from "react";
import { Feather } from "@expo/vector-icons";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { getMotivationalMessage } from "@/utils/calculations";
import { api } from "@/lib/api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COUNTER_SIZE = Math.min(SCREEN_WIDTH * 0.55, 240);

interface DailyTrackerProps {
  baseline: number | null;
  onSave: (count: number) => Promise<void>;
  initialCount?: number;
  isSaving?: boolean;
  isLoading?: boolean;
  smokingType?: "CIGARETTE" | "POD";
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function DailyTracker({
  baseline,
  onSave,
  initialCount = 0,
  isSaving = false,
  isLoading = false,
  smokingType = "CIGARETTE",
}: DailyTrackerProps) {
  const [count, setCount] = useState(initialCount);
  const [saved, setSaved] = useState(false);

  // Sync count if initialCount changes (e.g. after data loads asynchronously)
  React.useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  // Animated values
  const counterScale = useSharedValue(1);
  const buttonPulse = useSharedValue(1);
  const colorProgress = useSharedValue(0);
  const saveScale = useSharedValue(1);

  // Update color based on count relative to baseline
  React.useEffect(() => {
    const ratio = baseline && baseline > 0 ? count / baseline : count / 20;
    colorProgress.value = withTiming(Math.min(ratio, 1), { duration: 400 });
  }, [count, baseline, colorProgress]);

  const counterAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: counterScale.value }],
  }));

  const counterBorderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      colorProgress.value,
      [0, 0.5, 1],
      ["#10b981", "#f59e0b", "#ef4444"]
    ),
  }));

  const saveButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: saveScale.value }],
  }));

  const handleIncrement = useCallback(() => {
    setCount((prev) => prev + 1);
    setSaved(false);
    counterScale.value = withSequence(
      withSpring(1.08, { damping: 8, stiffness: 400 }),
      withSpring(1, { damping: 12, stiffness: 200 })
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      // Haptics not available (e.g., web)
    });
  }, [counterScale]);

  const handleDecrement = useCallback(() => {
    setCount((prev) => Math.max(0, prev - 1));
    setSaved(false);
    counterScale.value = withSequence(
      withSpring(0.93, { damping: 8, stiffness: 400 }),
      withSpring(1, { damping: 12, stiffness: 200 })
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      // Haptics not available
    });
  }, [counterScale]);

  const handleSave = useCallback(async () => {
    saveScale.value = withSequence(
      withSpring(0.95, { damping: 10 }),
      withSpring(1, { damping: 8 })
    );

    try {
      await onSave(count);
      api.postActionLog({
        action: "LOG_CIGARETTE",
        details: `บันทึกบุหรี่/พัฟ จำนวน ${count}`,
        metadata: { count }
      }).catch(() => {});
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {
          // Haptics not available
        }
      );
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => {
          // Haptics not available
        }
      );
    }
  }, [count, onSave, saveScale]);

  const message = getMotivationalMessage(count, baseline);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Feather name="activity" size={28} color="#38bdf8" />
          <Text style={styles.title}>ตัวติดตามวันนี้</Text>
        </View>
        <Text style={styles.subtitle}>
          {new Date().toLocaleDateString("th-TH", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </Text>
      </View>

      {/* Counter Circle */}
      <View style={styles.counterWrapper}>
        <Animated.View
          style={[styles.counterOuter, counterBorderStyle, counterAnimatedStyle]}
        >
          <View style={styles.counterInner}>
            <Text style={styles.counterLabel}>{smokingType === "POD" ? "จำนวนพัฟ (Pod)" : "จำนวนบุหรี่"}</Text>
            {isLoading ? (
              <ActivityIndicator size="large" color="#38bdf8" style={{ marginVertical: 10 }} />
            ) : (
              <Text style={styles.counterNumber}>{count}</Text>
            )}
            <Text style={styles.counterToday}>วันนี้</Text>
          </View>
        </Animated.View>
      </View>

      {/* +/- Buttons */}
      <View style={styles.buttonRow}>
        <AnimatedPressable
          onPress={handleDecrement}
          style={[styles.circleButton, styles.decrementButton]}
          accessibilityLabel="Decrease cigarette count"
          accessibilityRole="button"
        >
          <Text style={styles.circleButtonText}>−</Text>
        </AnimatedPressable>

        <AnimatedPressable
          onPress={handleIncrement}
          style={[styles.circleButton, styles.incrementButton]}
          accessibilityLabel="Increase cigarette count"
          accessibilityRole="button"
        >
          <Text style={styles.circleButtonText}>+</Text>
        </AnimatedPressable>
      </View>

      {/* Motivational Message */}
      <View style={styles.messageContainer}>
        <Text style={styles.message}>{message}</Text>
      </View>

      {/* Save Button */}
      <AnimatedPressable
        onPress={handleSave}
        disabled={isSaving}
        style={[
          styles.saveButton,
          saved && styles.saveButtonSaved,
          saveButtonStyle,
        ]}
        accessibilityLabel="Save today's log"
        accessibilityRole="button"
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.saveButtonText}>
            {saved ? "✓ บันทึกแล้ว" : "บันทึกข้อมูลวันนี้"}
          </Text>
        )}
      </AnimatedPressable>

      {/* Quick-set pills */}
      <View style={styles.quickSetRow}>
        {[0, 1, 3, 5, 10].map((val) => (
          <Pressable
            key={val}
            onPress={() => {
              setCount(val);
              setSaved(false);
            }}
            style={[styles.quickPill, count === val && styles.quickPillActive]}
          >
            <Text
              style={[
                styles.quickPillText,
                count === val && styles.quickPillTextActive,
              ]}
            >
              {val}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1e293b",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#475569",
    marginTop: 4,
  },
  counterWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 20,
  },
  counterOuter: {
    width: COUNTER_SIZE,
    height: COUNTER_SIZE,
    borderRadius: COUNTER_SIZE / 2,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
  },
  counterInner: {
    alignItems: "center",
  },
  counterLabel: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  counterNumber: {
    fontSize: 72,
    fontWeight: "900",
    color: "#1e293b",
    lineHeight: 84,
  },
  counterToday: {
    fontSize: 14,
    color: "rgba(0,0,0,0.55)",
    fontWeight: "500",
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 40,
    marginVertical: 16,
  },
  circleButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  decrementButton: {
    backgroundColor: "#ef4444",
    borderWidth: 0,
    borderColor: "transparent",
  },
  incrementButton: {
    backgroundColor: "#10b981",
    borderWidth: 0,
    borderColor: "transparent",
  },
  circleButtonText: {
    fontSize: 32,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: 36,
  },
  messageContainer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    marginVertical: 12,
    maxWidth: 340,
  },
  message: {
    fontSize: 14,
    color: "rgba(0,0,0,0.6)",
    textAlign: "center",
    lineHeight: 20,
  },
  saveButton: {
    marginTop: 16,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    backgroundColor: "#38bdf8",
    shadowColor: "#38bdf8",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
    minWidth: 220,
    alignItems: "center",
  },
  saveButtonSaved: {
    backgroundColor: "#059669",
    shadowColor: "#059669",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  quickSetRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  quickPill: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: "#f0fdfa",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  quickPillActive: {
    backgroundColor: "rgba(56,189,248,0.2)",
    borderColor: "rgba(56,189,248,0.4)",
  },
  quickPillText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#475569",
  },
  quickPillTextActive: {
    color: "#7dd3fc",
  },
});
