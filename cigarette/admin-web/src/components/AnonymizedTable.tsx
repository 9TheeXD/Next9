"use client";

import React, { useState, useEffect } from "react";

export interface AnonymizedUser {
  id: string;
  joinDate: string;
  baselineCigarettes: number;
  pricePerPack: number | null;
  status: string;
  lastActive: string | null;
}

interface AnonymizedTableProps {
  users: AnonymizedUser[];
  loading: boolean;
}

export default function AnonymizedTable({ users, loading }: AnonymizedTableProps) {
  if (loading) {
    return (
      <div className="glass-card overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-xl font-bold text-white">รายชื่อผู้เข้าร่วม (ไม่ระบุตัวตน)</h2>
          <p className="mt-1 text-sm text-white/50">กำลังโหลดผู้ใช้...</p>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-6 border-b border-white/10 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">รายชื่อผู้เข้าร่วม (ไม่ระบุตัวตน)</h2>
          <p className="mt-1 text-sm text-white/50">
            ข้อมูลส่วนบุคคลถูกซ่อนเพื่อปกป้องความเป็นส่วนตัวของนักเรียน
          </p>
        </div>
        <div className="text-sm font-semibold text-indigo-400">
          รวม: {users.length}
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-white/80">
          <thead className="bg-white/5 text-xs uppercase text-white/50">
            <tr>
              <th className="px-6 py-4 font-medium">รหัสไม่ระบุตัวตน</th>
              <th className="px-6 py-4 font-medium">วันที่เข้าร่วม</th>
              <th className="px-6 py-4 font-medium">พื้นฐาน (มวน/วัน)</th>
              <th className="px-6 py-4 font-medium">สถานะ</th>
              <th className="px-6 py-4 font-medium">ใช้งานล่าสุด</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-white/40">
                  ไม่พบผู้เข้าร่วม
                </td>
              </tr>
            ) : (
              users.map((user, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-indigo-300">
                    {user.id}
                  </td>
                  <td className="px-6 py-4">
                    {new Date(user.joinDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    {user.baselineCigarettes}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        user.status === "Smoke-Free"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : user.status === "Reducing"
                          ? "bg-amber-500/10 text-amber-400"
                          : user.status === "Struggling"
                          ? "bg-rose-500/10 text-rose-400"
                          : "bg-white/10 text-white/60"
                      }`}
                    >
                      {user.status === "Smoke-Free" ? "ปลอดบุหรี่" : 
                       user.status === "Reducing" ? "กำลังลด" : 
                       user.status === "Struggling" ? "กำลังพยายาม" : user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {user.lastActive
                      ? new Date(user.lastActive).toLocaleDateString("th-TH")
                      : "ไม่เคย"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
