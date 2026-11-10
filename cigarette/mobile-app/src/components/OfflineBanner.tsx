import React from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";

export default function OfflineBanner() {
  const { isOfflineMode } = useAuth();

  if (!isOfflineMode) return null;

  return (
    <View style={styles.banner}>
      <Feather name="wifi-off" size={16} color="white" />
      <Text style={styles.text}>
        ไม่มีการเชื่อมต่ออินเทอร์เน็ต กำลังใช้งานแบบออฟไลน์
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#ef4444", // red-500
    paddingVertical: 6,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  text: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
});
