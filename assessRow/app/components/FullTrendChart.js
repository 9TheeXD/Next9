'use client';

// The full trend chart (axes, tooltip) used in a grade's detail sheet on the summary page. Kept in its
// own file and loaded only when a sheet opens: the chart library is most of the page's JavaScript, and
// the page itself only needs the light SVG sparklines.

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { getScoreLabel, getScoreLevel } from '@/lib/scoreUtils';
import { CRITERIA, thaiShortDate, weekLabel } from '@/lib/dashboardShared';

const fmt = (v) => (v > 0 ? Number(v).toFixed(2) : '-');
const termKeys = (data) => [...new Set((data || []).flatMap((r) => Object.keys(r).filter((k) => /^s\d+$/.test(k))))];

function tickLabel(v, weekly) {
  if (typeof v !== 'string') return v;
  return weekly ? weekLabel(v) : thaiShortDate(v);
}

function TrendTip({ active, payload, label, weekly }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  return (
    <div className="v2-tip">
      <div className="v2-tip-date">{weekly ? weekLabel(label, true) : thaiShortDate(label, true)}</div>
      <div className={`v2-tip-score v2-tx${getScoreLevel(row.score || 0)}`}>
        {row.score > 0 ? `${fmt(row.score)} · ${getScoreLabel(row.score)}` : 'ไม่มีข้อมูล'}
      </div>
      {row.score > 0 &&
        CRITERIA.map((c) => (
          <div key={c.id} className="v2-tip-row">
            <span>{c.id}. {c.short}</span>
            <b className={`v2-tx${getScoreLevel(row[`c${c.id}`] || 0)}`}>{fmt(row[`c${c.id}`])}</b>
          </div>
        ))}
    </div>
  );
}

// Where each term begins after another: the first row of the new term, with the two term names.
function termBreaks(data, keys) {
  const out = [];
  for (let i = 1; i < (data || []).length; i++) {
    const prev = keys.find((k) => data[i - 1][k] !== undefined);
    const cur = keys.find((k) => data[i][k] !== undefined);
    if (prev && cur && prev !== cur) out.push({ date: data[i].date, before: prev.slice(1), after: cur.slice(1) });
  }
  return out;
}

// "เทอม 1 | เทอม 2" beside the line. When the later term is too short for its name to fit on
// the right, both names slide left together so neither leaves the chart.
const NAME_W = 62; // about the width of "เทอม 2" at 10px
function TermLabel({ viewBox, before, after, chartW }) {
  if (!viewBox) return null;
  const x = viewBox.x;
  const shift = Math.min(0, chartW - 4 - (x + 4 + NAME_W));
  const y = viewBox.y - 5; // above the plot, where no line can cross it
  return (
    <g fontSize="10" fill="#9ca3af" stroke="#fff" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
      <text x={x - 4 + shift} y={y} textAnchor="end">เทอม {before}</text>
      <text x={x + 4 + shift} y={y} textAnchor="start">เทอม {after}</text>
    </g>
  );
}

export default function FullTrendChart({ data, height, weekly, color = '#b91c1c' }) {
  const keys = termKeys(data);
  const breaks = termBreaks(data, keys);
  const [chartW, setChartW] = useState(0);
  return (
    <ResponsiveContainer width="100%" height={height} onResize={(w) => setChartW(w)}>
      <LineChart data={data} margin={{ top: breaks.length ? 22 : 8, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => tickLabel(v, weekly)} minTickGap={18} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
        <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} />
        {breaks.map((b) => (
          <ReferenceLine key={b.date} x={b.date} stroke="#d1d5db" strokeDasharray="3 3" label={<TermLabel before={b.before} after={b.after} chartW={chartW} />} />
        ))}
        <Tooltip content={<TrendTip weekly={weekly} />} cursor={{ stroke: '#d1d5db' }} />
        {keys.map((k) => (
          <Line key={k} type="monotone" dataKey={k} stroke={color} strokeWidth={2.25} dot={data.length <= 12 ? { r: 3 } : false} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

