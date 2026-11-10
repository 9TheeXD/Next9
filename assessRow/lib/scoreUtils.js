export function getScoreLevel(score) {
  if (score === null || score === undefined || score === 0) return 0;
  
  if (score >= 4.80) return 5;
  if (score >= 3.80) return 4;
  if (score >= 2.80) return 3;
  if (score >= 1.80) return 2;
  return 1;
}

export const SCORE_LABELS = {
  0: '-',
  1: 'ไม่ผ่าน',
  2: 'ปรับปรุง',
  3: 'พอใช้',
  4: 'ดี',
  5: 'ดีมาก',
};

export function getScoreLabel(score) {
  const level = getScoreLevel(score);
  return SCORE_LABELS[level] || '-';
}
