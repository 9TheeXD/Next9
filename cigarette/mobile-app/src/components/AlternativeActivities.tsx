import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useGamification } from '@/contexts/GamificationContext';

const ACTIVITIES = [
  { id: 1, title: 'ดื่มน้ำเย็น 1 แก้ว', icon: 'droplet', color: '#3b82f6', duration: '1 นาที' },
  { id: 2, title: 'ลุกขึ้นเดินยืดเส้นยืดสาย', icon: 'activity', color: '#10b981', duration: '5 นาที' },
  { id: 3, title: 'เคี้ยวหมากฝรั่ง', icon: 'smile', color: '#f59e0b', duration: '10 นาที' },
  { id: 4, title: 'โทรหาเพื่อนสนิท', icon: 'phone-call', color: '#8b5cf6', duration: '15 นาที' },
  { id: 5, title: 'ล้างหน้าให้สดชื่น', icon: 'wind', color: '#06b6d4', duration: '2 นาที' },
];

export default function AlternativeActivities({ onClose }: { onClose: () => void }) {
  const { addXP } = useGamification();

  const handleActivitySelect = (activity: typeof ACTIVITIES[0]) => {
    addXP(10, `เลือกกิจกรรม: ${activity.title}`);
    onClose();
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      <Text style={styles.title}>กิจกรรมเบี่ยงเบนความสนใจ</Text>
      <Text style={styles.subtitle}>หากการเล่นเกมยังไม่ช่วย ลองทำกิจกรรมเหล่านี้ดูสิ</Text>

      <View style={styles.grid}>
        {ACTIVITIES.map((activity) => (
          <Pressable 
            key={activity.id} 
            style={styles.card}
            onPress={() => handleActivitySelect(activity)}
          >
            <View style={[styles.iconContainer, { backgroundColor: `${activity.color}20` }]}>
              <Feather name={activity.icon as any} size={28} color={activity.color} />
            </View>
            <Text style={styles.activityTitle}>{activity.title}</Text>
            <Text style={styles.activityDuration}>{activity.duration}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  card: {
    width: '47%',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  activityTitle: {
    color: '#1e293b',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  activityDuration: {
    color: '#64748b',
    fontSize: 12,
  },
});
