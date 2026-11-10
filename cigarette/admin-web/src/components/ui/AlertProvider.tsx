"use client";

import React, { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { FiAlertCircle, FiCheckCircle, FiInfo } from "react-icons/fi";

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
      const opts = typeof options === "string" ? { title: "ข้อความระบบ", message: options, type: "info" as AlertType } : { ...options, type: options.type || "info" };
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

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      
      {isOpen && config && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className={`p-3 rounded-full ${
                  config.type === "error" || config.isDanger ? "bg-red-100 text-red-600" :
                  config.type === "success" ? "bg-green-100 text-green-600" :
                  config.type === "warning" ? "bg-amber-100 text-amber-600" :
                  "bg-blue-100 text-blue-600"
                }`}>
                  {config.type === "error" || config.isDanger ? <FiAlertCircle className="w-6 h-6" /> :
                   config.type === "success" ? <FiCheckCircle className="w-6 h-6" /> :
                   config.type === "warning" ? <FiAlertCircle className="w-6 h-6" /> :
                   <FiInfo className="w-6 h-6" />}
                </div>
                <h3 className="text-xl font-bold text-slate-800">{config.title || "ข้อความระบบ"}</h3>
              </div>
              <p className="text-slate-600 text-sm whitespace-pre-line leading-relaxed">
                {config.message}
              </p>
            </div>
            
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              {config.isConfirm && (
                <button
                  onClick={() => handleClose(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  {config.cancelText || "ยกเลิก"}
                </button>
              )}
              <button
                onClick={() => handleClose(true)}
                className={`px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors shadow-sm ${
                  config.isDanger || config.type === "error" ? "bg-red-500 hover:bg-red-600 shadow-red-500/20" :
                  config.type === "success" ? "bg-green-500 hover:bg-green-600 shadow-green-500/20" :
                  "bg-blue-600 hover:bg-blue-700 shadow-blue-600/20"
                }`}
              >
                {config.isConfirm ? (config.confirmText || "ยืนยัน") : "ตกลง"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AlertContext.Provider>
  );
};
