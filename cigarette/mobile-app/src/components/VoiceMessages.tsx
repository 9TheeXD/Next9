import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useGamification } from '@/contexts/GamificationContext';
import { useAlert } from '@/contexts/AlertContext';
import { Audio } from 'expo-av';
import { api } from '@/lib/api';

interface SoundItem {
  id: string;
  name: string;
  description: string;
  url: string;
  duration: number;
}

export default function VoiceMessages({ onClose }: { onClose: () => void }) {
  const { addXP } = useGamification();
  const { showAlert } = useAlert();
  const [messages, setMessages] = useState<SoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [currentSoundId, setCurrentSoundId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    fetchMessages();
    
    // Configure audio mode
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const fetchMessages = async () => {
    try {
      const res = await api.getSounds("ENCOURAGEMENT");
      if (res.success && res.data) {
        setMessages(res.data);
      } else {
        setError('ไม่สามารถดึงข้อความเสียงได้');
      }
    } catch (err) {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const playMessage = async (item: SoundItem) => {
    try {
      // Stop currently playing
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      setCurrentSoundId(item.id);
      setIsLoadingAudio(true);
      setIsPlaying(false);

      if (Platform.OS === 'web') {
        const audio = new window.Audio(item.url);
        audio.onended = () => {
          setIsPlaying(false);
          setCurrentSoundId(null);
          addXP(5, 'รับฟังข้อความให้กำลังใจ');
          api.postLog({ soundsListened: 1 }).catch(() => {});
        };
        await audio.play();
        soundRef.current = {
          stopAsync: async () => { audio.pause(); audio.currentTime = 0; },
          unloadAsync: async () => { audio.pause(); audio.src = ''; }
        } as any;
        setIsLoadingAudio(false);
        setIsPlaying(true);
      } else {
        const { sound } = await Audio.Sound.createAsync(
          { uri: item.url },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded && status.didJustFinish) {
              setIsPlaying(false);
              setCurrentSoundId(null);
              addXP(5, 'รับฟังข้อความให้กำลังใจ');
              api.postLog({ soundsListened: 1 }).catch(() => {});
            }
          }
        );
        soundRef.current = sound;
        setIsLoadingAudio(false);
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('Error playing sound:', err);
      setIsLoadingAudio(false);
      setIsPlaying(false);
      setCurrentSoundId(null);
      showAlert({ title: 'ข้อผิดพลาด', message: 'ไม่สามารถเล่นไฟล์เสียงนี้ได้', type: 'error' });
    }
  };

  const stopMessage = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      setIsPlaying(false);
      setIsLoadingAudio(false);
      setCurrentSoundId(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>กล่องข้อความให้กำลังใจ</Text>
      <Text style={styles.subtitle}>เลือกฟังข้อความเพื่อเสริมความเข้มแข็ง</Text>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loadingText}>กำลังโหลดข้อความเสียง...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={fetchMessages}>
            <Text style={styles.retryText}>ลองใหม่</Text>
          </Pressable>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>ยังไม่มีข้อความให้กำลังใจในระบบ</Text>
        </View>
      ) : (
        messages.map((msg) => {
          const isActive = isPlaying && currentSoundId === msg.id;
          const isThisLoading = isLoadingAudio && currentSoundId === msg.id;
          return (
            <Pressable 
              key={msg.id} 
              style={[
                styles.messageCard, 
                (isActive || isThisLoading) ? styles.playingCard : {}
              ]}
              onPress={() => (isActive || isThisLoading) ? stopMessage() : playMessage(msg)}
            >
              <View style={[styles.iconContainer, (isActive || isThisLoading) ? styles.playingIcon : {}]}>
                {isThisLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather 
                    name={isActive ? "square" : "play"} 
                    size={20} 
                    color={isActive ? "#fff" : "#10b981"} 
                  />
                )}
              </View>
              <View style={styles.textContent}>
                <Text style={styles.messageTitle}>{msg.name}</Text>
                <Text style={styles.messagePreview} numberOfLines={2}>
                  {msg.description || "ข้อความให้กำลังใจ"}
                </Text>
              </View>
              {isActive && (
                <Feather name="volume-2" size={20} color="#10b981" />
              )}
            </Pressable>
          );
        })
      )}
    </View>
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
  centerBox: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderRadius: 16,
  },
  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 16,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
  },
  retryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#10b981',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  messageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  playingCard: {
    borderColor: 'rgba(16, 185, 129, 0.5)',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  playingIcon: {
    backgroundColor: '#10b981',
  },
  textContent: {
    flex: 1,
  },
  messageTitle: {
    color: '#1e293b',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  messagePreview: {
    color: '#64748b',
    fontSize: 13,
  },
});
