"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LuActivity } from "react-icons/lu";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: "admin", password }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        // Must be an admin to access dashboard
        if (json.data.user.role !== "ADMIN") {
          setError("ปฏิเสธการเข้าถึง ต้องใช้สิทธิ์ผู้ดูแลระบบ");
          setLoading(false);
          return;
        }

        // Store token
        sessionStorage.setItem("__admin_token", json.data.token);
        
        // Redirect back to intended page or dashboard
        const searchParams = new URLSearchParams(window.location.search);
        const to = searchParams.get("to");
        router.push(to || "/dashboard");
      } else {
        setError(json.error || "ข้อมูลรับรองไม่ถูกต้อง");
      }
    } catch (err) {
      setError("เกิดข้อผิดพลาดระหว่างการเข้าสู่ระบบ โปรดลองอีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0f1a] px-4">
      <div className="w-full max-w-md space-y-8 glass-card p-8 sm:p-12">
        <div className="text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden shadow-lg shadow-indigo-500/20">
            <Image src="/logo.png" alt="Logo" width={80} height={80} className="object-cover" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white">
            พอร์ทัลผู้ดูแลระบบ
          </h2>
          <p className="mt-2 text-sm text-white/50">
            ลงชื่อเข้าใช้เพื่อเข้าถึงการวิเคราะห์ผลกระทบ
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/70">
                รหัสผ่านผู้ดูแลระบบ
              </label>
              <input
                type="password"
                required
                className="mt-1 block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/20 outline-none transition-all focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative flex w-full justify-center rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#0b0f1a] disabled:opacity-50"
          >
            {loading ? "กำลังลงชื่อเข้าใช้..." : "ลงชื่อเข้าใช้"}
          </button>
        </form>
      </div>
    </div>
  );
}
