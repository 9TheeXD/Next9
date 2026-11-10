import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { useGamification } from '@/contexts/GamificationContext';
import { useAppSounds } from '@/hooks/useAppSounds';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GROUND_H = 140;
const DINO_W = 24;
const DINO_H = 32;
const DINO_X = 50;
const OBSTACLE_W = 16;
const CACTUS_H = 30;
const BIRD_H = 16;
const GRAVITY = 0.6;
const JUMP_FORCE = -11;
const TICK = 16;

interface Obstacle {
  x: number;
  w: number;
  h: number;
  yOffset: number; // 0 for ground, more for flying
  type: 'cactus' | 'bird';
}

export default function DinoRunnerGame() {
  const { addXP } = useGamification();
  const { playClick, playWrong } = useAppSounds();

  const [gameState, setGameState] = useState<'idle' | 'running' | 'gameover'>('idle');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [dinoY, setDinoY] = useState(0);
  const [isDucking, setIsDucking] = useState(false);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);

  const dinoVelRef = useRef(0);
  const dinoYRef = useRef(0); // 0 is ground level, negative is up (but wait, dinoY is inverted? Let's keep it negative for up)
  const isJumpingRef = useRef(false);
  const isDuckingRef = useRef(false);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const scoreRef = useRef(0);
  const speedRef = useRef(2.5);
  const frameRef = useRef(0);
  const tickerRef = useRef<any>(null);
  const spawnTimerRef = useRef(0);

  const startGame = () => {
    playClick();
    dinoVelRef.current = 0;
    dinoYRef.current = 0;
    isJumpingRef.current = false;
    isDuckingRef.current = false;
    obstaclesRef.current = [];
    scoreRef.current = 0;
    speedRef.current = 2.5;
    frameRef.current = 0;
    spawnTimerRef.current = 0;
    setDinoY(0);
    setIsDucking(false);
    setObstacles([]);
    setScore(0);
    setGameState('running');
  };

  const jump = useCallback(() => {
    if (gameState !== 'running') {
      startGame();
      return;
    }
    if (!isJumpingRef.current) {
      dinoVelRef.current = JUMP_FORCE;
      isJumpingRef.current = true;
      isDuckingRef.current = false;
      setIsDucking(false);
    }
  }, [gameState]);

  const duck = useCallback(() => {
    if (gameState !== 'running') return;
    if (!isJumpingRef.current) {
      isDuckingRef.current = true;
      setIsDucking(true);
    }
  }, [gameState]);

  const unduck = useCallback(() => {
    isDuckingRef.current = false;
    setIsDucking(false);
  }, []);

  // Game loop
  useEffect(() => {
    if (gameState !== 'running') {
      if (tickerRef.current) clearInterval(tickerRef.current);
      return;
    }

    tickerRef.current = setInterval(() => {
      frameRef.current++;

      // Physics
      if (isJumpingRef.current) {
        dinoVelRef.current += GRAVITY;
        dinoYRef.current += dinoVelRef.current;
        if (dinoYRef.current >= 0) {
          dinoYRef.current = 0;
          dinoVelRef.current = 0;
          isJumpingRef.current = false;
        }
      }

      // Spawn obstacles
      spawnTimerRef.current--;
      if (spawnTimerRef.current <= 0) {
        const type = Math.random() > 0.75 && scoreRef.current > 50 ? 'bird' : 'cactus';
        const h = type === 'cactus' ? CACTUS_H + Math.floor(Math.random() * 12) : BIRD_H;
        const yOffset = type === 'bird' ? 40 + Math.floor(Math.random() * 30) : 0;
        const w = type === 'cactus' ? OBSTACLE_W + Math.floor(Math.random() * 8) : 20;
        obstaclesRef.current.push({ x: SCREEN_WIDTH + 20, w, h, yOffset, type });
        spawnTimerRef.current = 60 + Math.floor(Math.random() * 60);
      }

      // Move obstacles
      const speed = speedRef.current;
      obstaclesRef.current = obstaclesRef.current
        .map(o => ({ ...o, x: o.x - speed }))
        .filter(o => o.x + o.w > -20);

      // Collision (dinoYRef is 0 at ground, negative when up. Y axis is UP)
      // Actually dinoYRef is negative when jumping.
      // So dino bottom is -dinoYRef.
      const dinoBottom = -dinoYRef.current; 
      const effectiveDinoH = isDuckingRef.current ? DINO_H * 0.5 : DINO_H;
      const dinoTop = dinoBottom + effectiveDinoH;
      const dinoLeft = DINO_X;
      const dinoRight = DINO_X + DINO_W;

      for (const obs of obstaclesRef.current) {
        const obsLeft = obs.x;
        const obsRight = obs.x + obs.w;
        const obsBottom = obs.yOffset;
        const obsTop = obs.yOffset + obs.h;

        if (dinoRight > obsLeft + 4 && dinoLeft < obsRight - 4 &&
            dinoTop > obsBottom + 4 && dinoBottom < obsTop - 4) {
          // Collision!
          setGameState('gameover');
          playWrong();
          const finalScore = scoreRef.current;
          setScore(finalScore);
          if (finalScore > 0) {
            const xpEarned = Math.min(50, Math.floor(finalScore / 10));
            if (xpEarned > 0) addXP(xpEarned, `ไดโนเสาว์วิ่ง: ทำได้ ${finalScore} คะแนน`);
          }
          return;
        }
      }

      // Score
      scoreRef.current++;
      if (scoreRef.current % 500 === 0) {
        speedRef.current = Math.min(10, speedRef.current + 0.5);
      }

      // Sync state for rendering
      setDinoY(dinoYRef.current);
      setObstacles([...obstaclesRef.current]);
      setScore(scoreRef.current);
    }, TICK);

    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'gameover' && score > highScore) {
      setHighScore(score);
    }
  }, [gameState, score]);

  const effectiveDinoH = isDucking ? DINO_H * 0.5 : DINO_H;

  return (
    <View style={styles.container}>
      <Pressable
        onPress={jump}
        onLongPress={duck}
        onPressOut={unduck}
        style={styles.gameArea}
      >
        {/* Sky / Clouds */}
        <View style={styles.sky}>
          <View style={[styles.cloud, { left: (frameRef.current * 0.5) % (SCREEN_WIDTH + 60) === 0 ? SCREEN_WIDTH : ((SCREEN_WIDTH - (frameRef.current * 0.3) % (SCREEN_WIDTH + 100))), top: '20%' }]} />
          <View style={[styles.cloud, { left: ((SCREEN_WIDTH * 0.6 - (frameRef.current * 0.2) % (SCREEN_WIDTH + 80))), top: '40%' }]} />
        </View>

        {/* HUD inside GameArea */}
        <View style={styles.scoreRow}>
          <Text style={styles.scoreText}>คะแนน: {score}</Text>
          <Text style={styles.highScoreText}>สูงสุด: {highScore}</Text>
        </View>

        {/* Dino */}
        <View style={[
          styles.dino,
          {
            bottom: GROUND_H - dinoY, // dinoY is negative when jumping, so - dinoY is + height
            left: DINO_X,
            height: effectiveDinoH,
            width: DINO_W,
          }
        ]}>
          <View style={styles.dinoHead} />
          <View style={[styles.dinoBody, { height: effectiveDinoH - 8 }]} />
          <View style={styles.dinoEye} />
          {!isDucking && (
            <>
              <View style={[styles.dinoLeg, { left: 4, bottom: 0 }]} />
              <View style={[styles.dinoLeg, { left: 14, bottom: 0 }]} />
            </>
          )}
        </View>

        {/* Obstacles */}
        {obstacles.map((obs, i) => (
          <View
            key={i}
            style={[
              obs.type === 'cactus' ? styles.cactus : styles.bird,
              {
                left: obs.x,
                bottom: GROUND_H + obs.yOffset,
                width: obs.w,
                height: obs.h,
              }
            ]}
          >
            {obs.type === 'bird' && <MaterialCommunityIcons name="bird" size={14} color="#1e293b" />}
          </View>
        ))}

        {/* Ground */}
        <View style={styles.ground} />

        {/* Overlays */}
        {gameState === 'idle' && (
          <View style={styles.overlay}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <MaterialCommunityIcons name="google-downasaur" size={48} color="#ffffff" />
              <Text style={[styles.overlayTitle, { marginBottom: 0 }]}>ไดโนวิ่ง</Text>
            </View>
            <Text style={styles.overlaySubtitle}>แตะเพื่อกระโดด • กดค้างมุมซ้ายล่างเพื่อหมอบ</Text>
            <Text style={styles.overlayHint}>แตะเพื่อเริ่มเกม</Text>
          </View>
        )}
        {gameState === 'gameover' && (
          <View style={styles.overlay}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <MaterialCommunityIcons name="bomb" size={48} color="#ef4444" />
              <Text style={[styles.overlayTitle, { marginBottom: 0 }]}>Game Over</Text>
            </View>
            <Text style={styles.overlayScore}>คะแนน: {score}</Text>
            <Text style={styles.overlayHint}>แตะเพื่อเล่นอีกครั้ง</Text>
          </View>
        )}
      </Pressable>

      {/* Embedded Controls */}
      <View style={styles.embeddedControls}>
        <Pressable
          style={styles.embeddedBtn}
          onPressIn={duck}
          onPressOut={unduck}
        >
          <View style={[styles.controlCircle, { backgroundColor: '#f59e0b' }]}>
             <Feather name="arrow-down" size={28} color="#ffffff" />
          </View>
        </Pressable>
        <Pressable
          style={styles.embeddedBtn}
          onPress={jump}
        >
          <View style={[styles.controlCircle, { backgroundColor: '#3b82f6' }]}>
             <Feather name="arrow-up" size={28} color="#ffffff" />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fefce8' },
  gameArea: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  scoreRow: { 
    position: 'absolute', 
    top: 16, 
    left: 16, 
    right: 16, 
    flexDirection: 'row', 
    justifyContent: 'space-between',
    zIndex: 20
  },
  scoreText: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
  highScoreText: { fontSize: 16, fontWeight: '700', color: '#64748b' },
  sky: { position: 'absolute', top: 0, left: 0, right: 0, bottom: GROUND_H },
  cloud: {
    position: 'absolute',
    width: 60,
    height: 18,
    backgroundColor: '#e2e8f0',
    borderRadius: 9,
    opacity: 0.6,
  },
  dino: {
    position: 'absolute',
    zIndex: 10,
  },
  dinoHead: {
    width: 16, height: 10, backgroundColor: '#475569', borderRadius: 3,
    position: 'absolute', top: 0, right: 0,
  },
  dinoBody: {
    width: 20, backgroundColor: '#475569', borderRadius: 3,
    position: 'absolute', top: 8, left: 0,
  },
  dinoEye: {
    width: 3, height: 3, backgroundColor: '#ffffff', borderRadius: 2,
    position: 'absolute', top: 3, right: 3, zIndex: 11,
  },
  dinoLeg: {
    position: 'absolute', width: 4, height: 8, backgroundColor: '#475569', borderRadius: 2,
  },
  cactus: {
    position: 'absolute', backgroundColor: '#22c55e', borderRadius: 3, zIndex: 5,
  },
  bird: {
    position: 'absolute', zIndex: 5, justifyContent: 'center', alignItems: 'center',
  },
  ground: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: GROUND_H,
    backgroundColor: '#d6d3d1', borderTopWidth: 2, borderTopColor: '#a8a29e',
    zIndex: 1, // behind the controls
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  overlayTitle: { fontSize: 32, fontWeight: '900', color: '#ffffff', marginBottom: 8 },
  overlaySubtitle: { fontSize: 16, color: '#e2e8f0', marginBottom: 16 },
  overlayScore: { fontSize: 24, fontWeight: '700', color: '#fbbf24', marginBottom: 12 },
  overlayHint: { fontSize: 16, color: '#94a3b8' },
  embeddedControls: {
    position: 'absolute',
    bottom: 30, // placed inside the ground (GROUND_H is 140)
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 40,
    pointerEvents: 'box-none'
  },
  embeddedBtn: {
    padding: 10,
  },
  controlCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)'
  }
});
