import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Redirect, Slot } from 'expo-router';
import React, { useEffect } from 'react';
import { useColorScheme, ActivityIndicator, View, StyleSheet, Text } from 'react-native';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { GamificationProvider } from '@/contexts/GamificationContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { AlertProvider } from '@/contexts/AlertContext';
import XPToast from '@/components/XPToast';
import ForceInstall from '@/components/ForceInstall';
import PWAUpdatePrompt from '@/components/PWAUpdatePrompt';
import OfflineBanner from '@/components/OfflineBanner';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useNotifications } from '@/hooks/useNotifications';

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>กำลังเตรียมความพร้อม...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Slot />;
}

function RootNavigation() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <ErrorBoundary name="NavigationRoot">
        <Slot />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

function NotificationManager() {
  const { isAuthenticated } = useAuth();
  useNotifications(isAuthenticated);
  return null;
}

function WebWrapper({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: '#f0fdfa' }}>{children}</View>;
}

export default function RootLayout() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
  }, []);

  return (
    <ErrorBoundary name="RootLayout">
      <WebWrapper>
        <AlertProvider>
          <NetworkProvider>
            <AuthProvider>
              <ForceInstall>
                <GamificationProvider>
                  <NotificationManager />
                  <OfflineBanner />
                  <RootNavigation />
                  <XPToast />
                </GamificationProvider>
              </ForceInstall>
            </AuthProvider>
          </NetworkProvider>
        </AlertProvider>
        {/* PWAUpdatePrompt mounted at root level to guarantee detection across all pages */}
        <PWAUpdatePrompt />
      </WebWrapper>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontFamily: 'Sarabun',
    fontSize: 14,
    color: '#64748b',
  },
});
