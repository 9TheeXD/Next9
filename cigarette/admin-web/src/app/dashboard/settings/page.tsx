"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LuMic, LuUpload, LuMusic, LuChevronDown, LuChevronUp } from "react-icons/lu";
import { useAlert } from "@/components/ui/AlertProvider";
import SoundTrackCard from "@/components/settings/SoundTrackCard";
import RecordModal from "@/components/settings/RecordModal";

interface Sound {
  id: string;
  name: string;
  description: string | null;
  url: string;
  defaultUrl: string | null;
  isSystem: boolean;
  duration: number;
  category: string;
  createdAt: string;
}

export default function SettingsPage() {
  const { showAlert } = useAlert();
  const [activeTab, setActiveTab] = useState<"GENERAL" | "SOUND">("GENERAL");
  const router = useRouter();

  // General Settings State
  const [adminPassword, setAdminPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [genSuccess, setGenSuccess] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);

  // Sound Settings State
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [soundLoading, setSoundLoading] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    ENCOURAGEMENT: true,
    UI: true
  });
  const [uploadTargetCategory, setUploadTargetCategory] = useState("ENCOURAGEMENT");

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const loadSounds = useCallback(async () => {
    setSoundLoading(true);
    try {
      const token = sessionStorage.getItem("__admin_token");
      const res = await fetch("/api/admin/sounds", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSounds(json.data);
      } else {
        setSoundError(json.error || "โหลดเสียงล้มเหลว");
      }
    } catch (err) {
      setSoundError((err as Error).message);
    } finally {
      setSoundLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "SOUND") {
      loadSounds();
    }
  }, [activeTab, loadSounds]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenError(null);
    setGenSuccess(null);

    if (newPassword !== confirmPassword) {
      setGenError("รหัสผ่านไม่ตรงกัน");
      return;
    }

    setGenLoading(true);
    const token = sessionStorage.getItem("__admin_token");

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminPassword, newPassword }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setGenSuccess("เปลี่ยนรหัสผ่านสำเร็จแล้ว!");
        setAdminPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          sessionStorage.removeItem("__admin_token");
          router.push("/login");
        }, 2000);
      } else {
        setGenError(json.error || "เปลี่ยนรหัสผ่านล้มเหลว");
      }
    } catch (err) {
      setGenError("เกิดข้อผิดพลาดขณะเปลี่ยนรหัสผ่าน");
    } finally {
      setGenLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showAlert({ message: "ไฟล์เสียงต้องมีขนาดไม่เกิน 5MB", type: "warning" });
      return;
    }

    setUploadFile(file);
    setIsRecordModalOpen(true);
    
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const uploadSound = async (file: File, name: string, category: string, description: string | null, duration: number) => {
    setUploading(true);
    setSoundError(null);

    try {
      const token = sessionStorage.getItem("__admin_token");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      formData.append("category", category);
      if (description) formData.append("description", description);
      formData.append("duration", Math.round(duration).toString());

      const res = await fetch("/api/admin/sounds", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const json = await res.json();
      if (res.ok && json.success) {
        loadSounds();
      } else {
        showAlert({ message: json.error || "อัปโหลดล้มเหลว", type: "error" });
      }
    } catch (err) {
      showAlert({ message: (err as Error).message, type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSound = async (id: string, isReset: boolean) => {
    try {
      const token = sessionStorage.getItem("__admin_token");
      const res = await fetch(`/api/admin/sounds/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      
      if (res.ok && json.success) {
        if (isReset) {
          setSounds(sounds.map(s => s.id === id ? { ...s, url: s.defaultUrl! } : s));
        } else {
          setSounds(sounds.filter(s => s.id !== id));
        }
      } else {
        showAlert({ message: json.error || "ลบเสียงล้มเหลว", type: "error" });
      }
    } catch (err) {
      console.error(err);
      showAlert({ message: "เกิดข้อผิดพลาดในการลบ/รีเซ็ต", type: "error" });
    }
  };

  const openRecordModal = (targetCategory: string) => {
    setUploadFile(null);
    setUploadTargetCategory(targetCategory);
    setIsRecordModalOpen(true);
  };

  const triggerFileUpload = (targetCategory: string) => {
    setUploadTargetCategory(targetCategory);
    const input = document.getElementById("file-upload") as HTMLInputElement;
    if (input) input.click();
  };

  const groupedSounds = sounds.reduce((acc, sound) => {
    if (!acc[sound.category]) acc[sound.category] = [];
    acc[sound.category].push(sound);
    return acc;
  }, {} as Record<string, Sound[]>);

  const renderCategory = (categoryKey: string, categoryTitle: string, description: string) => {
    const categorySounds = groupedSounds[categoryKey] || [];
    const isExpanded = expandedCategories[categoryKey];

    return (
      <div key={categoryKey} className="glass-card overflow-hidden">
        <div 
          className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-white/5 transition"
          onClick={() => toggleCategory(categoryKey)}
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-base sm:text-lg font-semibold text-white">{categoryTitle} <span className="ml-2 text-sm text-indigo-400">({categorySounds.length})</span></h4>
              <p className="text-xs sm:text-sm text-white/50">{description}</p>
            </div>
            <div className="sm:hidden">
              {isExpanded ? <LuChevronUp className="text-white/50" /> : <LuChevronDown className="text-white/50" />}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openRecordModal(categoryKey);
              }}
              disabled={uploading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition text-xs sm:text-sm font-medium"
            >
              <LuMic size={16} /> อัดเสียง
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                triggerFileUpload(categoryKey);
              }}
              disabled={uploading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition text-xs sm:text-sm font-medium"
            >
              <LuUpload size={16} /> อัปโหลด
            </button>
            <div className="hidden sm:block">
              {isExpanded ? <LuChevronUp className="text-white/50" /> : <LuChevronDown className="text-white/50" />}
            </div>
          </div>
        </div>
        
        {isExpanded && (
          <div className="p-5 pt-0 border-t border-white/5 mt-2 space-y-3">
            {categorySounds.length === 0 ? (
              <div className="text-center py-6 text-white/40 text-sm">
                ไม่มีเสียงในหมวดหมู่นี้
              </div>
            ) : (
              categorySounds.map(sound => (
                <SoundTrackCard 
                  key={sound.id} 
                  sound={sound} 
                  onDelete={handleDeleteSound}
                  onUpdate={loadSounds}
                />
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-6 overview-enter pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">การตั้งค่า</h2>
          <p className="text-sm text-white/50">จัดการบัญชีผู้ดูแลระบบและการตั้งค่าแอป</p>
        </div>

        <div className="tab-nav">
          <button
            onClick={() => setActiveTab("GENERAL")}
            className={`tab-btn ${activeTab === "GENERAL" ? "active" : ""}`}
          >
            การตั้งค่าทั่วไป
          </button>
          <button
            onClick={() => setActiveTab("SOUND")}
            className={`tab-btn ${activeTab === "SOUND" ? "active" : ""}`}
          >
            จัดการเสียง
          </button>
        </div>
      </div>

      {activeTab === "GENERAL" && (
        <div className="glass-card max-w-lg p-6 animate-in fade-in duration-300">
          <h3 className="mb-4 text-lg font-medium text-white">เปลี่ยนรหัสผ่านหลัก</h3>
          
          <form onSubmit={handleChangePassword} className="space-y-4">
            {genError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {genError}
              </div>
            )}
            {genSuccess && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                {genSuccess} กำลังออกจากระบบ...
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-white/70">รหัสผ่านผู้ดูแลระบบ (จาก .env)</label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white placeholder-white/30 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="ป้อนรหัสผ่านผู้ดูแลระบบหลัก"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-white/70">รหัสผ่านใหม่</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white placeholder-white/30 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="ป้อนรหัสผ่านใหม่"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-white/70">ยืนยันรหัสผ่านใหม่</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white placeholder-white/30 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="ยืนยันรหัสผ่านใหม่"
              />
            </div>

            <button
              type="submit"
              disabled={genLoading}
              className="w-full mt-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {genLoading ? "กำลังอัปเดต..." : "อัปเดตรหัสผ่าน"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "SOUND" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="glass-card p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <LuMusic className="text-indigo-400" /> จัดการระบบเสียง
              </h3>
              <p className="text-sm text-white/50 mt-1">
                จัดการเสียงทั้งหมดในระบบ โดยแบ่งเป็นหมวดหมู่เสียงให้กำลังใจและเสียง UI
              </p>
            </div>
            
            <div className="hidden">
              {/* Hidden file input used by triggers */}
              <input 
                id="file-upload"
                type="file" 
                accept="audio/*" 
                onChange={handleFileUpload}
              />
            </div>
          </div>

          {soundError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              {soundError}
            </div>
          )}

          {uploading && (
            <div className="glass-card p-4 flex items-center justify-center gap-3">
              <span className="w-5 h-5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"></span>
              <span className="text-indigo-400 text-sm">กำลังอัปโหลด...</span>
            </div>
          )}

          <div className="space-y-6">
            {soundLoading ? (
              [...Array(2)].map((_, i) => (
                <div key={i} className="skeleton h-32 rounded-2xl w-full" />
              ))
            ) : (
              <>
                {renderCategory("ENCOURAGEMENT", "เสียงให้กำลังใจ (ในหน้า SOS)", "เสียงที่จะเล่นเมื่อผู้ใช้อยู่ในหน้าจอ SOS เพื่อให้กำลังใจ")}
                {renderCategory("UI", "เสียง UI", "เสียงเอฟเฟกต์สำหรับปุ่มกด แบดจ์ และการแจ้งเตือนต่างๆ ในแอป")}
              </>
            )}
          </div>
        </div>
      )}

      </div>

      <RecordModal 
        isOpen={isRecordModalOpen} 
        onClose={() => {
          setIsRecordModalOpen(false);
          setUploadFile(null);
        }} 
        onSave={uploadSound}
        defaultCategory={uploadTargetCategory}
        initialFile={uploadFile}
      />
    </>
  );
}
