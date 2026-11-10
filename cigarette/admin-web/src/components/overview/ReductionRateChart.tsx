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
} from "recharts";

interface ReductionPoint {
  date: string;
  rate: number;
}

interface Props {
  data: ReductionPoint[];
}

interface TooltipPayloadItem {
  payload: ReductionPoint;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass-card px-4 py-3 !bg-[#1a1f2e]/95 border border-white/10">
      <p className="text-xs text-white/50 mb-1">{d.date}</p>
      <p className={`text-lg font-bold ${d.rate >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
        {d.rate >= 0 ? "↓" : "↑"} {Math.abs(d.rate)}%
      </p>
      <p className="text-xs text-white/40 mt-1">
        {d.rate >= 0 ? "ลดลง" : "เพิ่มขึ้น"} เทียบกับ baseline
      </p>
    </div>
  );
}

export default function ReductionRateChart({ data }: Props) {
  const tickInterval = useMemo(() => {
    if (data.length <= 12) return 0;
    if (data.length <= 26) return 1;
    return Math.floor(data.length / 10) - 1;
  }, [data.length]);

  return (
    <div className="glass-card p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white">
          อัตราการลดการสูบ
        </h3>
        <p className="text-sm text-white/50">
          เปอร์เซ็นต์ที่ลดลงเทียบกับ baseline (รายสัปดาห์)
        </p>
      </div>

      <div className="chart-container" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradReduction" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
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
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              tickFormatter={(val: number) => `${val}%`}
              domain={["auto", "auto"]}
              width={45}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="rate"
              stroke="#a78bfa"
              strokeWidth={2.5}
              fill="url(#gradReduction)"
              dot={false}
              activeDot={{
                r: 5,
                fill: "#a78bfa",
                stroke: "#0b0f1a",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
