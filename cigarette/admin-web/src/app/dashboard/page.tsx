"use client";

import React, { useEffect, useState, useCallback } from "react";
import OverviewKPISection from "@/components/overview/OverviewKPISection";
import SmokingTrendChart from "@/components/overview/SmokingTrendChart";
import TypeDistributionChart from "@/components/overview/TypeDistributionChart";
import MoneySavedChart from "@/components/overview/MoneySavedChart";
import ReductionRateChart from "@/components/overview/ReductionRateChart";
import TimeRangeSelector from "@/components/overview/TimeRangeSelector";

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

interface TrendPoint {
  date: string;
  cigarettesSmoked: number;
  cigarettesAvoided: number;
  moneySaved: number;
  activeUsers: number;
}

interface TypeDistribution {
  type: string;
  count: number;
  percentage: number;
}

interface MonthlySaved {
  month: string;
  amount: number;
  cumulative: number;
}

interface ReductionPoint {
  date: string;
  rate: number;
}

interface OverviewData {
  kpis: OverviewKPIs;
  trendData: TrendPoint[];
  typeDistribution: TypeDistribution[];
  monthlySaved: MonthlySaved[];
  reductionTrend: ReductionPoint[];
  firstUserDate: string | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("all");

  const loadData = useCallback(async (selectedRange: string, isBackground = false) => {
    if (!isBackground) setLoading(true);
    if (!isBackground) setError(null);
    try {
      const token = typeof window !== "undefined" ? sessionStorage.getItem("__admin_token") : null;
      if (!token) {
        if (typeof window !== "undefined") window.location.href = `/login?to=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      const res = await fetch(`/api/analytics/overview?range=${selectedRange}&_t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError("ไม่สามารถโหลดข้อมูลได้");
        }
      } else if (res.status === 401) {
        if (typeof window !== "undefined") window.location.href = `/login?to=${encodeURIComponent(window.location.pathname)}`;
      } else {
        setError("เกิดข้อผิดพลาดในการโหลดข้อมูล");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(range);
  }, [range, loadData]);

  const handleRangeChange = (newRange: string) => {
    setRange(newRange);
  };

  if (loading) {
    return (
      <div className="space-y-8 overview-enter">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            ภาพรวมระบบ
          </h1>
          <p className="mt-1 text-sm text-white/50">กำลังโหลดข้อมูล...</p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-36 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="skeleton h-96 rounded-2xl xl:col-span-2" />
          <div className="skeleton h-96 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="skeleton h-80 rounded-2xl" />
          <div className="skeleton h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-red-400">ไม่สามารถโหลดข้อมูล: {error}</p>
        <button
          onClick={() => loadData(range)}
          className="mt-4 rounded-xl bg-indigo-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          ลองอีกครั้ง
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8 overview-enter">
      {/* Header with Time Range */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            ภาพรวมระบบ
          </h1>
          <p className="mt-1 text-sm text-white/50">
            สรุปข้อมูลผลกระทบของโปรแกรมเลิกสูบบุหรี่ Next Breath
            {data.firstUserDate && (
              <span className="ml-2 text-white/30">
                (ตั้งแต่ {new Date(data.firstUserDate).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })})
              </span>
            )}
          </p>
        </div>
        <TimeRangeSelector value={range} onChange={handleRangeChange} />
      </div>

      {/* KPI Section */}
      <OverviewKPISection kpis={data.kpis} />

      {/* Charts Row 1 — Trend + Distribution */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SmokingTrendChart data={data.trendData} />
        </div>
        <div className="xl:col-span-1">
          <TypeDistributionChart data={data.typeDistribution} />
        </div>
      </div>

      {/* Charts Row 2 — Money Saved + Reduction Rate */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MoneySavedChart data={data.monthlySaved} />
        <ReductionRateChart data={data.reductionTrend} />
      </div>
    </div>
  );
}
