"use client";

import React, { useState } from "react";

export default function ExportButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: "csv" | "json") => {
    setLoading(true);
    setError(null);

    try {
      const tokenKey = "__admin_token";
      const token = typeof window !== "undefined" ? sessionStorage.getItem(tokenKey) : null;

      if (!token) {
        window.location.href = `/login?to=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      const res = await fetch(`/api/admin/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("ส่งออกข้อมูลล้มเหลว");
      }

      if (format === "csv") {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `nextbreath_export_${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const json = await res.json();
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `nextbreath_export_${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex gap-4">
        <button
          onClick={() => handleExport("csv")}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-500 disabled:opacity-50"
        >
          <span>⬇️</span> ส่งออกเป็น CSV
        </button>
        <button
          onClick={() => handleExport("json")}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-white/20 disabled:opacity-50"
        >
          <span>{}</span> ส่งออกเป็น JSON
        </button>
      </div>
    </div>
  );
}
