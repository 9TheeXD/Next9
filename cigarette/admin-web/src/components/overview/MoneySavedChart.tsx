"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from "recharts";

interface MonthlySaved {
  month: string;
  amount: number;
  cumulative: number;
}

interface Props {
  data: MonthlySaved[];
}

interface TooltipPayloadItem {
  payload: MonthlySaved;
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
      <p className="text-xs font-semibold text-white/70 mb-2">{d.month}</p>
      <div className="space-y-1">
        <p className="text-sm text-amber-400">
          เดือนนี้: ฿{d.amount.toLocaleString()}
        </p>
        <p className="text-sm text-emerald-400">
          สะสม: ฿{d.cumulative.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default function MoneySavedChart({ data }: Props) {
  const tickInterval = useMemo(() => {
    if (data.length <= 6) return 0;
    if (data.length <= 12) return 1;
    return Math.floor(data.length / 6) - 1;
  }, [data.length]);

  return (
    <div className="glass-card p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white">
          เงินที่ประหยัดได้
        </h3>
        <p className="text-sm text-white/50">
          จำนวนเงินที่ไม่ต้องเสียไปเพราะซื้อบุหรี่ (รายเดือน + สะสม)
        </p>
      </div>

      <div className="chart-container" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              interval={tickInterval}
            />
            <YAxis
              yAxisId="bar"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              tickFormatter={(val: number) => `฿${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              width={50}
            />
            <YAxis
              yAxisId="line"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
              tickFormatter={(val: number) => `฿${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar
              yAxisId="bar"
              dataKey="amount"
              fill="url(#gradBar)"
              radius={[6, 6, 0, 0]}
              barSize={data.length > 12 ? 16 : 32}
            />
            <Line
              yAxisId="line"
              type="monotone"
              dataKey="cumulative"
              stroke="#34d399"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: "#34d399", stroke: "#0b0f1a", strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="text-xs text-white/50">รายเดือน (฿)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-white/50">สะสม (฿)</span>
        </div>
      </div>
    </div>
  );
}
