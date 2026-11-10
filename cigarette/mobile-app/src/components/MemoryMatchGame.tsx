import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useGamification } from '@/contexts/GamificationContext';
import GameTutorial from './GameTutorial';
import { useAppSounds } from '@/hooks/useAppSounds';

// 8 pairs of icons
const ICONS = ['sun', 'moon', 'star', 'cloud', 'heart', 'anchor', 'award', 'bell'];

interface Card {
  id: number;
  icon: string;
  isFlipped: boolean;
  isMatched: boolean;
}

export default function MemoryMatchGame() {
  const { addXP } = useGamification();
  const { playCorrect, playWrong, playWin, playLose } = useAppSounds();
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isWin, setIsWin] = useState(false);

  const initializeGame = () => {
    const shuffledIcons = [...ICONS, ...ICONS]
      .sort(() => Math.random() - 0.5)
      .map((icon, index) => ({
        id: index,
        icon,
        isFlipped: false,
        isMatched: false,
      }));
    setCards(shuffledIcons);
    setFlippedIndices([]);
    setMoves(0);
    setTimeLeft(60);
    setIsWin(false);
    setIsPlaying(true);
    setHasStarted(true);
    setIsLocked(false);
  };

  useEffect(() => {
    let timer: any;
    if (isPlaying && !isWin && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && isPlaying) {
      setIsPlaying(false);
      addXP(5, 'พยายามได้ดี! ลองใหม่อีกครั้งนะ');
      playLose();
    }
    return () => clearInterval(timer);
  }, [isPlaying, isWin, timeLeft, addXP]);

  const handleCardPress = (index: number) => {
    if (!isPlaying || isLocked || cards[index].isFlipped || cards[index].isMatched) return;

    const newCards = [...cards];
    newCards[index].isFlipped = true;
    setCards(newCards);

    const newFlippedIndices = [...flippedIndices, index];
    setFlippedIndices(newFlippedIndices);

    if (newFlippedIndices.length === 2) {
      setIsLocked(true);
      setMoves((prev) => prev + 1);

      const [firstIndex, secondIndex] = newFlippedIndices;
      if (newCards[firstIndex].icon === newCards[secondIndex].icon) {
        playCorrect();
        newCards[firstIndex].isMatched = true;
        newCards[secondIndex].isMatched = true;
        setCards(newCards);
        setFlippedIndices([]);
        setIsLocked(false);
        
        // Check win
        if (newCards.every((card) => card.isMatched)) {
          setIsWin(true);
          setIsPlaying(false);
          // Reward: base 20 XP + bonus for finishing fast
          const timeBonus = timeLeft > 30 ? 10 : 0;
          addXP(20 + timeBonus, `จับคู่สำเร็จใน ${moves + 1} ครั้ง!`);
          playWin();
        }
      } else {
        playWrong();
        // Penalty: deduct 1 second
        setTimeLeft((prev) => Math.max(0, prev - 1));
        
        setTimeout(() => {
          const resetCards = [...cards];
          resetCards[firstIndex].isFlipped = false;
          resetCards[secondIndex].isFlipped = false;
          setCards(resetCards);
          setFlippedIndices([]);
          setIsLocked(false);
        }, 800);
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>การเคลื่อนไหว: {moves}</Text>
        <Text style={styles.timerText}>{timeLeft} วินาที</Text>
      </View>

      <View style={styles.gameArea}>
        {!hasStarted && (
          <GameTutorial
            title="เกมจับคู่ความจำ (Memory)"
            description="เปิดการ์ดและจับคู่ภาพให้ครบทุกคู่ภายใน 60 วินาที เพื่อฝึกความจำและเบี่ยงเบนความสนใจ&#10;ระวัง! จับคู่ผิดเวลาจะลดลง 1 วินาที"
            iconName="grid"
            iconColor="#34d399"
            onStart={initializeGame}
          />
        )}

        {hasStarted && (!isPlaying && !isWin && timeLeft === 0) && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>
              หมดเวลา!
            </Text>
            <Text style={styles.overlayDesc}>
              คุณทำได้ดีแล้ว ลองพยายามใหม่อีกครั้ง
            </Text>
            <Pressable style={styles.startButton} onPress={initializeGame}>
              <Text style={styles.startButtonText}>เล่นอีกครั้ง</Text>
            </Pressable>
          </View>
        )}

        {isWin && (
          <View style={styles.overlay}>
            <Text style={styles.overlayTitle}>ยอดเยี่ยม!</Text>
            <Text style={styles.overlayDesc}>
              คุณจับคู่ได้ทั้งหมดใน {moves} ครั้ง!
            </Text>
            <Pressable style={styles.startButton} onPress={initializeGame}>
              <Text style={styles.startButtonText}>เล่นอีกครั้ง</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.grid}>
          {cards.map((card, index) => (
            <Pressable
              key={card.id}
              style={[
                styles.card,
                (card.isFlipped || card.isMatched) ? styles.cardFlipped : styles.cardHidden
              ]}
              onPress={() => handleCardPress(index)}
            >
              {(card.isFlipped || card.isMatched) ? (
                <Feather 
                  name={card.icon as keyof typeof Feather.glyphMap} 
                  size={32} 
                  color={card.isMatched ? "#34d399" : "#fff"} 
                />
              ) : (
                <Feather name="help-circle" size={32} color="rgba(255,255,255,0.2)" />
              )}
            </Pressable>
          ))}
        </View>
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
  headerText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  timerText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fbbf24',
  },
  gameArea: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    position: 'relative',
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  card: {
    width: '21%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  cardHidden: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderColor: '#e2e8f0',
  },
  cardFlipped: {
    backgroundColor: '#38bdf8',
    borderColor: '#e0e7ff',
  },
});
