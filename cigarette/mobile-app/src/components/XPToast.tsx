import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useGamification } from '@/contexts/GamificationContext';

export default function XPToast() {
  const { activeToast, clearToast } = useGamification();
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (activeToast) {
      // Show toast
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 50,
          useNativeDriver: true,
          tension: 40,
          friction: 5,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Hide toast after 3 seconds
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -100,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          clearToast();
        });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [activeToast, clearToast, opacity, translateY]);

  if (!activeToast) return null;

  return (
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.iconContainer}>
        <Feather name="star" size={24} color="#f59e0b" />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.amountText}>+{activeToast.amount} พลังใจ</Text>
        <Text style={styles.messageText}>{activeToast.message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    zIndex: 9999,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  amountText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#d97706', // Darker amber for contrast
    marginBottom: 4,
  },
  messageText: {
    fontSize: 13,
    color: '#475569', // Dark gray for readability
    lineHeight: 18,
  },
});
