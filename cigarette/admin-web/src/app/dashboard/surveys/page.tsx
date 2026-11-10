"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { LuArrowUpDown, LuArrowUp, LuArrowDown, LuUser, LuCheck, LuTrash2 } from "react-icons/lu";

interface SurveyRow {
  id: string;
  displayId: string;
  userId: string | null;
  ageGroup: string;
  gender: string;
  occupation: string;
  smokingType: string;
  frequency: string;
  cravingTime: string;
  duration: string;
  addictionLevel: string;
  wantedToQuit: string;
  reasonToQuit: string;
  previousMethods: string | null;
  longestQuit: string | null;
  interestedInApp: string;
  desiredHelp: string | null;
  createdAt: string;
  isDeleted: boolean;
  user: {
    displayName: string;
    phoneNumber: string | null;
    role: string;
  } | null;
}

export default function SurveysPage() {
  const [mounted, setMounted] = useState(false);
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    survey: SurveyRow | null;
  }>({ visible: false, x: 0, y: 0, survey: null });

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
    const handleClick = () => {
      if (contextMenu.visible) setContextMenu((prev) => ({ ...prev, visible: false }));
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [contextMenu.visible]);

  const loadSurveys = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    if (!isBackground) setError(null);
    try {
      const token = sessionStorage.getItem("__admin_token");
      if (!token) {
        window.location.href = `/login?to=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      const res = await fetch(`/api/admin/surveys`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setSurveys(json.data);
      } else {
        setError(json.error || "ไม่สามารถโหลดข้อมูลแบบสอบถามได้");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSurveys();
  }, [loadSurveys]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedSurveys = useMemo(() => {
    return [...surveys].sort((a, b) => {
      const aVal = (a as any)[sortKey];
      const bVal = (b as any)[sortKey];

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
  }, [surveys, sortKey, sortDir]);

  const toggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(sortedSurveys.map(s => s.id)));
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

  const handleContextMenu = (e: React.MouseEvent, survey: SurveyRow) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      survey,
    });
  };

  const handleAction = async (action: 'delete' | 'restore', id: string) => {
    setIsProcessing(true);
    try {
      const token = sessionStorage.getItem("__admin_token");
      const url = `/api/admin/surveys/${id}`;
      const options: RequestInit = action === 'delete' 
        ? { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
        : { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ isDeleted: false }) };
      
      const res = await fetch(url, options);
      const json = await res.json();
      if (res.ok && json.success) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        loadSurveys();
      } else {
        showAlert("ดำเนินการไม่สำเร็จ", json.error || "เกิดข้อผิดพลาด");
      }
    } catch (err) {
      showAlert("ดำเนินการไม่สำเร็จ", (err as Error).message);
    } finally {
      setIsProcessing(false);
      setContextMenu({ visible: false, x: 0, y: 0, survey: null });
    }
  };

  const handleBulkAction = (action: 'delete' | 'restore') => {
    if (selectedIds.size === 0) return;
    
    showConfirm(
      `ยืนยันการ${action === 'delete' ? 'ลบ' : 'กู้คืน'}`,
      `คุณแน่ใจหรือไม่ว่าต้องการ${action === 'delete' ? 'ลบ' : 'กู้คืน'}แบบสอบถามที่เลือกจำนวน ${selectedIds.size} รายการ?`,
      async () => {
        setIsProcessing(true);
        try {
          const token = sessionStorage.getItem("__admin_token");
          for (const id of Array.from(selectedIds)) {
            const url = `/api/admin/surveys/${id}`;
            const options: RequestInit = action === 'delete' 
              ? { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
              : { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ isDeleted: false }) };
            
            await fetch(url, options);
          }
          setSelectedIds(new Set());
          loadSurveys();
        } catch (err) {
          showAlert("ดำเนินการบางส่วนไม่สำเร็จ", (err as Error).message);
        } finally {
          setIsProcessing(false);
        }
      }
    );
  };

  const columns = [
    { key: "displayId", label: "รหัส 4 หลัก", sortable: true,
      render: (row: SurveyRow) => (
        <span className={row.isDeleted ? "text-red-400 line-through opacity-75" : ""}>
          {row.displayId} {row.isDeleted && <span className="text-xs ml-1">(ถูกลบ)</span>}
        </span>
      )
    },
    { key: "userId", label: "สถานะผู้ใช้", sortable: false,
      render: (row: SurveyRow) => row.userId ? (
        <span className="flex items-center gap-1 text-emerald-400">
          <LuUser size={14} /> เชื่อมต่อแล้ว ({row.user?.displayName})
        </span>
      ) : (
        <span className="text-white/40">ยังไม่สมัครใช้งาน</span>
      )
    },
    { key: "ageGroup", label: "อายุ", sortable: true },
    { key: "gender", label: "เพศ", sortable: true },
    { key: "occupation", label: "อาชีพ", sortable: true },
    { key: "smokingType", label: "ประเภทบุหรี่", sortable: true },
    { key: "frequency", label: "จำนวน/วัน", sortable: true },
    { key: "createdAt", label: "วันที่ทำแบบสอบถาม", sortable: true,
      render: (row: SurveyRow) => new Date(row.createdAt).toLocaleDateString("th-TH")
    }
  ];

  const allSelected = sortedSurveys.length > 0 && selectedIds.size === sortedSurveys.length;

  return (
    <div className="space-y-6 overview-enter pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">จัดการแบบสอบถาม</h1>
          <p className="mt-1 text-sm text-white/50">ดูข้อมูลแบบสอบถามก่อนใช้งานทั้งหมด</p>
        </div>
        <button
          onClick={() => loadSurveys()}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition"
        >
          รีเฟรช
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between glass-card p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10">
          <span className="text-sm font-semibold text-white flex items-center gap-2">
            <LuCheck size={18} className="text-indigo-400" />
            เลือกแล้ว {selectedIds.size} รายการ
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkAction('restore')}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              <LuCheck size={16} />
              {isProcessing ? "กำลังประมวลผล..." : "กู้คืน"}
            </button>
            <button
              onClick={() => handleBulkAction('delete')}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              <LuTrash2 size={16} />
              {isProcessing ? "กำลังประมวลผล..." : "ลบที่เลือก"}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <div className="glass-card p-8 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => loadSurveys()}
            className="mt-4 rounded-xl bg-white/10 px-6 py-2 text-sm font-semibold text-white hover:bg-white/20 transition"
          >
            ลองอีกครั้ง
          </button>
        </div>
      ) : loading ? (
        <div className="glass-card overflow-hidden">
          <div className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton h-12 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="data-table-wrapper">
            <table className="data-table min-w-[800px]">
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
                      className={sortKey === col.key ? "sorted cursor-pointer" : "cursor-pointer"}
                      onClick={() => col.sortable && handleSort(col.key)}
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        {col.sortable && (
                          <span className="inline-flex">
                            {sortKey === col.key ? (
                              sortDir === "asc" ? <LuArrowUp size={12} /> : <LuArrowDown size={12} />
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
                {sortedSurveys.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="!text-center !py-12 text-white/40">
                      ไม่พบแบบสอบถาม
                    </td>
                  </tr>
                ) : (
                  sortedSurveys.map((survey) => (
                    <tr 
                      key={survey.id} 
                      className={`relative hover:bg-white/5 cursor-default ${selectedIds.has(survey.id) ? 'bg-white/5' : ''}`}
                      onContextMenu={(e) => handleContextMenu(e, survey)}
                    >
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/50 cursor-pointer w-4 h-4"
                          checked={selectedIds.has(survey.id)}
                          onChange={(e) => toggleOne(e, survey.id)}
                        />
                      </td>
                      {columns.map((col) => (
                        <td key={col.key}>
                          {col.render
                            ? col.render(survey)
                            : String((survey as any)[col.key] ?? "–")}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-white/[0.06] text-xs text-white/40">
            ทั้งหมด {sortedSurveys.length} รายการ — คลิกขวาเพื่อจัดการแบบสอบถาม
          </div>
        </div>
      )}

      {/* Context Menu Portal */}
      {mounted && contextMenu.visible && contextMenu.survey && createPortal(
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 bg-gray-900 border border-white/10 shadow-xl rounded-xl py-2 w-56 text-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-white/50 border-b border-white/5 mb-1 truncate">
            แบบสอบถาม: {contextMenu.survey.displayId}
          </div>
          {contextMenu.survey.isDeleted ? (
            <button
              onClick={() => handleAction('restore', contextMenu.survey!.id)}
              disabled={isProcessing}
              className="w-full text-left px-4 py-2 text-emerald-400 hover:bg-white/5 flex items-center gap-2 transition disabled:opacity-50"
            >
              <LuCheck size={16} />
              {isProcessing ? "กำลังประมวลผล..." : "กู้คืนแบบสอบถาม"}
            </button>
          ) : (
            <button
              onClick={() => {
                setContextMenu({ visible: false, x: 0, y: 0, survey: null });
                showConfirm(
                  "ยืนยันการลบ",
                  `แน่ใจหรือไม่ว่าต้องการลบแบบสอบถาม ${contextMenu.survey!.displayId}?`,
                  () => handleAction('delete', contextMenu.survey!.id)
                );
              }}
              disabled={isProcessing}
              className="w-full text-left px-4 py-2 text-red-400 hover:bg-white/5 flex items-center gap-2 transition disabled:opacity-50"
            >
              <LuTrash2 size={16} />
              {isProcessing ? "กำลังประมวลผล..." : "ลบแบบสอบถาม"}
            </button>
          )}
        </div>,
        document.body
      )}

      {/* Dialog Modal Portal */}
      {mounted && dialog.isOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">{dialog.title}</h3>
            <p className="text-white/60 mb-6">{dialog.message}</p>
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

