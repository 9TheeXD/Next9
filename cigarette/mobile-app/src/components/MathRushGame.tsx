import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useGamification } from '@/contexts/GamificationContext';
import GameTutorial from './GameTutorial';
import { useAppSounds } from '@/hooks/useAppSounds';

export default function MathRushGame() {
  const { addXP } = useGamification();
  const { playCorrect, playWrong, playWin, playLose } = useAppSounds();
  const [score, setScore] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<number[]>([]);
  const [correctAnswer, setCorrectAnswer] = useState<number>(0);
  
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const flashAnim = useRef(new Animated.Value(0)).current;

  const generateQuestion = useCallback(() => {
    // Generate simple additions or subtractions
    const isAddition = Math.random() > 0.5;
    const num1 = Math.floor(Math.random() * 40) + 10; // 10-49
    const num2 = Math.floor(Math.random() * 40) + 10; // 10-49
    
    let answer: number;
    if (isAddition) {
      setQuestion(`${num1} + ${num2}`);
      answer = num1 + num2;
    } else {
      // Ensure positive result
      const max = Math.max(num1, num2);
      const min = Math.min(num1, num2);
      setQuestion(`${max} - ${min}`);
      answer = max - min;
    }

    setCorrectAnswer(answer);

    // Generate 3 wrong answers close to the correct one
    const wrongAnswers = new Set<number>();
    while (wrongAnswers.size < 3) {
      const offset = Math.floor(Math.random() * 10) - 5;
      const wrong = answer + offset;
      if (wrong !== answer && wrong > 0) {
        wrongAnswers.add(wrong);
      }
    }

    const allAnswers = [answer, ...Array.from(wrongAnswers)].sort(() => Math.random() - 0.5);
    setAnswers(allAnswers);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isPlaying && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isPlaying) {
      setIsPlaying(false);
      // Reward logic
      if (score > 0) {
        addXP(10 + score * 2, `ได้ ${score} คะแนนจากคณิตคิดเร็ว!`);
        playWin();
      } else {
        addXP(5, `พยายามได้ดีในเกมคณิตคิดเร็ว!`);
        playLose();
      }
    }
    return () => clearInterval(timer);
  }, [isPlaying, timeLeft, score, addXP]);

  const handleAnswer = (selected: number) => {
    if (!isPlaying) return;
    if (selected === correctAnswer) {
      playCorrect();
      setScore((prev) => prev + 1);
      setFeedback('correct');
      generateQuestion();
    } else {
      playWrong();
      setFeedback('wrong');
      // Penalty for wrong math: skip to next immediately
      generateQuestion();
    }
    
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
    generateQuestion();
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
            title="เกมคณิตคิดเร็ว (Math Rush)"
            description="ใช้ทักษะการคำนวณเพื่อลบความอยาก ตอบให้ถูกมากที่สุดใน 30 วินาที&#10;ระวัง! ตอบผิดจะข้ามไปข้อถัดไปทันที"
            iconName="hash"
            iconColor="#f472b6"
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
            
            <View style={styles.questionBox}>
              <Text style={styles.questionText}>{question}</Text>
            </View>

            <View style={styles.buttonGrid}>
              {answers.map((ans, idx) => (
                <Pressable
                  key={idx}
                  style={styles.answerButton}
                  onPress={() => handleAnswer(ans)}
                >
                  <Text style={styles.answerText}>{ans}</Text>
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
  questionBox: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 24,
    paddingHorizontal: 48,
    borderRadius: 24,
    marginBottom: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  questionText: {
    fontSize: 48,
    fontWeight: '900',
    color: '#1e293b',
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
  },
  answerButton: {
    width: '45%',
    aspectRatio: 2,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  answerText: {
    color: '#1e293b',
    fontSize: 28,
    fontWeight: '800',
  },
});
