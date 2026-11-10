import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AdaptiveMission } from '@/utils/AdaptiveMissionEngine';
import { useGamification } from '@/contexts/GamificationContext';
import { useAppSounds } from '@/hooks/useAppSounds';

interface DailyMissionModalProps {
  visible: boolean;
  mission: AdaptiveMission | null;
  onClose: () => void;
  onCompleteMission: (missionId: string, feedbackNote?: string) => Promise<void>;
  onFailMission: (missionId: string) => Promise<void>;
  onSubmitMicroSurvey: (answers: Record<string, any>) => Promise<void>;
}

export default function DailyMissionModal({
  visible,
  mission,
  onClose,
  onCompleteMission,
  onFailMission,
  onSubmitMicroSurvey,
}: DailyMissionModalProps) {
  const { addXP } = useGamification();
  const { playClick, playXP } = useAppSounds();
  const [loading, setLoading] = useState(false);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, any>>({});
  const [showDetails, setShowDetails] = useState(false);

  if (!mission) return null;

  const isSurvey = mission.type === 'micro_survey';
  const isCompleted = mission.status === 'completed';
  const isFailed = mission.status === 'failed';

  const handleSuccess = async () => {
    playClick();
    setLoading(true);
    try {
      await onCompleteMission(mission.id);
      playXP();
      addXP(mission.xpReward, `ทำภารกิจรายวันสำเร็จ: ${mission.title}`);
      onClose();
    } catch (e) {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  const handleFail = async () => {
    playClick();
    setLoading(true);
    try {
      await onFailMission(mission.id);
      onClose();
    } catch (e) {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  const handleSurveySubmit = async () => {
    playClick();
    if (mission.surveyQuestions) {
      const allAnswered = mission.surveyQuestions.every(
        (q) => surveyAnswers[q.id] !== undefined
      );
      if (!allAnswered) {
        alert('กรุณาตอบคำถามให้ครบทุกข้อเพื่อคำนวณภารกิจใหม่');
        return;
      }
    }

    setLoading(true);
    try {
      await onSubmitMicroSurvey(surveyAnswers);
      playXP();
      addXP(mission.xpReward, 'อัปเดตสภาวะปัจจุบันสำเร็จ');
      onClose();
    } catch (e) {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header Banner */}
          <LinearGradient
            colors={
              isCompleted
                ? ['#10b981', '#059669']
                : isFailed
                ? ['#f59e0b', '#d97706']
                : isSurvey
                ? ['#8b5cf6', '#6d28d9']
                : ['#0284c7', '#38bdf8']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.modalHeader}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.trackBadge}>
                <Text style={styles.trackBadgeText}>{mission.trackName}</Text>
              </View>
              <Text style={styles.modalHeaderTitle}>
                {isSurvey ? 'อัปเดตสภาวะปัจจุบัน' : 'ภารกิจวันนี้'}
              </Text>
            </View>

            <Pressable
              style={styles.closeButton}
              onPress={() => {
                playClick();
                onClose();
              }}
            >
              <Feather name="x" size={20} color="#ffffff" />
            </Pressable>
          </LinearGradient>

          {/* Scrollable Content */}
          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Primary Action Directive - Big & Simple */}
            {!isSurvey ? (
              <View style={styles.mainDirectiveCard}>
                <View style={styles.timeBadge}>
                  <Feather name="clock" size={13} color="#0284c7" style={{ marginRight: 5 }} />
                  <Text style={styles.timeBadgeText}>{mission.timeWindow}</Text>
                </View>
                
                <Text style={styles.mainHeadlineText}>{mission.headline || mission.title}</Text>
                {Boolean(mission.subDirective) && (
                  <Text style={styles.subDirectiveText}>{mission.subDirective}</Text>
                )}
              </View>
            ) : (
              <View style={styles.surveyContainer}>
                <Text style={styles.surveyIntroText}>
                  ตอบคำถามสั้นๆ เพื่อให้ระบบคำนวณภารกิจที่ตรงกับสภาพจริงของคุณที่สุด
                </Text>
                {mission.surveyQuestions?.map((q, qIndex) => (
                  <View key={q.id} style={styles.surveyQuestionBox}>
                    <Text style={styles.surveyQuestionText}>
                      {qIndex + 1}. {q.question}
                    </Text>
                    <View style={styles.surveyOptionsGrid}>
                      {q.options.map((opt) => {
                        const isSelected = surveyAnswers[q.id] === opt.value;
                        return (
                          <Pressable
                            key={opt.value}
                            style={[
                              styles.surveyOptionBtn,
                              isSelected && styles.surveyOptionBtnSelected,
                            ]}
                            onPress={() => {
                              playClick();
                              setSurveyAnswers((prev) => ({
                                ...prev,
                                [q.id]: opt.value,
                              }));
                            }}
                          >
                            <View
                              style={[
                                styles.radioCircle,
                                isSelected && styles.radioCircleSelected,
                              ]}
                            />
                            <Text
                              style={[
                                styles.surveyOptionText,
                                isSelected && styles.surveyOptionTextSelected,
                              ]}
                            >
                              {opt.text}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Expandable Details Toggle Link */}
            {!isSurvey && (
              <Pressable 
                style={styles.toggleDetailsBtn} 
                onPress={() => {
                  playClick();
                  setShowDetails(prev => !prev);
                }}
              >
                <Feather 
                  name={showDetails ? "chevron-up" : "chevron-down"} 
                  size={16} 
                  color="#0284c7" 
                  style={{ marginRight: 6 }} 
                />
                <Text style={styles.toggleDetailsText}>
                  {showDetails ? "ซ่อนรายละเอียด" : "ดูเหตุผลและรายละเอียดเพิ่มเติม"}
                </Text>
              </Pressable>
            )}

            {/* Expanded Details Section */}
            {!isSurvey && showDetails && (
              <View style={styles.expandedSection}>
                {/* Calculated Reason Card */}
                <View style={styles.reasonCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Feather name="cpu" size={14} color="#0284c7" style={{ marginRight: 6 }} />
                    <Text style={styles.reasonHeader}>ที่มาของการคำนวณภารกิจนี้</Text>
                  </View>
                  <Text style={styles.reasonText}>{mission.calculatedReason}</Text>
                </View>

                {/* Scientific Tip */}
                <View style={styles.tipCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Feather name="shield" size={14} color="#059669" style={{ marginRight: 6 }} />
                    <Text style={styles.tipHeader}>หลักการทางวิทยาศาสตร์</Text>
                  </View>
                  <Text style={styles.tipText}>{mission.scientificTip}</Text>
                </View>
              </View>
            )}

            {/* Reward Preview */}
            <View style={styles.rewardRow}>
              <Feather name="award" size={16} color="#d97706" style={{ marginRight: 6 }} />
              <Text style={styles.rewardText}>
                รางวัลภารกิจ: +{mission.xpReward} XP
              </Text>
            </View>

            {/* Action Buttons */}
            {isSurvey ? (
              <Pressable
                style={[styles.actionBtn, styles.completeBtn]}
                onPress={handleSurveySubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.completeBtnText}>บันทึกและคำนวณภารกิจใหม่</Text>
                )}
              </Pressable>
            ) : isCompleted ? (
              <View style={styles.completedAlert}>
                <Feather name="check-circle" size={18} color="#065f46" style={{ marginRight: 8 }} />
                <Text style={styles.completedAlertText}>
                  คุณทำภารกิจนี้สำเร็จแล้วในวันนี้
                </Text>
              </View>
            ) : (
              <View style={styles.buttonGroup}>
                <Pressable
                  style={[styles.actionBtn, styles.completeBtn]}
                  onPress={handleSuccess}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.completeBtnText}>สำเร็จแล้ว</Text>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.actionBtn, styles.failBtn]}
                  onPress={handleFail}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#991b1b" />
                  ) : (
                    <Text style={styles.failBtnText}>ยังทำไม่สำเร็จ</Text>
                  )}
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 460,
    maxHeight: '85%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  trackBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  trackBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 20,
  },
  mainDirectiveCard: {
    backgroundColor: '#f8fafc',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    alignItems: 'center',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
  },
  timeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  mainHeadlineText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    lineHeight: 30,
    textAlign: 'center',
    marginBottom: 6,
  },
  subDirectiveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
    lineHeight: 22,
    textAlign: 'center',
  },
  toggleDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom: 16,
  },
  toggleDetailsText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
  },
  expandedSection: {
    marginBottom: 14,
  },
  reasonCard: {
    backgroundColor: '#f0f9ff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginBottom: 12,
  },
  reasonHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369a1',
  },
  reasonText: {
    fontSize: 13,
    color: '#0369a1',
    lineHeight: 19,
  },
  tipCard: {
    backgroundColor: '#ecfdf5',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  tipHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
  },
  tipText: {
    fontSize: 13,
    color: '#065f46',
    lineHeight: 19,
  },
  surveyContainer: {
    marginBottom: 16,
  },
  surveyIntroText: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 14,
    lineHeight: 20,
  },
  surveyQuestionBox: {
    backgroundColor: '#f8fafc',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  surveyQuestionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  surveyOptionsGrid: {
    gap: 8,
  },
  surveyOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  surveyOptionBtnSelected: {
    borderColor: '#8b5cf6',
    backgroundColor: '#f5f3ff',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    marginRight: 10,
  },
  radioCircleSelected: {
    borderColor: '#8b5cf6',
    borderWidth: 5,
  },
  surveyOptionText: {
    fontSize: 13,
    color: '#334155',
    flex: 1,
  },
  surveyOptionTextSelected: {
    color: '#6d28d9',
    fontWeight: '700',
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffbeb',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fde68a',
    marginBottom: 16,
    alignSelf: 'center',
  },
  rewardText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b45309',
  },
  buttonGroup: {
    gap: 10,
  },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBtn: {
    backgroundColor: '#38bdf8',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  completeBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  failBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  failBtnText: {
    color: '#b91c1c',
    fontSize: 15,
    fontWeight: '600',
  },
  completedAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d1fae5',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6ee7b7',
  },
  completedAlertText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065f46',
  },
});
