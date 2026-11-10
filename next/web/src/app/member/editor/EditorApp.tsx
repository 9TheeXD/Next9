"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Member } from "@/lib/members";
import { Avatar } from "@/components/member/Avatar";
import { ImageCropper } from "./ImageCropper";

const MEMBERS_URL = "https://cdn.yumistack.net/next9/members/members.json";
const PHOTO_BASE = "https://cdn.yumistack.net/next9/members/"; // members.ts reads files on the server, so it is not imported here
const PASS_KEY = "editor_pass"; // same key as the old editor, so people stay signed in

const ROLE_SUGGESTIONS = [
  "ประธานสภา", "รองประธาน 1", "รองประธาน 2", "เลขานุการ", "เหรัญญิก",
  "หัวหน้าฝ่ายบริหารวิชาการ", "หัวหน้าฝ่ายบริหารกิจการนักเรียน", "หัวหน้าฝ่ายบริหารทั่วไป",
  "หัวหน้างานรับการประเมิน/นิเทศ/ติดตาม", "หัวหน้างานวางแผนสารสนเทศ", "หัวหน้างานขอเวลาเรียน",
  "หัวหน้างานจัดทำธรรมนูญ/คู่มือสภานักเรียน", "หัวหน้างานระดับชั้น", "หัวหน้างานระเบียบวินัย",
  "หัวหน้างานห้องเรียนสีขาว", "หัวหน้างานกิจกรรม", "หัวหน้างานประชาสัมพันธ์",
  "หัวหน้างานอาคารสถานที่และอนุรักษ์สิ่งแวดล้อม", "หัวหน้างานปฏิคม", "หัวหน้างานทัศนศึกษาดูงาน",
  ...[1, 2, 3, 4, 5, 6].map((g) => `หัวหน้าระดับชั้นม.${g}`),
];

type Form = { name: string; nickname: string; role: string; bio: string; ig: string; line: string; call: string };

function formOf(m: Member): Form {
  return {
    name: m.name ?? "",
    nickname: m.nickname ?? "",
    role: m.role ?? "",
    bio: m.bio ?? "",
    ig: m.contacts?.ig ?? "",
    line: m.contacts?.line ?? "",
    call: m.contacts?.call ?? "",
  };
}

function readPass() {
  try {
    return localStorage.getItem(PASS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function EditorApp() {
  const [pass, setPass] = useState<string | null>(null); // null: still checking a saved password
  const [members, setMembers] = useState<Member[]>([]);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(-1);
  const [form, setForm] = useState<Form | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null); // picked photo waiting in the crop step
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const say = useCallback((text: string, bad = false) => {
    setToast({ text, bad });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch(`${MEMBERS_URL}?${Date.now()}`, { cache: "no-store" });
      setMembers(await res.json());
    } catch {
      setLoadError("โหลดรายชื่อไม่สำเร็จ");
    }
  }, []);

  const signedIn = useCallback(
    (password: string) => {
      setPass(password);
      if (password) load();
    },
    [load],
  );

  // Sign in again with the password this browser remembers, if any.
  useEffect(() => {
    const saved = readPass();
    (saved ? verify(saved) : Promise.resolve(false)).then((ok) => signedIn(ok ? saved : ""));
  }, [signedIn]);

  const member = selected >= 0 ? members[selected] : undefined;
  const dirty = !!(member && form && JSON.stringify(formOf(member)) !== JSON.stringify(form));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => !q || [m.nickname, m.name, m.role, m.room].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [members, query]);

  function open(i: number) {
    if (dirty && i !== selected) return setPendingSwitch(i);
    setSelected(i);
    setForm(i >= 0 ? formOf(members[i]) : null);
    window.scrollTo({ top: 0 });
  }

  function set<K extends keyof Form>(key: K, value: string) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save() {
    if (!member || !form || !pass) return;
    setSaving(true);
    const updated: Member = {
      ...member,
      name: form.name.trim(),
      nickname: form.nickname.trim(),
      role: form.role.trim(),
      bio: form.bio,
      contacts: { ig: form.ig.trim(), line: form.line.trim(), call: form.call.trim() },
    };
    try {
      const res = await fetch("/api/save-member", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: pass },
        body: JSON.stringify({ index: selected, member: updated }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.success) return say(out.message || "บันทึกไม่สำเร็จ", true);
      setMembers((list) => list.map((m, i) => (i === selected ? out.member : m)));
      setForm(formOf(out.member));
      say("บันทึกแล้ว");
    } catch {
      say("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", true);
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: Blob) {
    if (!member || !pass) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/member-photo?index=${selected}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream", Authorization: pass },
        body: file,
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.success) return say(out.message || "อัปโหลดรูปไม่สำเร็จ", true);
      setMembers((list) => list.map((m, i) => (i === selected ? { ...m, img: out.member.img, updatedAt: out.member.updatedAt } as Member : m)));
      say("เปลี่ยนรูปแล้ว");
    } catch {
      say("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", true);
    } finally {
      setUploading(false);
    }
  }

  function logout() {
    try {
      localStorage.removeItem(PASS_KEY);
    } catch {}
    setPass("");
    setMembers([]);
    setSelected(-1);
    setForm(null);
  }

  if (pass === null) return <div className="e-center"><div className="e-spinner" /></div>;
  if (!pass) return <Login onDone={signedIn} />;

  return (
    <main className={`e-app${member ? " has-member" : ""}`}>
      <aside className="e-list">
        <div className="e-list-head">
          <div>
            <h1>จัดการสมาชิก</h1>
            <p>{members.length} คน · แตะชื่อเพื่อแก้ไข</p>
          </div>
          <button type="button" className="e-ghost" onClick={logout}>
            <i className="fas fa-sign-out-alt" aria-hidden /> ออก
          </button>
        </div>
        <label className="e-search">
          <i className="fas fa-search" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ ชื่อเล่น ตำแหน่ง ห้อง" />
        </label>
        {loadError && (
          <button type="button" className="e-error" onClick={load}>
            {loadError} · แตะเพื่อลองใหม่
          </button>
        )}
        <div className="e-items">
          {shown.map(({ m, i }) => (
            <button key={m.slug} type="button" className={`e-item${i === selected ? " is-active" : ""}`} onClick={() => open(i)}>
              <Avatar src={`${PHOTO_BASE}${m.img || `2/${m.slug}.webp`}`} nickname={m.nickname} className="e-item-photo" />
              <span className="e-item-text">
                <b>{m.nickname} {m.room && <small>{m.room}</small>}</b>
                <span>{m.role}</span>
              </span>
              <i className="fas fa-chevron-right" aria-hidden />
            </button>
          ))}
        </div>
      </aside>

      <section className="e-detail">
        {!member || !form ? (
          <div className="e-empty">
            <i className="fas fa-hand-pointer" aria-hidden />
            <p>เลือกสมาชิกจากรายชื่อทางซ้ายเพื่อแก้ไข</p>
          </div>
        ) : (
          <>
            <div className="e-detail-head">
              <button type="button" className="e-back" onClick={() => open(-1)}>
                <i className="fas fa-arrow-left" aria-hidden /> รายชื่อ
              </button>
              <a href={`/member/profile/${member.slug}.html`} target="_blank" rel="noreferrer" className="e-ghost">
                ดูหน้าโปรไฟล์ <i className="fas fa-external-link-alt" aria-hidden />
              </a>
            </div>

            <div className="e-photo-row">
              <label className={`e-photo${uploading ? " is-busy" : ""}`}>
                <Avatar key={member.img} src={`${PHOTO_BASE}${member.img || `2/${member.slug}.webp`}`} nickname={member.nickname} />
                <span className="e-photo-badge">
                  {uploading ? <i className="fas fa-spinner fa-spin" aria-hidden /> : <i className="fas fa-camera" aria-hidden />}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) setCropFile(f);
                  }}
                />
              </label>
              <div>
                <h2>{member.nickname}</h2>
                <p className="e-muted">{member.name}</p>
                <p className="e-hint">แตะรูปเพื่อเปลี่ยน · เลือกรูปแล้วครอปเป็น 4:5 ได้ก่อนบันทึก</p>
              </div>
            </div>

            {member.roles && member.roles.length > 0 && (
              <div className="e-positions">
                <span className="e-label">ตำแหน่งตามโครงสร้างสภา</span>
                <div>
                  {member.roles.map((r) => (
                    <span key={r} className="e-chip">{r}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="e-fields">
              <Field label="ชื่อ-นามสกุล" wide>
                <input value={form.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="ชื่อเล่น">
                <input value={form.nickname} onChange={(e) => set("nickname", e.target.value)} />
              </Field>
              <Field label="ตำแหน่งหลัก (หัวข้อหน้าโปรไฟล์)">
                <input value={form.role} list="e-roles" onChange={(e) => set("role", e.target.value)} />
                <datalist id="e-roles">
                  {[...new Set([...(member.roles ?? []), ...ROLE_SUGGESTIONS])].map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </Field>
              <Field label="ข้อมูลเพิ่มเติม (Bio)" wide>
                <textarea rows={6} value={form.bio} onChange={(e) => set("bio", e.target.value)} placeholder="ความสามารถ ผลงาน ฯลฯ" />
              </Field>
              <Field label="Instagram" icon="fab fa-instagram">
                <input value={form.ig} onChange={(e) => set("ig", e.target.value)} placeholder="ชื่อผู้ใช้ ไม่ต้องใส่ @" autoCapitalize="none" />
              </Field>
              <Field label="Line ID" icon="fab fa-line">
                <input value={form.line} onChange={(e) => set("line", e.target.value)} autoCapitalize="none" />
              </Field>
              <Field label="เบอร์โทร" icon="fas fa-phone">
                <input value={form.call} onChange={(e) => set("call", e.target.value)} inputMode="tel" placeholder="ใส่ — เพื่อซ่อน" />
              </Field>
            </div>

            <div className={`e-savebar${dirty ? " is-dirty" : ""}`}>
              <span>{dirty ? "มีการแก้ไขที่ยังไม่บันทึก" : "บันทึกแล้วทั้งหมด"}</span>
              {dirty && (
                <button type="button" className="e-ghost" onClick={() => setForm(formOf(member))} disabled={saving}>
                  ยกเลิก
                </button>
              )}
              <button type="button" className="e-primary" onClick={save} disabled={!dirty || saving}>
                {saving ? <i className="fas fa-spinner fa-spin" aria-hidden /> : <i className="fas fa-check" aria-hidden />} บันทึก
              </button>
            </div>
          </>
        )}
      </section>

      {pendingSwitch !== null && (
        <div className="e-modal" role="dialog" aria-modal="true">
          <div className="e-modal-card">
            <h3>ยังไม่ได้บันทึก</h3>
            <p>การแก้ไขของ {member?.nickname} ยังไม่ได้บันทึก จะทิ้งการแก้ไขนี้หรือไม่</p>
            <div className="e-modal-actions">
              <button type="button" className="e-ghost" onClick={() => setPendingSwitch(null)}>กลับไปแก้ต่อ</button>
              <button
                type="button"
                className="e-danger"
                onClick={() => {
                  const i = pendingSwitch;
                  setPendingSwitch(null);
                  setSelected(i);
                  setForm(i >= 0 ? formOf(members[i]) : null);
                }}
              >
                ทิ้งการแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`e-toast${toast.bad ? " is-bad" : ""}`}>{toast.text}</div>}
      {cropFile && (
        <ImageCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(blob) => {
            setCropFile(null);
            upload(blob);
          }}
        />
      )}
    </main>
  );
}

function Field({ label, icon, wide, children }: { label: string; icon?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`e-field${wide ? " is-wide" : ""}`}>
      <span className="e-label">
        {icon && <i className={icon} aria-hidden />} {label}
      </span>
      {children}
    </label>
  );
}

async function verify(password: string) {
  try {
    const res = await fetch("/api/verify-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function Login({ onDone }: { onDone: (pass: string) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <div className="e-center">
      <form
        className="e-login"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await verify(value);
          setBusy(false);
          if (!ok) return setError(true);
          try {
            localStorage.setItem(PASS_KEY, value);
          } catch {}
          onDone(value);
        }}
      >
        <i className="fas fa-id-card e-login-icon" aria-hidden />
        <h1>ระบบจัดการสมาชิก</h1>
        <p>กรอกรหัสผ่านผู้ดูแลเพื่อแก้ไขข้อมูลสมาชิก</p>
        <input type="password" value={value} onChange={(e) => { setValue(e.target.value); setError(false); }} placeholder="รหัสผ่าน" autoFocus />
        {error && <span className="e-login-error">รหัสผ่านไม่ถูกต้อง</span>}
        <button type="submit" className="e-primary" disabled={busy || !value}>
          {busy ? <i className="fas fa-spinner fa-spin" aria-hidden /> : null} เข้าสู่ระบบ
        </button>
      </form>
    </div>
  );
}
