"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { 
  LuLayoutDashboard, 
  LuUsers, 
  LuSettings, 
  LuLogOut, 
  LuUser, 
  LuActivity,
  LuClipboardList
} from "react-icons/lu";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: "ภาพรวม", href: "/dashboard", icon: <LuLayoutDashboard /> },
  { label: "จัดการผู้ใช้", href: "/dashboard/users", icon: <LuUsers /> },
  { label: "แบบสอบถาม", href: "/dashboard/surveys", icon: <LuClipboardList /> },
  { label: "การตั้งค่า", href: "/dashboard/settings", icon: <LuSettings /> },
];

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("__admin_token");
      window.location.href = "/login";
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-white/[0.06] bg-[#0d1117] transition-transform duration-300 md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden">
          <Image src="/logo.png" alt="Logo" width={36} height={36} className="object-cover" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-white">Next Breath</h1>
          <p className="text-[10px] text-white/40">แดชบอร์ดผู้ดูแลระบบ</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="mt-6 flex-1 space-y-1 px-3">
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-wider text-white/30">
          การวิเคราะห์
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`sidebar-link ${isActive ? "active" : ""}`}
            >
              <span className="text-base flex items-center justify-center">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.06] p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20 text-white">
            <LuUser size={16} />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-xs font-medium text-white/70">
              Student Council
            </p>
            <p className="truncate text-[10px] text-white/30">ผู้ดูแลระบบ</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/5 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
        >
          <LuLogOut size={16} /> <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
    </>
  );
}
