export const HEALTH_MILESTONES = [
  {
    hours: 0.33, // 20 minutes
    title: "ความดันโลหิตเป็นปกติ",
    description: "ความดันโลหิตและอัตราการเต้นของหัวใจเริ่มกลับสู่สภาวะปกติ",
    icon: "heart",
    color: "#be123c",
  },
  {
    hours: 8,
    title: "ระดับออกซิเจนฟื้นตัว",
    description: "ระดับนิโคตินและคาร์บอนมอนอกไซด์ในเลือดลดลงครึ่งหนึ่ง ระดับออกซิเจนกลับสู่ปกติ",
    icon: "wind",
    color: "#0369a1",
  },
  {
    hours: 24,
    title: "ความเสี่ยงหัวใจวายลดลง",
    description: "คาร์บอนมอนอกไซด์ถูกกำจัดออกจากร่างกาย ปอดเริ่มขับเสมหะและสิ่งตกค้างออก",
    icon: "activity",
    color: "#b45309",
  },
  {
    hours: 48,
    title: "การรับรู้กลิ่นและรสชาติดีขึ้น",
    description: "ร่างกายของคุณปราศจากนิโคตินแล้ว ความสามารถในการรับรสและกลิ่นจะเริ่มดีขึ้นอย่างเห็นได้ชัด",
    icon: "smile",
    color: "#a21caf",
  },
  {
    hours: 72,
    title: "หายใจสะดวกขึ้น",
    description: "หลอดลมของคุณเริ่มคลายตัว ทำให้หายใจได้ง่ายขึ้น ระดับพลังงานก็เพิ่มขึ้น",
    icon: "cloud",
    color: "#4338ca",
  },
  {
    hours: 336, // 14 days
    title: "ระบบไหลเวียนโลหิตดีขึ้น",
    description: "ระบบไหลเวียนเลือดดีขึ้นอย่างเห็นได้ชัด การเดินและการทำกิจกรรมทางกายทำได้ง่ายขึ้น",
    icon: "navigation",
    color: "#1d4ed8",
  },
  {
    hours: 720, // 30 days
    title: "การทำงานของปอดเพิ่มขึ้น 30%",
    description: "การทำงานของปอดของคุณเพิ่มขึ้นถึง 30% อาการไอและหายใจไม่อิ่มจะลดลงอย่างต่อเนื่อง",
    icon: "trending-up",
    color: "#15803d",
  },
  {
    hours: 2160, // 90 days
    title: "ระบบภูมิคุ้มกันฟื้นตัว",
    description: "ระบบไหลเวียนโลหิตดีขึ้นมากและระบบภูมิคุ้มกันของคุณกำลังฟื้นตัว",
    icon: "shield",
    color: "#b91c1c",
  },
  {
    hours: 8760, // 1 year
    title: "ความเสี่ยงโรคหัวใจลดลงครึ่งหนึ่ง",
    description: "ความเสี่ยงโรคหลอดเลือดหัวใจของคุณลดลงเหลือประมาณครึ่งหนึ่งของผู้ที่สูบบุหรี่",
    icon: "award",
    color: "#c2410c",
  },
];

/**
 * Returns health milestones with an `achieved` flag based on
 * how many hours since the user's quit date.
 */
export function getHealthTimeline(quitDate: string | null) {
  if (!quitDate) {
    return HEALTH_MILESTONES.map((m) => ({ ...m, achieved: false }));
  }

  const hoursSinceQuit =
    (Date.now() - new Date(quitDate).getTime()) / (1000 * 60 * 60);

  return HEALTH_MILESTONES.map((m) => ({
    ...m,
    achieved: hoursSinceQuit >= m.hours,
  }));
}
