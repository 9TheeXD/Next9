import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface AnimatedButtonProps {
  onPress: () => void;
  title: string;
  variant?: "primary" | "secondary" | "outline" | "line";
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

/**
 * Animated button with press scale effect and gradient support.
 */
export default function AnimatedButton({
  onPress,
  title,
  variant = "primary",
  disabled = false,
  style,
  textStyle,
  icon,
}: AnimatedButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const getButtonStyle = () => {
    switch (variant) {
      case "secondary":
        return styles.secondary;
      case "outline":
        return styles.outline;
      case "line":
        return styles.line;
      default:
        return styles.primary;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case "secondary":
        return styles.secondaryText;
      case "outline":
        return styles.outlineText;
      case "line":
        return styles.lineText;
      default:
        return styles.primaryText;
    }
  };

  if (variant === "primary") {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[animatedStyle, disabled && { opacity: 0.6 }]}
      >
        <LinearGradient
          colors={["#38bdf8", "#0ea5e9"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.base, styles.primary, style]}
        >
          {icon}
          <Text style={[styles.primaryText, textStyle]}>{title}</Text>
        </LinearGradient>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[animatedStyle, styles.base, getButtonStyle(), style, disabled && { opacity: 0.6 }]}
    >
      {icon}
      <Text style={[getTextStyle(), textStyle]}>{title}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primary: {
    shadowColor: "#38bdf8",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondary: {
    backgroundColor: "rgba(56,189,248,0.12)",
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.3)",
  },
  secondaryText: {
    color: "#0ea5e9",
    fontSize: 16,
    fontWeight: "700",
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.15)",
  },
  outlineText: {
    color: "#475569",
    fontSize: 16,
    fontWeight: "600",
  },
  line: {
    backgroundColor: "#06C755",
  },
  lineText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
