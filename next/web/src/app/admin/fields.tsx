"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useRef, useState } from "react";
import type { Field } from "./pages";
import { adminFetch } from "./api";

// One editor per field type. Values are plain JSON; every editor calls onChange with the new value.

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
        <label className="a-field">
          <span className="t-label">{field.label}</span>
          <input className="t-input" type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
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
      return <LinesField label={field.label} help={help} placeholder={field.placeholder} value={Array.isArray(value) ? value : []} onChange={onChange} />;
    case "color":
      return (
        <label className="a-field">
          <span className="t-label">{field.label}</span>
          <span className="a-color">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(value || "") ? value : "#b00909"} onChange={(e) => onChange(e.target.value)} />
            <input className="t-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
          </span>
          {help}
        </label>
      );
    case "icon":
      return (
        <label className="a-field">
          <span className="t-label">{field.label}</span>
          <span className="a-icon-input">
            <i className={value || "fas fa-question"} aria-hidden />
            <input className="t-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="fas fa-star" />
          </span>
          {help}
        </label>
      );
    case "bool":
      return (
        <label className="a-check">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <span>{field.label}</span>
          {help}
        </label>
      );
    case "select":
      return (
        <label className="a-field">
          <span className="t-label">{field.label}</span>
          <select className="t-input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {help}
        </label>
      );
    case "image":
      return <ImageField label={field.label} help={help} value={value || ""} onChange={onChange} />;
    case "list":
      return <ListField field={field} value={Array.isArray(value) ? value : []} onChange={onChange} />;
  }
}

function LinesField({ label, help, placeholder, value, onChange }: { label: string; help: React.ReactNode; placeholder?: string; value: string[]; onChange: (v: string[]) => void }) {
  // Edited as text so typing a new line is not swallowed; empty lines are dropped on save.
  const [text, setText] = useState(value.join("\n"));
  return (
    <label className="a-field">
      <span className="t-label">
        {label} <em className="a-count">{value.filter((v) => v.trim()).length} รายการ</em>
      </span>
      <textarea
        className="t-input a-textarea"
        rows={Math.min(14, Math.max(3, value.length + 1))}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split("\n").map((l) => l.trim()).filter(Boolean));
        }}
      />
      {help}
    </label>
  );
}

export function fileSrc(key: string) {
  return !key ? "" : /^(https?:)?\/\//.test(key) || key.startsWith("/") ? key : `/api/file/${key}`;
}

function ImageField({ label, help, value, onChange }: { label: string; help: React.ReactNode; value: string; onChange: (v: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 8 MB");
      const sign = await adminFetch("/api/admin/upload-url", { method: "POST", body: JSON.stringify({ name: file.name, type: file.type }) });
      const put = await fetch(sign.url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) throw new Error(`อัปโหลดไม่สำเร็จ (HTTP ${put.status})`);
      onChange(sign.key);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <div className="a-field">
      <span className="t-label">{label}</span>
      <div className="a-image">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileSrc(value)} alt="" />
        ) : (
          <span className="a-image-empty">
            <i className="fas fa-image" aria-hidden />
          </span>
        )}
        <div className="a-image-actions">
          <button type="button" className="t-btn t-btn-sm" disabled={busy} onClick={() => input.current?.click()}>
            <i className={busy ? "fas fa-spinner fa-spin" : "fas fa-upload"} aria-hidden /> {busy ? "กำลังอัปโหลด..." : value ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
          </button>
          {value && (
            <button type="button" className="t-btn t-btn-sm t-btn-ghost" onClick={() => onChange("")}>
              เอาออก
            </button>
          )}
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
      </div>
      {error && <small className="a-error">{error}</small>}
      {help}
    </div>
  );
}

function ListField({ field, value, onChange }: { field: Extract<Field, { type: "list" }>; value: any[]; onChange: (v: any[]) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setOpen(open === i ? j : open === j ? i : open);
  };
  return (
    <div className="a-field">
      <span className="t-label">
        {field.label} <em className="a-count">{value.length} รายการ</em>
      </span>
      {field.help && <small className="a-help">{field.help}</small>}
      <div className="a-list">
        {value.map((item, i) => {
          const title = (field.title && String(item?.[field.title] ?? "")) || `รายการที่ ${i + 1}`;
          const isOpen = open === i;
          return (
            <div key={i} className={`a-item${isOpen ? " is-open" : ""}`}>
              <div className="a-item-head">
                <button type="button" className="a-item-title" onClick={() => setOpen(isOpen ? null : i)}>
                  <i className={`fas fa-chevron-${isOpen ? "down" : "right"}`} aria-hidden /> <span className="a-item-n">{i + 1}</span> {title}
                </button>
                <span className="a-item-tools">
                  <button type="button" className="t-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="เลื่อนขึ้น">
                    <i className="fas fa-arrow-up" aria-hidden />
                  </button>
                  <button type="button" className="t-icon-btn" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="เลื่อนลง">
                    <i className="fas fa-arrow-down" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="t-icon-btn a-danger"
                    aria-label="ลบ"
                    onClick={() => {
                      onChange(value.filter((_, j) => j !== i));
                      setOpen(null);
                    }}
                  >
                    <i className="fas fa-trash" aria-hidden />
                  </button>
                </span>
              </div>
              {isOpen && (
                <div className="a-item-body">
                  {field.fields.map((f) => (
                    <FieldEditor key={f.key} field={f} value={item?.[f.key]} onChange={(v) => onChange(value.map((it, j) => (j === i ? { ...it, [f.key]: v } : it)))} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="t-btn t-btn-sm t-btn-ghost a-add"
        onClick={() => {
          onChange([...value, structuredClone(field.newItem)]);
          setOpen(value.length);
        }}
      >
        <i className="fas fa-plus" aria-hidden /> เพิ่ม
      </button>
    </div>
  );
}
