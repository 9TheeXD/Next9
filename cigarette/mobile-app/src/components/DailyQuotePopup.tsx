import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppSounds } from '@/hooks/useAppSounds';
import { GENERAL_QUOTES, COMPLIMENT_QUOTES } from '@/constants/quotes';
import { useGamification } from '@/contexts/GamificationContext';



interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function DailyQuotePopup({ visible, onClose }: Props) {
  const { playClick, playCorrect } = useAppSounds();
  const { reductionPercent } = useGamification();
  const [quote, setQuote] = useState("");
  const scaleAnim = React.useRef(new Animated.Value(0.8)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      if (reductionPercent !== null && reductionPercent >= 20) {
        const rawQuote = COMPLIMENT_QUOTES[Math.floor(Math.random() * COMPLIMENT_QUOTES.length)];
        setQuote(rawQuote.replace('{percent}', reductionPercent.toString()));
      } else {
        setQuote(GENERAL_QUOTES[Math.floor(Math.random() * GENERAL_QUOTES.length)]);
      }
      
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();

      // Play a nice sound when popup opens
      setTimeout(() => {
        playCorrect();
      }, 100);
    } else {
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const handleClose = () => {
    playClick();
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(() => {
      onClose();
    });
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={true} animationType="none">
      <View style={styles.overlay}>
        <Animated.View style={[styles.modalContainer, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
          <LinearGradient
            colors={['#f0fdfa', '#ffffff']}
            style={styles.card}
          >
            <View style={styles.iconContainer}>
              <Feather name="sun" size={32} color="#f59e0b" />
            </View>
            
            <Text style={styles.title}>ข้อความกำลังใจวันนี้</Text>
            
            <Text style={styles.quoteText}>"{quote}"</Text>
            
            <Pressable style={styles.button} onPress={handleClose}>
              <Text style={styles.buttonText}>ขอบคุณนะ!</Text>
            </Pressable>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  quoteText: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  button: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 99,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  }
});
