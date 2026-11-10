"use client";

import { useCallback, useEffect, useState } from "react";
import { photosApi } from "@/lib/photos/request";
import { shareUrl } from "@/lib/photos/tree";
import { copyText, fmt } from "@/lib/photos/util";
import { usePhotosUI } from "../ui/PhotosUI";

// Separate wording for a folder link (everything inside, optionally sub-folders) and a file link
// (that one file only), so it's always clear exactly what a link exposes.
const SHARE_EXPIRY: [number, string][] = [
  [1, "1 วัน"],
  [7, "7 วัน"],
  [30, "30 วัน"],
  [90, "90 วัน"],
  [0, "ไม่หมดอายุ"],
];
const thDate = (ts: number) => new Date(ts).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
const bareUrl = (id: string) => shareUrl(id).replace(/^https?:\/\//, "");

export type Share = {
  id: string;
  kind: "album" | "image";
  target?: { name: string } | null;
  include_subfolders?: boolean | number;
  allow_download?: boolean | number;
  role?: "viewer" | "editor";
  expires_at?: number | null;
  expired?: boolean;
  view_count?: number;
  created_at?: number;
};
export type ShareDialogOptions = { kind: "album" | "image"; id: string; name: string; locked?: boolean };

function useEscape(close: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".custom-modal-overlay.show")) {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [close]);
}

function SwitchRow({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="pf-switch-row">
      <span>
        <b>{title}</b>
        <small>{hint}</small>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i className="pf-switch" />
    </label>
  );
}

// Who the link is for. Downloading is always allowed; the choice is whether people with the link can
// also change the album. An edit link (server: shareEditorCovers) can upload, delete to the trash,
// rename, change dates and covers, and add folders, only inside what it shares; moving between albums,
// deleting albums, locks and new links stay with the site password. A single-file link can only view.
function RolePicker({ role, onChange, isAlbum }: { role: "viewer" | "editor"; onChange: (r: "viewer" | "editor") => void; isAlbum: boolean }) {
  const cards: { id: "viewer" | "editor"; icon: string; title: string; desc: string }[] = [
    { id: "viewer", icon: "fa-eye", title: "ดูได้อย่างเดียว", desc: "ดูและดาวน์โหลดได้ แก้ไขอะไรไม่ได้" },
    { id: "editor", icon: "fa-pen-to-square", title: "แก้ไขได้", desc: "อัปโหลด ลบ เปลี่ยนชื่อ และเพิ่มโฟลเดอร์ได้" },
  ];
  return (
    <div className="pf-role" role="radiogroup" aria-label="สิทธิ์ของลิงก์">
      {cards.map((c) => {
        const disabled = c.id === "editor" && !isAlbum;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={role === c.id}
            disabled={disabled}
            className={"pf-role-card" + (role === c.id ? " active" : "") + (c.id === "editor" ? " is-editor" : "")}
            onClick={() => onChange(c.id)}
          >
            <i className={"fas " + c.icon} />
            <b>{c.title}</b>
            <small>{disabled ? "ใช้ได้กับการแชร์โฟลเดอร์เท่านั้น" : c.desc}</small>
          </button>
        );
      })}
    </div>
  );
}

// Editing a link changes what it allows while keeping the same URL, so a link already sent out keeps
// working with the new rules. Expiry is optional here: "คงเดิม" never restarts the clock.
export function ShareEditor({ share, onSaved, onClose }: { share: Share; onSaved?: (s: Share) => void; onClose: () => void }) {
  const ui = usePhotosUI();
  const isAlbum = share.kind === "album";
  const [sub, setSub] = useState(!!share.include_subfolders);
  const [role, setRole] = useState<"viewer" | "editor">(share.role === "editor" ? "editor" : "viewer");
  const [days, setDays] = useState<"keep" | number>("keep");
  const [busy, setBusy] = useState(false);
  useEscape(onClose);

  async function save() {
    setBusy(true);
    const body: Record<string, unknown> = { role };
    if (isAlbum) body.includeSubfolders = sub;
    if (days !== "keep") body.expiresInDays = days;
    try {
      const d = await photosApi<{ share: Share }>("/api/photos/shares/" + encodeURIComponent(share.id), "PATCH", body);
      ui.toast("บันทึกสิทธิ์ใหม่แล้ว", "success");
      onClose();
      onSaved?.(d.share);
    } catch (err) {
      ui.toast((err as Error).message, "error");
      setBusy(false);
    }
  }

  return (
    <div className="pf-share-overlay is-editor" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pf-share" role="dialog" aria-modal="true" aria-labelledby="pfShareEditTitle">
        <div className="pf-share-head">
          <div className={"pf-share-ico " + (isAlbum ? "is-album" : "is-file")}>
            <i className="fas fa-sliders" />
          </div>
          <div className="pf-share-heading">
            <div className="pf-share-title" id="pfShareEditTitle">
              แก้ไขสิทธิ์ของลิงก์
            </div>
            <div className="pf-share-name">{share.target ? share.target.name : "ลิงก์นี้"}</div>
          </div>
          <button type="button" className="pf-icon-btn pf-dark" aria-label="ปิด" onClick={onClose}>
            <i className="fas fa-xmark" />
          </button>
        </div>
        <div className="pf-share-body">
          <div className="pf-scope">
            <i className="fas fa-link" />
            <div>
              <b>ลิงก์เดิมไม่เปลี่ยน</b>
              <div className="pf-scope-text">{bareUrl(share.id)}</div>
              <small>คนที่ได้ลิงก์ไปแล้วจะใช้สิทธิ์ใหม่ทันที</small>
            </div>
          </div>
          <div className="pf-field-label">สิทธิ์ของคนที่มีลิงก์</div>
          <RolePicker role={role} onChange={setRole} isAlbum={isAlbum} />
          {isAlbum ? <SwitchRow title="รวมโฟลเดอร์ย่อย" hint="โฟลเดอร์ย่อยที่ล็อกไว้จะยังล็อกอยู่" checked={sub} onChange={setSub} /> : null}
          <div className="pf-field-label">อายุลิงก์{share.expired ? " (ตอนนี้หมดอายุแล้ว)" : ""}</div>
          <div className="pf-chips">
            <button type="button" className={"pf-chip" + (days === "keep" ? " active" : "")} onClick={() => setDays("keep")}>
              คงเดิม
            </button>
            {SHARE_EXPIRY.map(([d, l]) => (
              <button key={d} type="button" className={"pf-chip" + (days === d ? " active" : "")} onClick={() => setDays(d)}>
                {l}
              </button>
            ))}
          </div>
          <div className="pf-share-hint">เลือกช่วงเวลาใหม่ = เริ่มนับใหม่จากวันนี้</div>
          <button type="button" className="pf-btn pf-btn-primary pf-share-create" disabled={busy} onClick={save}>
            <i className="fas fa-check" /> บันทึกการแก้ไข
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShareDialog({ opts, onClose, onEdit }: { opts: ShareDialogOptions; onClose: () => void; onEdit: (s: Share, onSaved?: (s: Share) => void) => void }) {
  const ui = usePhotosUI();
  const isAlbum = opts.kind === "album";
  const [sub, setSub] = useState(true);
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [links, setLinks] = useState<Share[] | null>(null);
  const [linksError, setLinksError] = useState("");
  useEscape(onClose);

  const loadLinks = useCallback(async () => {
    try {
      const d = await photosApi<{ shares: Share[] }>("/api/photos/shares?targetId=" + encodeURIComponent(opts.id), "GET");
      setLinks(d.shares || []);
      setLinksError("");
    } catch (e) {
      setLinksError((e as Error).message);
    }
  }, [opts.id]);

  useEffect(() => {
    // Fetches the link list on open; state updates arrive asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLinks();
  }, [loadLinks]);

  async function create() {
    setBusy(true);
    try {
      const d = await photosApi<{ share: Share }>("/api/photos/shares", "POST", {
        kind: opts.kind,
        targetId: opts.id,
        expiresInDays: days,
        role: isAlbum ? role : "viewer",
        includeSubfolders: isAlbum ? sub : false,
      });
      setFreshId(d.share.id);
      const copied = await copyText(shareUrl(d.share.id));
      ui.toast(copied ? "สร้างลิงก์และคัดลอกแล้ว" : "สร้างลิงก์แล้ว", "success");
      await loadLinks();
    } catch (err) {
      ui.toast((err as Error).message, "error");
    }
    setBusy(false);
  }

  async function revoke(id: string) {
    const yes = await ui.confirm({ title: "ยกเลิกลิงก์นี้?", message: "คนที่มีลิงก์นี้จะเปิดไม่ได้อีก", isDanger: true, confirmText: "ยกเลิกลิงก์", cancelText: "ย้อนกลับ", icon: "fas fa-link-slash" });
    if (!yes) return;
    try {
      await photosApi("/api/photos/shares/" + encodeURIComponent(id), "DELETE");
      ui.toast("ยกเลิกลิงก์แล้ว", "success");
      loadLinks();
    } catch (err) {
      ui.toast((err as Error).message, "error");
    }
  }

  const scope = isAlbum ? (sub ? `ทุกไฟล์ใน "${opts.name}" รวมโฟลเดอร์ย่อย` : `เฉพาะไฟล์ใน "${opts.name}" (ไม่รวมโฟลเดอร์ย่อย)`) : `เฉพาะไฟล์ "${opts.name}" ไฟล์เดียว`;

  return (
    <div className="pf-share-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pf-share" role="dialog" aria-modal="true" aria-labelledby="pfShareTitle">
        <div className="pf-share-head">
          <div className={"pf-share-ico " + (isAlbum ? "is-album" : "is-file")}>
            <i className={"fas " + (isAlbum ? "fa-folder" : "fa-image")} />
          </div>
          <div className="pf-share-heading">
            <div className="pf-share-title" id="pfShareTitle">
              {isAlbum ? "แชร์โฟลเดอร์" : "แชร์ไฟล์"}
            </div>
            <div className="pf-share-name">{opts.name || ""}</div>
          </div>
          <button type="button" className="pf-icon-btn pf-dark" aria-label="ปิด" onClick={onClose}>
            <i className="fas fa-xmark" />
          </button>
        </div>
        <div className="pf-share-body">
          <div className="pf-scope">
            <i className="fas fa-eye" />
            <div>
              <b>คนที่มีลิงก์จะเห็น</b>
              <div className="pf-scope-text">{scope}</div>
              <small>ไม่ต้องใส่รหัสเว็บ และมองไม่เห็นอัลบั้มอื่น</small>
            </div>
          </div>
          {opts.locked ? (
            <div className="pf-share-warn">
              <i className="fas fa-lock" /> อัลบั้มนี้ถูกล็อก คนที่มีลิงก์จะดูได้โดยไม่ต้องใส่รหัสอัลบั้ม
            </div>
          ) : null}
          <div className="pf-field-label">สิทธิ์ของคนที่มีลิงก์</div>
          <RolePicker role={role} onChange={setRole} isAlbum={isAlbum} />
          {isAlbum ? <SwitchRow title="รวมโฟลเดอร์ย่อย" hint="โฟลเดอร์ย่อยที่ล็อกไว้จะยังล็อกอยู่" checked={sub} onChange={setSub} /> : null}
          <div className="pf-field-label">ลิงก์หมดอายุใน</div>
          <div className="pf-chips">
            {SHARE_EXPIRY.map(([d, l]) => (
              <button key={d} type="button" className={"pf-chip" + (days === d ? " active" : "")} onClick={() => setDays(d)}>
                {l}
              </button>
            ))}
          </div>
          <button type="button" className="pf-btn pf-btn-primary pf-share-create" disabled={busy} onClick={create}>
            <i className="fas fa-link" /> สร้างลิงก์
          </button>
          <div className="pf-links-head">ลิงก์ที่ใช้งานอยู่</div>
          <div className="pf-links">
            {linksError ? (
              <div className="pf-links-empty">{linksError}</div>
            ) : links === null ? (
              <div className="pf-links-empty">กำลังโหลด…</div>
            ) : !links.length ? (
              <div className="pf-links-empty">ยังไม่มีลิงก์</div>
            ) : (
              links.map((sh) => (
                <div key={sh.id} className={"pf-link" + (sh.id === freshId ? " is-new" : "") + (sh.expired ? " is-expired" : "")}>
                  <div className="pf-link-main">
                    <div className="pf-link-url">{bareUrl(sh.id)}</div>
                    <div className="pf-link-meta">
                      <span>{sh.expired ? "หมดอายุแล้ว" : sh.expires_at ? "ถึง " + thDate(sh.expires_at) : "ไม่หมดอายุ"}</span>
                      <span className={sh.role === "editor" ? "pf-link-editor" : undefined}>
                        <i className={"fas " + (sh.role === "editor" ? "fa-pen-to-square" : "fa-eye")} /> {sh.role === "editor" ? "แก้ไขได้" : "ดูได้อย่างเดียว"}
                      </span>
                      {sh.kind === "album" ? <span>{sh.include_subfolders ? "รวมโฟลเดอร์ย่อย" : "เฉพาะโฟลเดอร์นี้"}</span> : null}
                      <span>
                        <i className="fas fa-eye" /> {fmt(sh.view_count)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="pf-mini"
                    title="คัดลอกลิงก์"
                    aria-label="คัดลอกลิงก์"
                    onClick={async () => {
                      const ok = await copyText(shareUrl(sh.id));
                      ui.toast(ok ? "คัดลอกลิงก์แล้ว" : "คัดลอกไม่สำเร็จ", ok ? "success" : "error");
                    }}
                  >
                    <i className="far fa-copy" />
                  </button>
                  <button type="button" className="pf-mini" title="แก้ไขสิทธิ์" aria-label="แก้ไขสิทธิ์" onClick={() => onEdit(sh, () => loadLinks())}>
                    <i className="fas fa-sliders" />
                  </button>
                  <button type="button" className="pf-mini pf-danger" title="ยกเลิกลิงก์" aria-label="ยกเลิกลิงก์" onClick={() => revoke(sh.id)}>
                    <i className="fas fa-link-slash" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
