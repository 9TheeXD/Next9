import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useGamification } from '@/contexts/GamificationContext';
import { useAlert } from "@/contexts/AlertContext";
import { api } from "@/lib/api";

const TRIGGERS = [
  'ความเครียด', 'หลังอาหาร', 'ดื่มแอลกอฮอล์', 
  'เห็นคนอื่นสูบ', 'เบื่อหน่าย', 'ตื่นนอนตอนเช้า', 'อื่นๆ'
];

export default function CravingJournal({ onLogComplete }: { onLogComplete?: () => void }) {
  const { addXP } = useGamification();
  const { showAlert } = useAlert();
  const [intensity, setIntensity] = useState<number>(5);
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const handleSave = async () => {
    if (!selectedTrigger) {
      showAlert({ 
        title: 'กรุณาเลือกสาเหตุ', 
        message: 'การรู้สาเหตุจะช่วยให้คุณรับมือกับความอยากในอนาคตได้ดีขึ้น', 
        type: 'warning' 
      });
      return;
    }
    
    try {
      const notes = `ความอยากระดับ ${intensity}/10, สาเหตุ: ${selectedTrigger}${note ? `\nเพิ่มเติม: ${note}` : ''}`;
      await api.postLog({
        cravingCount: 1,
        notes
      });
      
      api.postActionLog({
        action: "LOG_CRAVING",
        details: notes
      }).catch(() => {});
      
      await showAlert({
        title: 'บันทึกสำเร็จ',
        message: 'เก่งมากครับ! การที่คุณรับรู้และบันทึกความอยากได้แปลว่าคุณกำลังควบคุมมันอยู่',
        type: 'success'
      });
      addXP(10, 'บันทึกการเรียนรู้ตัวเองเยี่ยมมาก!');
      if (onLogComplete) onLogComplete();
    } catch (err) {
      showAlert({ title: "เกิดข้อผิดพลาด", message: "ไม่สามารถบันทึกข้อมูลได้", type: "error" });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>บันทึกความอยาก (Craving Journal)</Text>
      <Text style={styles.headerSubtitle}>บันทึกความรู้สึกของคุณเพื่อเรียนรู้และเอาชนะมันในครั้งหน้า</Text>

      {/* Intensity Slider */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ความรุนแรงของความอยาก (1-10)</Text>
        <View style={styles.intensityRow}>
          {[1, 3, 5, 7, 10].map((val) => (
            <Pressable
              key={val}
              style={[
                styles.intensityBtn,
                intensity === val && styles.intensityBtnActive
              ]}
              onPress={() => setIntensity(val)}
            >
              <Text style={[
                styles.intensityText,
                intensity === val && styles.intensityTextActive
              ]}>{val}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.intensityDesc}>
          {intensity <= 3 ? 'ความอยากระดับเบาบาง จัดการได้ง่าย' : 
           intensity <= 6 ? 'ความอยากระดับปานกลาง ต้องใช้สมาธิ' : 
           'ความอยากระดับรุนแรง คุณเก่งมากที่อดทนผ่านมันมาได้!'}
        </Text>
      </View>

      {/* Triggers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>อะไรคือตัวกระตุ้น? (Trigger)</Text>
        <View style={styles.triggerGrid}>
          {TRIGGERS.map((trigger) => (
            <Pressable
              key={trigger}
              style={[
                styles.triggerBtn,
                selectedTrigger === trigger && styles.triggerBtnActive
              ]}
              onPress={() => setSelectedTrigger(trigger)}
            >
              <Text style={[
                styles.triggerText,
                selectedTrigger === trigger && styles.triggerTextActive
              ]}>{trigger}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Notes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>บันทึกเพิ่มเติม (ไม่บังคับ)</Text>
        <TextInput
          style={styles.textInput}
          placeholder="ความรู้สึก ความคิด หรือวิธีที่คุณใช้จัดการมัน..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          multiline
          numberOfLines={3}
          value={note}
          onChangeText={setNote}
        />
      </View>

      <Pressable style={styles.saveButton} onPress={handleSave}>
        <Feather name="save" size={20} color="#fff" />
        <Text style={styles.saveButtonText}>บันทึกข้อมูล</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 32,
    lineHeight: 20,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 16,
  },
  intensityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  intensityBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  intensityBtnActive: {
    backgroundColor: 'rgba(244, 114, 182, 0.2)',
    borderColor: '#f472b6',
  },
  intensityText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 16,
  },
  intensityTextActive: {
    color: '#f472b6',
  },
  intensityDesc: {
    fontSize: 12,
    color: '#f472b6',
    textAlign: 'center',
    marginTop: 8,
  },
  triggerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  triggerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  triggerBtnActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: '#38bdf8',
  },
  triggerText: {
    color: '#475569',
    fontSize: 14,
  },
  triggerTextActive: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    color: '#1e293b',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#38bdf8',
    padding: 16,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
