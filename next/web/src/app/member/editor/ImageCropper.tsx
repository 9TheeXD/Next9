"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Crop step between picking a photo and uploading it. The frame is the 4:5 shape the profile uses;
// drag to move, pinch / wheel / slider to zoom, and the rotate button turns the photo a quarter.
// The result is drawn at 960 × 1200, exactly what /api/member-photo stores, so the server's own
// cover-crop changes nothing.

const OUT_W = 960;
const OUT_H = 1200;
const MAX_ZOOM = 4;

type View = { zoom: number; x: number; y: number; rot: number }; // x/y: image centre offset from the frame centre, in frame px

export function ImageCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (blob: Blob, raw: boolean) => void }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [frameW, setFrameW] = useState(0);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0, rot: 0 });
  const [busy, setBusy] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setFailed(true); // e.g. HEIC on a browser that cannot decode it
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrameW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  const frameH = (frameW * OUT_H) / OUT_W;
  // Size of the photo as it sits in the frame (sideways when rotated a quarter).
  const dims = useCallback(
    (v: View) => {
      if (!img || !frameW) return { w: 0, h: 0, s: 1 };
      const turned = v.rot % 180 !== 0;
      const iw = turned ? img.naturalHeight : img.naturalWidth;
      const ih = turned ? img.naturalWidth : img.naturalHeight;
      const s = Math.max(frameW / iw, frameH / ih) * v.zoom; // cover, then zoom
      return { w: iw * s, h: ih * s, s };
    },
    [img, frameW, frameH],
  );
  // Keep the photo covering the whole frame.
  const clamp = useCallback(
    (v: View): View => {
      const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
      const d = dims({ ...v, zoom });
      const mx = Math.max(0, (d.w - frameW) / 2);
      const my = Math.max(0, (d.h - frameH) / 2);
      return { ...v, zoom, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
    },
    [dims, frameW, frameH],
  );

  // Zoom keeping the point under (cx, cy) — frame coordinates from the centre — where it is.
  const zoomAt = (next: number, cx = 0, cy = 0) =>
    setView((v) => {
      const z = Math.min(MAX_ZOOM, Math.max(1, next));
      const k = z / v.zoom;
      return clamp({ ...v, zoom: z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
    });

  const centerOf = (e: { clientX: number; clientY: number }) => {
    const r = frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const mid = centerOf({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      zoomAt((pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist, mid.x, mid.y);
    } else {
      setView((v) => clamp({ ...v, x: v.x + now.x - prev.x, y: v.y + now.y - prev.y }));
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }
  function onWheel(e: React.WheelEvent) {
    const c = centerOf(e);
    zoomAt(view.zoom * Math.exp(-e.deltaY * 0.0015), c.x, c.y);
  }

  async function confirm() {
    if (!img || !frameW || busy) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      ctx.imageSmoothingQuality = "high";
      const k = OUT_W / frameW;
      const { s } = dims(view);
      ctx.translate(OUT_W / 2 + view.x * k, OUT_H / 2 + view.y * k);
      ctx.rotate((view.rot * Math.PI) / 180);
      ctx.scale(s * k, s * k);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (blob) onDone(blob, false);
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  const d = dims(view);
  return (
    <div className="e-crop" role="dialog" aria-modal="true" aria-label="ครอปรูป">
      <div className="e-crop-card">
        <div className="e-crop-head">
          <b>ครอปรูป</b>
          <span>ลากเพื่อเลื่อน · ถ่างนิ้วหรือใช้แถบเพื่อซูม</span>
        </div>

        {failed ? (
          <div className="e-crop-fail">
            <i className="fas fa-image" aria-hidden />
            <p>เบราว์เซอร์นี้เปิดไฟล์นี้ไม่ได้ (เช่น HEIC) จึงครอปไม่ได้</p>
            <p className="e-muted">อัปโหลดรูปเดิมได้ ระบบจะครอปตรงกลางให้เอง</p>
          </div>
        ) : (
          <div
            ref={frameRef}
            className="e-crop-frame"
            style={{ height: frameH || undefined }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {!img ? (
              <div className="e-spinner" />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={img.src}
                alt=""
                draggable={false}
                style={{
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                  transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) rotate(${view.rot}deg) scale(${d.s})`,
                }}
              />
            )}
            <div className="e-crop-grid" aria-hidden />
          </div>
        )}

        {!failed && (
          <div className="e-crop-tools">
            <button type="button" className="e-ghost" onClick={() => zoomAt(view.zoom / 1.25)} aria-label="ซูมออก">
              <i className="fas fa-minus" aria-hidden />
            </button>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={view.zoom}
              onChange={(e) => zoomAt(Number(e.target.value))}
              aria-label="ซูม"
            />
            <button type="button" className="e-ghost" onClick={() => zoomAt(view.zoom * 1.25)} aria-label="ซูมเข้า">
              <i className="fas fa-plus" aria-hidden />
            </button>
            <button type="button" className="e-ghost" onClick={() => setView((v) => clamp({ ...v, rot: (v.rot + 90) % 360, x: 0, y: 0 }))} aria-label="หมุน 90 องศา">
              <i className="fas fa-redo" aria-hidden />
            </button>
            <button type="button" className="e-ghost" onClick={() => setView({ zoom: 1, x: 0, y: 0, rot: 0 })} aria-label="เริ่มใหม่">
              <i className="fas fa-undo" aria-hidden />
            </button>
          </div>
        )}

        <div className="e-crop-actions">
          <button type="button" className="e-ghost" onClick={onCancel} disabled={busy}>
            ยกเลิก
          </button>
          {failed ? (
            <button type="button" className="e-primary" onClick={() => onDone(file, true)}>
              อัปโหลดรูปเดิม
            </button>
          ) : (
            <button type="button" className="e-primary" onClick={confirm} disabled={!img || busy}>
              {busy ? <i className="fas fa-spinner fa-spin" aria-hidden /> : <i className="fas fa-check" aria-hidden />} ใช้รูปนี้
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
