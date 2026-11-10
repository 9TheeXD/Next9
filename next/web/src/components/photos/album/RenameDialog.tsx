"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { imageDate, type Photo } from "./model";

// Rename one file or many. Two ways to build the new names:
//  - pattern: a template with tokens ({name} {n} {date} {time} {album}), numbered in grid order
//  - replace: find text in the current names and swap it for something else
// The extension never changes (the server keeps it), so only base names are edited here.

type Mode = "pattern" | "replace";

const TOKENS: [string, string][] = [
  ["{name}", "ชื่อเดิม"],
  ["{n}", "ลำดับ"],
  ["{date}", "วันที่"],
  ["{time}", "เวลา"],
  ["{album}", "อัลบั้ม"],
];
const PRESETS = ["{name}", "{album}-{n}", "{date}_{n}", "รูป {n}", "{date}_{time}"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const splitBase = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
};
const BAD = /[\\/:*?"<>|\x00-\x1f]+/g;

export function RenameDialog({
  items,
  albumName,
  onClose,
  onSubmit,
}: {
  /** Files to rename, in the order they are numbered. Empty = closed. */
  items: Photo[];
  albumName: string;
  onClose: () => void;
  onSubmit: (list: { id: string; name: string }[]) => Promise<boolean>;
}) {
  const open = items.length > 0;
  const single = items.length === 1;
  const [mode, setMode] = useState<Mode>("pattern");
  const [pattern, setPattern] = useState("");
  const [start, setStart] = useState(1);
  const [digits, setDigits] = useState(2);
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fresh state each time it opens: one file starts on its own name, ready to type over.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setMode("pattern");
      setPattern(items.length === 1 ? splitBase(items[0].original_name || "")[0] : "{album}-{n}");
      setStart(1);
      setDigits(Math.max(2, String(items.length).length));
      setFind("");
      setRepl("");
      setBusy(false);
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }, 0);
    return () => clearTimeout(t);
  }, [open, items]);

  const rows = useMemo(() => {
    return items.map((img, i) => {
      const old = img.original_name || "";
      const [base, ext] = splitBase(old);
      let next: string;
      if (mode === "replace") {
        next = find ? base.split(find).join(repl) : base;
      } else {
        const d = new Date(imageDate(img) || 0);
        next = pattern
          .replace(/\{name\}/g, base)
          .replace(/\{n\}/g, String(start + i).padStart(digits, "0"))
          .replace(/\{date\}/g, `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`)
          .replace(/\{time\}/g, `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`)
          .replace(/\{album\}/g, albumName);
      }
      next = next.replace(BAD, "-").trim();
      return { id: img.id, old, base, ext, next };
    });
  }, [items, mode, pattern, start, digits, find, repl, albumName]);

  const changed = rows.filter((r) => r.next && r.next !== r.base);
  const empty = rows.some((r) => !r.next);
  // Same new name twice: the server adds " (1)", " (2)"… — worth saying before it happens.
  const dupes = useMemo(() => {
    const seen = new Set<string>();
    let n = 0;
    for (const r of rows) {
      const k = r.next + r.ext;
      if (seen.has(k)) n++;
      seen.add(k);
    }
    return n;
  }, [rows]);

  const insertToken = (tok: string) => {
    const el = inputRef.current;
    if (!el) return setPattern((p) => p + tok);
    const a = el.selectionStart ?? pattern.length;
    const b = el.selectionEnd ?? a;
    setPattern(pattern.slice(0, a) + tok + pattern.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + tok.length, a + tok.length);
    });
  };

  const submit = async () => {
    if (busy || !changed.length || empty) return;
    setBusy(true);
    const ok = await onSubmit(changed.map((r) => ({ id: r.id, name: r.next })));
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className={"quality-modal rename-modal" + (open ? " show" : "")} onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="quality-card rn-card" onKeyDown={(e) => e.key === "Escape" && !busy && onClose()}>
        <h3>
          <i className="fas fa-pen" style={{ color: "#6366f1", marginRight: 6 }} /> {single ? "เปลี่ยนชื่อไฟล์" : `เปลี่ยนชื่อ ${items.length} ไฟล์`}
        </h3>

        {!single ? (
          <div className="rn-tabs" role="tablist">
            <button type="button" className={mode === "pattern" ? "on" : ""} onClick={() => setMode("pattern")}>
              <i className="fas fa-wand-magic-sparkles" /> ตั้งตามรูปแบบ
            </button>
            <button type="button" className={mode === "replace" ? "on" : ""} onClick={() => setMode("replace")}>
              <i className="fas fa-right-left" /> แทนที่คำ
            </button>
          </div>
        ) : null}

        {mode === "pattern" ? (
          <>
            <label className="rn-label">{single ? "ชื่อใหม่" : "รูปแบบชื่อ"}</label>
            <div className="rn-input-wrap">
              <input
                ref={inputRef}
                className="rn-input"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder={single ? "ชื่อไฟล์" : "เช่น {album}-{n}"}
                spellCheck={false}
              />
              {single && rows[0]?.ext ? <span className="rn-ext">{rows[0].ext}</span> : null}
            </div>
            <div className="rn-chips">
              {TOKENS.map(([tok, label]) => (
                <button type="button" key={tok} onClick={() => insertToken(tok)} title={"แทรก " + tok}>
                  <code>{tok}</code> {label}
                </button>
              ))}
            </div>
            {!single ? (
              <>
                <div className="rn-presets">
                  <span>แบบสำเร็จ:</span>
                  {PRESETS.map((p) => (
                    <button type="button" key={p} className={pattern === p ? "on" : ""} onClick={() => setPattern(p)}>
                      {p}
                    </button>
                  ))}
                </div>
                {pattern.includes("{n}") ? (
                  <div className="rn-row">
                    <label>
                      เริ่มที่
                      <input type="number" min={0} value={start} onChange={(e) => setStart(Math.max(0, parseInt(e.target.value, 10) || 0))} />
                    </label>
                    <label>
                      จำนวนหลัก
                      <select value={digits} onChange={(e) => setDigits(Number(e.target.value))}>
                        {[1, 2, 3, 4].map((d) => (
                          <option key={d} value={d}>
                            {d} ({String(start).padStart(d, "0")})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <div className="rn-row rn-replace">
            <label>
              หาคำว่า
              <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="เช่น IMG_" spellCheck={false} autoFocus />
            </label>
            <label>
              แทนด้วย
              <input value={repl} onChange={(e) => setRepl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="(เว้นว่าง = ลบคำนั้น)" spellCheck={false} />
            </label>
          </div>
        )}

        {!single ? (
          <div className="rn-preview">
            <div className="rn-preview-head">
              ตัวอย่าง · เปลี่ยน {changed.length} จาก {rows.length} ไฟล์
            </div>
            <ul>
              {rows.slice(0, 200).map((r) => (
                <li key={r.id} className={r.next === r.base ? "same" : ""}>
                  <span className="rn-old" title={r.old}>
                    {r.old}
                  </span>
                  <i className="fas fa-arrow-right" />
                  <span className="rn-new" title={r.next + r.ext}>
                    {r.next || <em>(ว่าง)</em>}
                    {r.ext}
                  </span>
                </li>
              ))}
              {rows.length > 200 ? <li className="more">…และอีก {rows.length - 200} ไฟล์</li> : null}
            </ul>
          </div>
        ) : null}

        {empty ? <p className="rn-warn">ชื่อใหม่ว่างไม่ได้</p> : dupes ? <p className="rn-hint">มีชื่อซ้ำ {dupes} ไฟล์ จะต่อท้าย (1), (2)… ให้อัตโนมัติ</p> : null}

        <div className="rn-actions">
          <button type="button" className="rn-cancel" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="button" className="rn-ok" onClick={submit} disabled={busy || !changed.length || empty}>
            {busy ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-check" />} เปลี่ยนชื่อ
          </button>
        </div>
      </div>
    </div>
  );
}
