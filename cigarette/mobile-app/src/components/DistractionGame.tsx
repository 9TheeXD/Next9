import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useGamification } from '@/contexts/GamificationContext';
import GameTutorial from './GameTutorial';
import { useAppSounds } from '@/hooks/useAppSounds';

const COLORS = [
  { name: 'แดง', hex: '#ef4444' },
  { name: 'เขียว', hex: '#22c55e' },
  { name: 'น้ำเงิน', hex: '#3b82f6' },
  { name: 'เหลือง', hex: '#eab308' },
];

export default function DistractionGame() {
  const { addXP } = useGamification();
  const { playCorrect, playWrong, playWin, playLose } = useAppSounds();
  const [score, setScore] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  
  const [wordIndex, setWordIndex] = useState(0);
  const [colorIndex, setColorIndex] = useState(0);

  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  const generateNewRound = useCallback(() => {
    const newWordIdx = Math.floor(Math.random() * COLORS.length);
    let newColorIdx = Math.floor(Math.random() * COLORS.length);
    // Ensure 70% of the time it's a mismatch to force cognitive load
    if (Math.random() < 0.7 && newWordIdx === newColorIdx) {
      newColorIdx = (newColorIdx + 1) % COLORS.length;
    }
    setWordIndex(newWordIdx);
    setColorIndex(newColorIdx);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isPlaying && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isPlaying) {
      setIsPlaying(false);
      if (score >= 10) {
        addXP(10 + Math.floor(score / 2), `ทำคะแนนแยกสีได้ ${score} คะแนน!`);
        playWin();
      } else {
        addXP(5, `พยายามได้ดี ฝึกสมาธิบ่อยๆ นะ`);
        playLose();
      }
    }
    return () => clearInterval(timer);
  }, [isPlaying, timeLeft, score, addXP]);

  const handlePress = (selectedColorIndex: number) => {
    if (!isPlaying) return;
    if (selectedColorIndex === colorIndex) {
      playCorrect();
      setScore((prev) => prev + 1);
      setFeedback('correct');
      generateNewRound();
    } else {
      playWrong();
      setFeedback('wrong');
      // Penalty: deduct 2 second for wrong answer
      setTimeLeft((prev) => Math.max(0, prev - 2));
    }
    
    // Flash animation
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start(() => setFeedback(null));
  };

  const startGame = () => {
    setHasStarted(true);
    setScore(0);
    setTimeLeft(30);
    setIsPlaying(true);
    generateNewRound();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.scoreText}>คะแนน: {score}</Text>
        <Text style={styles.timerText}>{timeLeft} วินาที</Text>
      </View>

      <View style={styles.gameArea}>
        {!hasStarted && (
          <GameTutorial
            title="เกมแยกประสาทสี (Stroop)"
            description="กดปุ่มที่ตรงกับ 'สีของตัวอักษร' ไม่ใช่คำที่เขียนไว้!&#10;ระวัง! ตอบผิดเวลาจะลดลง 2 วินาที"
            iconName="aperture"
            iconColor="#fbbf24"
            onStart={startGame}
          />
        )}

        {hasStarted && !isPlaying && timeLeft === 0 && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>หมดเวลา!</Text>
            <Text style={styles.overlayDesc}>คุณทำคะแนนไปได้ {score} คะแนน!</Text>
            <Pressable style={styles.startButton} onPress={startGame}>
              <Text style={styles.startButtonText}>ลองอีกครั้ง</Text>
            </Pressable>
          </View>
        )}

        {hasStarted && isPlaying && (
          <View style={styles.playingContainer}>
            <Animated.View style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: feedback === 'correct' ? 'rgba(52,211,153,0.3)' : feedback === 'wrong' ? 'rgba(248,113,113,0.3)' : 'transparent',
                opacity: flashAnim
              }
            ]} pointerEvents="none" />
            
            <Text style={styles.instruction}>กดเลือกตาม <Text style={{fontWeight: '900', color: '#1e293b'}}>สี</Text> ของคำศัพท์ด้านล่าง</Text>
            
            <View style={styles.wordContainer}>
              <Text style={[styles.targetWord, { color: COLORS[colorIndex].hex }]}>
                {COLORS[wordIndex].name}
              </Text>
            </View>

            <View style={styles.buttonGrid}>
              {COLORS.map((c, idx) => (
                <Pressable
                  key={c.name}
                  style={[styles.colorButton, { backgroundColor: c.hex }]}
                  onPress={() => handlePress(idx)}
                >
                  <Text style={styles.colorButtonText}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 450,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  timerText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fbbf24',
  },
  gameArea: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    zIndex: 10,
  },
  overlayTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 12,
  },
  overlayDesc: {
    fontSize: 15,
    color: "rgba(0,0,0,0.6)",
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  startButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: '#38bdf8',
    borderRadius: 12,
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  playingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  instruction: {
    fontSize: 16,
    color: '#475569',
    marginBottom: 40,
  },
  wordContainer: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 50,
  },
  targetWord: {
    fontSize: 72,
    fontWeight: '900',
    textShadowColor: '#64748b',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
  },
  colorButton: {
    width: '45%',
    aspectRatio: 2, // made it taller for tablet
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  colorButtonText: {
    color: '#ffffff',
    fontSize: 24, // increased font size
    fontWeight: '800',
    textShadowColor: '#64748b',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
