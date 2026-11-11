"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import type { Field } from "./pages";
import { adminFetch } from "./api";
import { SortableList } from "./Sortable";
import { ICONS } from "./icons";

// Visual editors for each field type. Lists are cards or chips you drag to reorder; a card opens a
// side panel with its own fields. Values are plain JSON; every editor calls onChange with the new value.

export function FieldEditor({ field, value, onChange }: { field: Field; value: any; onChange: (v: any) => void }) {
  const help = field.help ? <small className="a-help">{field.help}</small> : null;
  switch (field.type) {
    case "text":
    case "url":
    case "date":
      return (
        <label className="a-field">
          <span className="t-label">{field.label}</span>
          <input
            className="t-input"
            type={field.type === "url" ? "url" : field.type === "date" ? "date" : "text"}
            value={value ?? ""}
            placeholder={"placeholder" in field ? field.placeholder : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
        </label>
      );
    case "number":
      return (
        <label className="a-field a-field-short">
          <span className="t-label">{field.label}</span>
          <span className="a-stepper">
            <button type="button" className="t-icon-btn" onClick={() => onChange((Number(value) || 0) - 1)} aria-label="ลด">−</button>
            <input className="t-input" type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
            <button type="button" className="t-icon-btn" onClick={() => onChange((Number(value) || 0) + 1)} aria-label="เพิ่ม">+</button>
          </span>
          {help}
        </label>
      );
    case "textarea":
      return (
        <label className="a-field">
          <span className="t-label">{field.label}</span>
          <textarea className="t-input a-textarea" rows={4} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
          {help}
        </label>
      );
    case "lines":
      return (
        <div className="a-field">
          <span className="t-label">
            {field.label} <em className="a-count">{(Array.isArray(value) ? value : []).length} รายการ</em>
          </span>
          <Chips value={Array.isArray(value) ? value : []} onChange={onChange} placeholder={field.placeholder} />
          {help}
        </div>
      );
    case "color":
      return <ColorField label={field.label} help={help} value={value || ""} onChange={onChange} />;
    case "icon":
      return (
        <div className="a-field a-field-short">
          <span className="t-label">{field.label}</span>
          <IconPicker value={value || ""} onChange={onChange} />
        </div>
      );
    case "bool":
      return (
        <label className="a-switch">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <span className="a-switch-ui" aria-hidden />
          <span>{field.label}</span>
          {help}
        </label>
      );
    case "select":
      return (
        <div className="a-field">
          <span className="t-label">{field.label}</span>
          {field.options.length <= 6 ? (
            <div className="a-seg">
              {field.options.map((o) => (
                <button key={o.value} type="button" className={String(value ?? "") === o.value ? "is-on" : undefined} onClick={() => onChange(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <select className="t-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
              {field.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          {help}
        </div>
      );
    case "image":
      return <ImageField label={field.label} help={help} value={value || ""} onChange={onChange} />;
    case "list":
      return <CardList field={field} value={Array.isArray(value) ? value : []} onChange={onChange} />;
  }
}

// ---------------- Chips: a list of short texts ----------------
export function Chips({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const add = () => {
    // Several at once: one per line or separated by commas.
    const parts = draft.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...value, ...parts]);
    setDraft("");
  };
  return (
    <div className="a-chips">
      <SortableList
        items={value}
        onChange={onChange}
        layout="grid"
        className="a-chip-wrap"
        render={(item, i, handle) =>
          editing === i ? (
            <input
              className="a-chip-edit"
              autoFocus
              defaultValue={item}
              onBlur={(e) => {
                const v = e.target.value.trim();
                onChange(v ? value.map((x, j) => (j === i ? v : x)) : value.filter((_, j) => j !== i));
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditing(null);
              }}
            />
          ) : (
            <span className="a-chip" {...handle} onDoubleClick={() => setEditing(i)} title="ลากเพื่อเรียง · ดับเบิลคลิกเพื่อแก้">
              <span>{item}</span>
              <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setEditing(i)} aria-label="แก้">
                <i className="fas fa-pen" aria-hidden />
              </button>
              <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="ลบ">
                <i className="fas fa-xmark" aria-hidden />
              </button>
            </span>
          )
        }
      />
      <div className="a-chip-add">
        <input
          className="t-input"
          value={draft}
          placeholder={placeholder || "พิมพ์แล้วกด Enter เพื่อเพิ่ม"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (t.includes("\n")) {
              e.preventDefault();
              onChange([...value, ...t.split("\n").map((s) => s.trim()).filter(Boolean)]);
            }
          }}
        />
        <button type="button" className="t-btn t-btn-sm" onClick={add} disabled={!draft.trim()}>
          <i className="fas fa-plus" aria-hidden /> เพิ่ม
        </button>
      </div>
    </div>
  );
}

// ---------------- Cards: a list of objects ----------------
function CardList({ field, value, onChange }: { field: Extract<Field, { type: "list" }>; value: any[]; onChange: (v: any[]) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const titleKey = field.title;
  const iconKey = field.fields.find((f) => f.type === "icon")?.key;
  const imageKey = field.fields.find((f) => f.type === "image")?.key;
  const subKey = field.subtitle;
  const compact = field.layout === "rows";
  return (
    <div className="a-field">
      <span className="t-label">
        {field.label} <em className="a-count">{value.length} รายการ · ลากการ์ดเพื่อเรียงลำดับ</em>
      </span>
      {field.help && <small className="a-help">{field.help}</small>}
      <SortableList
        items={value}
        onChange={onChange}
        layout={compact ? "vertical" : "grid"}
        className={compact ? "a-rows" : "a-cards"}
        render={(item, i, handle) => (
          <div className={compact ? "a-row-card" : "a-card"} onClick={() => setOpen(i)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(i)}>
            <span className="a-grip" {...handle} onClick={(e) => e.stopPropagation()} title="ลากเพื่อเรียง">
              <i className="fas fa-grip-vertical" aria-hidden />
            </span>
            {imageKey && item?.[imageKey] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="a-card-img" src={fileSrc(item[imageKey])} alt="" />
            ) : iconKey ? (
              <span className="a-card-icon"><i className={item?.[iconKey] || "fas fa-square"} aria-hidden /></span>
            ) : (
              <span className="a-card-n">{i + 1}</span>
            )}
            <span className="a-card-text">
              <b>{(titleKey && String(item?.[titleKey] ?? "")) || <em className="a-muted">(ยังไม่ได้ตั้งชื่อ)</em>}</b>
              {subKey && item?.[subKey] && <small>{summarize(item[subKey])}</small>}
            </span>
            <button
              type="button"
              className="a-card-del"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((_, j) => j !== i));
              }}
              aria-label="ลบ"
            >
              <i className="fas fa-trash" aria-hidden />
            </button>
          </div>
        )}
      />
      <button
        type="button"
        className="a-add-card"
        onClick={() => {
          onChange([...value, structuredClone(field.newItem)]);
          setOpen(value.length);
        }}
      >
        <i className="fas fa-plus" aria-hidden /> เพิ่ม{field.itemName || ""}
      </button>
      {open !== null && value[open] !== undefined && (
        <Drawer title={(titleKey && String(value[open]?.[titleKey] ?? "")) || field.label} onClose={() => setOpen(null)}>
          {field.fields.map((f) => (
            <FieldEditor key={f.key} field={f} value={value[open]?.[f.key]} onChange={(v) => onChange(value.map((it, j) => (j === open ? { ...it, [f.key]: v } : it)))} />
          ))}
        </Drawer>
      )}
    </div>
  );
}

// Card subtitle: text as is; a list as its count and first values ("3 รายการ: 1, 2, 3").
const summarize = (v: any) =>
  (Array.isArray(v) ? `${v.length} รายการ: ${v.map((x) => (x && typeof x === "object" ? Object.values(x)[0] : x)).join(", ")}` : String(v)).slice(0, 90);

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="a-drawer-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="a-drawer" role="dialog" aria-modal="true">
        <header>
          <b>{title}</b>
          <button type="button" className="t-btn t-btn-sm" onClick={onClose}>
            <i className="fas fa-check" aria-hidden /> เสร็จ
          </button>
        </header>
        <div className="a-drawer-body">{children}</div>
        <p className="a-help a-drawer-note">การแก้ไขยังไม่ถูกบันทึกจนกว่าจะกด &quot;บันทึก&quot; ด้านล่างของหน้า</p>
      </aside>
    </div>
  );
}

// ---------------- Icon picker ----------------
function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = ICONS.filter((ic) => !q || ic.name.includes(q.toLowerCase()) || ic.th.includes(q));
  return (
    <>
      <button type="button" className="a-icon-btn" onClick={() => setOpen(true)}>
        <i className={value || "fas fa-question"} aria-hidden /> <span>เปลี่ยนไอคอน</span>
      </button>
      {open && (
        <Drawer title="เลือกไอคอน" onClose={() => setOpen(false)}>
          <input className="t-input" autoFocus placeholder="ค้นหา เช่น บ้าน, book, คน" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="a-icon-grid">
            {shown.map((ic) => (
              <button
                key={ic.cls}
                type="button"
                className={ic.cls === value ? "is-on" : undefined}
                title={`${ic.th} (${ic.cls})`}
                onClick={() => {
                  onChange(ic.cls);
                  setOpen(false);
                }}
              >
                <i className={ic.cls} aria-hidden />
              </button>
            ))}
          </div>
          <label className="a-field">
            <span className="t-label">หรือพิมพ์ชื่อไอคอนจาก fontawesome.com/icons</span>
            <input className="t-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="fas fa-star" />
          </label>
        </Drawer>
      )}
    </>
  );
}

// ---------------- Colour ----------------
const SWATCHES = ["#b00909", "#d32f2f", "#c2185b", "#7b1fa2", "#303f9f", "#1565c0", "#00838f", "#2e7d32", "#ef6c00", "#5d4037", "#37474f", "#111111"];
function ColorField({ label, help, value, onChange }: { label: string; help: React.ReactNode; value: string; onChange: (v: string) => void }) {
  return (
    <div className="a-field">
      <span className="t-label">{label}</span>
      <div className="a-swatches">
        {SWATCHES.map((c) => (
          <button key={c} type="button" className={c.toLowerCase() === value.toLowerCase() ? "is-on" : undefined} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
        ))}
        <label className="a-swatch-custom" title="เลือกสีเอง">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#b00909"} onChange={(e) => onChange(e.target.value)} />
          <i className="fas fa-eye-dropper" aria-hidden />
        </label>
      </div>
      {help}
    </div>
  );
}

// ---------------- Image ----------------
export function fileSrc(key: string) {
  return !key ? "" : /^(https?:)?\/\//.test(key) || key.startsWith("/") ? key : `/api/file/${key}`;
}

export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("อัปโหลดได้เฉพาะรูปภาพ");
  if (file.size > 8 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 8 MB");
  const sign = await adminFetch("/api/admin/upload-url", { method: "POST", body: JSON.stringify({ name: file.name, type: file.type }) });
  const put = await fetch(sign.url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!put.ok) throw new Error(`อัปโหลดไม่สำเร็จ (HTTP ${put.status})`);
  return sign.key;
}

function ImageField({ label, help, value, onChange }: { label: string; help: React.ReactNode; value: string; onChange: (v: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      onChange(await uploadImage(file));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <div className="a-field">
      <span className="t-label">{label}</span>
      <div
        className={`a-drop${over ? " is-over" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileSrc(value)} alt="" />
        ) : (
          <i className="fas fa-image" aria-hidden />
        )}
        <span>{busy ? "กำลังอัปโหลด..." : value ? "ลากรูปใหม่มาวาง หรือคลิกเพื่อเปลี่ยน" : "ลากรูปมาวางที่นี่ หรือคลิกเพื่อเลือก"}</span>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
      </div>
      {value && (
        <button type="button" className="t-btn t-btn-sm t-btn-ghost a-drop-remove" onClick={() => onChange("")}>
          เอารูปออก
        </button>
      )}
      {error && <small className="a-error">{error}</small>}
      {help}
    </div>
  );
}
