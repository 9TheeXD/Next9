import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Dimensions } from 'react-native';
import { useGamification } from '@/contexts/GamificationContext';
import { useAppSounds } from '@/hooks/useAppSounds';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

const { width: SCREEN_W } = Dimensions.get('window');
const CIRCLE_SIZE = Math.min(SCREEN_W * 0.55, 220);

// ────────────────────────────────────────────────────
// Challenge Types & Bank
// ────────────────────────────────────────────────────

type ChallengeType = 'tap_count' | 'no_tap' | 'math' | 'syllable' | 'animal_count' | 'body_part' | 'trick' | 'letter_count' | 'category_count' | 'patterned';

interface Challenge {
  text: string;
  answer: number; // correct number of taps (0 = don't tap)
  type: ChallengeType;
  timeLimit: number; // seconds
  /** If this challenge triggers a follow-up pattern */
  pattern?: {
    followUpIn: number; // how many challenges later (2-5)
    followUpText: string;
    followUpAnswer: number;
    followUpTime: number;
  };
}

function countSyllables(word: string): number {
  // Thai syllable rough estimation: each vowel cluster = 1 syllable
  const vowels = 'าิีึืุูเแโใไำ็่้๊๋';
  let count = 0;
  let prevWasVowel = false;
  for (const ch of word) {
    if (vowels.includes(ch)) {
      if (!prevWasVowel) count++;
      prevWasVowel = true;
    } else {
      prevWasVowel = false;
    }
  }
  return Math.max(1, count);
}

// ── Master Challenge Bank (100+ challenges) ──
const CHALLENGE_BANK: Challenge[] = [
  // ── Simple tap count ──
  { text: 'กด 1 ครั้ง', answer: 1, type: 'tap_count', timeLimit: 3 },
  { text: 'กด 2 ครั้ง', answer: 2, type: 'tap_count', timeLimit: 3 },
  { text: 'กด 3 ครั้ง', answer: 3, type: 'tap_count', timeLimit: 4 },
  { text: 'กด 4 ครั้ง', answer: 4, type: 'tap_count', timeLimit: 4 },
  { text: 'กด 5 ครั้ง', answer: 5, type: 'tap_count', timeLimit: 5 },
  { text: 'กด 6 ครั้ง', answer: 6, type: 'tap_count', timeLimit: 5 },
  { text: 'กด 7 ครั้ง', answer: 7, type: 'tap_count', timeLimit: 6 },
  { text: 'กด 8 ครั้ง', answer: 8, type: 'tap_count', timeLimit: 6 },
  { text: 'กด 9 ครั้ง', answer: 9, type: 'tap_count', timeLimit: 7 },
  { text: 'กด 10 ครั้ง', answer: 10, type: 'tap_count', timeLimit: 8 },

  // ── No tap ──
  { text: 'ห้ามกด', answer: 0, type: 'no_tap', timeLimit: 3 },
  { text: 'อย่ากด!', answer: 0, type: 'no_tap', timeLimit: 3 },
  { text: 'อย่าแตะจอ', answer: 0, type: 'no_tap', timeLimit: 4 },
  { text: 'ห้ามสัมผัส', answer: 0, type: 'no_tap', timeLimit: 3 },
  { text: 'มือออก!', answer: 0, type: 'no_tap', timeLimit: 3 },
  { text: 'ใจเย็นๆ อย่ากด', answer: 0, type: 'no_tap', timeLimit: 4 },
  { text: 'หยุด! ห้ามกด', answer: 0, type: 'no_tap', timeLimit: 3 },

  // ── Math ──
  { text: 'กด 2 + 3 ครั้ง', answer: 5, type: 'math', timeLimit: 5 },
  { text: 'กด 3 + 1 ครั้ง', answer: 4, type: 'math', timeLimit: 5 },
  { text: 'กด 5 - 2 ครั้ง', answer: 3, type: 'math', timeLimit: 5 },
  { text: 'กด 10 - 7 ครั้ง', answer: 3, type: 'math', timeLimit: 5 },
  { text: 'กด 2 × 3 ครั้ง', answer: 6, type: 'math', timeLimit: 6 },
  { text: 'กด 4 × 2 ครั้ง', answer: 8, type: 'math', timeLimit: 6 },
  { text: 'กด 6 ÷ 2 ครั้ง', answer: 3, type: 'math', timeLimit: 5 },
  { text: 'กด 8 ÷ 4 ครั้ง', answer: 2, type: 'math', timeLimit: 5 },
  { text: 'กด 1 + 1 + 1 ครั้ง', answer: 3, type: 'math', timeLimit: 5 },
  { text: 'กด 7 + 2 ÷ 1 × 0 ครั้ง', answer: 0, type: 'math', timeLimit: 6 },
  { text: 'กด 3 × 3 - 4 ครั้ง', answer: 5, type: 'math', timeLimit: 6 },
  { text: 'กด 2 × 2 × 2 ครั้ง', answer: 8, type: 'math', timeLimit: 7 },
  { text: 'กด 10 - 3 - 2 ครั้ง', answer: 5, type: 'math', timeLimit: 6 },
  { text: 'กด 9 ÷ 3 + 1 ครั้ง', answer: 4, type: 'math', timeLimit: 6 },
  { text: 'กด 0 × 999 ครั้ง', answer: 0, type: 'math', timeLimit: 4 },
  { text: 'กด 100 ÷ 100 ครั้ง', answer: 1, type: 'math', timeLimit: 5 },
  { text: 'กด 5 + 0 ครั้ง', answer: 5, type: 'math', timeLimit: 5 },
  { text: 'กด 12 - 5 ครั้ง', answer: 7, type: 'math', timeLimit: 6 },
  { text: 'กด 15 ÷ 5 ครั้ง', answer: 3, type: 'math', timeLimit: 5 },
  { text: 'กด 20 ÷ 4 ครั้ง', answer: 5, type: 'math', timeLimit: 5 },

  // ── Syllable ──
  { text: 'บุหรี่ มีกี่พยางค์', answer: 3, type: 'syllable', timeLimit: 5 },
  { text: 'สุขภาพ มีกี่พยางค์', answer: 3, type: 'syllable', timeLimit: 5 },
  { text: 'ออกกำลังกาย มีกี่พยางค์', answer: 5, type: 'syllable', timeLimit: 6 },
  { text: 'ครอบครัว มีกี่พยางค์', answer: 3, type: 'syllable', timeLimit: 5 },
  { text: 'โรงพยาบาล มีกี่พยางค์', answer: 4, type: 'syllable', timeLimit: 5 },
  { text: 'หมอ มีกี่พยางค์', answer: 1, type: 'syllable', timeLimit: 4 },
  { text: 'ประเทศไทย มีกี่พยางค์', answer: 4, type: 'syllable', timeLimit: 5 },
  { text: 'กรุงเทพ มีกี่พยางค์', answer: 3, type: 'syllable', timeLimit: 5 },
  { text: 'มหาวิทยาลัย มีกี่พยางค์', answer: 6, type: 'syllable', timeLimit: 7 },
  { text: 'น้ำ มีกี่พยางค์', answer: 1, type: 'syllable', timeLimit: 4 },
  { text: 'คอมพิวเตอร์ มีกี่พยางค์', answer: 4, type: 'syllable', timeLimit: 5 },
  { text: 'โทรศัพท์ มีกี่พยางค์', answer: 3, type: 'syllable', timeLimit: 5 },

  // ── Animal counting ──
  { text: 'แมว มีกี่ขา', answer: 4, type: 'animal_count', timeLimit: 4 },
  { text: 'ไก่ มีกี่ขา', answer: 2, type: 'animal_count', timeLimit: 4 },
  { text: 'แมงมุม มีกี่ขา', answer: 8, type: 'animal_count', timeLimit: 5 },
  { text: 'งู มีกี่ขา', answer: 0, type: 'animal_count', timeLimit: 4 },
  { text: 'ปลา มีกี่ขา', answer: 0, type: 'animal_count', timeLimit: 4 },
  { text: 'ช้าง มีกี่ขา', answer: 4, type: 'animal_count', timeLimit: 4 },
  { text: 'นก มีกี่ขา', answer: 2, type: 'animal_count', timeLimit: 4 },
  { text: 'กิ้งก่า มีกี่ขา', answer: 4, type: 'animal_count', timeLimit: 5 },
  { text: 'ปลาหมึก มีกี่หนวด', answer: 8, type: 'animal_count', timeLimit: 5 },
  { text: 'ผีเสื้อ มีกี่ปีก', answer: 4, type: 'animal_count', timeLimit: 5 },

  // ── Body parts ──
  { text: 'คนมีกี่แขน', answer: 2, type: 'body_part', timeLimit: 4 },
  { text: 'คนมีกี่ขา', answer: 2, type: 'body_part', timeLimit: 4 },
  { text: 'คนมีกี่ตา', answer: 2, type: 'body_part', timeLimit: 4 },
  { text: 'คนมีกี่นิ้วมือ', answer: 10, type: 'body_part', timeLimit: 5 },
  { text: 'คนมีกี่หู', answer: 2, type: 'body_part', timeLimit: 4 },
  { text: 'คนมีกี่จมูก', answer: 1, type: 'body_part', timeLimit: 4 },
  { text: 'คนมีกี่ปาก', answer: 1, type: 'body_part', timeLimit: 4 },
  { text: 'มือข้างหนึ่งมีกี่นิ้ว', answer: 5, type: 'body_part', timeLimit: 5 },

  // ── Trick questions ──
  { text: 'ถ้าเจอ ก 3 ตัว อย่ากด\nกกก', answer: 0, type: 'trick', timeLimit: 5 },
  { text: 'ถ้าเจอ ก 3 ตัว อย่ากด\nกขก', answer: 2, type: 'trick', timeLimit: 5 },
  { text: 'กาน้ำร้อนเก่ากำลังเดือด\nกด ก ทั้งหมดกี่ตัว', answer: 5, type: 'trick', timeLimit: 7 },
  { text: 'บุหรี่มีกี่ชนิด', answer: 2, type: 'trick', timeLimit: 5 },
  { text: '"ห้ามกด" มีกี่ตัวอักษร', answer: 6, type: 'trick', timeLimit: 5 },
  { text: 'ข้อนี้ห้ามกด 0 ครั้ง', answer: 0, type: 'trick', timeLimit: 4 },
  { text: 'กดเท่ากับจำนวนหัวใจ\nที่คุณเหลือ', answer: -1, type: 'trick', timeLimit: 5 }, // special: resolved at runtime
  { text: 'วันนี้วันที่เท่าไหร่\nกดตามจำนวนนั้น', answer: -2, type: 'trick', timeLimit: 8 }, // special: resolved at runtime
  { text: 'สัปดาห์มีกี่วัน', answer: 7, type: 'trick', timeLimit: 4 },
  { text: 'ปีหนึ่งมีกี่เดือน', answer: 12, type: 'trick', timeLimit: 5 },
  { text: 'หนึ่งวันมีกี่ชั่วโมง', answer: 24, type: 'trick', timeLimit: 6 },
  { text: 'วันหนึ่งมีกี่ชั่วโมง\nแบ่ง 2', answer: 12, type: 'trick', timeLimit: 6 },
  { text: 'ถ้าคำว่า "กด" เป็นสีแดง อย่ากด\nกด', answer: 0, type: 'trick', timeLimit: 5 },
  { text: 'จำนวนสระในคำว่า "เรียน"', answer: 2, type: 'trick', timeLimit: 6 },

  // ── Letter/Character counting ──
  { text: '"กรุงเทพ" มีกี่ตัวอักษร', answer: 7, type: 'letter_count', timeLimit: 6 },
  { text: '"แมว" มีกี่ตัวอักษร', answer: 3, type: 'letter_count', timeLimit: 5 },
  { text: '"สวัสดี" มีกี่ตัวอักษร', answer: 6, type: 'letter_count', timeLimit: 5 },
  { text: '"หมา" มีกี่ตัวอักษร', answer: 3, type: 'letter_count', timeLimit: 5 },
  { text: '"ประเทศไทย" มีกี่ตัวอักษร', answer: 9, type: 'letter_count', timeLimit: 6 },
  { text: '"น้ำ" มีกี่ตัวอักษร', answer: 3, type: 'letter_count', timeLimit: 5 },
  { text: '"เลิกบุหรี่" มีกี่ตัวอักษร', answer: 8, type: 'letter_count', timeLimit: 6 },

  // ── Category counting ──
  { text: 'สีรุ้งมีกี่สี', answer: 7, type: 'category_count', timeLimit: 5 },
  { text: 'ฤดูกาลในไทยมีกี่ฤดู', answer: 3, type: 'category_count', timeLimit: 5 },
  { text: 'ทิศหลักมีกี่ทิศ', answer: 4, type: 'category_count', timeLimit: 5 },
  { text: 'วรรณยุกต์ไทยมีกี่รูป', answer: 4, type: 'category_count', timeLimit: 5 },
  { text: 'สระในภาษาอังกฤษมีกี่ตัว', answer: 5, type: 'category_count', timeLimit: 5 },
  { text: 'เหรียญไทยมีกี่ชนิด', answer: 6, type: 'category_count', timeLimit: 6 },
  { text: 'ดาวเคราะห์มีกี่ดวง', answer: 8, type: 'category_count', timeLimit: 5 },
  { text: 'ทวีปมีกี่ทวีป', answer: 7, type: 'category_count', timeLimit: 5 },
  { text: 'พระเจ้าอยู่หัว ร.9 คือ รัชกาลที่เท่าไหร่', answer: 9, type: 'category_count', timeLimit: 5 },
  { text: 'กดตามจำนวนสัตว์:\nหมา แมว นก', answer: 3, type: 'category_count', timeLimit: 5 },
  { text: 'กดตามจำนวนสัตว์:\nหมา โต๊ะ แมว เก้าอี้ นก', answer: 3, type: 'category_count', timeLimit: 6 },
  { text: 'กดตามจำนวนผลไม้:\nแอปเปิ้ล กล้วย ส้ม หมา', answer: 3, type: 'category_count', timeLimit: 6 },
  { text: 'กดตามจำนวนสัตว์:\nช้าง รถ เรือ ม้า แมว', answer: 3, type: 'category_count', timeLimit: 6 },

  // ── Patterned (follow-up) ──
  { text: 'จำคำว่า "แมว"\nกด 1 ครั้ง', answer: 1, type: 'patterned', timeLimit: 4,
    pattern: { followUpIn: 3, followUpText: 'คำที่ให้จำ มีกี่ตัวอักษร', followUpAnswer: 3, followUpTime: 5 } },
  { text: 'จำเลข 5\nกด 2 ครั้ง', answer: 2, type: 'patterned', timeLimit: 4,
    pattern: { followUpIn: 2, followUpText: 'กดตามเลขที่ให้จำ', followUpAnswer: 5, followUpTime: 5 } },
  { text: 'จำเลข 3\nกด 1 ครั้ง', answer: 1, type: 'patterned', timeLimit: 4,
    pattern: { followUpIn: 4, followUpText: 'เลขที่จำได้ × 2 = ?', followUpAnswer: 6, followUpTime: 6 } },
  { text: 'จำคำว่า "บุหรี่"\nกด 3 ครั้ง', answer: 3, type: 'patterned', timeLimit: 5,
    pattern: { followUpIn: 2, followUpText: 'คำที่ให้จำ มีกี่พยางค์', followUpAnswer: 3, followUpTime: 5 } },
  { text: 'จำเลข 7\nห้ามกด', answer: 0, type: 'patterned', timeLimit: 4,
    pattern: { followUpIn: 3, followUpText: 'กดตามเลขที่จำได้ - 2', followUpAnswer: 5, followUpTime: 6 } },
  { text: 'จำเลข 4\nกด 2 ครั้ง', answer: 2, type: 'patterned', timeLimit: 4,
    pattern: { followUpIn: 5, followUpText: 'เลขที่จำ + 4 = ?', followUpAnswer: 8, followUpTime: 6 } },
  { text: 'จำคำว่า "ไก่"\nกด 1 ครั้ง', answer: 1, type: 'patterned', timeLimit: 4,
    pattern: { followUpIn: 2, followUpText: 'สัตว์ที่ให้จำ มีกี่ขา', followUpAnswer: 2, followUpTime: 5 } },
  { text: 'จำเลข 9\nกด 3 ครั้ง', answer: 3, type: 'patterned', timeLimit: 5,
    pattern: { followUpIn: 3, followUpText: 'กดตามเลขที่จำ ÷ 3', followUpAnswer: 3, followUpTime: 6 } },
  { text: 'จำสี "เขียว"\nกด 2 ครั้ง', answer: 2, type: 'patterned', timeLimit: 4,
    pattern: { followUpIn: 4, followUpText: 'คำสีที่จำได้ มีกี่ตัวอักษร', followUpAnswer: 5, followUpTime: 6 } },
  { text: 'จำเลข 6\nกด 1 ครั้ง', answer: 1, type: 'patterned', timeLimit: 4,
    pattern: { followUpIn: 2, followUpText: 'เลขที่จำ - 1 = ?', followUpAnswer: 5, followUpTime: 5 } },
];

// ────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────

export default function TapChallengeGame() {
  const { addXP } = useGamification();
  const { playClick, playCorrect, playWrong, playWin, playLose } = useAppSounds();

  const [gameState, setGameState] = useState<'idle' | 'playing' | 'feedback' | 'gameover'>('idle');
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [currentChallenge, setCurrentChallenge] = useState<Challenge | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [streak, setStreak] = useState(0);

  // Pattern queue: challenges to inject at specific indices
  const patternQueueRef = useRef<{ atIndex: number; challenge: Challenge }[]>([]);
  const challengeIndexRef = useRef(0);
  const usedIndicesRef = useRef<Set<number>>(new Set());
  const timerRef = useRef<any>(null);
  const livesRef = useRef(3);
  const tapCountRef = useRef(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;

  const getRandomChallenge = useCallback((): Challenge => {
    // Check pattern queue first
    const pq = patternQueueRef.current;
    const idx = challengeIndexRef.current;
    const patternMatch = pq.findIndex(p => p.atIndex === idx);
    if (patternMatch !== -1) {
      const c = pq[patternMatch].challenge;
      pq.splice(patternMatch, 1);
      return c;
    }

    // Pick random from bank
    let tries = 0;
    let pick: Challenge;
    const hasPendingPattern = pq.length > 0;

    do {
      const i = Math.floor(Math.random() * CHALLENGE_BANK.length);
      pick = { ...CHALLENGE_BANK[i] };
      tries++;
    } while (
      (usedIndicesRef.current.has(CHALLENGE_BANK.indexOf(pick)) || (hasPendingPattern && pick.pattern))
      && tries < 50
    );

    // Resolve runtime specials
    if (pick.answer === -1) {
      pick.answer = livesRef.current;
    }
    if (pick.answer === -2) {
      pick.answer = new Date().getDate();
      pick.timeLimit = Math.max(7, pick.answer > 15 ? 12 : 8);
    }
    
    // Ensure all challenges have at least 7 seconds
    pick.timeLimit = Math.max(7, pick.timeLimit);

    // If patterned, schedule follow-up
    if (pick.pattern) {
      const followUp: Challenge = {
        text: pick.pattern.followUpText,
        answer: pick.pattern.followUpAnswer,
        type: 'patterned',
        timeLimit: pick.pattern.followUpTime,
      };
      patternQueueRef.current.push({
        atIndex: idx + pick.pattern.followUpIn,
        challenge: followUp,
      });
    }

    return pick;
  }, []);

  const startGame = () => {
    playClick();
    setLives(3);
    livesRef.current = 3;
    setScore(0);
    setStreak(0);
    challengeIndexRef.current = 0;
    patternQueueRef.current = [];
    usedIndicesRef.current.clear();
    nextChallenge();
    setGameState('playing');
  };

  const nextChallenge = () => {
    challengeIndexRef.current++;
    const c = getRandomChallenge();
    setCurrentChallenge(c);
    setTapCount(0);
    tapCountRef.current = 0;
    setTimeLeft(c.timeLimit);
    setFeedback(null);
    progressAnim.setValue(1);
  };

  // Timer countdown
  useEffect(() => {
    if (gameState !== 'playing' || !currentChallenge) return;

    const totalMs = currentChallenge.timeLimit * 1000;
    const startTime = Date.now();

    Animated.timing(progressAnim, {
      toValue: 0,
      duration: totalMs,
      useNativeDriver: false,
    }).start();

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, totalMs - elapsed);
      setTimeLeft(Math.ceil(remaining / 1000));

      if (remaining <= 0) {
        clearInterval(timerRef.current);
        evaluateAnswer();
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentChallenge, gameState]);

  const handleTap = () => {
    if (gameState !== 'playing') return;
    
    // Pulse animation
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.92, duration: 50, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    tapCountRef.current++;
    setTapCount(tapCountRef.current);
    playClick();
  };

  const evaluateAnswer = () => {
    if (!currentChallenge) return;
    if (timerRef.current) clearInterval(timerRef.current);
    
    const isCorrect = tapCountRef.current === currentChallenge.answer;

    if (isCorrect) {
      playCorrect();
      setFeedback('correct');
      setScore(prev => prev + 1);
      setStreak(prev => prev + 1);
    } else {
      playWrong();
      setFeedback('wrong');
      const newLives = livesRef.current - 1;
      livesRef.current = newLives;
      setLives(newLives);
      setStreak(0);

      if (newLives <= 0) {
        setGameState('gameover');
        playLose();
        const finalScore = score + (isCorrect ? 1 : 0);
        if (finalScore > 0) {
          const xpEarned = Math.min(50, finalScore * 3);
          addXP(xpEarned, `ชาเลนจ์แตะ: ทำได้ ${finalScore} ข้อ`);
        }
        return;
      }
    }

    setGameState('feedback');
    setTimeout(() => {
      setGameState('playing');
      nextChallenge();
    }, 1200);
  };

  // Render hearts
  const renderHearts = () => {
    const hearts = [];
    for (let i = 0; i < 3; i++) {
      hearts.push(
        <MaterialCommunityIcons 
          key={i} 
          name={i < lives ? "heart" : "heart-outline"} 
          size={24} 
          color={i < lives ? "#ef4444" : "#94a3b8"} 
          style={{ marginHorizontal: 2 }} 
        />
      );
    }
    return hearts;
  };

  // Progress ring color
  const progressColor = progressAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: ['#ef4444', '#fbbf24', '#34d399'],
  });

  return (
    <View style={styles.container}>
      {gameState === 'idle' && (
        <View style={styles.idleContainer}>
          <View style={styles.titleRow}>
            <Feather name="target" size={32} color="#ef4444" />
            <Text style={[styles.title, { marginBottom: 0 }]}>ชาเลนจ์แตะ</Text>
          </View>
          <Text style={styles.desc}>
            กดปุ่มตามคำสั่งที่ปรากฏ!{'\n'}
            คุณมี 3 หัวใจ — ตอบผิดจะเสียหัวใจ{'\n'}
            เล่นไปเรื่อยๆ จนกว่าหัวใจจะหมด
          </Text>
          <Pressable style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>เริ่มเล่น</Text>
          </Pressable>
        </View>
      )}

      {(gameState === 'playing' || gameState === 'feedback') && currentChallenge && (
        <View style={styles.playContainer}>
          {/* Header */}
          <View style={styles.playHeader}>
            <View style={styles.heartsRow}>{renderHearts()}</View>
            <Text style={styles.scoreDisplay}>ข้อ: {score}</Text>
            {streak >= 3 && (
              <View style={[styles.streakBadge, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                <MaterialCommunityIcons name="fire" size={16} color="#f59e0b" />
                <Text style={{ color: '#f59e0b', fontWeight: '700' }}>{streak}</Text>
              </View>
            )}
          </View>

          {/* Challenge Text */}
          <Text style={styles.challengeText}>
            {currentChallenge.text}
          </Text>

          {/* Big Circle Button */}
          <View style={styles.circleContainer}>
            <Animated.View style={[styles.progressRing, {
              borderColor: progressColor,
              borderWidth: 6,
              transform: [{ scale: pulseAnim }],
            }]}>
              <Pressable
                style={[
                  styles.circleButton,
                  feedback === 'correct' && styles.circleCorrect,
                  feedback === 'wrong' && styles.circleWrong,
                ]}
                onPress={gameState === 'playing' ? handleTap : undefined}
              >
                {feedback ? (
                  <Feather 
                    name={feedback === 'correct' ? 'check-circle' : 'x-circle'} 
                    size={64} 
                    color={feedback === 'correct' ? '#22c55e' : '#ef4444'} 
                  />
                ) : (
                  <>
                    <Text style={styles.tapCountText}>{tapCount}</Text>
                    <Text style={styles.tapLabel}>แตะ</Text>
                  </>
                )}
              </Pressable>
            </Animated.View>
          </View>

          {/* Timer */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="clock" size={18} color={timeLeft <= 2 ? '#ef4444' : '#475569'} />
            <Text style={[styles.timerText, timeLeft <= 2 && { color: '#ef4444' }]}>
              {timeLeft} วินาที
            </Text>
          </View>

          {/* Feedback overlay */}
          {feedback && (
            <View style={styles.feedbackOverlay}>
              <View style={styles.feedbackTextContainer}>
                <Feather 
                  name={feedback === 'correct' ? 'check-circle' : 'x-circle'} 
                  size={18} 
                  color={feedback === 'correct' ? '#22c55e' : '#ef4444'} 
                />
                <Text style={[styles.feedbackText, { color: feedback === 'correct' ? '#22c55e' : '#ef4444' }]}>
                  {feedback === 'correct' ? 'ถูกต้อง!' : `ผิด! (คำตอบ: ${currentChallenge.answer})`}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {gameState === 'gameover' && (
        <View style={styles.idleContainer}>
          <MaterialCommunityIcons name="heart-broken" size={64} color="#ef4444" style={{ marginBottom: 16 }} />
          <Text style={styles.title}>Game Over</Text>
          <Text style={styles.gameOverScore}>คุณทำได้ {score} ข้อ!</Text>
          <Pressable style={styles.startButton} onPress={startGame}>
            <Text style={styles.startButtonText}>เล่นอีกครั้ง</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  
  // ── Idle / Game Over ──
  idleContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#1e293b', marginBottom: 12, textAlign: 'center' },
  desc: { fontSize: 15, color: '#475569', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  startButton: {
    backgroundColor: '#38bdf8', paddingHorizontal: 40, paddingVertical: 16,
    borderRadius: 30, shadowColor: '#38bdf8', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  startButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  gameOverScore: { fontSize: 20, fontWeight: '700', color: '#38bdf8', marginBottom: 32 },
  
  // ── Playing ──
  playContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  playHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', marginBottom: 24, paddingHorizontal: 8,
  },
  heartsRow: { flexDirection: 'row', gap: 4 },
  scoreDisplay: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  streakBadge: { backgroundColor: 'rgba(245,158,11,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  
  challengeText: {
    fontSize: 18, fontWeight: '700', color: '#1e293b', textAlign: 'center',
    marginBottom: 32, lineHeight: 28, minHeight: 60,
  },
  
  // ── Circle Button ──
  circleContainer: { marginBottom: 24 },
  progressRing: {
    width: CIRCLE_SIZE + 16,
    height: CIRCLE_SIZE + 16,
    borderRadius: (CIRCLE_SIZE + 16) / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleButton: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: '#f0fdfa',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  circleCorrect: { backgroundColor: '#dcfce7', borderColor: '#22c55e' },
  circleWrong: { backgroundColor: '#fef2f2', borderColor: '#ef4444' },
  tapCountText: { fontSize: 56, fontWeight: '800', color: '#1e293b' },
  tapLabel: { fontSize: 14, color: '#64748b', marginTop: -4 },
  
  timerText: { fontSize: 18, fontWeight: '700', color: '#475569' },
  
  feedbackOverlay: {
    position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center',
  },
  feedbackTextContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 16, overflow: 'hidden',
  },
  feedbackText: {
    fontSize: 16, fontWeight: '700',
  },
});
