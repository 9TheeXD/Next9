import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { useGamification } from '@/contexts/GamificationContext';
import { useAppSounds } from '@/hooks/useAppSounds';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const COLS = 10;
const ROWS = 20;
const MAX_BOARD_H = SCREEN_H - 360;
const MAX_BOARD_W = SCREEN_W - 32;
const BLOCK_SIZE = Math.max(10, Math.min(Math.floor(MAX_BOARD_W / COLS), Math.floor(MAX_BOARD_H / ROWS)));

// Tetromino shapes (4 rotations each)
const SHAPES = {
  I: [
    [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
    [[0,0,1,0], [0,0,1,0], [0,0,1,0], [0,0,1,0]],
    [[0,0,0,0], [0,0,0,0], [1,1,1,1], [0,0,0,0]],
    [[0,1,0,0], [0,1,0,0], [0,1,0,0], [0,1,0,0]]
  ],
  J: [
    [[1,0,0], [1,1,1], [0,0,0]],
    [[0,1,1], [0,1,0], [0,1,0]],
    [[0,0,0], [1,1,1], [0,0,1]],
    [[0,1,0], [0,1,0], [1,1,0]]
  ],
  L: [
    [[0,0,1], [1,1,1], [0,0,0]],
    [[0,1,0], [0,1,0], [0,1,1]],
    [[0,0,0], [1,1,1], [1,0,0]],
    [[1,1,0], [0,1,0], [0,1,0]]
  ],
  O: [
    [[1,1], [1,1]]
  ],
  S: [
    [[0,1,1], [1,1,0], [0,0,0]],
    [[0,1,0], [0,1,1], [0,0,1]],
    [[0,0,0], [0,1,1], [1,1,0]],
    [[1,0,0], [1,1,0], [0,1,0]]
  ],
  T: [
    [[0,1,0], [1,1,1], [0,0,0]],
    [[0,1,0], [0,1,1], [0,1,0]],
    [[0,0,0], [1,1,1], [0,1,0]],
    [[0,1,0], [1,1,0], [0,1,0]]
  ],
  Z: [
    [[1,1,0], [0,1,1], [0,0,0]],
    [[0,0,1], [0,1,1], [0,1,0]],
    [[0,0,0], [1,1,0], [0,1,1]],
    [[0,1,0], [1,1,0], [1,0,0]]
  ]
};

const COLORS = {
  0: 'transparent',
  I: '#06b6d4', // Cyan
  J: '#3b82f6', // Blue
  L: '#f59e0b', // Orange
  O: '#eab308', // Yellow
  S: '#22c55e', // Green
  T: '#a855f7', // Purple
  Z: '#ef4444', // Red
};

type TetrominoType = keyof typeof SHAPES;

interface Piece {
  type: TetrominoType;
  x: number;
  y: number;
  rotation: number;
}

const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

const getRandomType = (): TetrominoType => {
  const keys = Object.keys(SHAPES) as TetrominoType[];
  return keys[Math.floor(Math.random() * keys.length)];
};

const createPiece = (type: TetrominoType): Piece => ({
  type, x: Math.floor(COLS / 2) - 1, y: 0, rotation: 0
});

export default function TetrisGame() {
  const { addXP } = useGamification();
  const { playClick, playWin, playLose, playNav } = useAppSounds();

  const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameover'>('idle');
  const [board, setBoard] = useState<(string | 0)[][]>(emptyBoard());
  const [piece, setPiece] = useState<Piece | null>(null);
  const [nextPieceType, setNextPieceType] = useState<TetrominoType>('I');
  const [holdPieceType, setHoldPieceType] = useState<TetrominoType | null>(null);
  const [canHold, setCanHold] = useState(true);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState(0);

  const boardRef = useRef(board);
  const pieceRef = useRef(piece);
  const dropTimerRef = useRef<any>(null);
  const moveTimerRef = useRef<any>(null);

  // Sync refs
  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { pieceRef.current = piece; }, [piece]);

  const startGame = () => {
    playClick();
    setBoard(emptyBoard());
    setScore(0);
    setLevel(1);
    setLines(0);
    setHoldPieceType(null);
    setCanHold(true);
    setPiece(createPiece(getRandomType()));
    setNextPieceType(getRandomType());
    setGameState('playing');
  };

  const checkCollision = (p: Piece, b: (string | 0)[][]) => {
    const shape = SHAPES[p.type][p.rotation % SHAPES[p.type].length];
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const newY = p.y + r;
          const newX = p.x + c;
          if (newX < 0 || newX >= COLS || newY >= ROWS || (newY >= 0 && b[newY][newX] !== 0)) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const mergePiece = () => {
    const p = pieceRef.current;
    const b = [...boardRef.current.map(row => [...row])];
    if (!p) return b;

    const shape = SHAPES[p.type][p.rotation % SHAPES[p.type].length];
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] && p.y + r >= 0) {
          b[p.y + r][p.x + c] = p.type;
        }
      }
    }
    return b;
  };

  const clearLines = (b: (string | 0)[][]) => {
    let linesCleared = 0;
    const newBoard = b.filter(row => {
      if (row.every(cell => cell !== 0)) {
        linesCleared++;
        return false;
      }
      return true;
    });

    while (newBoard.length < ROWS) {
      newBoard.unshift(Array(COLS).fill(0));
    }

    if (linesCleared > 0) {
      playNav(); // Line clear sound
      setLines(l => {
        const newLines = l + linesCleared;
        setLevel(Math.floor(newLines / 10) + 1);
        return newLines;
      });
      setScore(s => s + [0, 100, 300, 500, 800][linesCleared] * level);
    }
    return newBoard;
  };

  const gameOver = () => {
    setGameState('gameover');
    playLose();
    if (score > 0) {
      const xpEarned = Math.min(50, Math.floor(score / 50));
      if (xpEarned > 0) addXP(xpEarned, `Tetris: ทำได้ ${score} คะแนน`);
    }
  };

  const spawnPiece = () => {
    const newPiece = createPiece(nextPieceType);
    setNextPieceType(getRandomType());
    setCanHold(true);
    setPiece(newPiece);
    if (checkCollision(newPiece, boardRef.current)) {
      gameOver();
    }
  };

  const lockPiece = (p: Piece) => {
    pieceRef.current = p; 
    const newBoard = clearLines(mergePiece());
    setBoard(newBoard);
    spawnPiece();
  };

  const moveDown = useCallback(() => {
    const p = pieceRef.current;
    if (!p) return;
    const nextP = { ...p, y: p.y + 1 };
    
    if (checkCollision(nextP, boardRef.current)) {
      if (p.y <= 0) {
        gameOver();
      } else {
        lockPiece(p);
      }
    } else {
      setPiece(nextP);
    }
  }, [level]);

  // Game Loop
  useEffect(() => {
    if (gameState !== 'playing') {
      if (dropTimerRef.current) clearInterval(dropTimerRef.current);
      return;
    }

    const speed = Math.max(150, 800 - (level - 1) * 80);
    dropTimerRef.current = setInterval(moveDown, speed);

    return () => {
      if (dropTimerRef.current) clearInterval(dropTimerRef.current);
    };
  }, [gameState, moveDown, level]);

  // Ghost Piece Logic
  const getGhostPiece = () => {
    let p = pieceRef.current;
    if (!p) return null;
    let nextP = { ...p, y: p.y + 1 };
    while (!checkCollision(nextP, boardRef.current)) {
      p = nextP;
      nextP = { ...p, y: p.y + 1 };
    }
    return p;
  };

  // Controls
  const handleMove = (dir: -1 | 1) => {
    if (gameState !== 'playing') return;
    const p = pieceRef.current;
    if (!p) return;
    const nextP = { ...p, x: p.x + dir };
    if (!checkCollision(nextP, boardRef.current)) setPiece(nextP);
  };

  const startMove = (dir: -1 | 1) => {
    handleMove(dir);
    if (moveTimerRef.current) clearInterval(moveTimerRef.current);
    moveTimerRef.current = setInterval(() => handleMove(dir), 100);
  };

  const stopMove = () => {
    if (moveTimerRef.current) clearInterval(moveTimerRef.current);
  };

  const handleRotate = () => {
    if (gameState !== 'playing') return;
    const p = pieceRef.current;
    if (!p) return;
    
    // Simple wall kick attempt (try normal, try left, try right, try up)
    const rotations = [0, -1, 1, 0, -2, 2];
    const yOffsets = [0, 0, 0, -1, 0, 0];
    
    for (let i = 0; i < rotations.length; i++) {
      const nextP = { ...p, rotation: p.rotation + 1, x: p.x + rotations[i], y: p.y + yOffsets[i] };
      if (!checkCollision(nextP, boardRef.current)) {
        setPiece(nextP);
        return;
      }
    }
  };

  const handleHardDrop = () => {
    if (gameState !== 'playing') return;
    const ghost = getGhostPiece();
    if (ghost) {
      lockPiece(ghost);
    }
  };
  
  const handleHold = () => {
    if (gameState !== 'playing' || !canHold) return;
    const p = pieceRef.current;
    if (!p) return;
    
    setCanHold(false);
    if (holdPieceType === null) {
      setHoldPieceType(p.type);
      spawnPiece();
    } else {
      const temp = holdPieceType;
      setHoldPieceType(p.type);
      const newPiece = createPiece(temp);
      setPiece(newPiece);
      if (checkCollision(newPiece, boardRef.current)) gameOver();
    }
  };

  // Render combined board
  const renderBoard = () => {
    const displayBoard = [...board.map(row => [...row])];
    
    // Draw Ghost
    const ghost = getGhostPiece();
    if (ghost && gameState === 'playing') {
      const shape = SHAPES[ghost.type][ghost.rotation % SHAPES[ghost.type].length];
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c] && ghost.y + r >= 0 && ghost.y + r < ROWS) {
            displayBoard[ghost.y + r][ghost.x + c] = ghost.type + '_GHOST';
          }
        }
      }
    }

    // Draw Active Piece
    if (piece && gameState === 'playing') {
      const shape = SHAPES[piece.type][piece.rotation % SHAPES[piece.type].length];
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c] && piece.y + r >= 0 && piece.y + r < ROWS) {
            displayBoard[piece.y + r][piece.x + c] = piece.type;
          }
        }
      }
    }

    return displayBoard.map((row, rIdx) => (
      <View key={rIdx} style={styles.row}>
        {row.map((cell, cIdx) => {
          let bgColor = 'transparent';
          let borderColor = '#334155';
          if (typeof cell === 'string') {
            if (cell.endsWith('_GHOST')) {
              const baseType = cell.replace('_GHOST', '') as TetrominoType;
              bgColor = COLORS[baseType] + '40'; // 25% opacity
              borderColor = COLORS[baseType] + '80';
            } else {
              bgColor = COLORS[cell as TetrominoType];
              borderColor = 'rgba(0,0,0,0.1)';
            }
          }
          return (
            <View
              key={`${rIdx}-${cIdx}`}
              style={[styles.cell, { backgroundColor: bgColor, borderColor }]}
            />
          );
        })}
      </View>
    ));
  };
  
  const renderMiniPiece = (type: TetrominoType | null) => {
    if (!type) return <View style={{ width: 40, height: 40 }} />;
    const shape = SHAPES[type][0]; // rotation 0
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {shape.map((row, rIdx) => (
          <View key={rIdx} style={{ flexDirection: 'row' }}>
            {row.map((cell, cIdx) => (
              <View
                key={`${rIdx}-${cIdx}`}
                style={{
                  width: 12, height: 12,
                  backgroundColor: cell ? COLORS[type] : 'transparent',
                  borderColor: cell ? 'rgba(0,0,0,0.1)' : 'transparent',
                  borderWidth: cell ? 1 : 0
                }}
              />
            ))}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.sidePanel}>
          <Text style={styles.panelTitle}>HOLD</Text>
          <View style={styles.panelBox}>
            {renderMiniPiece(holdPieceType)}
          </View>
        </View>
        
        <View style={styles.statsPanel}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>SCORE</Text>
            <Text style={styles.statValue}>{score}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>LEVEL</Text>
            <Text style={styles.statValue}>{level}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>LINES</Text>
            <Text style={styles.statValue}>{lines}</Text>
          </View>
        </View>

        <View style={styles.sidePanel}>
          <Text style={styles.panelTitle}>NEXT</Text>
          <View style={styles.panelBox}>
             {renderMiniPiece(nextPieceType)}
          </View>
        </View>
      </View>

      <View style={styles.gameArea}>
        <View style={styles.board}>
          {renderBoard()}
        </View>

        {gameState === 'idle' && (
          <View style={styles.overlay}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <MaterialCommunityIcons name="wall" size={32} color="#ffffff" />
              <Text style={[styles.overlayTitle, { marginBottom: 0 }]}>Tetris</Text>
            </View>
            <Text style={styles.overlaySubtitle}>เวอร์ชันใหม่ เล่นง่าย ลื่นไหลกว่าเดิม!</Text>
            <Pressable style={styles.startButton} onPress={startGame}>
              <Text style={styles.startButtonText}>เริ่มเกม</Text>
            </Pressable>
          </View>
        )}

        {gameState === 'gameover' && (
          <View style={styles.overlay}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <MaterialCommunityIcons name="bomb" size={32} color="#ef4444" />
              <Text style={[styles.overlayTitle, { marginBottom: 0 }]}>Game Over</Text>
            </View>
            <Text style={styles.overlaySubtitle}>คะแนน: {score}</Text>
            <Pressable style={styles.startButton} onPress={startGame}>
              <Text style={styles.startButtonText}>เล่นอีกครั้ง</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <Pressable style={[styles.controlBtn, { backgroundColor: '#fde68a', borderColor: '#fcd34d' }]} onPress={handleHold}>
             <Feather name="box" size={20} color="#b45309" />
             <Text style={styles.btnText}>Hold</Text>
          </Pressable>
          
          <Pressable style={[styles.controlBtn, { backgroundColor: '#bae6fd', borderColor: '#7dd3fc', width: 64, height: 64, borderRadius: 32 }]} onPress={handleRotate}>
            <Feather name="rotate-cw" size={28} color="#0369a1" />
          </Pressable>
          
          <Pressable style={[styles.controlBtn, { backgroundColor: '#fecaca', borderColor: '#fca5a5' }]} onPress={handleHardDrop}>
             <Feather name="arrow-down-circle" size={20} color="#b91c1c" />
             <Text style={styles.btnText}>Drop</Text>
          </Pressable>
        </View>
        <View style={[styles.controlRow, { marginTop: 12 }]}>
          <Pressable 
            style={styles.dirBtn} 
            onPressIn={() => startMove(-1)} 
            onPressOut={stopMove}
          >
            <Feather name="chevron-left" size={32} color="#cbd5e1" />
          </Pressable>
          <Pressable 
            style={styles.dirBtn} 
            onPressIn={() => { if(gameState==='playing') { moveDown(); if(moveTimerRef.current) clearInterval(moveTimerRef.current); moveTimerRef.current = setInterval(moveDown, 50); } }} 
            onPressOut={stopMove}
          >
            <Feather name="chevron-down" size={32} color="#cbd5e1" />
          </Pressable>
          <Pressable 
            style={styles.dirBtn} 
            onPressIn={() => startMove(1)} 
            onPressOut={stopMove}
          >
            <Feather name="chevron-right" size={32} color="#cbd5e1" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: COLS * BLOCK_SIZE + 80, // Extra width for side panels
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  statsPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statBox: {
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    minWidth: 80,
  },
  statLabel: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
  },
  sidePanel: {
    alignItems: 'center',
    gap: 4,
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  panelBox: {
    width: 60,
    height: 60,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameArea: {
    position: 'relative',
    backgroundColor: '#0f172a',
    padding: 2,
    borderRadius: 8,
  },
  board: {
    width: COLS * BLOCK_SIZE,
    height: ROWS * BLOCK_SIZE,
    backgroundColor: '#1e293b',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    width: BLOCK_SIZE,
    height: BLOCK_SIZE,
    borderWidth: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderRadius: 8,
  },
  overlayTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
  },
  overlaySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 24,
  },
  startButton: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  controls: {
    marginTop: 20,
    alignItems: 'center',
  },
  controlRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  btnText: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    color: 'rgba(0,0,0,0.6)'
  },
  dirBtn: {
    width: 64,
    height: 64,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  }
});
