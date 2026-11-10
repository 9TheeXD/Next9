import React from "react";
import { Tabs, Redirect } from "expo-router";
import { View, StyleSheet, Platform, ActivityIndicator, DeviceEventEmitter } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { useAppSounds } from "@/hooks/useAppSounds";

export default function TabsLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { playNav } = useAppSounds();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: "#7dd3fc",
        tabBarInactiveTintColor: "rgba(0,0,0,0.45)",
        tabBarLabelStyle: styles.tabBarLabel,
      }}
      screenListeners={{
        tabPress: (e) => {
          playNav();
          if (e.target) {
            const routeName = e.target.split('-')[0];
            DeviceEventEmitter.emit(`reset_tab_${routeName}`);
          }
        },
      }}
    >
      {/* SMOKER ONLY */}
      <Tabs.Screen
        name="health"
        options={{
          title: "สุขภาพ",
          href: (user?.role === "FAMILY" ? null : "/(tabs)/health") as any,
          tabBarIcon: ({ color }) => <Feather name="heart" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="sos"
        options={{
          title: "SOS",
          href: (user?.role === "FAMILY" ? null : "/(tabs)/sos") as any,
          tabBarIcon: ({ color }) => <Feather name="alert-circle" size={20} color={color} />,
        }}
      />

      {/* FAMILY ONLY */}
      <Tabs.Screen
        name="games"
        options={{
          title: "เกม",
          href: (user?.role !== "FAMILY" ? null : "/(tabs)/games") as any,
          tabBarIcon: ({ color }) => <Feather name="play" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "ประวัติ",
          href: (user?.role !== "FAMILY" ? null : "/(tabs)/history") as any,
          tabBarIcon: ({ color }) => <Feather name="clock" size={20} color={color} />,
        }}
      />

      {/* COMMON (index) */}
      <Tabs.Screen
        name="index"
        options={{
          title: user?.role === "FAMILY" ? "หน้าหลัก" : "ติดตาม",
          tabBarLabel: () => null, // Hide text
          tabBarIcon: ({ focused }) => (
            <View style={styles.fabContainer}>
              <View style={[styles.fab, focused && styles.fabFocused]}>
                <Feather name={user?.role === "FAMILY" ? "home" : "activity"} size={32} color="#ffffff" />
              </View>
            </View>
          ),
        }}
      />

      {/* SMOKER ONLY */}
      <Tabs.Screen
        name="knowledge"
        options={{
          title: "แผนเลิก",
          href: (user?.role === "FAMILY" ? null : "/(tabs)/knowledge") as any,
          tabBarIcon: ({ color }) => <Feather name="compass" size={20} color={color} />,
        }}
      />

      {/* FAMILY ONLY */}
      <Tabs.Screen
        name="guidance"
        options={{
          title: "คำแนะนำ",
          href: (user?.role !== "FAMILY" ? null : "/(tabs)/guidance") as any,
          tabBarIcon: ({ color }) => <Feather name="info" size={20} color={color} />,
        }}
      />

      {/* COMMON (profile) */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "โปรไฟล์",
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    backgroundColor: "#f0fdfa",
    borderTopColor: "rgba(0,0,0,0.04)",
    borderTopWidth: 1,
    height: 65,
    paddingBottom: 8,
    paddingTop: 6,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  tabIcon: {
    fontSize: 20,
  },
  fabContainer: {
    top: Platform.OS === 'ios' ? -20 : -30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 5,
    borderColor: '#f0fdfa', // Match app background
  },
  fabFocused: {
    backgroundColor: '#38bdf8',
  },
});
