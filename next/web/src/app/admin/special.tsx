"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthError, adminFetch, getToken } from "./api";

type Toast = (t: string, k?: "success" | "error") => void;
type Props = { toast: Toast; onAuthError: () => void };

function useGuard(onAuthError: () => void, toast: Toast) {
  return useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) onAuthError();
      else toast((e as Error).message, "error");
    },
    [onAuthError, toast],
  );
}

// ---------------- Dashboard ----------------
export function Dashboard({ toast, onAuthError }: Props) {
  const [checks, setChecks] = useState<any[] | null>(null);
  const [deep, setDeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const guard = useGuard(onAuthError, toast);
  const file = useRef<HTMLInputElement>(null);

  const run = useCallback(
    async (d: boolean) => {
      setBusy(true);
      try {
        setChecks((await adminFetch(`/api/admin/status${d ? "?deep=1" : ""}`)).checks);
        setDeep(d);
      } catch (e) {
        guard(e);
      }
      setBusy(false);
    },
    [guard],
  );

  useEffect(() => {
    const t = setTimeout(() => run(false), 0);
    return () => clearTimeout(t);
  }, [run]);

  async function download(withPasswords: boolean) {
    try {
      const r = await fetch(`/api/admin/export${withPasswords ? "?passwords=1" : ""}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `next9-settings-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      guard(e);
    }
  }

  async function restore(f: File) {
    try {
      const data = JSON.parse(await f.text());
      const j = await adminFetch("/api/admin/import", { method: "POST", body: JSON.stringify(data) });
      toast(`นำเข้าแล้ว: ${j.imported.length} หมวด`);
    } catch (e) {
      guard(e);
    }
  }

  const groups = [...new Set((checks || []).map((c) => c.group))];
  const bad = (checks || []).filter((c) => !c.ok).length;

  return (
    <>
      <section className="t-card a-part">
        <h2 className="a-part-title">สถานะระบบ</h2>
        {checks === null ? (
          <p className="a-loading"><i className="fas fa-spinner fa-spin" aria-hidden /></p>
        ) : (
          <>
            <p className={bad ? "a-error" : "a-ok"}>
              <i className={bad ? "fas fa-triangle-exclamation" : "fas fa-circle-check"} aria-hidden /> {bad ? `มี ${bad} รายการที่ต้องตั้งค่า` : "ทุกอย่างพร้อมใช้งาน"}
              {!deep && " (ยังไม่ได้ทดสอบเชื่อมต่อจริง)"}
            </p>
            {groups.map((g) => (
              <div key={g} className="a-checks">
                <h3>{g}</h3>
                {checks
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <div key={c.name} className={`a-check-row${c.ok ? " is-ok" : " is-bad"}`}>
                      <i className={c.ok ? "fas fa-circle-check" : "fas fa-circle-xmark"} aria-hidden />
                      <span className="a-check-name">{c.name}</span>
                      <span className="a-check-detail">{c.detail}</span>
                      {!c.ok && c.fix && <span className="a-check-fix">{c.fix}</span>}
                    </div>
                  ))}
              </div>
            ))}
          </>
        )}
        <div className="a-links">
          <button type="button" className="t-btn t-btn-sm" disabled={busy} onClick={() => run(true)}>
            <i className={busy ? "fas fa-spinner fa-spin" : "fas fa-plug-circle-check"} aria-hidden /> ทดสอบเชื่อมต่อ Google และ LINE
          </button>
        </div>
      </section>

      <section className="t-card a-part">
        <h2 className="a-part-title">สำรองและกู้คืนการตั้งค่า</h2>
        <p className="a-help">
          ไฟล์สำรองเก็บการตั้งค่าทุกหน้าในที่นี้ (ไม่รวมคีย์เชื่อมต่อ และข้อมูลที่ฟอร์มบันทึก) ใช้ย้ายไปเว็บใหม่หรือย้อนกลับหลังแก้ผิด ควรดาวน์โหลดเก็บไว้ก่อนแก้ครั้งใหญ่
        </p>
        <div className="a-links">
          <button type="button" className="t-btn t-btn-sm" onClick={() => download(false)}>
            <i className="fas fa-download" aria-hidden /> ดาวน์โหลดไฟล์สำรอง
          </button>
          <button type="button" className="t-btn t-btn-sm t-btn-ghost" onClick={() => download(true)}>
            <i className="fas fa-download" aria-hidden /> ดาวน์โหลดพร้อมรหัสผ่าน
          </button>
          <button type="button" className="t-btn t-btn-sm t-btn-ghost" onClick={() => file.current?.click()}>
            <i className="fas fa-upload" aria-hidden /> กู้คืนจากไฟล์
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) restore(f);
            }}
          />
        </div>
      </section>
    </>
  );
}

// ---------------- Passwords ----------------
export function Passwords({ toast, onAuthError }: Props) {
  const [kinds, setKinds] = useState<Record<string, { label: string; value: string }> | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [show, setShow] = useState(false);
  const guard = useGuard(onAuthError, toast);

  useEffect(() => {
    adminFetch("/api/admin/passwords")
      .then((j) => setKinds(j.kinds))
      .catch(guard);
  }, [guard]);

  async function save() {
    try {
      const j = await adminFetch("/api/admin/passwords", { method: "PUT", body: JSON.stringify(edit) });
      setKinds(j.kinds);
      const changedAdmin = !!edit.admin;
      setEdit({});
      toast("บันทึกรหัสผ่านแล้ว");
      if (changedAdmin) setTimeout(onAuthError, 800);
    } catch (e) {
      guard(e);
    }
  }

  if (!kinds) return <p className="a-loading"><i className="fas fa-spinner fa-spin" aria-hidden /></p>;
  return (
    <section className="t-card a-part">
      <p className="a-help">
        รหัสผ่านของแต่ละระบบ ผู้ดูแลเห็นรหัสปัจจุบันได้เสมอ เพื่อไม่ให้รหัสหายเมื่อเปลี่ยนรุ่น รหัสผ่านผู้ดูแลใช้เข้าหน้าที่ต้องใช้รหัสอื่นได้ด้วย เปลี่ยนรหัสผู้ดูแลแล้วทุกเครื่องต้องเข้าสู่ระบบใหม่
      </p>
      <label className="a-check">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> <span>แสดงรหัสปัจจุบัน</span>
      </label>
      {Object.entries(kinds).map(([k, d]) => (
        <label key={k} className="a-field">
          <span className="t-label">{d.label}</span>
          <span className="a-pw-row">
            <code className="a-pw-now">{show ? d.value || "(ยังไม่ได้ตั้ง)" : "••••••"}</code>
            <input className="t-input" value={edit[k] ?? ""} placeholder="รหัสใหม่ (เว้นว่าง = ไม่เปลี่ยน)" onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
          </span>
        </label>
      ))}
      <div className="a-save is-dirty">
        <span />
        <button type="button" className="t-btn" disabled={!Object.values(edit).some((v) => v.trim())} onClick={save}>
          <i className="fas fa-floppy-disk" aria-hidden /> บันทึกรหัสผ่าน
        </button>
      </div>
    </section>
  );
}

// ---------------- Integration keys ----------------
export function Secrets({ toast, onAuthError }: Props) {
  const [secrets, setSecrets] = useState<Record<string, { label: string; source: string; hint: string }> | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const guard = useGuard(onAuthError, toast);

  useEffect(() => {
    adminFetch("/api/admin/secrets")
      .then((j) => setSecrets(j.secrets))
      .catch(guard);
  }, [guard]);

  async function save(values: Record<string, string | null>) {
    try {
      const j = await adminFetch("/api/admin/secrets", { method: "PUT", body: JSON.stringify(values) });
      setSecrets(j.secrets);
      setEdit({});
      toast("บันทึกแล้ว");
    } catch (e) {
      guard(e);
    }
  }

  if (!secrets) return <p className="a-loading"><i className="fas fa-spinner fa-spin" aria-hidden /></p>;
  const src = (s: string) => (s === "admin" ? "ตั้งในหน้านี้" : s === "env" ? "จาก Vercel (Environment Variables)" : "ยังไม่ได้ตั้ง");
  return (
    <section className="t-card a-part">
      <p className="a-help">
        คีย์ที่ใส่ที่นี่ใช้แทนค่าใน Vercel ทันที ระบบจะไม่แสดงค่าเต็มกลับมา (แสดงแค่อีเมลหรือท้ายคีย์) ถ้าต้องการกลับไปใช้ค่าใน Vercel ให้กด &quot;ล้าง&quot;
      </p>
      {Object.entries(secrets).map(([k, d]) => {
        const isJson = k.endsWith("_json");
        return (
          <div key={k} className="a-field">
            <span className="t-label">{d.label}</span>
            <span className={`a-secret-state is-${d.source}`}>
              <i className={d.source === "none" ? "fas fa-circle-xmark" : "fas fa-circle-check"} aria-hidden /> {src(d.source)}
              {d.hint && <code>{d.hint}</code>}
            </span>
            {isJson ? (
              <textarea className="t-input a-textarea" rows={3} value={edit[k] ?? ""} placeholder="วางเนื้อหาไฟล์ JSON ทั้งไฟล์" onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
            ) : (
              <input className="t-input" value={edit[k] ?? ""} placeholder="ค่าใหม่" onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
            )}
            {isJson && (
              <label className="t-btn t-btn-sm t-btn-ghost a-file-btn">
                <i className="fas fa-file-arrow-up" aria-hidden /> เลือกไฟล์ JSON
                <input type="file" accept=".json,application/json" hidden onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) f.text().then((t) => setEdit((cur) => ({ ...cur, [k]: t })));
                }} />
              </label>
            )}
            {d.source === "admin" && (
              <button type="button" className="t-btn t-btn-sm t-btn-ghost" onClick={() => save({ [k]: null })}>
                ล้าง (กลับไปใช้ค่าใน Vercel)
              </button>
            )}
          </div>
        );
      })}
      <div className="a-save is-dirty">
        <span />
        <button type="button" className="t-btn" disabled={!Object.values(edit).some((v) => v.trim())} onClick={() => save(edit)}>
          <i className="fas fa-floppy-disk" aria-hidden /> บันทึกคีย์
        </button>
      </div>
    </section>
  );
}

// ---------------- Handover ----------------
export function Handover() {
  return (
    <section className="t-card a-part a-doc">
      <h2 className="a-part-title">เช็กลิสต์ส่งต่อให้สภารุ่นถัดไป</h2>
      <ol>
        <li>
          <b>รหัสผ่าน:</b> เปลี่ยนรหัสผ่านทุกระบบที่หน้า <a href="#passwords">รหัสผ่าน</a> แล้วส่งให้ทีมใหม่ (รหัสผู้ดูแลให้เฉพาะคนดูแลเว็บ)
        </li>
        <li>
          <b>ข้อมูลพรรค/สภา:</b> แก้ชื่อ โลโก้ สี เมนู โซเชียลที่ <a href="#site">ข้อมูลหลักของเว็บ</a> แล้วแก้ <a href="#home">หน้าแรก</a>, <a href="#policies">นโยบาย</a>, <a href="#about">หน้าเกี่ยวกับ</a>
        </li>
        <li>
          <b>สมาชิก:</b> แก้ฝ่าย/งานที่ <a href="#members">สมาชิก (โครงสร้าง)</a> แล้วเพิ่ม/ลบคนและตำแหน่งที่ <a href="#council">สมาชิกสภา</a> (รายชื่อนี้เป็นผู้ตรวจและคนลงเวรด้วย) ใส่รูปที่ <a href="/member/editor/" target="_blank">หน้าแก้ไขข้อมูลสมาชิก</a>
        </li>
        <li>
          <b>ภาคเรียน:</b> เพิ่มภาคเรียนใหม่และวันเปิด-ปิดที่ <a href="#terms">ภาคเรียน</a> (วันเปิด-ปิดเทอม ใช้ร่วมกันทุกระบบ รวมถึงระบบประเมินหน้าเสาธง)
        </li>
        <li>
          <b>Google Sheet:</b> สร้างไฟล์ใหม่ของปีการศึกษา แชร์ให้อีเมล service account (ดูที่ <a href="#secrets">คีย์เชื่อมต่อ</a>) เป็น Editor แล้วใส่ ID ที่ <a href="#building">ตรวจอาคาร</a>, <a href="#terms">ภาคเรียน</a> (Sheet สาย-เฉื่อย), <a href="#classes">นักเรียนและห้องเรียน</a> (ดูตัวอย่าง แล้วกดใช้รายชื่อนี้ ห้องและกลุ่ม ก/ข ของทุกระบบอัปเดตตาม)
        </li>
        <li>
          <b>ผู้ตรวจและคนลงเวร:</b> เปิด/ปิดรายคนที่ <a href="#council">สมาชิกสภา</a>
        </li>
        <li>
          <b>เล่มชมพู:</b> สัปดาห์ที่ 1 นับจากวันเปิดเทอมอัตโนมัติ ปรับหัวข้อตรวจได้ที่ <a href="#pinkbook">เล่มชมพู</a>
        </li>
        <li>
          <b>ระบบประเมินหน้าเสาธง:</b> ตรวจผู้ใช้และสิทธิ์ เวลาและวันประเมินที่หมวด <a href="#assess_people">ระบบประเมินหน้าเสาธง</a>
        </li>
        <li>
          <b>ตรวจสอบ:</b> กลับไปหน้า <a href="#dashboard">ภาพรวม</a> กด &quot;ทดสอบเชื่อมต่อ&quot; ให้ขึ้นเขียวทั้งหมด แล้วดาวน์โหลดไฟล์สำรองเก็บไว้
        </li>
      </ol>

      <h2 className="a-part-title">ถ้าต้องเปลี่ยนบัญชี (ไม่ต้องทำทุกปี)</h2>
      <ul>
        <li>
          <b>Google service account:</b> Google Cloud Console → IAM → Service Accounts → สร้าง key แบบ JSON (เปิด Google Sheets API ในโปรเจกต์) แล้ววางที่ <a href="#secrets">คีย์เชื่อมต่อ</a> และแชร์ทุก Sheet ให้อีเมลใหม่
        </li>
        <li>
          <b>LINE bot:</b> LINE Developers → Messaging API → คัดลอก Channel secret และ Channel access token มาใส่ที่ <a href="#secrets">คีย์เชื่อมต่อ</a> ตั้ง Webhook URL เป็น <code>&lt;ที่อยู่เว็บ&gt;/api/line/webhook</code> แล้วกด Verify
        </li>
        <li>
          <b>เวรประจำวัน (Apps Script):</b> เปิด Google Sheet ใหม่ → Extensions → Apps Script → วางโค้ดจากไฟล์ <code>ShiftManager/apps-script/Code.gs</code> ในโค้ดของเว็บ → Project Settings → Script properties ใส่ <code>SHEET_ID</code> และ <code>SHEET_GID</code> → Deploy เป็น Web app (Execute as: Me, Anyone) แล้วนำ URL มาใส่ที่ <a href="#duty">เวรประจำวัน</a>
        </li>
        <li>
          <b>เจ้าของบัญชี Vercel / Turso / Cloudflare / GitHub:</b> เพิ่มคนดูแลรุ่นใหม่เป็นสมาชิกทีมก่อนคนเก่าจบการศึกษา ค่าใน Vercel (Environment Variables) ไม่ต้องแก้ ยกเว้นย้ายฐานข้อมูลหรือที่เก็บไฟล์ รายละเอียดอยู่ใน <code>HANDOVER.md</code> ในโค้ดของเว็บ
        </li>
      </ul>
    </section>
  );
}

// ---------------- Every page of every system ----------------
type L = { path: string; title: string; note?: string };
const ASSESS = "https://assess-row-sdh.vercel.app";
const CATALOG: { title: string; icon: string; items: L[] }[] = [
  {
    title: "แบบฟอร์ม (สมาชิกสภาใช้กรอก)",
    icon: "fas fa-file-pen",
    items: [
      { path: "/forms/building/", title: "ตรวจอาคาร" },
      { path: "/forms/inert/", title: "ลงชื่อสาย - เฉื่อย" },
      { path: "/forms/submit_inert/", title: "รายงานส่งเล่มตรวจสาย - เฉื่อย" },
      { path: "/forms/pinkbook/", title: "ตรวจเล่มชมพู" },
      { path: "/duty/", title: "ลงเวรประจำวัน" },
      { path: "/forms/toilet/?room=<รหัสห้อง>", title: "แจ้งปัญหาห้องน้ำ (เปิดจาก QR หน้าห้องน้ำ)", note: "สร้าง QR ที่หน้าตั้งค่าระบบห้องน้ำ" },
    ],
  },
  {
    title: "หน้าสรุปผล",
    icon: "fas fa-chart-simple",
    items: [
      { path: "/viewforms/building/", title: "สรุปผลการตรวจอาคาร" },
      { path: "/viewforms/inert/", title: "สรุปรายชื่อสาย - เฉื่อย" },
      { path: "/viewforms/submit_inert/", title: "สรุปการส่งเล่มตรวจสาย - เฉื่อย", note: "รหัสผ่าน: หน้าสรุปการส่งเล่ม" },
      { path: "/viewforms/pinkbook/", title: "สรุปผลการตรวจเล่มชมพู", note: "รหัสผ่าน: หน้าสรุปผลเล่มชมพู" },
      { path: "/duty/summary.html", title: "สรุปการลงเวร" },
      { path: "/duty/dashboard.html", title: "ลงเวร (หน้าหลักหลังเลือกชื่อ)" },
      { path: "/duty/photos.html", title: "รูปเวรประจำวัน" },
    ],
  },
  {
    title: "คลังภาพ",
    icon: "fas fa-images",
    items: [{ path: "/photos/", title: "อัลบั้มรูปกิจกรรม", note: "รหัสผ่าน: คลังภาพ" }],
  },
  {
    title: "จัดการ (ผู้ดูแล)",
    icon: "fas fa-user-shield",
    items: [
      { path: "/admin/", title: "หน้าจัดการระบบ (หน้านี้)", note: "รหัสผ่านผู้ดูแล" },
      { path: "/member/editor/", title: "แก้ไขข้อมูลสมาชิก", note: "รหัสผู้ดูแล หรือรหัสแก้ไขสมาชิก" },
      { path: "/forms/toilet/manage/", title: "ดูเรื่องที่แจ้งห้องน้ำ", note: "รหัสผ่าน: ระบบห้องน้ำ" },
      { path: "/forms/toilet/admin/", title: "ตั้งค่าห้องน้ำและพิมพ์ QR Code", note: "รหัสผ่าน: ระบบห้องน้ำ" },
      { path: "/forms/inert/edit/", title: "ตั้งค่าคอลัมน์ Google Sheet สาย-เฉื่อย", note: "รหัสผู้ดูแล หรือรหัสแก้ไขสมาชิก" },
      { path: "/links/", title: "หน้ารวมลิงก์สำหรับสมาชิกสภา" },
    ],
  },
  {
    title: "ระบบประเมินกิจกรรมหน้าเสาธง",
    icon: "fas fa-flag",
    items: [
      { path: `${ASSESS}/`, title: "หน้าสรุป", note: "เข้าด้วย Google ของโรงเรียน" },
      { path: `${ASSESS}/evaluate`, title: "หน้ากรอกคะแนน" },
      { path: `${ASSESS}/admin`, title: "หน้าจัดการของระบบประเมิน" },
      { path: `${ASSESS}/admin/evaluations`, title: "แก้ไข/ลบคะแนนที่บันทึก" },
      { path: `${ASSESS}/admin/logs`, title: "ประวัติการใช้งาน" },
    ],
  },
  {
    title: "เว็บไซต์สาธารณะ",
    icon: "fas fa-globe",
    items: [
      { path: "/", title: "หน้าแรก" },
      { path: "/about/", title: "เกี่ยวกับ" },
      { path: "/policy/", title: "นโยบาย" },
      { path: "/member/", title: "สมาชิก" },
      { path: "/member/grade/", title: "งานระดับชั้น" },
      { path: "/problem/", title: "แจ้งปัญหา" },
    ],
  },
  {
    title: "แบบฟอร์มรุ่นเก่า (สำรอง)",
    icon: "fas fa-box-archive",
    items: [
      { path: "/forms/building/classic/", title: "ตรวจอาคาร (รุ่นเก่า)" },
      { path: "/forms/inert/classic/", title: "สาย - เฉื่อย (รุ่นเก่า)" },
      { path: "/forms/pinkbook/classic/", title: "เล่มชมพู (รุ่นเก่า)" },
      { path: "/forms/submit_inert/classic/", title: "ส่งเล่ม (รุ่นเก่า)" },
    ],
  },
];

export function AllLinks({ toast }: { toast: Toast }) {
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState("");
  const [extra, setExtra] = useState<L[]>([]);
  useEffect(() => {
    const t = setTimeout(() => setOrigin(location.origin), 0);
    // Links added on the /links/ page that are not in the list below (other projects, new apps).
    adminFetch("/api/admin/settings/links")
      .then((j) => {
        const known = new Set(CATALOG.flatMap((c) => c.items.map((i) => i.path)));
        const items: L[] = (j.value.sections || []).flatMap((s: any) => s.items || []).map((i: any) => ({ path: i.href, title: i.title, note: i.lock || "" }));
        setExtra(items.filter((i) => !known.has(i.path) && !known.has(i.path.replace(/\/$/, ""))));
      })
      .catch(() => {});
    return () => clearTimeout(t);
  }, []);
  const full = (p: string) => (/^https?:/.test(p) ? p : origin + p);
  const groups = [...CATALOG, ...(extra.length ? [{ title: "ลิงก์อื่นจากหน้ารวมลิงก์", icon: "fas fa-link", items: extra }] : [])];
  return (
    <>
      <input className="t-input a-search" placeholder="ค้นหา เช่น ห้องน้ำ, สรุป, เวร" value={q} onChange={(e) => setQ(e.target.value)} />
      {groups.map((g) => {
        const items = g.items.filter((i) => !q || (i.title + i.path + (i.note || "")).toLowerCase().includes(q.toLowerCase()));
        if (!items.length) return null;
        return (
          <section key={g.title} className="t-card a-part">
            <h2 className="a-part-title"><i className={g.icon} aria-hidden /> {g.title}</h2>
            <div className="a-rows">
              {items.map((i) => (
                <div key={i.path + i.title} className="a-row-card a-link-row">
                  <span className="a-card-text">
                    <b>{i.title}</b>
                    <small>{full(i.path)}{i.note ? ` · ${i.note}` : ""}</small>
                  </span>
                  <button
                    type="button"
                    className="t-icon-btn"
                    aria-label="คัดลอกลิงก์"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(full(i.path));
                        toast("คัดลอกลิงก์แล้ว");
                      } catch {
                        toast("คัดลอกไม่สำเร็จ", "error");
                      }
                    }}
                  >
                    <i className="fas fa-copy" aria-hidden />
                  </button>
                  {!i.path.includes("<") && (
                    <a className="t-icon-btn" href={full(i.path)} target="_blank" rel="noopener noreferrer" aria-label="เปิด">
                      <i className="fas fa-arrow-up-right-from-square" aria-hidden />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
