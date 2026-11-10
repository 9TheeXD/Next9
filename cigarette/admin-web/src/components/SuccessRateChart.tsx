"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { SuccessRateData } from "@/types";

interface SuccessRateChartProps {
  data: SuccessRateData[];
}

const BAR_COLORS = ["#6c63ff", "#a78bfa", "#c4b5fd"];

interface TooltipPayloadItem {
  payload: SuccessRateData;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  return (
    <div className="glass-card px-4 py-3">
      <p className="text-sm font-semibold text-white">{data.period}</p>
      <p className="mt-1 text-2xl font-bold text-accent-light">
        {data.successRate.toFixed(1)}%
      </p>
      <p className="text-xs text-white/50">
        {data.successfulUsers} จาก {data.totalUsers} ผู้ใช้
      </p>
    </div>
  );
}

export default function SuccessRateChart({ data }: SuccessRateChartProps) {
  return (
    <div className="glass-card p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white">อัตราความสำเร็จ</h3>
        <p className="text-sm text-white/50">
          ผู้ใช้ที่ลดการสูบบุหรี่ได้ ≥50% ในช่วงเวลาที่ผ่านมา
        </p>
      </div>

      <div className="chart-container" style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={8}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              vertical={false}
            />
            <XAxis
              dataKey="period"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
              tickFormatter={(val: number) => `${val}%`}
              domain={[0, 100]}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar dataKey="successRate" radius={[8, 8, 0, 0]} barSize={56}>
              {data.map((_entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={BAR_COLORS[index % BAR_COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
