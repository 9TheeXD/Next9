import re

def update_gamification_context():
    with open("src/contexts/GamificationContext.tsx", "r") as f:
        content = f.read()

    # Add perfectQuizzes to context interface
    content = content.replace(
        "  clearToast: () => void;\n}",
        "  clearToast: () => void;\n  perfectQuizzes: string[];\n  markQuizPerfect: (quizId: string) => void;\n}"
    )

    # Add storage key
    content = content.replace(
        'const XP_STORAGE_KEY = "@ciga_user_xp";',
        'const XP_STORAGE_KEY = "@ciga_user_xp";\nconst PERFECT_QUIZ_KEY = "@ciga_perfect_quizzes";'
    )

    # Add state in Provider
    content = content.replace(
        '  const [activeToast, setActiveToast] = useState<ToastData | null>(null);',
        '  const [activeToast, setActiveToast] = useState<ToastData | null>(null);\n  const [perfectQuizzes, setPerfectQuizzes] = useState<string[]>([]);'
    )

    # Add load logic
    load_logic_old = """      try {
        const storedXp = await AsyncStorage.getItem(XP_STORAGE_KEY);
        if (storedXp !== null) {
          setXp(parseInt(storedXp, 10));
        }
      } catch (e) {
        console.error("Failed to load XP", e);
      }"""
    load_logic_new = """      try {
        const storedXp = await AsyncStorage.getItem(XP_STORAGE_KEY);
        if (storedXp !== null) {
          setXp(parseInt(storedXp, 10));
        }
        const storedQuizzes = await AsyncStorage.getItem(PERFECT_QUIZ_KEY);
        if (storedQuizzes !== null) {
          setPerfectQuizzes(JSON.parse(storedQuizzes));
        }
      } catch (e) {
        console.error("Failed to load Gamification data", e);
      }"""
    content = content.replace(load_logic_old, load_logic_new)

    # Add markQuizPerfect method
    clear_toast_method = """  const clearToast = useCallback(() => {
    setActiveToast(null);
  }, []);"""
    mark_perfect_method = """  const clearToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  const markQuizPerfect = useCallback(async (quizId: string) => {
    setPerfectQuizzes((prev) => {
      if (prev.includes(quizId)) return prev;
      const next = [...prev, quizId];
      AsyncStorage.setItem(PERFECT_QUIZ_KEY, JSON.stringify(next)).catch(console.error);
      return next;
    });
  }, []);"""
    content = content.replace(clear_toast_method, mark_perfect_method)

    # Expose in Provider
    content = content.replace(
        '        clearToast,\n      }}',
        '        clearToast,\n        perfectQuizzes,\n        markQuizPerfect,\n      }}'
    )

    with open("src/contexts/GamificationContext.tsx", "w") as f:
        f.write(content)

def update_quiz_file():
    with open("src/app/quiz/[id].tsx", "r") as f:
        content = f.read()

    # Get from hook
    content = content.replace(
        'const { addXP } = useGamification();',
        'const { addXP, perfectQuizzes, markQuizPerfect } = useGamification();'
    )

    # Update logic
    old_xp_logic = """        if (finalScore === quiz.questions.length) {
          addXP(100, "ตอบคำถามถูกต้องทั้งหมด! รับ XP พิเศษ");
        } else {
          addXP(20, "ทำแบบทดสอบเสร็จสิ้น! รับ XP พิเศษ");
        }"""
        
    new_xp_logic = """        if (finalScore === quiz.questions.length) {
          if (!perfectQuizzes.includes(quiz.id)) {
            markQuizPerfect(quiz.id);
            addXP(quiz.questions.length * 100, "โบนัสตอบถูกทุกข้อครั้งแรก!");
          } else {
            addXP(2, "ทบทวนแบบทดสอบเสร็จสิ้น (ได้คะแนนเต็ม)");
          }
        } else {
          addXP(2, "ทำแบบทดสอบเสร็จสิ้น (ยังไม่ผ่านทุกข้อ)");
        }"""
    content = content.replace(old_xp_logic, new_xp_logic)
    
    # Update end message
    content = content.replace(
        '              ? "ยอดเยี่ยม! คุณตอบถูกหมดเลย รับโบนัส 100 XP"\n              : "เก่งมาก! ความรู้จะช่วยให้คุณเลิกบุหรี่ได้สำเร็จ"',
        '              ? (perfectQuizzes.includes(quiz.id) ? "ยอดเยี่ยม! คุณยังจำเนื้อหาได้ดีเยี่ยม" : `ยอดเยี่ยม! คุณตอบถูกหมดเลย รับโบนัส ${quiz.questions.length * 100} XP`)\n              : "เก่งมาก! ความรู้จะช่วยให้คุณเลิกบุหรี่ได้สำเร็จ"'
    )

    with open("src/app/quiz/[id].tsx", "w") as f:
        f.write(content)

def update_knowledge_file():
    with open("src/app/(tabs)/knowledge.tsx", "r") as f:
        content = f.read()

    # Add GamificationContext import
    content = content.replace(
        'import { useRouter } from "expo-router";',
        'import { useRouter } from "expo-router";\nimport { useGamification } from "@/contexts/GamificationContext";'
    )
    
    # Add GamificationContext hook
    content = content.replace(
        '  const router = useRouter();',
        '  const router = useRouter();\n  const { perfectQuizzes } = useGamification();'
    )

    # Find the quiz mapping and update card rendering
    # We will search for '<View style={styles.quizInfo}>'
    # and put a checkmark icon next to the title if perfect
    
    old_card = """                  <View style={styles.quizIconContainer}>
                    <Text style={styles.quizIcon}>{quiz.icon}</Text>
                  </View>
                  <View style={styles.quizInfo}>
                    <Text style={styles.quizTitle}>{quiz.title}</Text>
                    <Text style={styles.quizSubtitle}>{quiz.questions.length} คำถาม</Text>
                  </View>"""
    
    new_card = """                  <View style={styles.quizIconContainer}>
                    <Text style={styles.quizIcon}>{quiz.icon}</Text>
                  </View>
                  <View style={styles.quizInfo}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={styles.quizTitle}>{quiz.title}</Text>
                      {perfectQuizzes.includes(quiz.id) && (
                        <Feather name="check-circle" size={16} color="#34d399" />
                      )}
                    </View>
                    <Text style={styles.quizSubtitle}>
                      {quiz.questions.length} คำถาม {perfectQuizzes.includes(quiz.id) && " • ถูกต้องทั้งหมดแล้ว"}
                    </Text>
                  </View>"""
                  
    content = content.replace(old_card, new_card)

    with open("src/app/(tabs)/knowledge.tsx", "w") as f:
        f.write(content)

update_gamification_context()
update_quiz_file()
update_knowledge_file()
