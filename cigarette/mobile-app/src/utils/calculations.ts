/**
 * Calculate money saved based on cigarettes avoided.
 */
export function calculateMoneySaved(
  cigarettesAvoided: number,
  pricePerPack: number,
  cigarettesPerPack: number = 20
): number {
  const pricePerCigarette = pricePerPack / cigarettesPerPack;
  return Math.round(cigarettesAvoided * pricePerCigarette * 100) / 100;
}

/**
 * Calculate current streak of smoke-free days (0 cigarettes).
 * Expects logs sorted by date descending (most recent first).
 */
export function calculateStreak(
  logs: Array<{ logDate: string; cigarettesSmoked: number }>
): { currentStreak: number; longestStreak: number } {
  if (logs.length === 0) return { currentStreak: 0, longestStreak: 0 };

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  // Iterate from most recent to oldest
  for (const log of logs) {
    if (log.cigarettesSmoked === 0) {
      tempStreak++;
      if (currentStreak === 0 || currentStreak === tempStreak - 1) {
        currentStreak = tempStreak;
      }
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      if (tempStreak === currentStreak && currentStreak > 0) {
        // Streak broken before current, stop counting current
      }
      tempStreak = 0;
    }
  }

  return { currentStreak, longestStreak };
}

/**
 * Get a motivational message based on the cigarette count for the day.
 */
export function getMotivationalMessage(
  count: number,
  baseline: number | null
): string {
  if (count === 0) {
    return "ยอดเยี่ยมมาก! วันนี้ไม่สูบบุหรี่เลย คุณคือแชมป์เปี้ยน!";
  }

  if (baseline && baseline > 0) {
    const reduction = Math.round(((baseline - count) / baseline) * 100);
    if (reduction > 50) {
      return `ลดลง ${reduction}% จากจำนวนพื้นฐานของคุณ ทำต่อไปนะ!`;
    }
  }

  if (count <= 3) {
    return "ทำได้ดีมากที่สูบน้อยลง ทุกมวนที่คุณลดได้มีความหมาย!";
  }

  if (count <= 10) {
    return "คุณกำลังก้าวหน้า พรุ่งนี้ต้องดีกว่าเดิมแน่นอน!";
  }

  return "การเลิกบุหรี่มันยาก แต่คุณก็มาถึงจุดนี้แล้ว พยายามใหม่อีกครั้งในวันพรุ่งนี้นะ!";
}

/**
 * Format a number as currency.
 */
export function formatCurrency(amount: number): string {
  return `${amount.toFixed(2)} บาท`;
}

/**
 * Get current date string (YYYY-MM-DD) in Bangkok time (UTC+7)
 */
export function getBangkokDateString(): string {
  const now = new Date();
  const bkkTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const year = bkkTime.getUTCFullYear();
  const month = String(bkkTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(bkkTime.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
