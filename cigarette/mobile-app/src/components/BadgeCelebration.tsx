import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Pressable, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface Badge {
  id: string;
  name: string;
  description: string;
  iconName: string;
}

interface BadgeCelebrationProps {
  badge: Badge | null;
  onClose: () => void;
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

export default function BadgeCelebration({ badge, onClose }: BadgeCelebrationProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (badge) {
      Animated.parallel([
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 40,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [badge, scaleAnim, opacityAnim]);

  if (!badge) return null;

  return (
    <Modal visible={!!badge} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: opacityAnim }]}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>ปลดล็อคความสำเร็จแล้ว! </Text>
            <Feather name="award" size={18} color="#34d399" />
          </View>
          
          <View style={styles.iconContainer}>
            <Feather name={getBadgeFeatherIcon(badge.iconName)} size={64} color="#38bdf8" />
          </View>
          
          <Text style={styles.badgeName}>{badge.name}</Text>
          <Text style={styles.badgeDesc}>{badge.description}</Text>
          
          <Pressable style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>สุดยอด!</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 480 : undefined,
    alignSelf: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#f0fdfa',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#34d399',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(56,189,248,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#38bdf8',
  },
  icon: {
    fontSize: 64,
  },
  badgeName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  badgeDesc: {
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    width: '100%',
    paddingVertical: 16,
    backgroundColor: '#38bdf8',
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
