"use client";

import React, { useEffect, useState, useRef } from "react";
import type { KPICardProps } from "@/types";

function useAnimatedCount(target: number, duration: number = 1200): number {
  const [count, setCount] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    const start = prevTarget.current;
    prevTarget.current = target;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();
    let frameId: number;

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(start + diff * eased));

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    }

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [target, duration]);

  return count;
}

export default function KPICard({
  title,
  value,
  subtitle,
  icon,
  trend,
  gradient,
}: KPICardProps) {
  const numericValue = typeof value === "number" ? value : parseFloat(value);
  const isNumeric = !isNaN(numericValue);
  const animatedValue = useAnimatedCount(isNumeric ? numericValue : 0);

  const displayValue = isNumeric
    ? numericValue >= 1000
      ? animatedValue.toLocaleString()
      : animatedValue.toString()
    : value;

  return (
    <div
      className={`${gradient} relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl`}
    >
      {/* Decorative circle */}
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-sm" />
      <div className="absolute -right-2 -top-2 h-16 w-16 rounded-full bg-white/5" />

      <div className="relative z-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-lg">
            {icon}
          </div>
          {trend && (
            <div
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                trend.isPositive
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-red-500/20 text-red-300"
              }`}
            >
              <span>{trend.isPositive ? "↑" : "↓"}</span>
              <span>{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>

        <div className="animate-count-up">
          <p className="text-3xl font-bold tracking-tight text-white">
            {displayValue}
          </p>
        </div>

        <p className="mt-1 text-sm font-medium text-white/70">{title}</p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-white/50">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
