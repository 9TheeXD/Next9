import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, ScrollView, Animated } from 'react-native';
import { useGamification } from '@/contexts/GamificationContext';
import { useAppSounds } from '@/hooks/useAppSounds';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CANVAS_SIZE = 1200;
const ITEM_SIZE = 40;

interface HiddenItem {
  id: string;
  emoji: string;
  x: number;
  y: number;
  isTarget: boolean;
  found: boolean;
}

interface Level {
  title: string;
  desc: string;
  targetEmoji: string;
  targetCount: number;
  noiseEmojis: string[];
  noiseCount: number;
  timeLimit: number;
}

const LEVELS: Level[] = [
  {
    title: 'หาแมวเหมียว 🐈',
    desc: 'แมว 5 ตัวแอบหลบซ่อนอยู่ในฝูงสัตว์ หาให้เจอ!',
    targetEmoji: '🐈',
    targetCount: 5,
    noiseEmojis: ['🐕', '🐁', '🐿', '🐇', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕‍🦺', '🦮', '🐩', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿', '🦔'],
    noiseCount: 200,
    timeLimit: 60,
  },
  {
    title: 'หาแก้วน้ำแดง 🥤',
    desc: 'ใครเอาแก้วน้ำ 3 ใบไปวางปะปนกับของกินเนี่ย!',
    targetEmoji: '🥤',
    targetCount: 3,
    noiseEmojis: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠', '🥐', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🥪', '🥙', '🧆', '🌮', '🌯', '🥗', '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '☕', '🍵', '🧃', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'],
    noiseCount: 250,
    timeLimit: 45,
  },
  {
    title: 'ตามหาหนังสือ 📖',
    desc: 'ช่วยหาหนังสือ 1 เล่มในห้องที่รกมากๆ ให้หน่อย',
    targetEmoji: '📖',
    targetCount: 1,
    noiseEmojis: ['📦', '📺', '🛋', '🛏', '🧸', '📻', '📱', '💻', '🖨', '⌨', '🖱', '🖲', '🕹', '🗜', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽', '🎞', '📞', '☎', '📟', '📠', '🔋', '🔌', '💡', '🔦', '🕯', '🪔', '🧯', '🛢', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒', '🛠', '⛏', '🪚', '🔩', '⚙', '🪤', '🧱', '⛓', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡', '⚔', '🛡', '🚬', '⚰', '🪦', '⚱', '🏺', '🔮', '📿', '🧿', '💈', '⚗', '🔭', '🔬', '🕳', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡', '🧹', '🧺', '🧻', '🚽', '🚰', '🚿', '🛁', '🛀', '🧼', '🧽', '🪒', '🧴', '🛎', '🔑', '🗝', '🚪', '🪑', '🛋', '🛏', '🛌', '🧸', '🪆', '🖼', '🪞', '🪟', '🛍', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅', '🎊', '🎉'],
    noiseCount: 300,
    timeLimit: 30,
  }
];

export default function HiddenObjectGame() {
  const { addXP } = useGamification();
  const { playClick, playCorrect, playWrong, playWin, playLose } = useAppSounds();

  const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameover' | 'win'>('idle');
  const [currentLevel, setCurrentLevel] = useState(0);
  const [items, setItems] = useState<HiddenItem[]>([]);
  const [foundCount, setFoundCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  const timerRef = useRef<any>(null);

  const generateLevel = (levelIndex: number) => {
    const lvl = LEVELS[levelIndex];
    const newItems: HiddenItem[] = [];

    // Generate targets
    for (let i = 0; i < lvl.targetCount; i++) {
      newItems.push({
        id: `target_${i}`,
        emoji: lvl.targetEmoji,
        x: Math.random() * (CANVAS_SIZE - ITEM_SIZE),
        y: Math.random() * (CANVAS_SIZE - ITEM_SIZE),
        isTarget: true,
        found: false,
      });
    }

    // Generate noise
    for (let i = 0; i < lvl.noiseCount; i++) {
      const randomEmoji = lvl.noiseEmojis[Math.floor(Math.random() * lvl.noiseEmojis.length)];
      newItems.push({
        id: `noise_${i}`,
        emoji: randomEmoji,
        x: Math.random() * (CANVAS_SIZE - ITEM_SIZE),
        y: Math.random() * (CANVAS_SIZE - ITEM_SIZE),
        isTarget: false,
        found: false,
      });
    }

    // Shuffle
    newItems.sort(() => Math.random() - 0.5);

    setItems(newItems);
    setFoundCount(0);
    setTimeLeft(lvl.timeLimit);
  };

  const startGame = () => {
    playClick();
    setCurrentLevel(0);
    generateLevel(0);
    setGameState('playing');
  };

  const nextLevel = () => {
    playClick();
    const nextLvl = currentLevel + 1;
    if (nextLvl >= LEVELS.length) {
      // Finished all levels
      setGameState('win');
      playWin();
      addXP(50, 'หาของ: เคลียร์ทุกด่าน!');
    } else {
      setCurrentLevel(nextLvl);
      generateLevel(nextLvl);
      setGameState('playing');
    }
  };

  useEffect(() => {
    if (gameState !== 'playing') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setGameState('gameover');
          playLose();
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState]);

  const handleTapItem = (id: string, isTarget: boolean, isFound: boolean) => {
    if (gameState !== 'playing' || isFound) return;

    if (isTarget) {
      playCorrect();
      setItems(prev => prev.map(item => item.id === id ? { ...item, found: true } : item));
      const newFoundCount = foundCount + 1;
      setFoundCount(newFoundCount);

      if (newFoundCount >= LEVELS[currentLevel].targetCount) {
        clearInterval(timerRef.current);
        playWin();
        const xpEarned = 15;
        addXP(xpEarned, `หาของ: ด่าน ${LEVELS[currentLevel].title}`);
        setGameState('win');
      }
    } else {
      // Tapped wrong item - penalty? Maybe just play wrong sound
      playWrong();
      setTimeLeft(t => Math.max(0, t - 3)); // -3 seconds penalty
    }
  };

  return (
    <View style={styles.container}>
      {/* Header Info */}
      <View style={styles.header}>
        {gameState === 'playing' ? (
          <>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle}>{LEVELS[currentLevel].title}</Text>
              <Text style={styles.headerTarget}>
                เป้าหมาย: {LEVELS[currentLevel].targetEmoji} ({foundCount}/{LEVELS[currentLevel].targetCount})
              </Text>
            </View>
            <View style={styles.timerBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialCommunityIcons name="timer-outline" size={20} color={timeLeft <= 10 ? '#ef4444' : '#1e293b'} />
                <Text style={[styles.timerText, timeLeft <= 10 && styles.timerDanger]}>
                  {timeLeft}s
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons name="magnify" size={24} color="#1e293b" />
            <Text style={styles.headerTitle}>หา Emoji</Text>
          </View>
        )}
      </View>

      {/* Game Area */}
      <View style={styles.gameArea}>
        {gameState === 'idle' && (
          <View style={styles.overlay}>
            <MaterialCommunityIcons name="magnify" size={64} color="#38bdf8" style={{ marginBottom: 16 }} />
            <Text style={styles.overlayTitle}>หา Emoji</Text>
            <Text style={styles.overlayDesc}>
              เลื่อนหน้าจอเพื่อค้นหาสิ่งของที่กำหนด{'\n'}
              ระวัง: กดผิดโดนหักเวลา!
            </Text>
            <Pressable style={styles.startButton} onPress={startGame}>
              <Text style={styles.startButtonText}>เริ่มเกม</Text>
            </Pressable>
          </View>
        )}

        {(gameState === 'playing' || gameState === 'gameover' || (gameState === 'win' && currentLevel < LEVELS.length - 1)) && (
          <ScrollView horizontal bounces={false} style={styles.scrollX} contentContainerStyle={styles.scrollContent}>
            <ScrollView bounces={false} style={styles.scrollY} contentContainerStyle={styles.scrollContent}>
              <View style={styles.canvas}>
                {items.map(item => (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.item,
                      { left: item.x, top: item.y },
                      item.found && styles.itemFound
                    ]}
                    onPress={() => handleTapItem(item.id, item.isTarget, item.found)}
                  >
                    <Text style={[styles.emoji, item.found && styles.emojiFound]}>
                      {item.found ? '✅' : item.emoji}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </ScrollView>
        )}

        {gameState === 'gameover' && (
          <View style={styles.overlay}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <MaterialCommunityIcons name="timer-off-outline" size={32} color="#ef4444" />
              <Text style={[styles.overlayTitle, { marginBottom: 0 }]}>หมดเวลา!</Text>
            </View>
            <Text style={styles.overlayDesc}>หาเจอ {foundCount}/{LEVELS[currentLevel].targetCount} ชิ้น</Text>
            <Pressable style={styles.startButton} onPress={startGame}>
              <Text style={styles.startButtonText}>ลองใหม่</Text>
            </Pressable>
          </View>
        )}

        {gameState === 'win' && currentLevel < LEVELS.length - 1 && (
          <View style={styles.overlay}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <MaterialCommunityIcons name="party-popper" size={32} color="#22c55e" />
              <Text style={[styles.overlayTitle, { marginBottom: 0 }]}>เก่งมาก!</Text>
            </View>
            <Text style={styles.overlayDesc}>คุณหาของเจอครบทั้งหมดแล้ว</Text>
            <Pressable style={styles.startButton} onPress={nextLevel}>
              <Text style={styles.startButtonText}>ด่านต่อไป ➡️</Text>
            </Pressable>
          </View>
        )}

        {gameState === 'win' && currentLevel >= LEVELS.length - 1 && (
          <View style={styles.overlay}>
            <MaterialCommunityIcons name="trophy" size={64} color="#f59e0b" style={{ marginBottom: 16 }} />
            <Text style={styles.overlayTitle}>ยินดีด้วย!</Text>
            <Text style={styles.overlayDesc}>คุณเคลียร์เกมหาของครบทุกด่านแล้ว!</Text>
            <Pressable style={styles.startButton} onPress={startGame}>
              <Text style={styles.startButtonText}>เล่นอีกครั้ง</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    height: 60,
  },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  headerTarget: { fontSize: 16, color: '#475569', fontWeight: '600' },
  timerBox: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  timerText: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  timerDanger: { color: '#ef4444' },
  
  gameArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    position: 'relative',
  },
  scrollX: { flex: 1 },
  scrollY: { flex: 1 },
  scrollContent: { },
  canvas: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    backgroundColor: '#fff',
    position: 'relative',
  },
  item: {
    position: 'absolute',
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemFound: {
    backgroundColor: 'rgba(34,197,94,0.2)',
    borderRadius: 20,
    zIndex: 10,
  },
  emoji: { fontSize: 28 },
  emojiFound: { fontSize: 20 },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: 24,
  },
  overlayTitle: { fontSize: 32, fontWeight: '800', color: '#ffffff', marginBottom: 12 },
  overlayDesc: { fontSize: 16, color: '#cbd5e1', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  startButton: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 30,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
});
