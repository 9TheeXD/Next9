"use client";

import { useCallback, useEffect, useState } from "react";
import { ToolShell, useToast } from "@/components/tool/Tool";
import { exportWord, filterByMonths, groupByClass, type InertRow } from "./exportWord";
import { usePublicSettings } from "@/lib/useSettings";

// Late/slow students summary (/viewforms/inert/): GET /api/inert/report?type=all|junior|high&term=1|2,
// and a Word export built in the browser (same document as the old page).

const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TYPES = [
  { key: "all", label: "รวมทั้งหมด" },
  { key: "junior", label: "ม.ต้น" },
  { key: "high", label: "ม.ปลาย" },
];

export function ViewInert() {
  // Year and current term: admin → ปีการศึกษา.
  const school = usePublicSettings("school")?.school;
  const year = school?.year || "";
  const [termPicked, setTerm] = useState("");
  const term = termPicked || String(school?.term || "2");
  const [type, setType] = useState("all");
  const [rows, setRows] = useState<InertRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exp, setExp] = useState({ start: "all", end: "all", semester: "", year: "" });
  const [working, setWorking] = useState(false);
  const toast = useToast();
  const say = toast.show;

  const load = useCallback(
    async (t: string, ty: string) => {
      setRows(null);
      try {
        const result = await (await fetch(`/api/inert/report?type=${ty}&term=${encodeURIComponent(t)}`)).json();
        if (result.success) setRows(result.data);
        else {
          setRows([]);
          say("โหลดข้อมูลไม่สำเร็จ: " + (result.message || ""), "error");
        }
      } catch {
        setRows([]);
        say("โหลดข้อมูลไม่สำเร็จ", "error");
      }
    },
    [say],
  );

  useEffect(() => {
    const t = setTimeout(() => load(term, type), 0);
    return () => clearTimeout(t);
  }, [load, term, type]);

  async function doExport(e: React.FormEvent) {
    e.preventDefault();
    const filtered = filterByMonths(rows || [], exp.start, exp.end);
    if (filtered.length === 0) return say("ไม่มีข้อมูลสำหรับส่งออกในช่วงเวลานี้", "error");
    setExportOpen(false);
    setWorking(true);
    try {
      await exportWord(groupByClass(filtered), exp.semester, exp.year);
    } catch (err) {
      say((err as Error).message === "docx-not-loaded" ? "กำลังโหลดไลบรารีสร้างไฟล์เอกสาร กรุณารอสักครู่แล้วลองใหม่" : "สร้างไฟล์ไม่สำเร็จ", "error");
    }
    setWorking(false);
  }

  const q = query.trim().toLowerCase();
  const shown = (rows || []).filter((r) => !q || [r.name, r.studentId, r.cls, r.room, r.violations, r.date].some((v) => String(v ?? "").toLowerCase().includes(q)));

  return (
    <ToolShell
      wide
      title="สรุปข้อมูลสาย - เฉื่อย"
      icon="fas fa-list-check"
      sub={
        <>
          <span>ดูและส่งออกข้อมูลนักเรียนที่มาสายหรือมีรายการผิดระเบียบ</span>
          <div className="t-tabs" role="tablist">
            {["2", "1"].map((t) => (
              <button key={t} type="button" role="tab" aria-selected={term === t} className={term === t ? "is-on" : undefined} onClick={() => setTerm(t)}>
                ภาคเรียนที่ {t}{year ? `/${year}` : ""}
              </button>
            ))}
          </div>
        </>
      }
    >
      <div className="vf-toolbar t-card">
        <div className="t-pills vf-pills">
          {TYPES.map((t) => (
            <button key={t.key} type="button" className={type === t.key ? "is-on" : undefined} onClick={() => setType(t.key)}>{t.label}</button>
          ))}
        </div>
        <input className="t-input vf-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ รหัส ห้อง รายการ" aria-label="ค้นหา" />
        <div className="vf-actions">
          <button type="button" className="t-btn t-btn-ghost" onClick={() => load(term, type)} disabled={rows === null}>
            <i className="fas fa-rotate" aria-hidden /> รีเฟรช
          </button>
          <button type="button" className="t-btn" onClick={() => setExportOpen(true)} disabled={!rows || rows.length === 0}>
            <i className="fas fa-file-word" aria-hidden /> ส่งออก Word
          </button>
        </div>
      </div>

      <div className="t-card vf-table-card">
        {rows === null ? (
          <div className="t-empty"><i className="fas fa-spinner fa-spin" aria-hidden />กำลังโหลดข้อมูล...</div>
        ) : shown.length === 0 ? (
          <div className="t-empty"><i className="far fa-folder-open" aria-hidden />ไม่มีข้อมูล</div>
        ) : (
          <>
            <p className="t-muted vf-count">{shown.length} รายการ{q && rows.length !== shown.length ? ` จาก ${rows.length}` : ""}</p>
            <div className="vf-table-wrap">
              <table className="vf-table">
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>รหัสประจำตัว</th>
                    <th>ชื่อ-สกุล</th>
                    <th>ชั้น</th>
                    <th>เลขที่</th>
                    <th>รายการผิดระเบียบ</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={i}>
                      <td data-label="วันที่">{r.date}</td>
                      <td data-label="รหัส">{r.studentId}</td>
                      <td data-label="ชื่อ"><b>{r.name}</b></td>
                      <td data-label="ชั้น">{r.cls && r.room ? `${r.cls}/${r.room}` : r.cls}</td>
                      <td data-label="เลขที่">{r.number ? `${r.number}${r.classType}` : ""}</td>
                      <td data-label="ผิดระเบียบ">{r.violations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {exportOpen && (
        <div className="t-modal" onClick={(e) => e.target === e.currentTarget && setExportOpen(false)}>
          <form className="t-modal-card vf-export" onSubmit={doExport}>
            <p><b>ส่งออกข้อมูลสรุป (Word)</b></p>
            <span className="t-label">ช่วงเดือน</span>
            <div className="vf-two">
              <select className="t-input" value={exp.start} onChange={(e) => setExp({ ...exp, start: e.target.value })} aria-label="เดือนเริ่ม">
                <option value="all">ทั้งหมด</option>
                {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
              </select>
              <select className="t-input" value={exp.end} onChange={(e) => setExp({ ...exp, end: e.target.value })} aria-label="เดือนสิ้นสุด">
                <option value="all">ทั้งหมด</option>
                {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
              </select>
            </div>
            <div className="vf-two">
              <label>
                <span className="t-label">ภาคเรียนที่</span>
                <input className="t-input" value={exp.semester} onChange={(e) => setExp({ ...exp, semester: e.target.value })} placeholder="เช่น 1, 2" required />
              </label>
              <label>
                <span className="t-label">ปีการศึกษา</span>
                <input className="t-input" value={exp.year} onChange={(e) => setExp({ ...exp, year: e.target.value })} placeholder={year ? `เช่น ${year}` : "ปีการศึกษา"} required />
              </label>
            </div>
            <div className="t-modal-actions">
              <button type="button" className="t-btn t-btn-ghost" onClick={() => setExportOpen(false)}>ยกเลิก</button>
              <button type="submit" className="t-btn">ยืนยันส่งออก</button>
            </div>
          </form>
        </div>
      )}
      {working && (
        <div className="t-modal">
          <div className="t-modal-card vf-working">
            <i className="fas fa-spinner fa-spin" aria-hidden />
            <p><b>กำลังสร้างไฟล์เอกสาร...</b></p>
            <p className="t-muted">โปรดรอสักครู่ ระบบกำลังจัดเตรียมข้อมูลลงในไฟล์ Word</p>
          </div>
        </div>
      )}
      {toast.node}
    </ToolShell>
  );
}
