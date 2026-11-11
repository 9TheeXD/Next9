"use client";

import { useCallback, useEffect, useState } from "react";
import { ToolShell, useConfirm, useToast } from "@/components/tool/Tool";
import { usePublicSettings } from "@/lib/useSettings";

// Weekly status of the late-check books (/viewforms/submit_inert/). Same requests as the old page:
//   GET /api/submit-inert/data, GET /inspectors.json
//   POST /api/submit-inert/admin-override { date_str }          (mark / unmark a day as complete)
//   POST /api/submit-inert/submit multipart { id, reporter, classes }   (edit a report)
//   DELETE /api/submit-inert/delete?id=…
// The page lock is the old one: password "next9", remembered in localStorage next9_viewforms_auth.

type Rec = { id: string | number; date_str: string; reporter: string; classes: string[]; image_key?: string; is_admin_override?: boolean };

// Places: admin → ส่งเล่มตรวจสาย-เฉื่อย; grades: admin → ปีการศึกษา. Fallbacks while loading.
const DEFAULT_LEVELS = ["1", "2", "3", "4", "5", "6"];
const DEFAULT_PLACES = ["ข้างอ.5", "หลังโดม"];
const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
// Photos are served through /api/file/ (a redirect to R2).
const CDN = "/api/file/";

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  return date;
}
const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const show = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const dbDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function analyze(records: Rec[], PLACES: string[], LEVELS: string[]) {
  const all = [...new Set(records.flatMap((r) => r.classes || []))];
  const missing = PLACES.map((place) => ({ place, levels: LEVELS.filter((l) => !all.includes(`${place} ม.${l}`)) }));
  return { missing, complete: missing.every((m) => m.levels.length === 0) };
}

export function ViewSubmitInert() {
  const cfg = usePublicSettings("school", "submit_inert");
  const PLACES = cfg ? cfg.submit_inert.places : DEFAULT_PLACES;
  const LEVELS = cfg ? cfg.school.grades.map((g, i) => String(g.name).match(/\d+/)?.[0] || String(i + 1)) : DEFAULT_LEVELS;
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [data, setData] = useState<Rec[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [monday, setMonday] = useState(() => getMonday(new Date()));
  const [inspectors, setInspectors] = useState<string[]>([]);
  const [day, setDay] = useState<{ date: Date; str: string } | null>(null);
  const [edit, setEdit] = useState<{ id: string; reporter: string; classes: string[]; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<{ list: string[]; i: number } | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      setData(await (await fetch("/api/submit-inert/data")).json());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      let ok = false;
      try {
        ok = localStorage.getItem("next9_viewforms_auth") === "true";
      } catch {}
      setUnlocked(ok);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const t = setTimeout(load, 0);
    fetch("/inspectors.json")
      .then((r) => r.json())
      .then(setInspectors)
      .catch(() => {});
    return () => clearTimeout(t);
  }, [unlocked, load]);

  async function override(dateStr: string) {
    if (!(await confirm.ask("ยืนยันปรับสถานะของวันนี้?"))) return;
    try {
      const res = await (await fetch("/api/submit-inert/admin-override", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date_str: dateStr }) })).json();
      if (res.success) await load();
      else toast.show("เกิดข้อผิดพลาด: " + res.message, "error");
    } catch (e) {
      toast.show("Error: " + (e as Error).message, "error");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const reporter = edit.reporter.trim();
    if (!reporter) return toast.show("กรุณากรอกชื่อผู้รายงาน", "error");
    const ordered = PLACES.flatMap((p) => LEVELS.map((l) => `${p} ม.${l}`)).filter((v) => edit.classes.includes(v));
    const fd = new FormData();
    fd.append("id", edit.id);
    fd.append("reporter", reporter);
    fd.append("classes", JSON.stringify(ordered));
    setBusy(true);
    try {
      const res = await (await fetch("/api/submit-inert/submit", { method: "POST", body: fd })).json();
      if (res.success) {
        setEdit(null);
        setDay(null);
        await load();
        toast.show("บันทึกแล้ว");
      } else toast.show("เกิดข้อผิดพลาด: " + res.message, "error");
    } catch (err) {
      toast.show("Error: " + (err as Error).message, "error");
    }
    setBusy(false);
  }

  async function remove() {
    if (!edit) return;
    if (!(await confirm.ask("คุณแน่ใจหรือไม่ที่จะลบรายงานนี้? การกระทำนี้ไม่สามารถย้อนกลับได้", "ลบรายงาน"))) return;
    setBusy(true);
    try {
      const res = await (await fetch("/api/submit-inert/delete?id=" + encodeURIComponent(edit.id), { method: "DELETE" })).json();
      if (!res.success) throw new Error(res.message || "Delete failed");
      setEdit(null);
      await load();
      setDay(null);
      toast.show("ลบรายงานแล้ว");
    } catch (err) {
      toast.show("Error: " + (err as Error).message, "error");
    }
    setBusy(false);
  }

  if (unlocked === null) return null;
  if (!unlocked) return <Lock onUnlock={() => setUnlocked(true)} />;

  const records = (s: string) => (data || []).filter((d) => d.date_str === s);
  const friday = addDays(monday, 4);
  const dayRecords = day ? records(day.str) : [];
  const dayOverride = dayRecords.some((r) => r.is_admin_override);
  const shownRecords = dayRecords.filter((r) => !r.is_admin_override);
  const dayImages = shownRecords.map((r) => CDN + r.image_key).filter((k) => !k.endsWith("undefined") && !k.endsWith("admin_override") && k !== CDN);

  return (
    <ToolShell
      title="สรุปการส่งเล่มตรวจสาย-เฉื่อย"
      icon="fas fa-clipboard-check"
      sub={
        <div className="vs-week">
          <button type="button" onClick={() => setMonday((m) => addDays(m, -7))} aria-label="สัปดาห์ก่อน"><i className="fas fa-chevron-left" aria-hidden /></button>
          <span>{show(monday)} – {show(friday)}</span>
          <button type="button" onClick={() => setMonday((m) => addDays(m, 7))} aria-label="สัปดาห์ถัดไป"><i className="fas fa-chevron-right" aria-hidden /></button>
          <button type="button" onClick={load} aria-label="รีเฟรชข้อมูล"><i className="fas fa-rotate" aria-hidden /></button>
        </div>
      }
    >
      {failed && <div className="t-card t-empty">โหลดข้อมูลล้มเหลว</div>}
      {!failed && data === null && <div className="t-card t-empty"><i className="fas fa-spinner fa-spin" aria-hidden />กำลังโหลดข้อมูล...</div>}
      {data &&
        DAYS.map((name, i) => {
          const date = addDays(monday, i);
          const str = dbDate(date);
          const recs = records(str);
          const st = analyze(recs, PLACES, LEVELS);
          const state = recs.length === 0 ? "none" : st.complete ? "ok" : "part";
          return (
            <button key={str} type="button" className={`t-card vs-day is-${state}`} onClick={() => setDay({ date, str })}>
              <div className="vs-day-name">
                <b>{name}</b>
                <span>{show(date)}</span>
              </div>
              <div className="vs-day-body">
                {recs.length === 0 ? (
                  <span className="vs-missing">ยังไม่ส่ง</span>
                ) : (
                  <>
                    {st.missing.map((m) => (
                      <div key={m.place}><span className="t-muted">{m.place}:</span> <b className={m.levels.length ? "vs-bad" : "vs-good"}>{m.levels.length ? `ขาด ${m.levels.join(", ")}` : "ครบ"}</b></div>
                    ))}
                    <div className="t-muted vs-who">ผู้ส่ง: {[...new Set(recs.map((r) => r.reporter))].join(", ")}</div>
                  </>
                )}
              </div>
              <i className="fas fa-chevron-right vs-go" aria-hidden />
            </button>
          );
        })}

      {day && (
        <div className="t-modal" onClick={(e) => e.target === e.currentTarget && setDay(null)}>
          <div className="t-modal-card vs-sheet">
            <div className="vs-sheet-head">
              <b>รายละเอียดการส่ง ({show(day.date)})</b>
              <button type="button" className="t-icon-btn" onClick={() => setDay(null)} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
            </div>
            <button type="button" className={`vs-override${dayOverride ? " is-on" : ""}`} onClick={() => override(day.str)}>
              <i className={dayOverride ? "fas fa-circle-check" : "fas fa-check"} aria-hidden /> {dayOverride ? "ทำเครื่องหมายว่าครบแล้ว (กดเพื่อยกเลิก)" : "ทำเครื่องหมายว่าครบแล้ว"}
            </button>
            {shownRecords.length === 0 ? (
              <div className="t-empty">ไม่มีข้อมูลการส่งของวันนี้</div>
            ) : (
              shownRecords.map((r) => {
                const has = (p: string) => r.classes.filter((c) => c.startsWith(p)).map((c) => c.replace(p + " ", ""));
                const img = CDN + r.image_key;
                return (
                  <div key={String(r.id)} className="vs-rec">
                    <div className="vs-rec-text">
                      <b>{r.reporter}</b>
                      <div className="t-muted"><b>ข้างอ.5:</b> {has("ข้างอ.5").join(", ") || "-"}</div>
                      <div className="t-muted"><b>หลังโดม:</b> {has("หลังโดม").join(", ") || "-"}</div>
                      <button type="button" className="t-btn t-btn-ghost t-btn-sm" onClick={() => setEdit({ id: String(r.id), reporter: r.reporter, classes: [...r.classes], title: r.reporter })}>
                        <i className="fas fa-pen" aria-hidden /> แก้ไขฟอร์มนี้
                      </button>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="หลักฐาน" onClick={() => setLightbox({ list: dayImages, i: Math.max(0, dayImages.indexOf(img)) })} />
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {edit && (
        <div className="t-modal vs-edit-modal">
          <form className="t-modal-card vs-sheet" onSubmit={save}>
            <p><b>แก้ไขข้อมูลของ {edit.title}</b></p>
            <span className="t-label">ผู้รายงาน</span>
            <input className="t-input" list="vs-inspectors" value={edit.reporter} onChange={(e) => setEdit({ ...edit, reporter: e.target.value })} placeholder="พิมพ์ชื่อผู้รายงาน..." required />
            <datalist id="vs-inspectors">{inspectors.map((n) => <option key={n} value={n} />)}</datalist>
            {PLACES.map((p) => (
              <div key={p} className="sub-place">
                <h3>{p}</h3>
                <div className="sub-levels">
                  {LEVELS.map((l) => {
                    const v = `${p} ม.${l}`;
                    const on = edit.classes.includes(v);
                    return (
                      <label key={v} className={`inert-check${on ? " is-on" : ""}`}>
                        <input type="checkbox" value={v} checked={on} onChange={() => setEdit({ ...edit, classes: on ? edit.classes.filter((x) => x !== v) : [...edit.classes, v] })} />
                        <i className={on ? "fas fa-square-check" : "far fa-square"} aria-hidden /> ม.{l}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="vs-note">หากต้องการเปลี่ยนรูปภาพ ต้องไปอัปโหลดใหม่ที่หน้าฟอร์มเท่านั้น</p>
            <div className="t-modal-actions vs-edit-actions">
              <button type="button" className="t-btn t-btn-ghost vs-delete" onClick={remove} disabled={busy}><i className="fas fa-trash" aria-hidden /> ลบรายงาน</button>
              <span />
              <button type="button" className="t-btn t-btn-ghost" onClick={() => setEdit(null)}>ยกเลิก</button>
              <button type="submit" className="t-btn" disabled={busy}>{busy ? "กำลังบันทึก..." : "บันทึกข้อมูล"}</button>
            </div>
          </form>
        </div>
      )}

      {lightbox && (
        <div className="bld-lb" onClick={(e) => e.target === e.currentTarget && setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.list[lightbox.i]} alt="" />
          <button type="button" className="bld-lb-close" onClick={() => setLightbox(null)} aria-label="ปิด"><i className="fas fa-xmark" aria-hidden /></button>
          {lightbox.list.length > 1 && (
            <>
              <button type="button" className="bld-lb-nav is-prev" onClick={() => setLightbox((l) => l && { ...l, i: (l.i - 1 + l.list.length) % l.list.length })} aria-label="ก่อนหน้า"><i className="fas fa-chevron-left" aria-hidden /></button>
              <button type="button" className="bld-lb-nav is-next" onClick={() => setLightbox((l) => l && { ...l, i: (l.i + 1) % l.list.length })} aria-label="ถัดไป"><i className="fas fa-chevron-right" aria-hidden /></button>
            </>
          )}
          <span className="bld-lb-count">{lightbox.i + 1} / {lightbox.list.length}</span>
        </div>
      )}
      {toast.node}
      {confirm.node}
    </ToolShell>
  );
}

function Lock({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  return (
    <div className="t-center">
      <form
        className="t-login"
        onSubmit={async (e) => {
          e.preventDefault();
          // Checked by the server: admin → รหัสผ่าน ("หน้าสรุปการส่งเล่มตรวจสาย-เฉื่อย").
          let ok = false;
          try {
            const r = await fetch("/api/auth/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "viewforms", password: value }) });
            ok = r.ok;
          } catch {}
          if (ok) {
            try {
              localStorage.setItem("next9_viewforms_auth", "true");
            } catch {}
            onUnlock();
          } else {
            setError(true);
            setValue("");
          }
        }}
      >
        <i className="fas fa-lock t-login-icon" aria-hidden />
        <h1>เข้าสู่ระบบจัดการ</h1>
        <p>กรุณากรอกรหัสผ่านเพื่อเข้าถึงข้อมูล</p>
        <input type="password" value={value} onChange={(e) => { setValue(e.target.value); setError(false); }} placeholder="รหัสผ่าน" maxLength={32} autoFocus />
        {error && <span className="t-login-error">รหัสผ่านไม่ถูกต้อง</span>}
        <button type="submit" className="t-btn t-btn-block">เข้าสู่ระบบ</button>
      </form>
    </div>
  );
}
