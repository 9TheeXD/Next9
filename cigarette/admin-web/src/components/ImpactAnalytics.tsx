"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import KPICard from "./KPICard";
import SuccessRateChart from "./SuccessRateChart";
import type {
  ImpactAnalyticsProps,
  DailyTrendPoint,
} from "@/types";
import { LuCigaretteOff, LuDollarSign, LuUsers, LuTrendingDown } from "react-icons/lu";

interface TrendTooltipPayloadItem {
  payload: DailyTrendPoint;
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TrendTooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  return (
    <div className="glass-card px-4 py-3">
      <p className="text-xs text-white/50">{data.date}</p>
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-1.5 text-sm text-emerald-400">
          <LuCigaretteOff size={14} /> <span>{data.cigarettesAvoided.toLocaleString()} บุหรี่ที่ไม่ได้สูบ</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-amber-400">
          <LuDollarSign size={14} /> <span>฿{data.moneySaved.toFixed(2)} ประหยัดได้</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-violet-400">
          <LuUsers size={14} /> <span>{data.activeUsers} ผู้ใช้งาน</span>
        </div>
      </div>
    </div>
  );
}

export default function ImpactAnalytics({
  kpis,
  dailyTrends,
  successRates,
}: ImpactAnalyticsProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          แดชบอร์ดผลกระทบ
        </h1>
        <p className="mt-1 text-sm text-white/50">
          ภาพรวมแบบเรียลไทม์เกี่ยวกับผลกระทบของโปรแกรมเลิกสูบบุหรี่
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title="ผู้ใช้งาน"
          value={kpis.totalActiveUsers}
          subtitle="กำลังติดตาม"
          icon={<LuUsers size={20} />}
          trend={{ value: 12, isPositive: true }}
          gradient="gradient-violet"
        />
        <KPICard
          title="บุหรี่ที่ไม่ได้สูบ"
          value={kpis.totalCigarettesAvoided}
          subtitle="รวมผู้ใช้ทั้งหมด"
          icon={<LuCigaretteOff size={20} />}
          trend={{ value: 23, isPositive: true }}
          gradient="gradient-emerald"
        />
        <KPICard
          title="เงินที่ประหยัดได้"
          value={`฿${kpis.totalMoneySaved.toLocaleString()}`}
          subtitle="เงินเก็บรวม"
          icon={<LuDollarSign size={20} />}
          trend={{ value: 18, isPositive: true }}
          gradient="gradient-amber"
        />
        <KPICard
          title="ลดลงโดยเฉลี่ย"
          value={`${kpis.averageReductionPercent}%`}
          subtitle="มวนต่อวัน"
          icon={<LuTrendingDown size={20} />}
          trend={{ value: 8, isPositive: true }}
          gradient="gradient-rose"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Trend Chart — 2/3 width */}
        <div className="glass-card p-6 xl:col-span-2">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white">
              บุหรี่ที่ไม่ได้สูบในช่วงเวลาที่ผ่านมา
            </h3>
            <p className="text-sm text-white/50">
              ผลสะสมรายวันจากผู้เข้าร่วมทั้งหมด
            </p>
          </div>

          <div className="chart-container" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrends}>
                <defs>
                  <linearGradient
                    id="gradientAvoided"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient
                    id="gradientMoney"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                />
                <Tooltip content={<TrendTooltip />} />
                <Area
                  type="monotone"
                  dataKey="cigarettesAvoided"
                  stroke="#34d399"
                  strokeWidth={2.5}
                  fill="url(#gradientAvoided)"
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "#34d399",
                    stroke: "#0b0f1a",
                    strokeWidth: 2,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="moneySaved"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  fill="url(#gradientMoney)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: "#fbbf24",
                    stroke: "#0b0f1a",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="mt-4 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-white/50">บุหรี่ที่ไม่ได้สูบ</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="text-xs text-white/50">เงินที่ประหยัดได้ (฿)</span>
            </div>
          </div>
        </div>

        {/* Success Rate — 1/3 width */}
        <div className="xl:col-span-1">
          <SuccessRateChart data={successRates} />
        </div>
      </div>
    </div>
  );
}
