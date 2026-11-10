import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";

export interface CheerData {
  id: string;
  senderName: string;
  message: string;
}

interface CheerNotificationProps {
  cheer: CheerData | null;
  onDismiss: () => void;
}

export default function CheerNotification({ cheer, onDismiss }: CheerNotificationProps) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (cheer) {
      Animated.spring(translateY, {
        toValue: 20,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }).start();

      // Auto dismiss after 8 seconds to give more time to click play
      timerRef.current = setTimeout(() => {
        handleDismiss();
      }, 8000);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    } else {
      translateY.setValue(-100);
    }
  }, [cheer, translateY]);

  const handlePlayAudio = async () => {
    if (!cheer || isLoadingAudio) return;
    
    // Clear auto dismiss timer so it doesn't disappear while playing
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    setIsLoadingAudio(true);
    try {
      const textToSpeak = `${cheer.senderName} ส่งข้อความมาว่า ${cheer.message}`;
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(textToSpeak)}&tl=th&client=tw-ob`;
      const { sound } = await Audio.Sound.createAsync({ uri: url });
      
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
      
      await sound.playAsync();
    } catch (e) {
      console.error("Failed to play cheer audio", e);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleDismiss = () => {
    Animated.timing(translateY, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  };

  if (!cheer) return null;

  return (
    <Animated.View style={[styles.container, { transform: [{ translateY }] }]}>
      <Pressable style={styles.card} onPress={handlePlayAudio}>
        <View style={styles.iconContainer}>
          {isLoadingAudio ? (
            <ActivityIndicator size="small" color="#f43f5e" />
          ) : (
            <Feather name="volume-2" size={24} color="#f43f5e" />
          )}
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>{cheer.senderName} ส่งข้อความมาว่า:</Text>
          <Text style={styles.message} numberOfLines={2}>
            "{cheer.message}"
          </Text>
        </View>
        <Pressable onPress={handleDismiss} style={styles.closeButton}>
          <Feather name="x" size={16} color="#64748b" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    zIndex: 100,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(236,72,153,0.15)",
    borderWidth: 1,
    borderColor: "#ec4899",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#ec4899",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    marginRight: 12,
  },
  icon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    color: "#db2777", // Darker pink for readability
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    color: "#1e293b",
    fontWeight: "500",
  },
  closeButton: {
    padding: 4,
  },
  closeIcon: {
    fontSize: 16,
    color: "#475569",
  },
});
