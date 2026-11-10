import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AdaptiveMission } from '@/utils/AdaptiveMissionEngine';

interface MissionBubbleProps {
  mission: AdaptiveMission | null;
  onPress: () => void;
}

export default function MissionBubble({ mission, onPress }: MissionBubbleProps) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Smooth floating animation
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -6,
          duration: 1800,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    floatLoop.start();

    // Pulse animation if mission is pending
    if (mission && mission.status === 'pending') {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.06,
            duration: 1200,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ])
      );
      pulseLoop.start();
      return () => {
        floatLoop.stop();
        pulseLoop.stop();
      };
    }

    return () => floatLoop.stop();
  }, [mission?.status]);

  if (!mission) return null;

  const isCompleted = mission.status === 'completed';
  const isFailed = mission.status === 'failed';
  const isSurvey = mission.type === 'micro_survey';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            { translateY: floatAnim },
            { scale: isCompleted ? 1 : pulseAnim },
          ],
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.bubblePressable,
          pressed && { opacity: 0.88, transform: [{ scale: 0.95 }] },
        ]}
        onPress={onPress}
      >
        <LinearGradient
          colors={
            isCompleted
              ? ['#10b981', '#059669']
              : isFailed
              ? ['#f59e0b', '#d97706']
              : isSurvey
              ? ['#8b5cf6', '#6d28d9']
              : ['#38bdf8', '#0284c7']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bubbleGradient}
        >
          {/* Top Indicator / Icon */}
          <View style={styles.iconContainer}>
            {isCompleted ? (
              <Feather name="check" size={16} color="#ffffff" />
            ) : isSurvey ? (
              <Feather name="edit-3" size={15} color="#ffffff" />
            ) : (
              <Feather name="zap" size={16} color="#ffffff" />
            )}
          </View>

          {/* Bubble Text */}
          <Text style={styles.bubbleTitle}>
            {isSurvey ? 'อัปเดต\nสภาวะ' : 'ภารกิจเลิก\nวันนี้'}
          </Text>

          {/* Status Dot / Ribbon */}
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: isCompleted
                  ? '#064e3b'
                  : isFailed
                  ? '#78350f'
                  : '#0369a1',
              },
            ]}
          >
            <Text style={styles.statusBadgeText}>
              {isCompleted ? 'สำเร็จ' : isFailed ? 'พลาด' : 'ท้าทาย'}
            </Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 175,
    left: 14,
    zIndex: 90,
    borderRadius: 22,
  },
  bubblePressable: {
    width: 72,
    height: 78,
    borderRadius: 22,
    overflow: 'hidden',
  },
  bubbleGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.65)',
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  bubbleTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 13,
  },
  statusBadge: {
    marginTop: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
});
