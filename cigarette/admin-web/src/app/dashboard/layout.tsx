"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import { LuMenu, LuActivity } from "react-icons/lu";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = sessionStorage.getItem("__admin_token");
    if (!token) {
      router.replace(`/login?to=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, router]);

  return (
    <div className="flex min-h-screen bg-[#0b0f1a]">
      {/* Mobile Header (visible only on small screens) */}
      <div className="fixed top-0 left-0 right-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.06] bg-[#0d1117] px-4 md:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
            <Image src="/logo.png" alt="Logo" width={32} height={32} className="object-cover" />
          </div>
          <h1 className="text-sm font-bold text-white">Next Breath</h1>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(true)} 
          className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <LuMenu size={24} />
        </button>
      </div>

      <Sidebar 
        isOpen={isMobileMenuOpen} 
        onClose={() => setIsMobileMenuOpen(false)} 
      />
      
      {/* Main Content Area */}
      <main className="flex-1 w-full p-4 pt-20 md:ml-64 md:p-8">
        {children}
      </main>
    </div>
  );
}
