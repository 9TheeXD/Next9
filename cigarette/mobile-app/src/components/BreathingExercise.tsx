import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable } from 'react-native';

type BreathingPhase = 'inhale' | 'hold' | 'exhale';

export default function BreathingExercise() {
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<BreathingPhase>('inhale');
  const [timeLeft, setTimeLeft] = useState(4);
  
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    if (isActive) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev > 1) return prev - 1;
          
          // Phase transition
          if (phase === 'inhale') {
            setPhase('hold');
            return 7;
          } else if (phase === 'hold') {
            setPhase('exhale');
            return 8;
          } else {
            setPhase('inhale');
            return 4;
          }
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isActive, phase]);

  useEffect(() => {
    if (!isActive) {
      Animated.timing(scale, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
      return;
    }

    if (phase === 'inhale') {
      Animated.timing(scale, {
        toValue: 2,
        duration: 4000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    } else if (phase === 'exhale') {
      Animated.timing(scale, {
        toValue: 1,
        duration: 8000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
    // During 'hold', animation does not change
  }, [isActive, phase, scale]);

  const toggleExercise = () => {
    if (isActive) {
      setIsActive(false);
      setPhase('inhale');
      setTimeLeft(4);
    } else {
      setIsActive(true);
      setPhase('inhale');
      setTimeLeft(4);
    }
  };

  const getInstruction = () => {
    if (!isActive) return "แตะเพื่อเริ่มการฝึกหายใจแบบ 4-7-8";
    if (phase === 'inhale') return "หายใจเข้า...";
    if (phase === 'hold') return "กลั้นหายใจ...";
    if (phase === 'exhale') return "หายใจออก...";
  };

  return (
    <View style={styles.container}>
      <View style={styles.circleContainer}>
        <Animated.View 
          style={[
            styles.breathingCircle,
            { transform: [{ scale }] }
          ]} 
        />
        <View style={styles.textContainer}>
          {isActive && <Text style={styles.timer}>{timeLeft}</Text>}
        </View>
      </View>
      
      <Text style={styles.instruction}>{getInstruction()}</Text>
      
      <Pressable 
        style={[styles.button, isActive && styles.buttonActive]} 
        onPress={toggleExercise}
      >
        <Text style={styles.buttonText}>{isActive ? "หยุด" : "เริ่มการฝึก"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  circleContainer: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  breathingCircle: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(56,189,248, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(56,189,248, 0.5)',
  },
  textContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timer: {
    fontSize: 48,
    fontWeight: '800',
    color: '#1e293b',
  },
  instruction: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 24,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 20,
    backgroundColor: '#38bdf8',
  },
  buttonActive: {
    backgroundColor: 'rgba(248, 113, 113, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.5)',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
});
