import React, { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Dimensions, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";

type AlertType = "info" | "success" | "error" | "warning";

interface AlertOptions {
  title?: string;
  message: string;
  type?: AlertType;
}

interface ConfirmOptions extends AlertOptions {
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

interface AlertContextType {
  showAlert: (options: AlertOptions | string) => Promise<void>;
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return context;
};

export const AlertProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ConfirmOptions & { isConfirm: boolean } | null>(null);
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  const showAlert = useCallback((options: AlertOptions | string) => {
    return new Promise<void>((resolve) => {
      const opts = typeof options === "string" 
        ? { title: "ข้อความระบบ", message: options, type: "info" as AlertType } 
        : { ...options, type: options.type || "info" };
      setConfig({ ...opts, isConfirm: false });
      setResolvePromise(() => (val: boolean) => resolve());
      setIsOpen(true);
    });
  }, []);

  const showConfirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfig({ ...options, type: options.type || "warning", isConfirm: true });
      setResolvePromise(() => resolve);
      setIsOpen(true);
    });
  }, []);

  const handleClose = (result: boolean) => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(result);
    }
  };

  const getIcon = () => {
    if (!config) return null;
    if (config.type === "error" || config.isDanger) return <Feather name="alert-circle" size={24} color="#ef4444" />;
    if (config.type === "success") return <Feather name="check-circle" size={24} color="#10b981" />;
    if (config.type === "warning") return <Feather name="alert-triangle" size={24} color="#f59e0b" />;
    return <Feather name="info" size={24} color="#3b82f6" />;
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      
      <Modal
        visible={isOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => handleClose(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.alertBox}>
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                {getIcon()}
              </View>
              <Text style={styles.title}>{config?.title || "ข้อความระบบ"}</Text>
            </View>
            
            <Text style={styles.message}>{config?.message}</Text>
            
            <View style={styles.actions}>
              {config?.isConfirm && (
                <Pressable 
                  style={[styles.button, styles.cancelButton]} 
                  onPress={() => handleClose(false)}
                >
                  <Text style={styles.cancelText}>{config?.cancelText || "ยกเลิก"}</Text>
                </Pressable>
              )}
              
              <Pressable 
                style={[
                  styles.button, 
                  config?.type === "error" || config?.isDanger ? styles.dangerButton : 
                  config?.type === "success" ? styles.successButton : 
                  styles.confirmButton
                ]} 
                onPress={() => handleClose(true)}
              >
                <Text style={styles.buttonText}>
                  {config?.isConfirm ? (config?.confirmText || "ยืนยัน") : "ตกลง"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AlertContext.Provider>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    ...(Platform.OS === 'web' ? { backdropFilter: "blur(4px)" } : {})
  },
  alertBox: {
    backgroundColor: "white",
    borderRadius: 20,
    width: "100%",
    maxWidth: 360,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  iconContainer: {
    padding: 8,
    borderRadius: 50,
    backgroundColor: "#f8fafc",
  },
  title: {
    fontSize: 18,
    fontFamily: "NotoSansThai-Bold",
    color: "#1e293b",
    flex: 1,
  },
  message: {
    fontSize: 15,
    fontFamily: "NotoSansThai-Regular",
    color: "#475569",
    lineHeight: 22,
    marginBottom: 24,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f1f5f9",
  },
  confirmButton: {
    backgroundColor: "#3b82f6",
  },
  dangerButton: {
    backgroundColor: "#ef4444",
  },
  successButton: {
    backgroundColor: "#10b981",
  },
  buttonText: {
    color: "white",
    fontFamily: "NotoSansThai-Bold",
    fontSize: 15,
  },
  cancelText: {
    color: "#64748b",
    fontFamily: "NotoSansThai-Bold",
    fontSize: 15,
  }
});
