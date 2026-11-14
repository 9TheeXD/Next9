import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { getBangkokDateString } from '@/utils/calculations';
import {
  calculateDailyAdaptiveMission,
  AdaptiveMission,
  MissionHistoryRecord,
} from '@/utils/AdaptiveMissionEngine';
import { api } from '@/lib/api';

const MISSION_STATE_KEY = '@ciga_adaptive_mission_state';
const MISSION_HISTORY_KEY = '@ciga_adaptive_mission_history';
const LAST_SURVEY_KEY = '@ciga_last_micro_survey_date';

export function useAdaptiveMission(recentLogs: any[]) {
  const { user, refreshProfile } = useAuth();
  const [mission, setMission] = useState<AdaptiveMission | null>(null);
  const [history, setHistory] = useState<MissionHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Load and calculate today's mission
  const loadMission = useCallback(async () => {
    if (!user || (user.role === 'FAMILY' || user.role === 'EXPLORER')) {
      setMission(null);
      setLoading(false);
      return;
    }

    try {
      const todayStr = getBangkokDateString();

      // 1. Load History
      const historyStr = await AsyncStorage.getItem(MISSION_HISTORY_KEY);
      const parsedHistory: MissionHistoryRecord[] = historyStr ? JSON.parse(historyStr) : [];
      setHistory(parsedHistory);

      // 2. Check if today's mission state already exists
      const stateStr = await AsyncStorage.getItem(MISSION_STATE_KEY);
      const lastSurveyDate = await AsyncStorage.getItem(LAST_SURVEY_KEY);

      if (stateStr) {
        const savedMission: AdaptiveMission = JSON.parse(stateStr);
        if (savedMission.date === todayStr) {
          setMission(savedMission);
          setLoading(false);
          return;
        }
      }

      // 3. Compute deterministic new mission for today
      const calculated = calculateDailyAdaptiveMission({
        user,
        surveyResponse: (user as any).surveyResponse || null,
        recentLogs,
        history: parsedHistory,
        lastMicroSurveyDate: lastSurveyDate,
      });

      // Save to state and storage
      setMission(calculated);
      await AsyncStorage.setItem(MISSION_STATE_KEY, JSON.stringify(calculated));
    } catch (e) {
      console.error('Error computing adaptive mission:', e);
    } finally {
      setLoading(false);
    }
  }, [user, recentLogs]);

  useEffect(() => {
    loadMission();
  }, [loadMission]);

  // Complete mission
  const completeMission = async (missionId: string, feedbackNote?: string) => {
    if (!mission) return;
    const todayStr = getBangkokDateString();
    const updated: AdaptiveMission = {
      ...mission,
      status: 'completed',
      completedAt: new Date().toISOString(),
      feedbackNote,
    };

    setMission(updated);
    await AsyncStorage.setItem(MISSION_STATE_KEY, JSON.stringify(updated));

    // Update history
    const newHistory: MissionHistoryRecord[] = [
      ...history.filter((h) => h.date !== todayStr),
      {
        date: todayStr,
        missionId: mission.id,
        trackId: mission.trackId,
        status: 'completed',
        completedAt: new Date().toISOString(),
      },
    ];
    setHistory(newHistory);
    await AsyncStorage.setItem(MISSION_HISTORY_KEY, JSON.stringify(newHistory));

    // Sync to server action log (fire and forget)
    try {
      await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api'}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'MISSION_COMPLETED',
          details: `Completed mission: ${mission.title}`,
          metadata: { missionId: mission.id, trackId: mission.trackId, date: todayStr },
        }),
      });
    } catch {}
  };

  // Fail mission
  const failMission = async (missionId: string) => {
    if (!mission) return;
    const todayStr = getBangkokDateString();
    const updated: AdaptiveMission = {
      ...mission,
      status: 'failed',
    };

    setMission(updated);
    await AsyncStorage.setItem(MISSION_STATE_KEY, JSON.stringify(updated));

    // Update history
    const newHistory: MissionHistoryRecord[] = [
      ...history.filter((h) => h.date !== todayStr),
      {
        date: todayStr,
        missionId: mission.id,
        trackId: mission.trackId,
        status: 'failed',
      },
    ];
    setHistory(newHistory);
    await AsyncStorage.setItem(MISSION_HISTORY_KEY, JSON.stringify(newHistory));

    // Sync to server action log
    try {
      await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api'}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'MISSION_FAILED',
          details: `Incomplete mission: ${mission.title}`,
          metadata: { missionId: mission.id, trackId: mission.trackId, date: todayStr },
        }),
      });
    } catch {}
  };

  // Submit micro-survey
  const submitMicroSurvey = async (answers: Record<string, any>) => {
    const todayStr = getBangkokDateString();
    await AsyncStorage.setItem(LAST_SURVEY_KEY, todayStr);

    // If survey indicated new challenging window or reduced craving, update user profile/survey state
    const currentCraving = answers.current_craving_level;
    const challengingWindow = answers.current_challenging_window;

    let updatedCravingTime = (user as any)?.surveyResponse?.cravingTime || 'เช้า(06-10)';
    if (challengingWindow === 'morning') updatedCravingTime = 'เช้า(06-10)';
    else if (challengingWindow === 'after_meal') updatedCravingTime = 'สาย-เที่ยง(10-14)';
    else if (challengingWindow === 'stress') updatedCravingTime = 'บ่าย(14-18)';
    else if (challengingWindow === 'night') updatedCravingTime = 'ดึก(22-06)';

    // Update history
    const newHistory: MissionHistoryRecord[] = [
      ...history.filter((h) => h.date !== todayStr),
      {
        date: todayStr,
        missionId: mission?.id || 'micro_survey',
        trackId: 'micro_survey',
        status: 'completed',
        completedAt: new Date().toISOString(),
      },
    ];
    setHistory(newHistory);
    await AsyncStorage.setItem(MISSION_HISTORY_KEY, JSON.stringify(newHistory));

    // Calculate immediately next actionable mission with fresh data
    const recalculated = calculateDailyAdaptiveMission({
      user,
      surveyResponse: {
        ...(user as any)?.surveyResponse,
        cravingTime: updatedCravingTime,
      },
      recentLogs,
      history: newHistory,
      lastMicroSurveyDate: todayStr,
    });

    setMission(recalculated);
    await AsyncStorage.setItem(MISSION_STATE_KEY, JSON.stringify(recalculated));

    // Sync to server
    try {
      await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api'}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'MICRO_SURVEY_COMPLETED',
          details: `Updated current craving status: ${currentCraving}, window: ${challengingWindow}`,
          metadata: answers,
        }),
      });
    } catch {}
  };

  return {
    mission,
    loading,
    completeMission,
    failMission,
    submitMicroSurvey,
    refreshMission: loadMission,
  };
}
