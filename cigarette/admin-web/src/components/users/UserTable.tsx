"use client";

import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { LuArrowUpDown, LuArrowUp, LuArrowDown, LuTrash2, LuCheck } from "react-icons/lu";

interface UserRow {
  id: string;
  phoneNumber: string;
  displayName: string;
  role: string;
  smokingType: string;
  cigarettesPerDay: number | null;
  status: string;
  lastLogDate: string | null;
  lastLogSmoked: number | null;
  createdAt: string;
  updatedAt: string;
  xp: number;
  linkedSmokerPhone: string | null;
  linkedSmokerName: string | null;
  followers: { id: string; phoneNumber: string; displayName: string }[];
  followerCount: number;
  isDeleted: boolean;
}

interface Column {
  key: string;
  label: string;
  sortable: boolean;
  render?: (row: UserRow) => React.ReactNode;
}

interface Props {
  users: UserRow[];
  role: string;
  loading: boolean;
  onRefresh?: () => void;
}

export default function UserTable({ users, role, loading, onRefresh }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    user: UserRow | null;
  }>({ visible: false, x: 0, y: 0, user: null });
  const [isDeleting, setIsDeleting] = useState(false);

  // Custom Confirm & Alert Dialogs
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "alert" | "confirm";
    onConfirm?: () => void;
  }>({ isOpen: false, title: "", message: "", type: "alert" });

  const showAlert = (title: string, message: string) => {
    setDialog({ isOpen: true, title, message, type: "alert" });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setDialog({ isOpen: true, title, message, type: "confirm", onConfirm });
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [users, role]);

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu.visible) setContextMenu((prev) => ({ ...prev, visible: false }));
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [contextMenu.visible]);

  const handleContextMenu = (e: React.MouseEvent, user: UserRow) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      user,
    });
  };

  const handleDelete = () => {
    if (!contextMenu.user) return;
    const targetUser = contextMenu.user;

    setContextMenu((prev) => ({ ...prev, visible: false }));
    showConfirm(
      "ยืนยันการลบ",
      `คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ ${targetUser.displayName || targetUser.phoneNumber}?\nการกระทำนี้ไม่สามารถยกเลิกได้และข้อมูลที่เกี่ยวข้องทั้งหมดจะถูกลบ`,
      async () => {
        setIsDeleting(true);
        try {
          const token = sessionStorage.getItem("__admin_token");
          const res = await fetch(`/api/admin/users/${targetUser.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          const json = await res.json();
          if (res.ok && json.success) {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.delete(targetUser.id);
              return next;
            });
            if (onRefresh) onRefresh();
            else window.location.reload();
          } else {
            showAlert("ลบผู้ใช้ไม่สำเร็จ", json.error || "เกิดข้อผิดพลาด");
          }
        } catch (err) {
          showAlert("ลบผู้ใช้ไม่สำเร็จ", (err as Error).message);
        } finally {
          setIsDeleting(false);
        }
      }
    );
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    
    showConfirm(
      "ยืนยันการลบที่เลือก",
      `คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ที่เลือกจำนวน ${selectedIds.size} คน?\nการกระทำนี้ไม่สามารถยกเลิกได้`,
      async () => {
        setIsDeleting(true);
        try {
          const token = sessionStorage.getItem("__admin_token");
          for (const id of Array.from(selectedIds)) {
            await fetch(`/api/admin/users/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` }
            });
          }
          setSelectedIds(new Set());
          if (onRefresh) onRefresh();
          else window.location.reload();
        } catch (err) {
          showAlert("ลบผู้ใช้บางส่วนไม่สำเร็จ", (err as Error).message);
        } finally {
          setIsDeleting(false);
        }
      }
    );
  };

  const handleRestore = () => {
    if (!contextMenu.user) return;
    const targetUser = contextMenu.user;

    setContextMenu((prev) => ({ ...prev, visible: false }));
    showConfirm(
      "ยืนยันการกู้คืน",
      `คุณแน่ใจหรือไม่ว่าต้องการกู้คืนผู้ใช้ ${targetUser.displayName || targetUser.phoneNumber}?`,
      async () => {
        setIsDeleting(true);
        try {
          const token = sessionStorage.getItem("__admin_token");
          const res = await fetch(`/api/admin/users/${targetUser.id}`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ isDeleted: false })
          });
          const json = await res.json();
          if (res.ok && json.success) {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              next.delete(targetUser.id);
              return next;
            });
            if (onRefresh) onRefresh();
            else window.location.reload();
          } else {
            showAlert("กู้คืนไม่สำเร็จ", json.error || "เกิดข้อผิดพลาด");
          }
        } catch (err) {
          showAlert("กู้คืนไม่สำเร็จ", (err as Error).message);
        } finally {
          setIsDeleting(false);
        }
      }
    );
  };

  const handleBulkRestore = () => {
    if (selectedIds.size === 0) return;
    
    showConfirm(
      "ยืนยันการกู้คืนที่เลือก",
      `คุณแน่ใจหรือไม่ว่าต้องการกู้คืนผู้ใช้ที่เลือกจำนวน ${selectedIds.size} คน?`,
      async () => {
        setIsDeleting(true);
        try {
          const token = sessionStorage.getItem("__admin_token");
          for (const id of Array.from(selectedIds)) {
            await fetch(`/api/admin/users/${id}`, {
              method: 'PUT',
              headers: { 
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ isDeleted: false })
            });
          }
          setSelectedIds(new Set());
          if (onRefresh) onRefresh();
          else window.location.reload();
        } catch (err) {
          showAlert("กู้คืนบางส่วนไม่สำเร็จ", (err as Error).message);
        } finally {
          setIsDeleting(false);
        }
      }
    );
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortKey];
      const bVal = (b as unknown as Record<string, unknown>)[sortKey];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let cmp = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal, "th");
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }

      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [users, sortKey, sortDir]);

  const toggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(sortedUsers.map(u => u.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleOne = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (e.target.checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  const columns: Column[] = useMemo(() => {
    const base: Column[] = [
      {
        key: "createdAt",
        label: "วันที่สมัคร",
        sortable: true,
        render: (row) => new Date(row.createdAt).toLocaleDateString("th-TH"),
      },
      { key: "phoneNumber", label: "เบอร์โทร", sortable: true },
      { 
        key: "displayName", 
        label: "ชื่อ", 
        sortable: true,
        render: (row) => (
          <span className={row.isDeleted ? "text-red-400 line-through opacity-75" : ""}>
            {row.displayName} {row.isDeleted && <span className="text-xs ml-1">(ถูกลบ)</span>}
          </span>
        )
      },
      {
        key: "status",
        label: "สถานะ",
        sortable: true,
        render: (row) => {
          const cls =
            row.status === "ปลอดบุหรี่" ? "smoke-free" :
            row.status === "กำลังลด" ? "reducing" :
            row.status === "เพิ่มขึ้น" || row.status === "คงที่" ? "struggling" :
            "no-data";
          return <span className={`status-badge ${cls}`}>{row.status}</span>;
        },
      },
    ];

    if (role === "SMOKER") {
      base.push(
        {
          key: "cigarettesPerDay",
          label: "baseline/วัน",
          sortable: true,
          render: (row) => (
            <span>
              {row.cigarettesPerDay ?? "–"} {row.smokingType === "POD" ? "พัฟ" : "มวน"}
            </span>
          ),
        },
        {
          key: "lastLogSmoked",
          label: "สูบล่าสุด",
          sortable: true,
          render: (row) =>
            row.lastLogSmoked != null ? (
              <span>{row.lastLogSmoked} {row.smokingType === "POD" ? "พัฟ" : "มวน"}</span>
            ) : (
              <span className="text-white/30">–</span>
            ),
        },
        {
          key: "followerCount",
          label: "ผู้ติดตาม",
          sortable: true,
          render: (row) => (
            <span className={row.followerCount > 0 ? "text-indigo-400" : "text-white/30"}>
              {row.followerCount > 0 ? `${row.followerCount} คน` : "ไม่มี"}
            </span>
          ),
        }
      );
    }

    if (role === "FAMILY") {
      base.push({
        key: "linkedSmokerPhone",
        label: "เบอร์ผู้สูบ",
        sortable: false,
        render: (row) =>
          row.linkedSmokerPhone ? (
            <span>
              {row.linkedSmokerPhone}
              {row.linkedSmokerName && (
                <span className="text-white/40 ml-1">({row.linkedSmokerName})</span>
              )}
            </span>
          ) : (
            <span className="text-white/30">ไม่ได้เชื่อม</span>
          ),
      });
    }

    base.push({
      key: "updatedAt",
      label: "แก้ไขล่าสุด",
      sortable: true,
      render: (row) => new Date(row.updatedAt).toLocaleDateString("th-TH"),
    });

    return base;
  }, [role]);

  if (loading) {
    return (
      <div className="glass-card overflow-hidden">
        <div className="p-6">
          <div className="space-y-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="skeleton h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const allSelected = sortedUsers.length > 0 && selectedIds.size === sortedUsers.length;

  return (
    <div className="space-y-4">
      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between glass-card p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10">
          <span className="text-sm font-semibold text-white flex items-center gap-2">
            <LuCheck size={18} className="text-indigo-400" />
            เลือกแล้ว {selectedIds.size} รายการ
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleBulkRestore}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              <LuCheck size={16} />
              {isDeleting ? "กำลังประมวลผล..." : "กู้คืน"}
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              <LuTrash2 size={16} />
              {isDeleting ? "กำลังประมวลผล..." : "ลบที่เลือก"}
            </button>
          </div>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-12 text-center">
                  <input
                    type="checkbox"
                    className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer w-4 h-4"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={sortKey === col.key ? "sorted" : ""}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.sortable && (
                        <span className="inline-flex">
                          {sortKey === col.key ? (
                            sortDir === "asc" ? (
                              <LuArrowUp size={12} />
                            ) : (
                              <LuArrowDown size={12} />
                            )
                          ) : (
                            <LuArrowUpDown size={12} className="opacity-30" />
                          )}
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="!text-center !py-12 text-white/40">
                    ไม่พบผู้ใช้
                  </td>
                </tr>
              ) : (
                sortedUsers.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => router.push(`/dashboard/users/${user.id}`)}
                    onContextMenu={(e) => handleContextMenu(e, user)}
                    className={`relative ${selectedIds.has(user.id) ? 'bg-white/5' : ''}`}
                  >
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer w-4 h-4"
                        checked={selectedIds.has(user.id)}
                        onChange={(e) => toggleOne(e, user.id)}
                      />
                    </td>
                    {columns.map((col) => (
                      <td key={col.key}>
                        {col.render
                          ? col.render(user)
                          : String((user as unknown as Record<string, unknown>)[col.key] ?? "–")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-white/[0.06] text-xs text-white/40">
          ทั้งหมด {sortedUsers.length} คน — คลิกที่แถวเพื่อดูรายละเอียด — คลิกขวาเพื่อลบผู้ใช้
        </div>
      </div>

      {/* Context Menu Portal */}
      {mounted && contextMenu.visible && contextMenu.user && createPortal(
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 bg-gray-900 border border-white/10 shadow-xl rounded-xl py-2 w-56 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-white/50 border-b border-white/5 mb-1 truncate">
            {contextMenu.user.displayName || contextMenu.user.phoneNumber}
          </div>
          {contextMenu.user.isDeleted ? (
            <button
              onClick={handleRestore}
              disabled={isDeleting}
              className="w-full text-left px-4 py-2 text-emerald-400 hover:bg-white/5 flex items-center gap-2 transition disabled:opacity-50"
            >
              <LuCheck size={16} />
              {isDeleting ? "กำลังประมวลผล..." : "กู้คืนผู้ใช้"}
            </button>
          ) : (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full text-left px-4 py-2 text-red-400 hover:bg-white/5 flex items-center gap-2 transition disabled:opacity-50"
            >
              <LuTrash2 size={16} />
              {isDeleting ? "กำลังประมวลผล..." : "ลบผู้ใช้"}
            </button>
          )}
        </div>,
        document.body
      )}

      {/* Dialog Modal Portal */}
      {mounted && dialog.isOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-2">{dialog.title}</h3>
            <p className="text-white/60 mb-6 whitespace-pre-line">{dialog.message}</p>
            <div className="flex justify-end gap-3">
              {dialog.type === "confirm" && (
                <button
                  onClick={() => setDialog({ ...dialog, isOpen: false })}
                  className="px-4 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition"
                >
                  ยกเลิก
                </button>
              )}
              <button
                onClick={() => {
                  setDialog({ ...dialog, isOpen: false });
                  if (dialog.type === "confirm" && dialog.onConfirm) {
                    dialog.onConfirm();
                  }
                }}
                className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white transition font-medium"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
