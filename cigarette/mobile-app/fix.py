import os
filepath = "/home/cmp/sdh-council/cigarette/mobile-app/src/lib/api.ts"
with open(filepath, "r") as f:
    content = f.read()

content = content.replace("""  submitQuiz: (data: { topicId: string; score: number; totalQuestions: number }) =>
    request("/quiz", { method: "POST", body: JSON.stringify(data) }),

  // ── Community / Chat ─────────────────────────────""", """  postQuizResult: (data: {
    quizId: string;
    score: number;
    maxScore: number;
  }) => request("/quizzes", { method: "POST", body: JSON.stringify(data) }),

  submitQuiz: (data: { topicId: string; score: number; totalQuestions: number }) =>
    request("/quiz", { method: "POST", body: JSON.stringify(data) }),

  // ── Community / Chat ─────────────────────────────""")

with open(filepath, "w") as f:
    f.write(content)
