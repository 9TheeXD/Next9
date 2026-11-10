"use client";

import React from "react";
import { LuCigarette, LuCalendar, LuAward, LuWallet, LuFlame } from "react-icons/lu";

interface StatsProps {
  stats: {
    totalLogged: number;
    totalSmoked: number;
    totalAvoided: number;
    totalMoneySaved: number;
    currentStreak: number;
    badgesEarned: number;
    quizzesCompleted: number;
    totalGamesPlayed?: number;
    totalArticlesRead?: number;
    totalSoundsListened?: number;
  };
  smokingType: string;
}

export default function UserDetailStats({ stats, smokingType }: StatsProps) {
  const typeLabel = smokingType === "POD" ? "พัฟ" : "มวน";

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="glass-card p-4 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-white/50 mb-3">
          <LuFlame size={16} className="text-orange-400" />
          <span className="text-xs font-medium">สตรีคปัจจุบัน</span>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{stats.currentStreak}</p>
          <p className="text-xs text-white/40 mt-1">วันต่อเนื่อง</p>
        </div>
      </div>

      <div className="glass-card p-4 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-white/50 mb-3">
          <LuCigarette size={16} className="text-emerald-400" />
          <span className="text-xs font-medium">ลดได้ทั้งหมด</span>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{stats.totalAvoided.toLocaleString()}</p>
          <p className="text-xs text-white/40 mt-1">{typeLabel}</p>
        </div>
      </div>

      <div className="glass-card p-4 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-white/50 mb-3">
          <LuWallet size={16} className="text-amber-400" />
          <span className="text-xs font-medium">ประหยัดเงิน</span>
        </div>
        <div>
          <p className="text-2xl font-bold text-white">฿{stats.totalMoneySaved.toLocaleString()}</p>
          <p className="text-xs text-white/40 mt-1">บาท</p>
        </div>
      </div>

      <div className="glass-card p-4 flex flex-col justify-between">
        <div className="flex items-center gap-2 text-white/50 mb-3">
          <LuAward size={16} className="text-violet-400" />
          <span className="text-xs font-medium">ความสำเร็จ</span>
        </div>
        <div className="flex gap-4">
          <div>
            <p className="text-xl font-bold text-white">{stats.badgesEarned}</p>
            <p className="text-[10px] text-white/40 mt-1">เหรียญตรา</p>
          </div>
          <div className="w-[1px] h-full bg-white/10" />
          <div>
            <p className="text-xl font-bold text-white">{stats.quizzesCompleted}</p>
            <p className="text-[10px] text-white/40 mt-1">แบบทดสอบ</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-4 flex flex-col justify-between sm:col-span-4 lg:col-span-1">
        <div className="flex items-center gap-2 text-white/50 mb-3">
          <LuAward size={16} className="text-pink-400" />
          <span className="text-xs font-medium">กิจกรรมอื่นๆ</span>
        </div>
        <div className="flex gap-4 justify-between">
          <div>
            <p className="text-xl font-bold text-white">{stats.totalArticlesRead || 0}</p>
            <p className="text-[10px] text-white/40 mt-1">อ่านคู่มือ</p>
          </div>
          <div className="w-[1px] h-full bg-white/10" />
          <div>
            <p className="text-xl font-bold text-white">{stats.totalGamesPlayed || 0}</p>
            <p className="text-[10px] text-white/40 mt-1">เล่นเกม</p>
          </div>
          <div className="w-[1px] h-full bg-white/10" />
          <div>
            <p className="text-xl font-bold text-white">{stats.totalSoundsListened || 0}</p>
            <p className="text-[10px] text-white/40 mt-1">ฟังเสียง</p>
          </div>
        </div>
      </div>
    </div>
  );
}
