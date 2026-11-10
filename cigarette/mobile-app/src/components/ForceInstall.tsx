import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Platform, Pressable, ActivityIndicator, Image, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAlert } from "@/contexts/AlertContext";
import { usePathname } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";

export default function ForceInstall({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { showAlert } = useAlert();
  const { isAuthenticated, isLoading } = useAuth();
  const [isWeb, setIsWeb] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true); // Default to true to prevent flash
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [os, setOs] = useState<"ios" | "android" | "other">("other");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installStatus, setInstallStatus] = useState<"idle" | "installing" | "installed">("idle");
  
  let showWelcome = !isAuthenticated;
  if (typeof window !== 'undefined' && window.location.search.includes('install=1')) {
    showWelcome = false;
  }

  useEffect(() => {
    if (Platform.OS === "web") {
      setIsWeb(true);

      // Listen for the native install prompt
      const handleBeforeInstallPrompt = (e: any) => {
        e.preventDefault();
        setDeferredPrompt(e);
        // We cannot auto-trigger e.prompt() here without user interaction (Browser security policy)
      };
      window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

      // Listen for successful installation (Note: Chrome fires this immediately after acceptance)
      const handleAppInstalled = () => {
        console.log("appinstalled event fired (hand-off to OS)");
        setDeferredPrompt(null);
      };
      window.addEventListener("appinstalled", handleAppInstalled);

      // 1. Check for In-App Browser (Line, FB, IG, etc.)
      const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isLine = /Line/i.test(ua);
      const isFB = /FBAN|FBAV/i.test(ua);
      const isIG = /Instagram/i.test(ua);
      const isTwitter = /Twitter/i.test(ua);
      
      // Auto-open external browser for LINE
      if (isLine && !window.location.search.includes("openExternalBrowser=1")) {
        const separator = window.location.href.includes("?") ? "&" : "?";
        window.location.href = window.location.href + separator + "openExternalBrowser=1";
        // Wait for redirect
        setIsInAppBrowser(true);
        return;
      }
      
      if (isLine || isFB || isIG || isTwitter) {
        setIsInAppBrowser(true);
      }

      // 2. Check for Standalone Mode (PWA Installed)
      const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
      const isAndroid = /android/i.test(ua);
      
      if (isIos) setOs("ios");
      else if (isAndroid) setOs("android");

      const mediaQuery = window.matchMedia("(display-mode: standalone)");
      const iosStandalone = (navigator as any).standalone === true;
      
      const checkStandalone = (e: MediaQueryListEvent | MediaQueryList) => {
        if (e.matches || iosStandalone) {
          setIsStandalone(true);
        } else {
          setIsStandalone(false);
        }
      };

      checkStandalone(mediaQuery);

      // Listen for changes (e.g. when app is installed and immediately opens)
      mediaQuery.addEventListener("change", checkStandalone);

      return () => {
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        window.removeEventListener("appinstalled", handleAppInstalled);
        mediaQuery.removeEventListener("change", checkStandalone);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          console.log('User accepted the install prompt');
          setInstallStatus("installing");
          setDeferredPrompt(null);
          
          // In Android Chrome, WebAPK minting takes about 10-20 seconds.
          // The current browser tab will NEVER become 'standalone'.
          // So we simply wait 15 seconds to show the "Open App" button.
          setTimeout(() => {
            setInstallStatus("installed");
          }, 15000);
        } else {
          setInstallStatus("idle");
        }
      } catch (err) {
        setInstallStatus("idle");
        showAlert({ message: 'เกิดข้อผิดพลาดในการติดตั้ง', type: "error" });
      }
    } else if (os === "android") {
      showAlert({ message: "กรุณากดที่เมนู 3 จุด มุมขวาบน แล้วเลือก 'เพิ่มลงในหน้าจอหลัก' หรือ 'Install App'", type: "info" });
    }
  };

  const tryForceExternalBrowser = () => {
    if (os === "android") {
      // Android Intent trick to force open in Chrome
      const currentUrl = window.location.href.replace(/^https?:\/\//, "");
      const intentUrl = `intent://${currentUrl}#Intent;scheme=https;package=com.android.chrome;end;`;
      window.location.href = intentUrl;
    } else if (os === "ios") {
      showAlert({ message: "กรุณากดที่ไอคอนเข็มทิศมุมขวาล่าง หรือมุมขวาบน เพื่อเปิดใน Safari ปกติครับ", type: "info" });
    } else {
      showAlert({ message: "กรุณากดที่ไอคอน 3 จุดที่มุมจอ เพื่อเลือกเปิดในเบราว์เซอร์ปกติครับ", type: "info" });
    }
  };

  if (!isWeb) return <>{children}</>;

  if (typeof window !== 'undefined') {
    const path = pathname || window.location.pathname;
    if (path === '/survey' || path === '/survey_follower' || path === '/login' || path === '/register' || path === '/(auth)/login' || path === '/(auth)/register' || path === '/onboarding') {
      return <>{children}</>;
    }
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  if (isInAppBrowser) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconCircleWarning}>
            <Feather name="alert-triangle" size={32} color="#f59e0b" />
          </View>
          <Text style={styles.title}>คุณกำลังเปิดผ่านโซเชียลแอป</Text>
          <Text style={styles.desc}>
            เพื่อการใช้งานที่สมบูรณ์และสามารถติดตั้งแอปลงเครื่องได้ กรุณาเปิดด้วยเบราว์เซอร์ปกติ
          </Text>
          
          <View style={styles.instructionBox}>
            <Text style={styles.instructionText}>
              1. กดที่ไอคอน <Text style={{fontWeight: 'bold'}}>จุด 3 จุด</Text> (หรือสัญลักษณ์แชร์) ที่มุมหน้าจอ
            </Text>
            <Text style={styles.instructionText}>
              2. เลือก <Text style={{fontWeight: 'bold'}}>"เปิดด้วยเบราว์เซอร์เริ่มต้น"</Text> หรือ <Text style={{fontWeight: 'bold'}}>"Open in Browser"</Text>
            </Text>
          </View>

          <Pressable style={styles.actionButton} onPress={tryForceExternalBrowser}>
            <Text style={styles.actionButtonText}>ลองเปิดเบราว์เซอร์อัตโนมัติ</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if ((pathname === '/' || pathname === '') && showWelcome && !isStandalone) {
    return (
      <LinearGradient
        colors={['#72a9d8', '#a8d1ee', '#79b0dc']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 28,
            paddingTop: 48,
            paddingBottom: 48,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{
            width: '100%',
            maxWidth: 420,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            {/* App Icon */}
            <View style={{
              width: 120,
              height: 120,
              borderRadius: 28,
              backgroundColor: 'rgba(255,255,255,0.9)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
              shadowColor: 'rgba(14, 165, 233, 0.2)',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 1,
              shadowRadius: 20,
              elevation: 8,
            }}>
              <Image
                source={require('../../assets/images/icon.png')}
                style={{ width: 92, height: 92, borderRadius: 20 }}
              />
            </View>

            {/* Welcome Text */}
            <Text style={{
              fontFamily: Platform.select({
                web: "'Prompt', 'Kanit', sans-serif",
                default: "Prompt",
              }),
              fontSize: 22,
              fontWeight: '700',
              color: '#0f172a',
              marginBottom: 10,
              textAlign: 'center',
              letterSpacing: -0.2,
            }}>
              {"ยินดีต้อนรับสู่ Next Breath"}
            </Text>

            {/* Main Title 1 */}
            <Text style={{
              fontFamily: Platform.select({
                web: "'DawnoraTH', 'Chonburi', 'Fahkwang', 'Kanit', sans-serif",
                default: "Kanit",
              }),
              fontSize: 44,
              fontWeight: '900',
              color: '#ffffff',
              textAlign: 'center',
              lineHeight: 56,
              textShadowColor: 'rgba(0, 0, 0, 0.08)',
              textShadowOffset: { width: 0, height: 2 },
              textShadowRadius: 4,
            }}>
              {"หายใจครั้งต่อไป"}
            </Text>

            {/* Main Title 2 (Accent) */}
            <Text style={{
              fontFamily: Platform.select({
                web: "'DawnoraTH', 'Chonburi', 'Fahkwang', 'Kanit', sans-serif",
                default: "Kanit",
              }),
              fontSize: 44,
              fontWeight: '900',
              color: '#0284c7',
              textAlign: 'center',
              lineHeight: 56,
              marginBottom: 18,
              textShadowColor: 'rgba(255, 255, 255, 0.7)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 3,
            }}>
              {"ที่ไร้ควัน"}
            </Text>

            {/* Description */}
            <Text style={{
              fontFamily: Platform.select({
                web: "'Prompt', 'Sarabun', sans-serif",
                default: "Prompt",
              }),
              fontSize: 17,
              fontWeight: '500',
              color: 'rgba(255, 255, 255, 0.95)',
              textAlign: 'center',
              lineHeight: 28,
              marginBottom: 36,
              textShadowColor: 'rgba(0, 0, 0, 0.06)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 2,
            }}>
              {"แอปพลิเคชันช่วยเลิกบุหรี่\nด้วยการติดตามพฤติกรรม\nเกมเสริมกำลังใจ และแรงสนับสนุน\nจากคนที่คุณรัก"}
            </Text>

            {/* Start Button */}
            <Pressable
              style={({ pressed }) => [{
                backgroundColor: '#ffffff',
                paddingVertical: 18,
                paddingHorizontal: 64,
                borderRadius: 50,
                width: '100%',
                maxWidth: 290,
                alignItems: 'center' as const,
                shadowColor: 'rgba(0, 0, 0, 0.08)',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 1,
                shadowRadius: 18,
                elevation: 6,
                transform: pressed ? [{ scale: 0.97 }] : [{ scale: 1 }],
              }]}
              onPress={() => window.location.href = '/login'}
            >
              <Text style={{
                fontFamily: Platform.select({
                  web: "'Prompt', 'Kanit', sans-serif",
                  default: "Prompt",
                }),
                fontSize: 24,
                fontWeight: '700',
                color: '#0284c7',
              }}>
                เริ่มต้น
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (!isStandalone) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconCirclePrimary}>
            <Feather name="download" size={32} color="#38bdf8" />
          </View>
          <Text style={styles.title}>กรุณาติดตั้งแอปลงเครื่อง</Text>
          <Text style={styles.desc}>
            คุณจำเป็นต้องติดตั้งแอปพลิเคชันนี้ลงบนหน้าจอหลักเพื่อเข้าใช้งาน
          </Text>

          {os === "ios" ? (
            <View style={styles.instructionBox}>
              <Text style={styles.instructionText}>
                1. แตะที่ไอคอน <Feather name="share" size={16} color="#38bdf8" /> (แชร์) ด้านล่างของจอ
              </Text>
              <Text style={styles.instructionText}>
                2. เลื่อนหาและเลือก <Text style={{fontWeight: 'bold'}}>เพิ่มไปยังหน้าจอโฮม</Text> (Add to Home Screen)
              </Text>
              <Text style={styles.instructionText}>
                3. กด <Text style={{fontWeight: 'bold'}}>เพิ่ม</Text> (Add) ที่มุมขวาบน
              </Text>
              <Text style={styles.instructionText}>
                4. เข้าใช้งานแอปผ่านไอคอนบนหน้าจอหลัก
              </Text>
            </View>
          ) : (
            <View style={styles.instructionBox}>
              {installStatus === "installed" ? (
                <View style={{ alignItems: 'center', padding: 8 }}>
                  <View style={styles.successIcon}>
                    <Feather name="check-circle" size={48} color="#10b981" />
                  </View>
                  <Text style={[styles.title, { marginTop: 16, fontSize: 20 }]}>ติดตั้งเสร็จสมบูรณ์!</Text>
                  <Text style={[styles.desc, { marginBottom: 20 }]}>
                    ไอคอนแอป Next Breath ถูกเพิ่มลงบนหน้าจอหลัก (Home Screen) ของมือถือคุณเรียบร้อยแล้ว
                  </Text>
                  <Text style={[styles.instructionText, { textAlign: 'center', color: '#047857', fontSize: 15, marginBottom: 0 }]}>
                    <Text style={{fontWeight: 'bold'}}>วิธีเข้าใช้งาน:</Text> กดที่เมนูจุด 3 จุด (มุมขวาบน/ล่างของจอ) แล้วเลือก <Text style={{fontWeight: 'bold'}}>"เปิดในแอป"</Text> หรือกดเปิดแอป Next Breath จากหน้าจอหลักของคุณ
                  </Text>
                </View>
              ) : installStatus === "installing" ? (
                <View style={{ alignItems: 'center', padding: 16 }}>
                  <ActivityIndicator size="large" color="#38bdf8" style={{ marginBottom: 20, transform: [{ scale: 1.5 }] }} />
                  <Text style={[styles.title, { fontSize: 20 }]}>กำลังติดตั้งแอปพลิเคชัน...</Text>
                  <Text style={[styles.desc, { marginBottom: 0 }]}>
                    ระบบกำลังดาวน์โหลดแอปพลิเคชันลงบนเครื่องของคุณ กรุณารอสักครู่ (ประมาณ 10-30 วินาที)
                  </Text>
                </View>
              ) : deferredPrompt ? (
                <View style={{ alignItems: 'center', padding: 8 }}>
                  <Text style={[styles.instructionText, { textAlign: 'center', marginBottom: 16 }]}>
                    คุณสามารถกดปุ่มด้านล่างเพื่อติดตั้งแอปพลิเคชันได้ทันที
                  </Text>
                  <Pressable 
                    style={styles.installButton} 
                    onPress={handleInstallClick}
                  >
                    <Feather name="download" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={styles.installButtonText}>ติดตั้งแอปพลิเคชัน</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={styles.instructionText}>
                    1. แตะที่ไอคอน <Feather name="more-vertical" size={16} color="#38bdf8" /> (จุด 3 จุด) ที่มุมขวาบน
                  </Text>
                  <Text style={styles.instructionText}>
                    2. เลือก <Text style={{fontWeight: 'bold'}}>เพิ่มลงในหน้าจอหลัก</Text> หรือ <Text style={{fontWeight: 'bold'}}>ติดตั้งแอป</Text> (Install App)
                  </Text>
                  <Text style={styles.instructionText}>
                    3. เข้าใช้งานแอปผ่านไอคอนบนหน้าจอหลัก
                  </Text>
                  
                  <Pressable style={[styles.actionButton, { marginTop: 12 }]} onPress={handleInstallClick}>
                    <Text style={styles.actionButtonText}>ลองกดเรียกหน้าจอติดตั้ง</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </View>
      </View>
    );
  }

  // If web and standalone (installed PWA), allow access!
  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0fdfa",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    height: "100%",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 32,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    shadowColor: "rgba(0,0,0,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 30,
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  iconCircleWarning: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(245,158,11,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  iconCirclePrimary: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(56,189,248,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 12,
    textAlign: "center",
  },
  desc: {
    fontSize: 15,
    color: "#475569",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 28,
  },
  instructionBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  instructionText: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 24,
    marginBottom: 12,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(16,185,129,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  actionButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "rgba(56,189,248,0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.3)",
    width: "100%",
  },
  actionButtonText: {
    color: "#0284c7",
    fontWeight: "600",
    textAlign: "center",
  },
  installButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#38bdf8',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    shadowColor: "#38bdf8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  installButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
