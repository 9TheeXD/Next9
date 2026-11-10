"use client";

import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface TypeDistribution {
  type: string;
  count: number;
  percentage: number;
}

interface Props {
  data: TypeDistribution[];
}

const COLORS = ["#6c63ff", "#f59e0b"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderCustomLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent, value } = props;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  const pct = Math.round(percent * 1000) / 10;
  if (pct < 5) return null;

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={13}
      fontWeight={700}
    >
      {value} ({pct}%)
    </text>
  );
}

interface TooltipPayloadItem {
  payload: TypeDistribution;
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
      <p className="text-sm font-semibold text-white">{d.type}</p>
      <p className="text-lg font-bold text-accent-light mt-1">{d.count} คน</p>
      <p className="text-xs text-white/50">{d.percentage}%</p>
    </div>
  );
}

export default function TypeDistributionChart({ data }: Props) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="glass-card p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">สัดส่วนบุหรี่ / พอต</h3>
        <p className="text-sm text-white/50">
          ผู้สูบทั้งหมด {total} คน
        </p>
      </div>

      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={95}
              paddingAngle={4}
              dataKey="count"
              label={renderCustomLabel}
              labelLine={false}
            >
              {data.map((_entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  stroke="transparent"
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-6 mt-2">
        {data.map((d, i) => (
          <div key={d.type} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-xs text-white/60">
              {d.type} ({d.percentage}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
