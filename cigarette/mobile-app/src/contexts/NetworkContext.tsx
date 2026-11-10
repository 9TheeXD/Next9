import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface NetworkContextType {
  isOnline: boolean;
}

const NetworkContext = createContext<NetworkContextType>({ isOnline: true });

export function useNetwork() {
  return useContext(NetworkContext);
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const heightAnim = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    Animated.spring(heightAnim, {
      toValue: isOnline ? 0 : 36,
      useNativeDriver: false,
    }).start();
  }, [isOnline]);

  return (
    <NetworkContext.Provider value={{ isOnline }}>
      <Animated.View
        style={[
          styles.banner,
          { height: heightAnim },
        ]}
        pointerEvents="none"
      >
        <Feather name="wifi-off" size={16} color="#ffffff" />
        <Text style={styles.bannerText}>ไม่มีอินเทอร์เน็ต — ใช้งานแบบออฟไลน์</Text>
      </Animated.View>
      {children}
    </NetworkContext.Provider>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#ef4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  bannerText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
