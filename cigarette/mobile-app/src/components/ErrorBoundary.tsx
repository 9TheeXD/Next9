import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`ErrorBoundary caught error in [${this.props.name || "App"}]:`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.location.reload();
      } catch {}
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconCircle}>
              <Feather name="refresh-cw" size={32} color="#0284c7" />
            </View>
            <Text style={styles.title}>กำลังเตรียมข้อมูลใหม่อีกครั้ง</Text>
            <Text style={styles.desc}>
              ระบบกำลังเชื่อมต่อหรือมีข้อมูลบางส่วนกำลังอัปเดต กดปุ่มด้านล่างเพื่อเปิดหน้าต่างนี้ใหม่ได้ทันที
            </Text>
            <Pressable style={styles.button} onPress={this.handleReset}>
              <Feather name="rotate-ccw" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>ลองใหม่อีกครั้ง</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0fdfa",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    minHeight: "100%",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    shadowColor: "rgba(0,0,0,0.08)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.04)",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#e0f2fe",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: "Kanit",
    fontSize: 20,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
    textAlign: "center",
  },
  desc: {
    fontFamily: "Sarabun",
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0284c7",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    width: "100%",
    shadowColor: "#0284c7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    fontFamily: "Kanit",
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
