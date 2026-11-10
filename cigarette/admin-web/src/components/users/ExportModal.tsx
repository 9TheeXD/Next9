"use client";

import React, { useState } from "react";
import { LuX, LuFileSpreadsheet, LuFileText, LuFileJson, LuFile } from "react-icons/lu";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  role: string;
}

type ExportFormat = "xlsx" | "csv" | "json" | "pdf";

const formats: { value: ExportFormat; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "xlsx", label: "Excel (.xlsx)", icon: <LuFileSpreadsheet size={20} />, desc: "ตารางข้อมูลแบบสเปรดชีต" },
  { value: "csv", label: "CSV (.csv)", icon: <LuFileText size={20} />, desc: "ข้อมูลคั่นด้วยจุลภาค" },
  { value: "json", label: "JSON (.json)", icon: <LuFileJson size={20} />, desc: "ข้อมูลแบบ structured" },
  { value: "pdf", label: "PDF (.pdf)", icon: <LuFile size={20} />, desc: "เอกสารพร้อมโลโก้และ header" },
];

export default function ExportModal({ isOpen, onClose, role }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setLoading(true);
    setError(null);

    try {
      const token = sessionStorage.getItem("__admin_token");
      if (!token) {
        window.location.href = `/login?to=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      const res = await fetch(
        `/api/admin/export?format=${format}&role=${role}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) {
        throw new Error("ส่งออกข้อมูลล้มเหลว");
      }

      const contentType = res.headers.get("content-type") || "";
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const dateStr = new Date().toISOString().split("T")[0];
      const roleLabel = role === "FAMILY" ? "family" : "smokers";
      a.download = `nextbreath_${roleLabel}_${dateStr}.${format}`;

      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white">ส่งออกข้อมูล</h3>
            <p className="text-sm text-white/50 mt-1">
              {role === "FAMILY" ? "ข้อมูลผู้ติดตาม" : "ข้อมูลผู้สูบบุหรี่"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"
          >
            <LuX size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {formats.map((fmt) => (
            <button
              key={fmt.value}
              onClick={() => handleExport(fmt.value)}
              disabled={loading}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all disabled:opacity-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                {fmt.icon}
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold text-white">{fmt.label}</p>
                <p className="text-xs text-white/40">{fmt.desc}</p>
              </div>
              <span className="text-xs text-white/30">⬇</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
