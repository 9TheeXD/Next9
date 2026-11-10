import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, SafeAreaView, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { QUIZ_BANK } from "@/utils/quizBank";
import { api } from "@/lib/api";
import { useGamification } from "@/contexts/GamificationContext";
import { useAppSounds } from "@/hooks/useAppSounds";

export default function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { addXP, perfectQuizzes, markQuizPerfect, completeDailyMission } = useGamification();
  const { playCorrect, playWrong, playWin, playClick, playNav } = useAppSounds();
  const router = useRouter();
  const quiz = QUIZ_BANK.find((q) => q.id === id);

  const shuffledQuestions = useMemo(() => {
    if (!quiz) return [];
    return [...quiz.questions].sort(() => Math.random() - 0.5);
  }, [quiz]);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [earnedBonusThisTime, setEarnedBonusThisTime] = useState(false);

  const handleClose = () => {
    playNav();
    router.replace("/(tabs)/knowledge?tab=QUIZ" as any);
  };

  if (!quiz) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Quiz not found.</Text>
          <Pressable style={styles.backButton} onPress={handleClose}>
            <Feather name="x" size={20} color="#1e293b" />
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const question = shuffledQuestions[currentQuestionIndex];
  const isAnswered = selectedOption !== null;
  const isCorrect = selectedOption === question.correctAnswerIndex;

  const handleSelectOption = (index: number) => {
    if (isAnswered) return;
    setSelectedOption(index);
    if (index === question.correctAnswerIndex) {
      setScore((prev) => prev + 1);
      playCorrect();
    } else {
      playWrong();
    }
  };

  const handleNext = async () => {
    playClick();
    if (currentQuestionIndex < shuffledQuestions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedOption(null);
    } else {
      // Finish quiz
      setSubmitting(true);
      const finalScore = score;
      try {
        if (finalScore === shuffledQuestions.length) {
          if (!perfectQuizzes.includes(quiz.id)) {
            markQuizPerfect(quiz.id);
            setEarnedBonusThisTime(true);
            addXP(shuffledQuestions.length * 100, "ทำคะแนนเต็มได้สำเร็จ! รับโบนัสพิเศษ");
          } else {
            addXP(5, "ทบทวนแบบทดสอบเสร็จสิ้น");
          }
        } else {
          addXP(score * 10, `ตอบถูก ${score}/${shuffledQuestions.length} ข้อ!`);
        }
        completeDailyMission('quiz');
        await api.postQuizResult({
          quizId: quiz.id,
          score: finalScore,
          maxScore: shuffledQuestions.length,
        });
        api.postActionLog({
          action: "QUIZ_COMPLETE",
          details: `ทำแบบทดสอบ: ${quiz.title} ได้ ${finalScore}/${shuffledQuestions.length} คะแนน`,
        }).catch(() => {});
      } catch (err) {
        // fail silently for now
      } finally {
        setSubmitting(false);
        setIsFinished(true);
        if (finalScore === shuffledQuestions.length) playWin();
      }
    }
  };

  if (isFinished) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.emojiIcon}>{quiz.icon}</Text>
          <Text style={styles.title}>ทำแบบทดสอบเสร็จสิ้น!</Text>
          <Text style={styles.scoreText}>
            คุณได้คะแนน {score} จาก {shuffledQuestions.length}
          </Text>
          <Text style={styles.subtitle}>
            {earnedBonusThisTime
              ? `ยอดเยี่ยม! คุณตอบถูกหมดเลย ได้รับโบนัส ${shuffledQuestions.length * 100} XP`
              : score === shuffledQuestions.length
              ? "ยอดเยี่ยม! คุณยังจำเนื้อหาได้ดีเยี่ยม ได้รับ 2 XP สำหรับการทบทวน"
              : "เก่งมาก! ความรู้จะช่วยให้คุณเลิกบุหรี่ได้สำเร็จ ได้รับ 2 XP เป็นกำลังใจ"}
          </Text>
          <Pressable style={styles.button} onPress={() => router.replace("/(tabs)/knowledge?tab=QUIZ" as any)}>
            <Text style={styles.buttonText}>กลับไปที่ความรู้</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={handleClose} style={styles.backButton}>
          <Feather name="x" size={20} color="#64748b" />
        </Pressable>
        <Text style={styles.headerTitle}>{quiz.title}</Text>
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            {currentQuestionIndex + 1} / {shuffledQuestions.length}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.questionCard}>
          <Text style={styles.questionText}>{question.question}</Text>
        </View>

        <View style={styles.optionsContainer}>
          {question.options.map((opt, idx) => {
            let bgColor = "#f0fdfa";
            let borderColor = "rgba(0,0,0,0.1)";

            if (isAnswered) {
              if (idx === question.correctAnswerIndex) {
                bgColor = "rgba(52,211,153,0.15)";
                borderColor = "#34d399";
              } else if (idx === selectedOption) {
                bgColor = "rgba(248,113,113,0.15)";
                borderColor = "#f87171";
              }
            } else if (idx === selectedOption) {
              bgColor = "rgba(56,189,248,0.2)";
              borderColor = "#38bdf8";
            }

            return (
              <Pressable
                key={idx}
                style={[
                  styles.optionButton,
                  { backgroundColor: bgColor, borderColor },
                ]}
                onPress={() => handleSelectOption(idx)}
                disabled={isAnswered}
              >
                <Text style={styles.optionText}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>

        {isAnswered && (
          <View style={styles.explanationCard}>
            <Text
              style={[
                styles.resultTitle,
                { color: isCorrect ? "#34d399" : "#f87171" },
              ]}
            >
              {isCorrect ? "Correct!" : "Not quite!"}
            </Text>
            <Text style={styles.explanationText}>{question.explanation}</Text>
          </View>
        )}
      </ScrollView>

      {isAnswered && (
        <View style={styles.footer}>
          <Pressable
            style={[styles.nextButton, submitting && styles.disabledButton]}
            onPress={handleNext}
            disabled={submitting}
          >
            <Text style={styles.nextButtonText}>
              {currentQuestionIndex === shuffledQuestions.length - 1
                ? "Finish Quiz"
                : "Next Question"}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f0fdfa" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { fontSize: 18, color: "#1e293b", marginBottom: 16 },
  button: { paddingVertical: 14, paddingHorizontal: 32, backgroundColor: "#38bdf8", borderRadius: 16 },
  buttonText: { fontSize: 16, fontWeight: "700", color: "#ffffff" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#1e293b" },
  progressContainer: { padding: 8 },
  progressText: { fontSize: 14, fontWeight: "600", color: "#7dd3fc" },

  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  questionCard: {
    marginBottom: 32,
  },
  questionText: { fontSize: 22, fontWeight: "700", color: "#1e293b", lineHeight: 30 },
  
  optionsContainer: { gap: 12 },
  optionButton: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  optionText: { fontSize: 16, color: "#1e293b", fontWeight: "500" },

  explanationCard: {
    marginTop: 32,
    padding: 20,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  resultTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
  explanationText: { fontSize: 14, color: "rgba(0,0,0,0.6)", lineHeight: 22 },

  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.04)",
  },
  nextButton: {
    backgroundColor: "#38bdf8",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  disabledButton: { opacity: 0.5 },
  nextButtonText: { fontSize: 16, fontWeight: "700", color: "#ffffff" },

  emojiIcon: { fontSize: 64, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: "800", color: "#1e293b", marginBottom: 12 },
  scoreText: { fontSize: 20, fontWeight: "700", color: "#34d399", marginBottom: 8 },
  subtitle: { fontSize: 15, color: "#475569", textAlign: "center", marginBottom: 32 },
});
