"use client";

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { LuCigaretteOff, LuActivity } from "react-icons/lu";

interface TrendPoint {
  date: string;
  cigarettesSmoked: number;
  cigarettesAvoided: number;
  moneySaved: number;
  activeUsers: number;
}

interface TooltipPayload {
  payload: TrendPoint;
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass-card px-4 py-3 !bg-[#1a1f2e]/95 border border-white/10">
      <p className="text-xs font-semibold text-white/70 mb-2">{d.date}</p>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-sm text-emerald-400">
          <LuCigaretteOff size={13} />
          <span>{d.cigarettesAvoided.toLocaleString()} ลดได้</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-rose-400">
          <LuActivity size={13} />
          <span>{d.cigarettesSmoked.toLocaleString()} ที่ยังสูบ</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-violet-400">
          <span>👥 {d.activeUsers} คน</span>
        </div>
      </div>
    </div>
  );
}

interface Props {
  data: TrendPoint[];
}

export default function SmokingTrendChart({ data }: Props) {
  // Calculate optimal tick interval based on data length
  const tickInterval = useMemo(() => {
    if (data.length <= 14) return 0; // Show every label
    if (data.length <= 30) return 1; // Every other label
    if (data.length <= 60) return 3; // Every 4th
    if (data.length <= 180) return 6; // Every 7th (weekly)
    return Math.floor(data.length / 12); // ~12 labels max
  }, [data.length]);

  return (
    <div className="glass-card p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white">
          แนวโน้มการสูบบุหรี่
        </h3>
        <p className="text-sm text-white/50">
          จำนวนที่สูบจริง vs จำนวนที่ลดได้ ตามช่วงเวลา
        </p>
      </div>

      <div className="chart-container" style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradAvoided" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradSmoked" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f87171" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
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
              interval={tickInterval}
              angle={data.length > 60 ? -45 : 0}
              textAnchor={data.length > 60 ? "end" : "middle"}
              height={data.length > 60 ? 60 : 30}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              width={45}
            />
            <Tooltip content={<TrendTooltip />} />
            <Area
              type="monotone"
              dataKey="cigarettesAvoided"
              name="ลดได้"
              stroke="#34d399"
              strokeWidth={2.5}
              fill="url(#gradAvoided)"
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
              dataKey="cigarettesSmoked"
              name="สูบจริง"
              stroke="#f87171"
              strokeWidth={2}
              fill="url(#gradSmoked)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "#f87171",
                stroke: "#0b0f1a",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-white/50">บุหรี่ที่ลดได้</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="text-xs text-white/50">ที่ยังสูบ</span>
        </div>
      </div>
    </div>
  );
}
