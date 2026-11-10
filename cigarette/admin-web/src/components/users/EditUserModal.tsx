"use client";

import React, { useState, useEffect } from "react";
import { LuX, LuCheck } from "react-icons/lu";

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  initialData: {
    displayName: string;
    phoneNumber: string;
    xp: number;
  };
  onSuccess: () => void;
}

export default function EditUserModal({ isOpen, onClose, userId, initialData, onSuccess }: EditUserModalProps) {
  const [formData, setFormData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData(initialData);
      setError(null);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const token = sessionStorage.getItem("__admin_token");
      if (!token) throw new Error("Authentication required");

      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName: formData.displayName,
          phoneNumber: formData.phoneNumber,
          xp: Number(formData.xp),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "อัปเดตข้อมูลล้มเหลว");
      }

      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-white">แก้ไขข้อมูลผู้ใช้</h3>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">
              ชื่อผู้ใช้
            </label>
            <input
              type="text"
              required
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white placeholder-white/30 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">
              เบอร์โทรศัพท์
            </label>
            <input
              type="tel"
              required
              value={formData.phoneNumber}
              onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white placeholder-white/30 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">
              XP ปัจจุบัน
            </label>
            <input
              type="number"
              min="0"
              required
              value={formData.xp}
              onChange={(e) => setFormData({ ...formData, xp: Number(e.target.value) })}
              className="w-full rounded-xl bg-black/20 border border-white/10 px-4 py-2.5 text-white placeholder-white/30 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl bg-white/5 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LuCheck size={18} />
                  บันทึก
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
