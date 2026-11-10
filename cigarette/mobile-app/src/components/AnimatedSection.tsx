import React, { useEffect, useRef, useState } from "react";
import { View, ViewStyle, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface AnimatedSectionProps {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
}

/**
 * Wrapper that fades-in and slides-up its children when they enter the viewport.
 * Uses IntersectionObserver on Web, immediate render on native.
 */
export default function AnimatedSection({
  children,
  delay = 0,
  style,
}: AnimatedSectionProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(24);
  const containerRef = useRef<View>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || hasAnimated) {
      // On native, animate immediately
      if (!hasAnimated) {
        const timeout = setTimeout(() => {
          opacity.value = withTiming(1, {
            duration: 600,
            easing: Easing.out(Easing.cubic),
          });
          translateY.value = withTiming(0, {
            duration: 600,
            easing: Easing.out(Easing.cubic),
          });
          setHasAnimated(true);
        }, delay);
        return () => clearTimeout(timeout);
      }
      return;
    }

    // Web: use IntersectionObserver
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }

    const node = containerRef.current as unknown as HTMLElement;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated) {
            setTimeout(() => {
              opacity.value = withTiming(1, {
                duration: 600,
                easing: Easing.out(Easing.cubic),
              });
              translateY.value = withTiming(0, {
                duration: 600,
                easing: Easing.out(Easing.cubic),
              });
              setHasAnimated(true);
            }, delay);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.15 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasAnimated, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View ref={containerRef as any} style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}
