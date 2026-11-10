"use client";

import React from "react";
import { LuUsers, LuCigaretteOff, LuDollarSign, LuTrendingDown, LuTrendingUp, LuHeart } from "react-icons/lu";
import KPICard from "../KPICard";

interface OverviewKPIs {
  totalSmokers: number;
  totalFamily: number;
  totalCigarettesAvoided: number;
  totalMoneySaved: number;
  averageReductionPercent: number;
  smokersReducing: number;
  smokersIncreasing: number;
  smokersStable: number;
}

interface Props {
  kpis: OverviewKPIs;
}

export default function OverviewKPISection({ kpis }: Props) {
  return (
    <div className="overview-kpi-grid">
      {/* Row 1 — Primary KPIs */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title="ผู้สูบทั้งหมด"
          value={kpis.totalSmokers}
          subtitle={`ผู้ติดตาม ${kpis.totalFamily} คน`}
          icon={<LuUsers size={20} />}
          gradient="gradient-violet"
        />
        <KPICard
          title="บุหรี่ที่ไม่ได้สูบ"
          value={kpis.totalCigarettesAvoided.toLocaleString()}
          subtitle="สะสมตั้งแต่เริ่มต้น"
          icon={<LuCigaretteOff size={20} />}
          trend={{ value: kpis.averageReductionPercent, isPositive: true }}
          gradient="gradient-emerald"
        />
        <KPICard
          title="เงินที่ประหยัดได้"
          value={`฿${kpis.totalMoneySaved.toLocaleString()}`}
          subtitle="ไม่ต้องเสียไปกับบุหรี่"
          icon={<LuDollarSign size={20} />}
          gradient="gradient-amber"
        />
        <KPICard
          title="อัตราลดลงเฉลี่ย"
          value={`${kpis.averageReductionPercent}%`}
          subtitle="เทียบกับ baseline"
          icon={<LuTrendingDown size={20} />}
          gradient="gradient-rose"
        />
      </div>

      {/* Row 2 — Reduction Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-5">
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15">
            <LuTrendingDown size={22} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-400">{kpis.smokersReducing}</p>
            <p className="text-xs text-white/50">กำลังลดการสูบ</p>
          </div>
        </div>
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15">
            <LuHeart size={22} className="text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-400">{kpis.smokersStable}</p>
            <p className="text-xs text-white/50">คงที่</p>
          </div>
        </div>
        <div className="glass-card p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15">
            <LuTrendingUp size={22} className="text-rose-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-rose-400">{kpis.smokersIncreasing}</p>
            <p className="text-xs text-white/50">เพิ่มขึ้น</p>
          </div>
        </div>
      </div>
    </div>
  );
}
