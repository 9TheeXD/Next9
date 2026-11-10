import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { useGamification } from '@/contexts/GamificationContext';
import GameTutorial from './GameTutorial';
import { useAppSounds } from '@/hooks/useAppSounds';

export default function TapReactionGame() {
  const { addXP } = useGamification();
  const { playCorrect, playWrong, playWin, playLose } = useAppSounds();
  const [gameState, setGameState] = useState<'idle' | 'waiting' | 'ready' | 'finished'>('idle');
  const [hasStarted, setHasStarted] = useState(false);
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [message, setMessage] = useState('แตะเพื่อเริ่มรอบใหม่');
  
  const timeoutRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const startGame = () => {
    setGameState('waiting');
    setMessage('รอจนกว่าจะเปลี่ยนเป็นสีเขียว...');
    setReactionTime(null);
    
    // Random delay between 2 to 5 seconds
    const delay = Math.floor(Math.random() * 3000) + 2000;
    
    timeoutRef.current = setTimeout(() => {
      setGameState('ready');
      setMessage('แตะเลย!');
      startTimeRef.current = Date.now();
    }, delay);
  };

  const handleTap = () => {
    // Animate tap
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();

    if (gameState === 'idle' || gameState === 'finished') {
      startGame();
    } else if (gameState === 'waiting') {
      // Tapped too early
      playWrong();
      playLose();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setGameState('finished');
      setMessage('ใจร้อนเกินไป! แตะก่อนสีเขียว');
      addXP(2, 'ใจเย็นๆ ลองใหม่นะ');
    } else if (gameState === 'ready') {
      // Success
      playCorrect();
      const endTime = Date.now();
      const timeTaken = endTime - startTimeRef.current;
      setReactionTime(timeTaken);
      setGameState('finished');
      
      if (timeTaken < 300) {
        setMessage('ปฏิกิริยาไวแสง!');
        addXP(20, `สุดยอด! ปฏิกิริยา ${timeTaken}ms`);
        playWin();
      } else if (timeTaken < 500) {
        setMessage('ทำได้ดีมาก!');
        addXP(15, `เยี่ยม! ปฏิกิริยา ${timeTaken}ms`);
        playWin();
      } else {
        setMessage('โอเค แต่ยังเร็วกว่านี้ได้อีก');
        addXP(10, `ปฏิกิริยา ${timeTaken}ms`);
        playWin();
      }
    }
  };

  const getBackgroundColor = () => {
    switch (gameState) {
      case 'idle': return '#e2e8f0'; // gray
      case 'waiting': return '#dc2626'; // red
      case 'ready': return '#16a34a'; // green
      case 'finished': return '#e0e7ff'; // indigo
      default: return '#e2e8f0';
    }
  };

  return (
    <View style={styles.container}>
      {!hasStarted ? (
        <GameTutorial
          title="ทดสอบปฏิกิริยา (Reaction)"
          description="รอจนกว่าวงกลมจะเปลี่ยนเป็นสีเขียว แล้วรีบแตะให้เร็วที่สุด!&#10;ระวัง! ถ้าแตะก่อนสีเขียวจะถือว่าฟาวล์"
          iconName="zap"
          iconColor="#7dd3fc"
          onStart={() => {
            setHasStarted(true);
            startGame();
          }}
        />
      ) : (
        <>
          <Text style={styles.title}>ทดสอบปฏิกิริยาตอบสนอง</Text>
          <Text style={styles.subtitle}>ฝึกสมาธิ เบี่ยงเบนความอยากบุหรี่</Text>

          <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
        <Pressable 
          style={[styles.gameArea, { backgroundColor: getBackgroundColor() }]} 
          onPress={handleTap}
        >
          <Text style={styles.messageText}>{message}</Text>
          {reactionTime !== null && (
            <Text style={styles.timeText}>{reactionTime} ms</Text>
          )}
          {gameState === 'finished' && (
            <Text style={styles.restartText}>แตะอีกครั้งเพื่อเริ่มใหม่</Text>
          )}
        </Pressable>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 24,
  },
  gameArea: {
    width: 300,
    height: 300,
    borderRadius: 150,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  messageText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 8,
  },
  timeText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1e293b',
    marginTop: 10,
  },
  restartText: {
    fontSize: 14,
    color: "rgba(0,0,0,0.6)",
    marginTop: 20,
  },
});
