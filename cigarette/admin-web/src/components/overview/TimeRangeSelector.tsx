"use client";

import React from "react";

interface TimeRangeSelectorProps {
  value: string;
  onChange: (range: string) => void;
}

const ranges = [
  { label: "1 เดือน", value: "1m" },
  { label: "6 เดือน", value: "6m" },
  { label: "ทั้งหมด", value: "all" },
];

export default function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="time-range-selector">
      {ranges.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          className={`time-range-btn ${value === r.value ? "active" : ""}`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
