import { getBangkokDateString } from './calculations';
import { MISSION_TRACKS_50, CatalogTrack, MissionContext } from './missionCatalog';

export interface MicroSurveyQuestion {
  id: string;
  question: string;
  options: { text: string; value: any }[];
}

export interface AdaptiveMission {
  id: string;
  date: string;
  trackId: string;
  trackName: string;
  title: string;
  timeWindow: string;
  headline: string;
  subDirective: string;
  directive: string;
  calculatedReason: string;
  scientificTip: string;
  type: 'action' | 'micro_survey';
  surveyQuestions?: MicroSurveyQuestion[];
  xpReward: number;
  status: 'pending' | 'completed' | 'failed';
  completedAt?: string;
  feedbackNote?: string;
}

export interface MissionHistoryRecord {
  date: string;
  missionId: string;
  trackId: string;
  status: 'completed' | 'failed' | 'ignored';
  completedAt?: string;
}

/**
 * Deterministic Adaptive Daily Quitting Mission Engine.
 * 
 * Powered by 50 Clinical Behavioral & Physiological Tracks (1,000 sub-action variations).
 * Grounded in WHO (2024), CDC, NHS NCSCT, and Michie et al. BCT Taxonomy.
 * Deep multi-factorial selection computed from:
 * 1. FTND Morning Delay & Physical Addiction
 * 2. Circadian Craving Windows (Morning, Midday, Afternoon, Evening, Bedtime)
 * 3. Daily Tracking Logs (Actual count vs baseline, craving frequency, emotional valence/mood)
 * 4. Longitudinal Performance (Streaks, relapse risk, slip recovery)
 * 5. Smoking Medium (Pod/e-cig vs combustible cigarette)
 * 6. Progressive Non-Repeating Sequence Index
 */
export function calculateDailyAdaptiveMission(params: {
  user: any;
  surveyResponse: any;
  recentLogs: any[];
  history: MissionHistoryRecord[];
  lastMicroSurveyDate?: string | null;
}): AdaptiveMission {
  const todayStr = getBangkokDateString();
  const { user, surveyResponse, recentLogs, history, lastMicroSurveyDate } = params;

  // 1. Baseline & Medium
  const baseline = user?.cigarettesPerDay ?? 10;
  const smokingType = (user?.smokingType || surveyResponse?.smokingType || 'CIGARETTE').toUpperCase();
  const isPod = smokingType.includes('POD') || smokingType.includes('บุหรี่ไฟฟ้า');
  const itemUnit = isPod ? 'ครั้ง' : 'มวน';

  // 2. Yesterday Analytics
  const yesterdayLog = recentLogs && recentLogs.length > 0 ? recentLogs[0] : null;
  const yesterdayCigs = yesterdayLog ? yesterdayLog.cigarettesSmoked : baseline;
  const yesterdayCraving = yesterdayLog ? (yesterdayLog.cravingCount || 0) : 0;
  const yesterdayMood = yesterdayLog?.mood || 'neutral';

  // 3. Historical Streak & Slip Analysis
  const yesterdayRecord = history.find(h => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return h.date === d.toISOString().split('T')[0];
  });
  const yesterdayMissionStatus = yesterdayRecord ? yesterdayRecord.status : (history.length > 0 ? 'ignored' : 'none');

  let missionCompletedStreak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].status === 'completed') missionCompletedStreak++;
    else break;
  }

  // 4. Survey Assessment Parameters
  const cravingTimeStr = surveyResponse?.cravingTime || 'เช้า(06-10)';
  const morningFirstTime = surveyResponse?.smokesWithin30Min || surveyResponse?.ftnd1 || '6-30 นาที';

  // 5. Days since last micro-survey check-in
  let daysSinceSurvey = 999;
  if (lastMicroSurveyDate) {
    const diff = new Date(todayStr).getTime() - new Date(lastMicroSurveyDate).getTime();
    daysSinceSurvey = Math.floor(diff / (1000 * 60 * 60 * 24));
  } else if (history.length >= 3) {
    daysSinceSurvey = 5;
  }

  // 6. Progressive Day Index (eliminating repetition over 90+ days)
  const dateParts = todayStr.split('-').map(Number);
  const dayOfMonth = dateParts[2] || new Date().getDate();
  const month = dateParts[1] || new Date().getMonth() + 1;
  const userSeed = (user?.id ? user.id.charCodeAt(user.id.length - 1) : 7);
  const journeyDay = history.length + dayOfMonth + (month * 31) + userSeed;

  const context: MissionContext = {
    baseline,
    isPod,
    itemUnit,
    yesterdayCigs,
    cravingTimeStr,
    morningDelayStr: morningFirstTime,
    mood: yesterdayMood,
    streak: missionCompletedStreak,
    journeyDay,
  };

  // =========================================================================
  // PRIORITY 1: Real-Time Micro Check-In (Recalibration every 5-7 days)
  // =========================================================================
  if (daysSinceSurvey >= 5 && (missionCompletedStreak >= 3 || history.length >= 4)) {
    return {
      id: `micro_survey_${todayStr}`,
      date: todayStr,
      trackId: 'micro_survey',
      trackName: 'อัปเดตสภาวะปัจจุบัน',
      title: 'ประเมินสภาวะความอยากสูบปัจจุบัน',
      timeWindow: 'ตลอดทั้งวัน',
      headline: 'ตอบสั้นๆ 2 ข้อ เพื่อปรับแผนภารกิจ',
      subDirective: 'อัปเดตระดับความอยากจริงของคุณในปัจจุบัน',
      directive: 'ตอบคำถามสั้นๆ 2 ข้อเพื่ออัปเดตระดับความอยากและปรับแผนภารกิจถัดไปให้เข้ากับสภาวะร่างกายของคุณในปัจจุบัน',
      calculatedReason: `คุณทำภารกิจและบันทึกข้อมูลต่อเนื่อง ระบบต้องการ recalibrate ข้อมูลจริงเพื่อไม่ให้อิงเพียงแบบสอบถามเดิม`,
      scientificTip: 'WHO Guidelines แนะนำให้ทบทวนสภาวะตนเองสม่ำเสมอ เพื่อให้แผนการเลิกสอดคล้องกับอาการถอนที่ลดลง',
      type: 'micro_survey',
      surveyQuestions: [
        {
          id: 'current_craving_level',
          question: 'ในช่วง 3 วันที่ผ่านมา ระดับความอยากสูบบุหรี่ของคุณเป็นอย่างไร?',
          options: [
            { text: 'เบาบางลงมาก ควบคุมได้ง่าย', value: 'very_low' },
            { text: 'ลดลงปานกลาง มีอยากเป็นบางช่วง', value: 'moderate' },
            { text: 'ยังมีความอยากสูบเข้มข้นในเวลาเดิมๆ', value: 'high' },
          ]
        },
        {
          id: 'current_challenging_window',
          question: 'ช่วงเวลาใดของวัน ที่คุณรู้สึกว่าท้าทายที่สุดในปัจจุบัน?',
          options: [
            { text: 'หลังตื่นนอนตอนเช้า', value: 'morning' },
            { text: 'หลังมื้ออาหาร (เที่ยง/เย็น)', value: 'after_meal' },
            { text: 'เวลาเครียดจากการทำงาน/เรียน', value: 'stress' },
            { text: 'ช่วงค่ำหรือก่อนนอน', value: 'night' },
          ]
        }
      ],
      xpReward: 60,
      status: 'pending'
    };
  }

  // =========================================================================
  // PRIORITY 2: Slip Recovery & Compassionate Re-stabilization
  // =========================================================================
  if (yesterdayMissionStatus === 'failed' || (yesterdayLog && yesterdayCigs > baseline + 2)) {
    const recoveryTrack = MISSION_TRACKS_50.find(t => t.id === 'track_1_quota_caps') || MISSION_TRACKS_50[0];
    const gentleCap = Math.max(1, baseline);
    return buildMissionFromTrack(recoveryTrack, context, todayStr, {
      target: gentleCap,
      cap: gentleCap,
      unit: itemUnit,
    });
  }

  // =========================================================================
  // PRIORITY 3: 100% Smoke-Free Maintenance (If 0 cigarettes yesterday)
  // =========================================================================
  if (yesterdayCigs === 0 && yesterdayLog) {
    const smokefreeTrack = MISSION_TRACKS_50.find(t => t.id === 'track_20_identity_maintenance') || MISSION_TRACKS_50[19];
    return buildMissionFromTrack(smokefreeTrack, context, todayStr, {
      target: 0,
      cap: 0,
      unit: itemUnit,
    });
  }

  // =========================================================================
  // PRIORITY 4: Multi-Factorial Vulnerability Matching
  // =========================================================================
  const isMorningCraver = morningFirstTime.includes('5 นาที') || morningFirstTime.includes('within5') || morningFirstTime.includes('6-30') || cravingTimeStr.includes('เช้า');
  const isMealCraver = cravingTimeStr.includes('สาย') || cravingTimeStr.includes('10-14') || cravingTimeStr.includes('เที่ยง');
  const isStressCraver = cravingTimeStr.includes('บ่าย') || cravingTimeStr.includes('14-18') || yesterdayMood === 'bad' || yesterdayCraving > 4;
  const isNightCraver = cravingTimeStr.includes('ค่ำ') || cravingTimeStr.includes('ดึก') || cravingTimeStr.includes('18-22') || cravingTimeStr.includes('22-06');

  // Build eligible track pool based on primary vulnerabilities and daily cycle
  let eligibleTracks: CatalogTrack[] = [];

  if (isNightCraver && (journeyDay % 3 === 0)) {
    eligibleTracks.push(...MISSION_TRACKS_50.filter(t => t.category === 'evening_protocol'));
  } else if (isMorningCraver && (journeyDay % 3 === 1)) {
    eligibleTracks.push(...MISSION_TRACKS_50.filter(t => t.category === 'morning_protocol'));
  } else if (isMealCraver && (journeyDay % 3 === 2)) {
    eligibleTracks.push(...MISSION_TRACKS_50.filter(t => t.category === 'meal_trigger'));
  } else if (isStressCraver) {
    eligibleTracks.push(...MISSION_TRACKS_50.filter(t => t.category === 'stress_protocol' || t.category === 'emergency_cbt'));
  }

  // Add rotating tactical tracks to guarantee broad clinical coverage
  const cycleIndex = journeyDay % 6;
  if (cycleIndex === 0) eligibleTracks.push(...MISSION_TRACKS_50.filter(t => t.category === 'sensory_shock'));
  else if (cycleIndex === 1) eligibleTracks.push(...MISSION_TRACKS_50.filter(t => t.category === 'friction_protocol'));
  else if (cycleIndex === 2) eligibleTracks.push(...MISSION_TRACKS_50.filter(t => t.category === 'social_shield'));
  else if (cycleIndex === 3) eligibleTracks.push(...MISSION_TRACKS_50.filter(t => t.category === 'stepdown_protocol'));
  else if (cycleIndex === 4) eligibleTracks.push(...MISSION_TRACKS_50.filter(t => t.category === 'reward_protocol'));
  else eligibleTracks.push(...MISSION_TRACKS_50.filter(t => t.category === 'emergency_cbt'));

  if (eligibleTracks.length === 0) {
    eligibleTracks = MISSION_TRACKS_50;
  }

  // Select track and sub-variation using non-repeating hash
  const selectedTrack = eligibleTracks[journeyDay % eligibleTracks.length];
  const todayTarget = Math.max(0, yesterdayCigs > 0 ? yesterdayCigs - 1 : baseline - 1);
  const eveningCap = Math.max(1, Math.floor(baseline * 0.4));

  return buildMissionFromTrack(selectedTrack, context, todayStr, {
    target: todayTarget,
    cap: eveningCap,
    unit: itemUnit,
  });
}

/**
 * Builds a formatted AdaptiveMission from a CatalogTrack and dynamically interpolates variation tokens
 */
function buildMissionFromTrack(
  track: CatalogTrack,
  ctx: MissionContext,
  todayStr: string,
  variables: { target?: number; cap?: number; unit?: string }
): AdaptiveMission {
  // Deterministically select 1 of the 20 sub-variations based on journey day
  const variationIndex = (ctx.journeyDay * 7 + (ctx.baseline * 3)) % track.variations.length;
  const variation = track.variations[variationIndex] || track.variations[0];

  let headline = variation.headline;
  let subDirective = variation.subDirective;

  // Interpolate dynamic tokens
  if (variables.target !== undefined) {
    headline = headline.replace(/{target}/g, variables.target.toString());
    subDirective = subDirective.replace(/{target}/g, variables.target.toString());
  }
  if (variables.cap !== undefined) {
    headline = headline.replace(/{cap}/g, variables.cap.toString());
    subDirective = subDirective.replace(/{cap}/g, variables.cap.toString());
  }
  if (variables.unit) {
    headline = headline.replace(/{unit}/g, variables.unit);
    subDirective = subDirective.replace(/{unit}/g, variables.unit);
  }

  return {
    id: `${track.id}_v${variationIndex}_${todayStr}`,
    date: todayStr,
    trackId: track.category,
    trackName: track.trackName,
    title: headline,
    timeWindow: track.timeWindow,
    headline,
    subDirective,
    directive: `${headline} — ${subDirective}`,
    calculatedReason: track.calculatedReason(ctx),
    scientificTip: track.scientificTip,
    type: 'action',
    xpReward: track.xpReward,
    status: 'pending',
  };
}


