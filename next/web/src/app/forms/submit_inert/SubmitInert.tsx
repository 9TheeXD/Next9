"use client";

import { useEffect, useState } from "react";
import { StateCard, ToolShell, useToast } from "@/components/tool/Tool";
import { usePublicSettings } from "@/lib/useSettings";

// Report that a grade's late-check books were handed in (/forms/submit_inert/). Same request as the
// old page: POST /api/submit-inert/submit, multipart { reporter, classes (JSON array), file }.
// The class values are "ข้างอ.5 ม.1" … then "หลังโดม ม.1" …, in that order, as the old page sent them.

// Places: admin → ส่งเล่มตรวจสาย-เฉื่อย; grades: admin → ปีการศึกษา. Fallbacks while loading.
const DEFAULT_LEVELS = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];
const DEFAULT_PLACES = ["ข้างอ.5", "หลังโดม"];

function useInAppIOS() {
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const t = setTimeout(() => setInApp(/iPad|iPhone|iPod/.test(ua) && /FBAN|FBAV|Instagram|Line|Messenger|Twitter/i.test(ua)), 0);
    return () => clearTimeout(t);
  }, []);
  return inApp;
}

export function SubmitInert() {
  const cfg = usePublicSettings("school", "submit_inert");
  const LEVELS = cfg ? cfg.school.grades.map((g) => g.name) : DEFAULT_LEVELS;
  const PLACES = cfg ? cfg.submit_inert.places : DEFAULT_PLACES;
  const [inspectors, setInspectors] = useState<string[] | null>(null);
  const [reporter, setReporter] = useState("");
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();
  const inAppIOS = useInAppIOS();

  useEffect(() => {
    let alive = true;
    fetch("/inspectors.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((l) => alive && setInspectors(l))
      .catch(() => alive && setInspectors([]));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const t = setTimeout(() => setPreview(url), 0);
    return () => {
      clearTimeout(t);
      URL.revokeObjectURL(url);
    };
  }, [file]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
    e.target.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = reporter.trim();
    if (!name) return toast.show("กรุณากรอกชื่อผู้รายงาน", "error");
    if (!file) return toast.show("กรุณาอัปโหลดรูปภาพหลักฐาน", "error");
    const ordered = PLACES.flatMap((p) => LEVELS.map((l) => `${p} ${l}`)).filter((v) => classes.includes(v));
    const fd = new FormData();
    fd.append("reporter", name);
    fd.append("classes", JSON.stringify(ordered));
    fd.append("file", file);
    setSending(true);
    try {
      const res = await fetch("/api/submit-inert/submit", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Upload failed");
      setDone(true);
    } catch (err) {
      toast.show("เกิดข้อผิดพลาด: " + (err as Error).message, "error");
    }
    setSending(false);
  }

  if (done)
    return (
      <StateCard icon="fas fa-check" title="บันทึกสำเร็จ" tone="ok">
        <p>ระบบได้บันทึกข้อมูลการส่งเล่มเรียบร้อยแล้ว</p>
        <button
          type="button"
          className="t-btn"
          onClick={() => {
            setClasses([]);
            setFile(null);
            setPreview("");
            setDone(false);
          }}
        >
          ส่งรายงานอีกครั้ง
        </button>
      </StateCard>
    );

  const q = reporter.toLowerCase();
  const matches = (inspectors ?? []).filter((n) => n.toLowerCase().includes(q));

  return (
    <ToolShell title="บันทึกการส่งเล่มตรวจสาย-เฉื่อย" icon="fas fa-book" sub="สภานักเรียน โรงเรียนสิรินธร จังหวัดสุรินทร์">
      <form onSubmit={submit}>
        <div className="t-card">
          <span className="t-label">1. ผู้รายงาน <span className="t-req">*</span></span>
          <div className="inert-suggest">
            <input
              className="t-input"
              value={reporter}
              onChange={(e) => {
                setReporter(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 200)}
              placeholder={inspectors && inspectors.length === 0 ? "โหลดรายชื่อล้มเหลว" : "พิมพ์เพื่อค้นหา หรือเลือกจากรายการ..."}
              autoComplete="off"
            />
            {open && inspectors && (
              <div className="inert-menu">
                {matches.length === 0 ? (
                  <div className="inert-menu-empty">ไม่พบรายชื่อ</div>
                ) : (
                  matches.map((n) => (
                    <button key={n} type="button" onMouseDown={(e) => { e.preventDefault(); setReporter(n); setOpen(false); }}>
                      {n}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="t-card">
          <span className="t-label">2. ชั้นที่ตรวจ (เลือกได้หลายข้อ)</span>
          {PLACES.map((place) => (
            <div key={place} className="sub-place">
              <h3>{place}</h3>
              <div className="sub-levels">
                {LEVELS.map((l) => {
                  const v = `${place} ${l}`;
                  const on = classes.includes(v);
                  return (
                    <label key={v} className={`inert-check${on ? " is-on" : ""}`}>
                      <input type="checkbox" name="classes" value={v} checked={on} onChange={() => setClasses((c) => (on ? c.filter((x) => x !== v) : [...c, v]))} />
                      <i className={on ? "fas fa-square-check" : "far fa-square"} aria-hidden /> {l}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="t-card">
          <span className="t-label">3. รูปหลักฐาน <span className="t-req">*</span></span>
          {file && preview ? (
            <div className="sub-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="รูปหลักฐาน" />
              <button type="button" className="t-icon-btn" onClick={() => { setFile(null); setPreview(""); }} aria-label="ลบรูปภาพ">
                <i className="fas fa-xmark" aria-hidden />
              </button>
            </div>
          ) : (
            <div className="sub-upload">
              <label className="sub-upload-btn">
                <i className="fas fa-camera" aria-hidden /> เปิดกล้อง
                <input type="file" accept="image/*" capture onChange={onPick} />
              </label>
              <label className="sub-upload-btn">
                <i className="fas fa-images" aria-hidden /> เลือกรูปภาพ
                <input type="file" accept="image/*" onChange={onPick} />
              </label>
            </div>
          )}
        </div>

        <button type="submit" className="t-btn t-btn-block" disabled={sending}>
          {sending ? <><i className="fas fa-spinner fa-spin" aria-hidden /> กำลังส่งข้อมูล...</> : <><i className="fas fa-paper-plane" aria-hidden /> ส่งแบบฟอร์ม</>}
        </button>
      </form>

      {inAppIOS && (
        <div className="sub-inapp">
          <i className="fas fa-triangle-exclamation" aria-hidden />
          <h2>ฟอร์มไม่รองรับการใช้งานผ่านแอพนี้</h2>
          <p>
            กรุณากดที่ <b>จุด 3 จุด (หรือเมนู)</b> มุมบนขวา<br />
            แล้วเลือก <b>&quot;เปิดในเบราว์เซอร์ระบบ&quot; / &quot;Open in Safari&quot;</b><br />
            เพื่อส่งข้อมูลและอัปโหลดรูปได้อย่างสมบูรณ์
          </p>
        </div>
      )}
      {toast.node}
    </ToolShell>
  );
}
