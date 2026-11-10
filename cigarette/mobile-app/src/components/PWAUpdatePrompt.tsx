import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, ActivityIndicator, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { usePathname } from 'expo-router';

export default function PWAUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [isUpdating, setIsUpdating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const pathname = usePathname();

  const triggerPrompt = useCallback(() => {
    const ignoredUntil = parseInt(localStorage.getItem('ciga_update_ignored_until') || '0', 10);
    if (Date.now() > ignoredUntil) {
      setShowPrompt(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    }
  }, [fadeAnim]);

  const checkVersion = useCallback(async () => {
    if (typeof window === 'undefined') return;

    // 1. Check version.json mismatch
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const serverVersion = data.version;
        const localVersion = localStorage.getItem('ciga_app_version');

        if (!localVersion) {
          localStorage.setItem('ciga_app_version', serverVersion);
        } else if (localVersion !== serverVersion) {
          triggerPrompt();
          return;
        }
      }
    } catch {}

    // 2. Check ServiceWorker registration waiting state
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          // Check if a worker is already waiting in background
          if (reg.waiting) {
            triggerPrompt();
            return;
          }
          // Request SW check for updates
          await reg.update().catch(() => {});
          if (reg.waiting) {
            triggerPrompt();
            return;
          }
        }
      } catch {}
    }
  }, [triggerPrompt]);

  // Check on mount, every 5s, on focus, and on route change
  useEffect(() => {
    if (typeof window === 'undefined') return;

    checkVersion();
    const intervalId = setInterval(checkVersion, 5000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    const handleFocus = () => checkVersion();

    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    // Listen for new worker install state change
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                triggerPrompt();
              }
            });
          }
        });
      }).catch(() => {});

      let refreshing = false;
      const handleControllerChange = () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      };
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }

    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      clearInterval(intervalId);
    };
  }, [checkVersion, triggerPrompt]);

  // Check on every pathname transition
  useEffect(() => {
    checkVersion();
  }, [pathname, checkVersion]);

  const handleUpdate = async () => {
    if (pathname === '/onboarding' && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    setShowConfirm(false);
    setIsUpdating(true);
    setShowPrompt(false);

    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('ciga_app_version', data.version);
      }
    } catch {}

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        if (reg.waiting) {
          (reg.waiting as any).postMessage({ type: 'SKIP_WAITING' });
        } else {
          await reg.update();
          if (reg.waiting) {
            (reg.waiting as any).postMessage({ type: 'SKIP_WAITING' });
          } else if (reg.installing) {
            reg.installing.addEventListener('statechange', (e: any) => {
              if (e.target.state === 'installed') {
                e.target.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          } else {
            window.location.reload();
          }
        }
      } else {
        window.location.reload();
      }
    } else {
      window.location.reload();
    }
  };

  if (!showPrompt && !isUpdating && !showConfirm) return null;

  return (
    <>
      {isUpdating && (
        <View style={styles.overlay}>
          <View style={styles.updatingCard}>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={styles.updatingText}>กำลังอัปเดตแอปพลิเคชัน...</Text>
          </View>
        </View>
      )}

      {showConfirm && (
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Feather name="alert-triangle" size={48} color="#f59e0b" style={{ marginBottom: 16 }} />
            <Text style={styles.confirmTitle}>แน่ใจหรือไม่ที่จะอัปเดตตอนนี้?</Text>
            <Text style={styles.confirmDesc}>คุณกำลังอยู่ในหน้าแบบสอบถาม หากอัปเดตตอนนี้ ข้อมูลที่คุณกรอกไว้ทั้งหมดจะถูกรีเซ็ต</Text>
            
            <View style={styles.confirmButtons}>
              <Pressable style={[styles.btn, styles.btnCancel]} onPress={() => setShowConfirm(false)}>
                <Text style={styles.btnCancelText}>ยกเลิก</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnConfirm]} onPress={handleUpdate}>
                <Text style={styles.btnConfirmText}>ยืนยันอัปเดต</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {showPrompt && !isUpdating && !showConfirm && (
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <Feather name="refresh-cw" size={24} color="#0284c7" />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.title}>มีอัปเดตใหม่</Text>
              <Text style={styles.description}>มีเวอร์ชันใหม่พร้อมใช้งาน กรุณากดปุ่มเพื่ออัปเดต</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable style={styles.button} onPress={handleUpdate}>
                <Text style={styles.buttonText}>อัปเดตตอนนี้</Text>
              </Pressable>
              <Pressable 
                style={[styles.button, { backgroundColor: '#f1f5f9' }]} 
                onPress={() => {
                  setShowPrompt(false);
                  localStorage.setItem('ciga_update_ignored_until', (Date.now() + 5 * 60 * 1000).toString());
                }}
              >
                <Text style={[styles.buttonText, { color: '#64748b' }]}>ปิด</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 1000000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  updatingCard: {
    backgroundColor: '#ffffff',
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  updatingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  confirmCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 20,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmDesc: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: '#f1f5f9',
  },
  btnCancelText: {
    color: '#475569',
    fontWeight: 'bold',
    fontSize: 16,
  },
  btnConfirm: {
    backgroundColor: '#0284c7',
  },
  btnConfirmText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  container: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    bottom: 85,
    left: 16,
    right: 16,
    maxWidth: 500,
    alignSelf: 'center',
    marginHorizontal: 'auto',
    zIndex: 999999,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
  button: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
