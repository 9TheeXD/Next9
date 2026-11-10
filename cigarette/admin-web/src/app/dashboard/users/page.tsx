"use client";

import React, { useEffect, useState, useCallback } from "react";
import { LuFolderDown } from "react-icons/lu";
import UserTable from "@/components/users/UserTable";
import ExportModal from "@/components/users/ExportModal";

export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<"SMOKER" | "FAMILY">("SMOKER");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);

  const loadUsers = useCallback(async (role: string, isBackground = false) => {
    if (!isBackground) setLoading(true);
    if (!isBackground) setError(null);
    try {
      const token = sessionStorage.getItem("__admin_token");
      if (!token) {
        window.location.href = `/login?to=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      const res = await fetch(`/api/admin/users?role=${role}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setUsers(json.data);
      } else {
        setError(json.error || "ไม่สามารถโหลดข้อมูลผู้ใช้ได้");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers(activeTab);
  }, [activeTab, loadUsers]);

  return (
    <>
      <div className="space-y-6 overview-enter pb-10">
      {/* Header and Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">จัดการผู้ใช้</h1>
          <p className="mt-1 text-sm text-white/50">ดูและจัดการข้อมูลผู้สูบและผู้ติดตาม</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Tabs */}
          <div className="tab-nav">
            <button
              onClick={() => setActiveTab("SMOKER")}
              className={`tab-btn ${activeTab === "SMOKER" ? "active" : ""}`}
            >
              ผู้สูบบุหรี่
            </button>
            <button
              onClick={() => setActiveTab("FAMILY")}
              className={`tab-btn ${activeTab === "FAMILY" ? "active" : ""}`}
            >
              ผู้ติดตาม
            </button>
          </div>

          <button
            onClick={() => setIsExportOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            <LuFolderDown size={16} />
            ส่งออกข้อมูล
          </button>
        </div>
      </div>

      {error ? (
        <div className="glass-card p-8 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => loadUsers(activeTab)}
            className="mt-4 rounded-xl bg-white/10 px-6 py-2 text-sm font-semibold text-white hover:bg-white/20 transition"
          >
            ลองอีกครั้ง
          </button>
        </div>
      ) : (
        <UserTable users={users} role={activeTab} loading={loading} onRefresh={() => loadUsers(activeTab)} />
      )}

      </div>

      <ExportModal 
        isOpen={isExportOpen} 
        onClose={() => setIsExportOpen(false)} 
        role={activeTab} 
      />
    </>
  );
}
