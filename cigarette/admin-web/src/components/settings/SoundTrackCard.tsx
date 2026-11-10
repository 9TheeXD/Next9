"use client";

import React, { useState, useRef } from "react";
import { LuPlay, LuPause, LuTrash2, LuRotateCcw, LuPencil, LuCheck, LuX } from "react-icons/lu";
import { useAlert } from "@/components/ui/AlertProvider";

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

interface Props {
  sound: Sound;
  onDelete: (id: string, isReset: boolean) => void;
  onUpdate?: () => void;
}

export default function SoundTrackCard({ sound, onDelete, onUpdate }: Props) {
  const { showAlert, showConfirm } = useAlert();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(sound.name);
  const [editDesc, setEditDesc] = useState(sound.description || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      showAlert({ message: "กรุณาระบุชื่อเสียง", type: "warning" });
      return;
    }
    setIsSaving(true);
    try {
      const token = sessionStorage.getItem("__admin_token");
      const formData = new FormData();
      formData.append("name", editName);
      formData.append("description", editDesc);

      const res = await fetch(`/api/admin/sounds/${sound.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setIsEditing(false);
        if (onUpdate) onUpdate();
      } else {
        showAlert({ message: json.error || "แก้ไขข้อมูลล้มเหลว", type: "error" });
      }
    } catch (err) {
      showAlert({ message: "เกิดข้อผิดพลาดในการบันทึก", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const togglePlay = async () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        setIsLoading(true);
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (err) {
          console.error("Failed to play audio:", err);
        } finally {
          setIsLoading(false);
        }
      }
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const isCustomizedSystem = sound.isSystem && sound.url !== sound.defaultUrl && sound.defaultUrl;

  let displayUrl = sound.url;
  if (sound.isSystem && displayUrl.includes('nextbreath-sounds.s3')) {
    const filename = displayUrl.split('/').pop();
    displayUrl = `/api/sounds/${filename}`;
  }

  return (
    <div className="glass-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <audio 
        ref={audioRef} 
        src={displayUrl} 
        onEnded={() => setIsPlaying(false)}
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => setIsLoading(false)}
        onCanPlay={() => setIsLoading(false)}
        preload="metadata"
      />
      
      <div className="flex items-center gap-4 flex-1">
        <button
          onClick={togglePlay}
          disabled={isLoading}
          className="w-12 h-12 shrink-0 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center hover:bg-indigo-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
            <LuPause size={20} className="fill-current" />
          ) : (
            <LuPlay size={20} className="fill-current ml-1" />
          )}
        </button>
        
        <div className="flex-1 mr-4">
          {isEditing ? (
            <div className="space-y-2 mt-1 w-full max-w-sm">
              <input 
                type="text" 
                value={editName} 
                onChange={e => setEditName(e.target.value)} 
                className="w-full bg-black/20 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" 
                placeholder="ชื่อเสียง"
              />
              <input 
                type="text" 
                value={editDesc} 
                onChange={e => setEditDesc(e.target.value)} 
                className="w-full bg-black/20 border border-white/10 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" 
                placeholder="รายละเอียด"
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-white">{sound.name}</h4>
                {sound.isSystem && (
                  <span className="text-[10px] bg-white/10 text-white/60 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    System
                  </span>
                )}
                {isCustomizedSystem && (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Customized
                  </span>
                )}
              </div>
              {sound.description && (
                <p className="text-sm text-white/70 mt-1">{sound.description}</p>
              )}
            </>
          )}
          <p className="text-xs text-white/40 mt-1">
            ความยาว {formatTime(sound.duration)} • อัปโหลดเมื่อ {new Date(sound.createdAt).toLocaleDateString("th-TH")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-white/5 pt-4 sm:border-0 sm:pt-0 shrink-0 flex-wrap sm:flex-nowrap justify-end">
        {isEditing ? (
          <>
            <button
              onClick={handleSaveEdit}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 rounded-lg transition-colors disabled:opacity-50"
              title="บันทึก"
            >
              <LuCheck size={16} /> บันทึก
            </button>
            <button
              onClick={() => {
                setEditName(sound.name);
                setEditDesc(sound.description || "");
                setIsEditing(false);
              }}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white/50 hover:text-white/80 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
              title="ยกเลิก"
            >
              <LuX size={16} /> ยกเลิก
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-400/10 rounded-lg transition-colors"
              title="แก้ไขรายละเอียด"
            >
              <LuPencil size={16} /> แก้ไข
            </button>
            {sound.isSystem ? (
              isCustomizedSystem ? (
                <button
                  onClick={async () => {
                    const confirmed = await showConfirm({
                      title: "ยืนยันการคืนค่า",
                      message: `ต้องการคืนค่าเสียง "${sound.name}" เป็นเสียงระบบเริ่มต้นใช่หรือไม่?`,
                      confirmText: "คืนค่าเริ่มต้น",
                      isDanger: true
                    });
                    if (confirmed) {
                      onDelete(sound.id, true);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 rounded-lg transition-colors"
                  title="คืนค่าเริ่มต้น"
                >
                  <LuRotateCcw size={16} /> รีเซ็ต
                </button>
              ) : null
            ) : (
              <button
                onClick={async () => {
                  const confirmed = await showConfirm({
                    title: "ยืนยันการลบ",
                    message: `ลบเสียง "${sound.name}" ใช่หรือไม่?`,
                    confirmText: "ลบ",
                    isDanger: true
                  });
                  if (confirmed) {
                    onDelete(sound.id, false);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
                title="ลบเสียง"
              >
                <LuTrash2 size={16} /> ลบ
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
