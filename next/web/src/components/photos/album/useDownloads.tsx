"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Zip } from "fflate";
import { fmtBytes, fmtSpeed, haptic, HAPTIC } from "@/lib/photos/util";
import { DownloadDock, type DockProgress } from "./DownloadDock";
import { MIME_EXT, type Photo } from "./model";

// Downloads on the album page: the quality picker, single-file downloads through the browser's own
// download manager, a bounded queue for "download selected" as separate files, and client-side ZIP
// assembly (fflate, store-only) with live size/speed/ETA in the progress modal.

const DL_QUEUE_CONCURRENCY = 3;
// Above this, a file is never read into a Blob: holding hundreds of MB (or several GB of video) in
// memory just to show a percentage can crash the tab, on phones especially. Such a file is either
// streamed straight to disk through the File System Access API (Chromium desktop: the user picks where
// to save, and the card shows a real percentage), or handed to the browser's own download manager with
// a card that says so.
const LARGE_FILE_BYTES = 300 * 1024 * 1024;
const DL_SPEED_WINDOW_MS = 1500;

type QueueState = {
  total: number;
  done: number;
  cancelled: boolean;
  bytesDone: number;
  // Set for a single streamed file: percentage and ETA then come from bytes, not from files done.
  totalBytes?: number;
  samples: { t: number; bytes: number }[];
  onCancel?: () => void;
};

// What the user picked in the download dialog: a tier for photos (sd | medium | 4k | original) and a
// height for videos ("original", or "720" meaning "up to 720p", see resolveVideoDownload in server.js).
export type DownloadChoice = { photo: string; video: string };
const ORIGINAL_CHOICE: DownloadChoice = { photo: "original", video: "original" };
// The URL variant one file is fetched at under that choice.
const variantOf = (meta: Photo | undefined, c: DownloadChoice) =>
  meta?.file_type === "video" ? (c.video === "original" ? "original" : `vmax${c.video}`) : c.photo;
// Large = not safe to hold in memory. Resized photo tiers never are. A video "up to H" (vmax) counts by
// its original's size: the server serves the original itself whenever the video is no taller than H,
// so a 2 GB 4K video asked for "up to 4K" is the 2 GB file.
const isLarge = (meta: Photo | undefined, variant: string) => (meta?.size_bytes || 0) > LARGE_FILE_BYTES && (variant === "original" || variant.startsWith("vmax"));

// The dialog's options. Video heights are "up to": each video gets the tallest finished version not
// above it, highest first down to the smallest.
// Every option is a cap ("no sharper than"), highest first. cap = the long edge (photos) or the video
// height it limits to; an option is only offered when some selected file is sharper than its cap
// (below that it would download exactly the originals, the same as ต้นฉบับ).
const PHOTO_TIERS = [
  { id: "4k", cap: 3840, icon: "fas fa-tv", name: "4K", px: "3840px", desc: "คมชัดสูง ไฟล์เล็กกว่าต้นฉบับมาก" },
  { id: "medium", cap: 1600, icon: "fas fa-image", name: "HD", px: "1600px", desc: "คมชัดพอดี ไฟล์ไม่ใหญ่" },
  { id: "sd", cap: 640, icon: "fas fa-mobile-alt", name: "SD", px: "640px", desc: "ไฟล์เล็กสุด เหมาะกับส่งในแชท" },
];
const VIDEO_TIERS = [
  { id: "4320", cap: 4320, name: "4320p", badge: "8K" },
  { id: "2160", cap: 2160, name: "2160p", badge: "4K" },
  { id: "1440", cap: 1440, name: "1440p", badge: "2K" },
  { id: "1080", cap: 1080, name: "1080p", badge: "HD" },
  { id: "720", cap: 720, name: "720p", badge: "HD" },
  { id: "360", cap: 360, name: "360p", badge: "" },
  { id: "144", cap: 144, name: "144p", badge: "" },
];
// What the selection holds, for filtering the options. null max = unknown: then nothing is hidden.
type MediaSummary = { loading: boolean; photoMaxEdge: number | null; videoMaxShort: number | null };
const offered = (cap: number, max: number | null) => max === null || max > cap;

// Not in TypeScript's DOM lib yet (Chromium-only API).
type SaveFilePicker = (opts?: { suggestedName?: string; id?: string }) => Promise<FileSystemFileHandle>;
const saveFilePicker = (): SaveFilePicker | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { showSaveFilePicker?: SaveFilePicker; self: unknown; top: unknown };
  // The picker throws inside cross-origin iframes; treat that the same as unsupported.
  return typeof w.showSaveFilePicker === "function" && w.self === w.top ? w.showSaveFilePicker.bind(window) : null;
};

type Progress = DockProgress;


// Reads a response body as chunks, reporting bytes as they arrive (so the speed readout moves while a
// large file is still downloading, not only once it has finished).
async function readBodyWithProgress(r: Response, onChunk?: (n: number) => void) {
  if (r.body && r.body.getReader) {
    const reader = r.body.getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      onChunk?.(value.length);
    }
    return chunks;
  }
  const buf = new Uint8Array(await r.arrayBuffer());
  onChunk?.(buf.length);
  return [buf];
}

// A download fetch() follows the API's 302 to a signed R2 URL, which only succeeds when the bucket's
// CORS policy names this exact origin. When it does not, the fetch fails outright with
// "TypeError: Failed to fetch" — the ZIP builder logged it per file and the separate-files queue
// swallowed it and still reported success with nothing saved. Retrying with proxy=1 streams the same
// bytes through our own server, where CORS does not apply.
async function fetchDownload(url: string, init?: RequestInit) {
  try {
    const r = await fetch(url, init);
    if (r.ok) return r;
    if (r.status < 500) throw new Error("HTTP " + r.status);
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
  }
  const viaProxy = url + (url.includes("?") ? "&" : "?") + "proxy=1";
  const r2 = await fetch(viaProxy, init);
  if (!r2.ok) throw new Error("HTTP " + r2.status);
  return r2;
}

// ---- iPhone / iPad: save through the share sheet ----
// Safari on iOS/iPadOS has no save dialog: a download lands in Downloads with no say in where, and
// photos never reach the Photos app. Its share sheet does both ("บันทึกไปยังแอปไฟล์" to pick any folder,
// "บันทึกรูปภาพ" for the camera roll). Limited to Apple touch devices: desktop browsers and Android
// save files directly, where a share sheet would only be an extra step. iPadOS reports itself as a Mac,
// so it is recognised by its touch screen.
//
// The files are held in memory until the user taps, so a batch above this goes to the download
// manager as before instead (on a phone, a tab that holds too much is reloaded by the system).
const SHARE_MAX_BYTES = 300 * 1024 * 1024;
const SHARE_MAX_FILES = 100;
function shareSheetAvailable() {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  const ua = navigator.userAgent;
  const appleTouch = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!appleTouch) return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], "probe.jpg", { type: "image/jpeg" })] });
  } catch {
    return false;
  }
}
// Share-sheet mode for a batch whose total size is known up front (unknown sizes count as 0; the
// running total is checked again as files arrive).
const shareSheetFor = (count: number, knownBytes: number) => count <= SHARE_MAX_FILES && knownBytes <= SHARE_MAX_BYTES && shareSheetAvailable();

function saveBlob(blob: Blob, name: string, revokeMs: number) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), revokeMs);
}

export type DownloadEnv = {
  imageUrl: (id: string, variant: string, download?: boolean) => string;
  isShare: boolean;
  shareToken: string;
  shareAllows: (action: string) => boolean;
  isAll: boolean;
  albumId: () => string;
  authHeaders: () => Record<string, string>;
  findMeta: (id: string) => Photo | undefined;
  albumName: () => string;
  toast: (m: string, t?: "success" | "error") => void;
  hideToast: () => void;
};

export function useDownloads(env: DownloadEnv) {
  const envRef = useRef(env);
  useEffect(() => {
    envRef.current = env;
  });
  const [quality, setQuality] = useState<{ target: string; zip: boolean; hasPhotos: boolean; hasVideos: boolean } | null>(null);
  const [zipChoice, setZipChoice] = useState("0");
  const [progress, setProgress] = useState<Progress>({ open: false, startedAt: 0, title: "", pct: 0, done: false, doneCount: 0, total: 0, unit: "ไฟล์", size: "", speed: "--", etaSec: null, busy: false, showStats: true, handoff: null, share: null });
  const state = useRef<QueueState | null>(null);
  const statsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const zipping = useRef(false);
  // Finished files waiting for the share sheet (iPhone/iPad). Released on share, fallback, close.
  const pendingShare = useRef<File[] | null>(null);

  // Hands finished files to the user. On iPhone/iPad the share sheet, which needs a fresh tap: the
  // download took seconds, and Safari refuses navigator.share() once the tap that started it is that
  // old (NotAllowedError). So the first try usually fails and the card shows a button for the tap;
  // closing the sheet (AbortError) keeps the button for another go. Anything else the share sheet
  // cannot take (too large, a type it refuses) falls back to ordinary downloads.
  const sharePending = useCallback(async () => {
    const files = pendingShare.current;
    if (!files || !files.length) return;
    try {
      await navigator.share({ files });
      pendingShare.current = null;
      haptic(HAPTIC.success);
      setProgress((p) => ({ ...p, share: null, title: "บันทึกเสร็จแล้ว" }));
    } catch (err) {
      const name = (err as Error).name;
      if (name === "AbortError" || name === "NotAllowedError") return;
      console.error("[download:share]", err);
      pendingShare.current = null;
      files.forEach((f) => saveBlob(f, f.name, 60000));
      setProgress((p) => ({ ...p, share: null }));
      envRef.current.toast("เปิดหน้าบันทึกไม่ได้ ดาวน์โหลดตามปกติแทนแล้ว", "error");
    }
  }, []);
  const deliver = useCallback(
    (files: File[], viaShare: boolean, revokeMs: number) => {
      if (!files.length) return;
      if (!viaShare) {
        files.forEach((f) => saveBlob(f, f.name, revokeMs));
        return;
      }
      pendingShare.current = files;
      setProgress((p) => ({ ...p, title: "พร้อมบันทึกแล้ว", share: { count: files.length } }));
      sharePending();
    },
    [sharePending],
  );

  const isActive = useCallback(() => {
    const s = state.current;
    return zipping.current || !!(s && !s.cancelled && s.done < s.total);
  }, []);

  // Speed over a rolling ~1.5 s window of transferred bytes; only the monotonically increasing
  // "downloaded so far" figure is shown, and ETA from a rough remaining-bytes estimate.
  const updateStats = useCallback(() => {
    const s = state.current;
    if (!s) return;
    const now = Date.now();
    s.samples.push({ t: now, bytes: s.bytesDone });
    while (s.samples.length > 1 && now - s.samples[0].t > DL_SPEED_WINDOW_MS) s.samples.shift();
    const oldest = s.samples[0];
    const windowSec = (now - oldest.t) / 1000;
    const bps = windowSec > 0.2 ? (s.bytesDone - oldest.bytes) / windowSec : 0;
    setProgress((p) => {
      if (s.totalBytes) {
        const next = { ...p, size: `${fmtBytes(s.bytesDone)} / ${fmtBytes(s.totalBytes)}`, pct: Math.min(99, (s.bytesDone / s.totalBytes) * 100) };
        if (bps > 0) {
          next.speed = fmtSpeed(bps);
          next.etaSec = Math.round(Math.max(0, s.totalBytes - s.bytesDone) / bps);
        }
        return next;
      }
      const next = { ...p, size: fmtBytes(s.bytesDone) };
      if (bps > 0) {
        next.speed = fmtSpeed(bps);
        const avg = s.done > 0 ? s.bytesDone / s.done : 0;
        // Nothing finished yet: estimate from this file's pace is unknown, so wait for the first file.
        next.etaSec = s.done >= s.total ? 0 : s.done > 0 ? Math.round(Math.max(0, avg * (s.total - s.done)) / bps) : null;
      }
      return next;
    });
  }, []);

  const updateProgress = useCallback(() => {
    const s = state.current;
    if (!s) return;
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    setProgress((p) => ({ ...p, pct, doneCount: s.done, total: s.total }));
    updateStats();
  }, [updateStats]);

  const openModal = useCallback((total: number, opts: { title?: string; unit?: string } = {}) => {
    setProgress({
      open: true,
      startedAt: Date.now(),
      title: opts.title || "กำลังดาวน์โหลด",
      pct: 0,
      done: false,
      doneCount: 0,
      total,
      unit: opts.unit || "ไฟล์",
      size: "0 MB",
      speed: "--",
      etaSec: null,
      busy: false,
      showStats: true,
      handoff: null,
      share: null,
    });
  }, []);
  const closeModal = useCallback(() => {
    pendingShare.current = null;
    setProgress((p) => ({ ...p, open: false, share: null }));
  }, []);
  const finishModal = useCallback(() => {
    haptic(HAPTIC.success);
    const s = state.current;
    setProgress((p) => ({
      ...p,
      pct: 100,
      done: true,
      busy: false,
      doneCount: s ? s.done : p.doneCount,
      title: "ดาวน์โหลดเสร็จแล้ว",
      size: `ดาวน์โหลดแล้ว ${fmtBytes(s ? s.bytesDone : 0)}`,
      etaSec: 0,
      showStats: false,
    }));
  }, []);
  const cancel = useCallback(() => {
    const s = state.current;
    if (s) {
      s.cancelled = true;
      s.onCancel?.();
    }
    if (statsTimer.current) clearInterval(statsTimer.current);
    zipping.current = false;
    closeModal();
  }, [closeModal]);

  useEffect(
    () => () => {
      // Leaving the page stops downloads in progress.
      const s = state.current;
      if (s) {
        s.cancelled = true;
        s.onCancel?.();
      }
      if (statsTimer.current) clearInterval(statsTimer.current);
    },
    [],
  );

  const fnameForDownload = (id: string, contentType: string | null) => {
    const meta = envRef.current.findMeta(id);
    const name = meta?.original_name || id;
    const fallbackExt = (name.match(/\.[^.]+$/) || [meta?.file_type === "video" ? ".mp4" : ".jpg"])[0];
    const ext = MIME_EXT[(contentType || "").split(";")[0].trim().toLowerCase()] || fallbackExt;
    return name.replace(/\.[^.]+$/, "") + ext;
  };

  // Single file: the server redirects to R2 with Content-Disposition, so the browser streams it.
  const trigDL = useCallback((id: string, variant: string) => {
    const a = document.createElement("a");
    a.href = envRef.current.imageUrl(id, variant, true);
    a.download = "";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // The page cannot see a download the browser runs itself, so instead of a fake percentage the card
  // says plainly where the file went and where to watch it.
  const showHandoff = useCallback((count: number, bytes: number, note?: string) => {
    haptic(HAPTIC.success);
    setProgress({
      open: true,
      startedAt: Date.now(),
      title: count > 1 ? `ส่ง ${count} ไฟล์ให้เบราว์เซอร์ดาวน์โหลดแล้ว` : "ส่งให้เบราว์เซอร์ดาวน์โหลดแล้ว",
      pct: 100,
      done: true,
      doneCount: count,
      total: count,
      unit: "ไฟล์",
      size: bytes ? fmtBytes(bytes) : "",
      speed: "--",
      etaSec: 0,
      busy: false,
      showStats: false,
      share: null,
      handoff: { standalone: true, note: note || "ไฟล์ใหญ่จะดาวน์โหลดผ่านตัวจัดการดาวน์โหลดของเบราว์เซอร์ ดูความคืบหน้าได้ที่แถบดาวน์โหลดหรือการแจ้งเตือนของเครื่อง ปิดหน้านี้ได้เลย" },
    });
  }, []);

  const handOff = useCallback(
    (id: string, q: string, bytes: number) => {
      trigDL(id, q);
      envRef.current.hideToast();
      showHandoff(1, bytes);
    },
    [trigDL, showHandoff],
  );

  // Large single file on Chromium desktop: ask where to save, then pipe the response body straight
  // into the file chunk by chunk. Memory stays flat at one chunk, and the card shows real bytes.
  // Must be called synchronously from the click: the picker needs the user gesture, so nothing may be
  // awaited before it opens.
  const streamToDisk = useCallback(
    async (pick: SaveFilePicker, id: string, q: string, bytes: number) => {
      let handle: FileSystemFileHandle;
      try {
        handle = await pick({ suggestedName: fnameForDownload(id, null), id: "next9-photos" });
      } catch (err) {
        // Closing the picker is a choice, not an error. Anything else (no user activation, policy):
        // the browser's own download manager still works.
        if ((err as Error).name !== "AbortError") handOff(id, q, bytes);
        return;
      }
      const controller = new AbortController();
      let writable: FileSystemWritableFileStream | null = null;
      const s: QueueState = {
        total: 1,
        done: 0,
        cancelled: false,
        bytesDone: 0,
        totalBytes: bytes || undefined,
        samples: [],
        onCancel: () => {
          controller.abort();
          // abort() discards the partial file instead of leaving a truncated one behind.
          writable?.abort().catch(() => {});
        },
      };
      state.current = s;
      openModal(1, { title: "กำลังบันทึกไฟล์ลงเครื่อง" });
      if (statsTimer.current) clearInterval(statsTimer.current);
      statsTimer.current = setInterval(updateStats, 500);
      try {
        writable = await handle.createWritable();
        const r = await fetchDownload(envRef.current.imageUrl(id, q, true), { signal: controller.signal });
        if (!s.totalBytes) s.totalBytes = Number(r.headers.get("content-length")) || undefined;
        if (!r.body) throw new Error("no response body");
        const reader = r.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          // Awaiting each write is the back-pressure: the network is read no faster than the disk takes it.
          await writable.write(value);
          s.bytesDone += value.length;
        }
        await writable.close();
        if (s.cancelled) return;
        s.done = 1;
        updateProgress();
        finishModal();
        setProgress((p) => ({ ...p, title: "บันทึกไฟล์เสร็จแล้ว", size: `บันทึกแล้ว ${fmtBytes(s.bytesDone)} · ${handle.name}` }));
      } catch (err) {
        if (s.cancelled || (err as Error).name === "AbortError") return;
        console.error("[download:stream]", id, err);
        writable?.abort().catch(() => {});
        // A failed stream (network drop, disk full, CORS on both paths) still ends with the file:
        // the browser's download manager retries on its own terms.
        handOff(id, q, bytes);
      } finally {
        if (state.current === s && statsTimer.current) clearInterval(statsTimer.current);
      }
    },
    [openModal, updateStats, updateProgress, finishModal, handOff],
  );

  const runDownloadQueue = useCallback(
    async (ids: string[], choice: DownloadChoice) => {
      const vOf = (id: string) => variantOf(envRef.current.findMeta(id), choice);
      // Large files skip the in-memory path entirely and go to the browser's download manager up front.
      let largeBytes = 0;
      const large = ids.filter((id) => {
        const meta = envRef.current.findMeta(id);
        if (!isLarge(meta, vOf(id))) return false;
        largeBytes += meta?.size_bytes || 0;
        return true;
      });
      large.forEach((id) => trigDL(id, vOf(id)));
      ids = ids.filter((id) => !large.includes(id));
      if (!ids.length) {
        showHandoff(large.length, largeBytes);
        return;
      }
      const s: QueueState = { total: ids.length, done: 0, cancelled: false, bytesDone: 0, samples: [] };
      state.current = s;
      openModal(s.total);
      // iPhone/iPad: collect the files and save them through the share sheet in one go at the end.
      const knownBytes = ids.reduce((n, id) => n + (envRef.current.findMeta(id)?.size_bytes || 0), 0);
      let viaShare = shareSheetFor(ids.length, knownBytes);
      const collected: File[] = [];
      // Saving many files one after another is what browsers ask permission for ("allow multiple
      // downloads"). Without a word about it, a blocked prompt looks exactly like the bug where the
      // card said finished and nothing arrived.
      if (ids.length > 1 && !viaShare) envRef.current.toast("ถ้าเบราว์เซอร์ถามอนุญาตให้ดาวน์โหลดหลายไฟล์ กดอนุญาตด้วย", "success");
      if (statsTimer.current) clearInterval(statsTimer.current);
      statsTimer.current = setInterval(updateStats, 500);
      let next = 0,
        saved = 0,
        handedToBrowser = large.length;
      const worker = async () => {
        while (next < ids.length) {
          if (s.cancelled) return;
          const id = ids[next++];
          try {
            // download=1 gets a signed URL distinct from the <img> one, so this CORS fetch never
            // receives a cached R2 response stored without CORS headers.
            const r = await fetchDownload(envRef.current.imageUrl(id, vOf(id), true));
            const ct = r.headers.get("content-type");
            // The real type matters on iOS: it is what makes the share sheet offer "บันทึกรูปภาพ".
            const type = (ct || "").split(";")[0].trim() || "application/octet-stream";
            const taken = envRef.current.findMeta(id)?.taken_at;
            const file = new File((await readBodyWithProgress(r, (n) => (s.bytesDone += n))) as BlobPart[], fnameForDownload(id, ct), { type, ...(taken ? { lastModified: taken } : {}) });
            if (viaShare && s.bytesDone > SHARE_MAX_BYTES) {
              // Bigger than the sizes said: stop holding files, save what is held and carry on normally.
              viaShare = false;
              collected.splice(0).forEach((f) => saveBlob(f, f.name, 5000));
            }
            if (viaShare) collected.push(file);
            else saveBlob(file, file.name, 5000);
            saved++;
          } catch (e) {
            if (s.cancelled || (e as Error).name === "AbortError") return;
            console.error("[download]", id, e);
            // Last resort: hand the URL to the browser's own download manager. That is a navigation,
            // not a fetch, so it needs no CORS — the file lands in the downloads folder without the
            // progress readout. Better than reporting success and saving nothing.
            try {
              trigDL(id, vOf(id));
              handedToBrowser++;
            } catch {}
          }
          if (s.cancelled) return;
          s.done++;
          updateProgress();
        }
      };
      await Promise.all(Array.from({ length: Math.min(DL_QUEUE_CONCURRENCY, ids.length) }, worker));
      if (statsTimer.current) clearInterval(statsTimer.current);
      if (s.cancelled) return;
      if (!saved && !handedToBrowser) {
        closeModal();
        envRef.current.toast("ดาวน์โหลดไม่สำเร็จ", "error");
        return;
      }
      finishModal();
      if (handedToBrowser)
        setProgress((p) => ({ ...p, handoff: { note: `${handedToBrowser} ไฟล์ส่งให้เบราว์เซอร์ดาวน์โหลดเอง ดูความคืบหน้าได้ที่แถบดาวน์โหลดหรือการแจ้งเตือนของเครื่อง` } }));
      deliver(collected, viaShare, 5000);
    },
    [openModal, updateStats, updateProgress, finishModal, closeModal, trigDL, showHandoff, deliver],
  );

  const runZipDownload = useCallback(
    async (ids: string[] | null, choice: DownloadChoice, opts?: { treeAlbumId?: string }) => {
      const q = choice.photo;
      const vq = choice.video !== "original" ? `&videoQuality=${encodeURIComponent(choice.video)}` : "";
      const e = envRef.current;
      const controller = new AbortController();
      let zip: Zip | null = null;
      const s: QueueState = {
        total: ids ? ids.length : 0,
        done: 0,
        cancelled: false,
        bytesDone: 0,
        samples: [],
        onCancel: () => {
          controller.abort();
          try {
            zip?.terminate();
          } catch {}
          zipping.current = false;
        },
      };
      state.current = s;
      zipping.current = true;
      openModal(s.total, { title: "กำลังเตรียมไฟล์ ZIP", unit: "รูป" });
      if (statsTimer.current) clearInterval(statsTimer.current);
      statsTimer.current = setInterval(updateStats, 500);
      try {
        type ZipFile = { id?: string; url?: string | null; name: string; path?: string; shareName?: boolean; fallbackExt?: string; taken_at?: number | null };
        let zipName: string, files: ZipFile[];
        if (e.isShare) {
          files = (ids || []).map((id) => {
            const m = e.findMeta(id) || ({} as Photo);
            const name = String(m.original_name || id).replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_");
            const ext = (name.match(/\.[^.]+$/) || [""])[0];
            return { id, url: null, shareName: true, name: name.replace(/\.[^.]+$/, "") || id, fallbackExt: ext || (m.file_type === "video" ? ".mp4" : ".jpg") };
          });
          zipName = (e.albumName() || "NEXT9").replace(/[^a-zA-Z0-9ก-๙]/g, "_") + ".zip";
        } else {
          const zipUrl = opts?.treeAlbumId
            ? `/api/photos/download-zip/${encodeURIComponent(opts.treeAlbumId)}?tree=1&quality=${q}${vq}`
            : `/api/photos/download-zip/${e.isAll ? "all" : e.albumId()}?ids=${(ids || []).join(",")}&quality=${q}${vq}`;
          const r = await fetch(zipUrl, { headers: e.authHeaders(), credentials: "include", signal: controller.signal });
          if (!r.ok) {
            closeModal();
            e.toast(r.status === 404 ? "ไม่พบไฟล์ในโฟลเดอร์นี้" : "ดาวน์โหลดไม่สำเร็จ", "error");
            return;
          }
          ({ zipName, files } = await r.json());
        }
        if (s.cancelled) return;
        if (!files || !files.length) {
          closeModal();
          e.toast("ไม่พบไฟล์", "error");
          return;
        }
        s.total = files.length;
        updateProgress();

        const fflate = await import("fflate");
        const out: Uint8Array[] = [];
        let zipErr: unknown = null;
        const z = new fflate.Zip((err, data) => {
          if (err) zipErr = err;
          else out.push(data);
        });
        zip = z;
        let next = 0,
          failed = 0;
        const used = new Set<string>();
        const unique = (name: string) => {
          const dot = name.lastIndexOf(".");
          const base = dot > 0 ? name.slice(0, dot) : name,
            ext = dot > 0 ? name.slice(dot) : "";
          let o = name;
          for (let n = 2; used.has(o.toLowerCase()); n++) o = `${base} (${n})${ext}`;
          used.add(o.toLowerCase());
          return o;
        };
        const worker = async () => {
          while (next < files.length && !s.cancelled) {
            const f = files[next++];
            try {
              const r = await fetchDownload(f.url || e.imageUrl(f.id || "", variantOf(e.findMeta(f.id || ""), choice), true), { signal: controller.signal });
              const chunks = await readBodyWithProgress(r, (n) => (s.bytesDone += n));
              if (s.cancelled) return;
              const ct = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
              // Store-only: photos/videos are already compressed. Share entries take their extension
              // from what was actually served (tiers differ in format).
              const entryName = f.shareName ? unique(f.name + (MIME_EXT[ct] || f.fallbackExt)) : f.path || f.name;
              const entry = new fflate.ZipPassThrough(entryName);
              // Extracted files keep when the photo was taken instead of the moment the ZIP was made.
              const taken = f.taken_at ?? e.findMeta(f.id || "")?.taken_at;
              if (taken) entry.mtime = new Date(taken);
              z.add(entry);
              if (!chunks.length) entry.push(new Uint8Array(0), true);
              chunks.forEach((c, i) => entry.push(c, i === chunks.length - 1));
            } catch (err) {
              if (s.cancelled) return;
              console.error("[zip]", f.name, err);
              failed++;
            }
            s.done++;
            updateProgress();
          }
        };
        await Promise.all(Array.from({ length: Math.min(DL_QUEUE_CONCURRENCY, files.length) }, worker));
        if (s.cancelled) return;
        if (zipErr) throw zipErr;
        if (failed === files.length) throw new Error("every file failed");

        if (statsTimer.current) clearInterval(statsTimer.current);
        setProgress((p) => ({ ...p, title: "กำลังบีบอัดไฟล์ ZIP", doneCount: files.length - failed, busy: true, showStats: false }));
        // Two frames so the stage-2 text paints before the synchronous finalize + Blob build.
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        if (s.cancelled) return;
        z.end();
        if (zipErr) throw zipErr;
        const zipFile = new File(out as BlobPart[], zipName, { type: "application/zip" });
        out.length = 0;
        zipping.current = false;
        finishModal();
        deliver([zipFile], shareSheetFor(1, zipFile.size), 60000);
        if (failed) e.toast(`ข้าม ${failed} ไฟล์ที่ดาวน์โหลดไม่สำเร็จ`, "error");
      } catch (err) {
        if (s.cancelled || (err as Error).name === "AbortError") return;
        console.error(err);
        closeModal();
        e.toast("เกิดข้อผิดพลาดในการสร้างไฟล์ ZIP", "error");
      } finally {
        // A new download may have started right after a cancel — don't touch its state.
        if (state.current === s) {
          if (statsTimer.current) clearInterval(statsTimer.current);
          zipping.current = false;
        }
      }
    },
    [openModal, updateStats, updateProgress, closeModal, finishModal, deliver],
  );

  // One file still gets the progress card and the floating circle: it goes through the same queue as a
  // batch, so the feedback does not depend on how many files were picked. A large file is the
  // exception (see LARGE_FILE_BYTES): streamed to disk where the browser allows it, else handed off.
  const downloadOne = useCallback(
    (id: string, choice: DownloadChoice) => {
      const meta = envRef.current.findMeta(id);
      const size = meta?.size_bytes || 0;
      const variant = variantOf(meta, choice);
      if (!isLarge(meta, variant)) return runDownloadQueue([id], choice);
      const pick = saveFilePicker();
      if (pick) streamToDisk(pick, id, variant, size);
      else handOff(id, variant, size);
    },
    [runDownloadQueue, streamToDisk, handOff],
  );

  // The download dialog. One dialog for photos and videos: a photo quality and a video quality are
  // chosen side by side (each section only when the download contains that kind of file), both start at
  // ต้นฉบับ, and nothing downloads until "ดาวน์โหลด" is pressed.
  //
  // target: 'selected' | 'current' | 'tree:<albumId>' | <image id>. A folder (tree) may hold both kinds,
  // so it shows both. A single video lists its own ladder (finished versions selectable, the rest shown
  // as รอคิว); a single video with nothing but the original downloads straight away, as before.
  const [videoLadder, setVideoLadder] = useState<{ id: string; height: number | null; status: "ready" | "queued" }[] | null>(null);
  const [photoPick, setPhotoPick] = useState("original");
  const [summary, setSummary] = useState<MediaSummary | null>(null);
  const summaryToken = useRef(0);
  const [videoPick, setVideoPick] = useState("original");
  const openQuality = useCallback(
    async (target: string, ctxIds?: string[]) => {
      const e = envRef.current;
      const single = target === "selected" || target === "current" || target.startsWith("tree:") ? undefined : e.findMeta(target);
      let hasPhotos = true,
        hasVideos = true;
      if (target === "selected" && ctxIds) {
        const metas = ctxIds.map((id) => e.findMeta(id));
        hasVideos = metas.some((m) => m?.file_type === "video");
        // Unknown files (not loaded on this page) may be photos.
        hasPhotos = metas.some((m) => !m || m.file_type !== "video");
      } else if (single) {
        hasVideos = single.file_type === "video";
        hasPhotos = !hasVideos;
      }
      let ladder: typeof videoLadder = null;
      if (single && single.file_type === "video") {
        if (e.isShare && !e.shareAllows("download")) return;
        try {
          const r = await fetch(e.imageUrl(target, "renditions"), { cache: "no-store" });
          const d = await r.json();
          const rungs = (d.renditions || []) as { height: number; status: string }[];
          ladder = [
            { id: "original", height: d.original?.height ?? null, status: "ready" as const },
            ...rungs.map((x) => ({ id: String(x.height), height: x.height, status: x.status === "ready" ? ("ready" as const) : ("queued" as const) })),
          ];
        } catch {}
        if (!ladder || ladder.length < 2) {
          downloadOne(target, ORIGINAL_CHOICE); // nothing to choose between
          return;
        }
      }
      setZipChoice("0");
      setPhotoPick("original");
      setVideoPick("original");
      setVideoLadder(ladder);
      setQuality({ target, zip: target === "selected", hasPhotos, hasVideos });

      // Which caps make sense: a single photo knows its own size; a batch or a folder asks the server,
      // which also knows the videos' real resolutions and the files not loaded on this page. The dialog
      // is already open meanwhile, with a spinner where those options will go.
      const token = ++summaryToken.current;
      if (single) {
        setSummary({ loading: false, photoMaxEdge: single.width && single.height ? Math.max(single.width, single.height) : null, videoMaxShort: null });
        return;
      }
      setSummary({ loading: true, photoMaxEdge: null, videoMaxShort: null });
      const body = target.startsWith("tree:")
        ? { tree: target.slice(5) }
        : e.isShare
          ? { share: e.shareToken, ids: ctxIds || [] }
          : { ids: ctxIds || [] };
      try {
        const r = await fetch("/api/photos/media-summary", {
          method: "POST",
          headers: { ...e.authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (token !== summaryToken.current) return; // the dialog was closed or reopened meanwhile
        if (!d.success) throw new Error("summary failed");
        setSummary({ loading: false, photoMaxEdge: d.photoMaxEdge ?? null, videoMaxShort: d.videoMaxShort ?? null });
        // The real counts: a selection of files not loaded here, or a folder, may hold only one kind.
        if (typeof d.photoCount === "number" && typeof d.videoCount === "number" && d.photoCount + d.videoCount > 0)
          setQuality((q) => (q && q.target === target ? { ...q, hasPhotos: d.photoCount > 0, hasVideos: d.videoCount > 0 } : q));
      } catch {
        // Unknown: show every option, as before.
        if (token === summaryToken.current) setSummary({ loading: false, photoMaxEdge: null, videoMaxShort: null });
      }
    },
    [downloadOne],
  );

  const execute = useCallback(
    (ctx: { selectedIds: () => string[]; currentId: string | null }) => {
      const target = quality?.target;
      setQuality(null);
      if (!target) return;
      const choice: DownloadChoice = { photo: photoPick, video: videoPick };
      const e = envRef.current;
      if (e.isShare && (!e.shareAllows("download") || target.startsWith("tree:"))) return;
      if (target.startsWith("tree:")) runZipDownload(null, choice, { treeAlbumId: target.slice(5) });
      else if (target === "selected") {
        const ids = ctx.selectedIds();
        if (zipChoice === "1") runZipDownload(ids, choice);
        else runDownloadQueue(ids, choice);
      } else {
        const id = target === "current" ? ctx.currentId : target;
        if (id) downloadOne(id, choice);
      }
    },
    [quality, zipChoice, photoPick, videoPick, runZipDownload, runDownloadQueue, downloadOne],
  );

  const modals = (ctx: { selectedIds: () => string[]; currentId: string | null }) => (
    <>
      <div className={"quality-modal" + (quality ? " show" : "")} id="qualityModal">
        <div className={"quality-card qm-card" + (quality?.hasPhotos && quality?.hasVideos ? " qm-wide" : "")}>
          <h3>
            <i className="fas fa-download" style={{ color: "var(--accent)", marginRight: 6 }} /> ดาวน์โหลด
          </h3>
          <p style={{ marginBottom: 15, color: "var(--text-light)", fontSize: "0.9rem" }}>เลือกความละเอียด แล้วกด ดาวน์โหลด</p>
          <div id="qmZipOption" style={{ display: quality?.zip ? "block" : "none", marginBottom: 15 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 8, color: "var(--text-dark)" }}>รูปแบบการโหลด:</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
              <input type="radio" name="qmZip" value="0" checked={zipChoice === "0"} onChange={() => setZipChoice("0")} /> แยกไฟล์ทีละรูป (เหมาะกับมือถือ)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="radio" name="qmZip" value="1" checked={zipChoice === "1"} onChange={() => setZipChoice("1")} /> รวมเป็นไฟล์ ZIP (เหมาะกับคอมฯ)
            </label>
          </div>
          <div className="qm-heading">ความชัดสูงสุดที่ต้องการ</div>
          <div className={"qm-sections" + (quality?.hasPhotos && quality?.hasVideos ? " two" : "")}>
            {quality?.hasPhotos ? (
              <section className="qm-section" aria-label="ความชัดสูงสุดของรูปภาพ">
                <div className="qm-section-title">
                  <i className="fas fa-image" /> รูปภาพ
                </div>
                <div className="qm-options" role="radiogroup">
                  <button type="button" role="radio" aria-checked={photoPick === "original"} className={"qm-option" + (photoPick === "original" ? " selected" : "")} onClick={() => setPhotoPick("original")}>
                    <i className="fas fa-crown" />
                    <div>
                      <div className="qm-tier-name">ต้นฉบับ</div>
                      <div className="qm-tier-desc">
                        ชัดที่สุดของแต่ละไฟล์{summary?.photoMaxEdge ? ` · สูงสุด ${summary.photoMaxEdge}px` : ""}
                      </div>
                    </div>
                    <i className={"qm-radio fa-" + (photoPick === "original" ? "solid fa-circle-dot" : "regular fa-circle")} />
                  </button>
                  {summary?.loading ? (
                    <div className="qm-loading">
                      <i className="fas fa-circle-notch fa-spin" /> กำลังตรวจสอบความละเอียดของไฟล์ที่เลือก…
                    </div>
                  ) : (
                    PHOTO_TIERS.filter((t) => offered(t.cap, summary?.photoMaxEdge ?? null)).map((t) => (
                      <button key={t.id} type="button" role="radio" aria-checked={photoPick === t.id} className={"qm-option" + (photoPick === t.id ? " selected" : "")} onClick={() => setPhotoPick(t.id)}>
                        <i className={t.icon} />
                        <div>
                          <div className="qm-tier-name">
                            สูงสุดไม่เกิน {t.name} <span>{t.px}</span>
                          </div>
                          <div className="qm-tier-desc">{t.desc} (หรือต้นฉบับ)</div>
                        </div>
                        <i className={"qm-radio fa-" + (photoPick === t.id ? "solid fa-circle-dot" : "regular fa-circle")} />
                      </button>
                    ))
                  )}
                </div>
              </section>
            ) : null}
            {quality?.hasVideos ? (
              <section className="qm-section" aria-label="ความชัดสูงสุดของวิดีโอ">
                <div className="qm-section-title">
                  <i className="fas fa-film" /> วิดีโอ
                </div>
                <div className="qm-options" role="radiogroup">
                  {videoLadder ? (
                    // A single video: its own versions, the ones still being made shown as รอคิว.
                    videoLadder.map((r) => {
                      const badge = r.height && r.height >= 4320 ? "8K" : r.height && r.height >= 2160 ? "4K" : r.height && r.height >= 1440 ? "2K" : r.height && r.height >= 720 ? "HD" : "";
                      const waiting = r.status !== "ready";
                      return (
                        <button
                          key={r.id}
                          type="button"
                          role="radio"
                          aria-checked={videoPick === r.id}
                          disabled={waiting}
                          className={"qm-option compact" + (videoPick === r.id ? " selected" : "") + (waiting ? " waiting" : "")}
                          onClick={() => setVideoPick(r.id)}
                        >
                          <div>
                            <div className="qm-tier-name">
                              {r.id === "original" ? "ต้นฉบับ" : `${r.id}p`}
                              {r.id === "original" && r.height ? <span>{r.height}p</span> : null}
                              {badge ? <sup className="qm-badge">{badge}</sup> : null}
                            </div>
                            {r.id === "original" ? <div className="qm-tier-desc">ไฟล์เดิม ชัดที่สุด</div> : null}
                          </div>
                          {waiting ? <em className="qm-wait">รอคิว</em> : <i className={"qm-radio fa-" + (videoPick === r.id ? "solid fa-circle-dot" : "regular fa-circle")} />}
                        </button>
                      );
                    })
                  ) : (
                    <>
                      <button type="button" role="radio" aria-checked={videoPick === "original"} className={"qm-option compact" + (videoPick === "original" ? " selected" : "")} onClick={() => setVideoPick("original")}>
                        <div>
                          <div className="qm-tier-name">ต้นฉบับ</div>
                          <div className="qm-tier-desc">
                            ชัดที่สุดของแต่ละไฟล์{summary?.videoMaxShort ? ` · สูงสุด ${summary.videoMaxShort}p` : ""}
                          </div>
                        </div>
                        <i className={"qm-radio fa-" + (videoPick === "original" ? "solid fa-circle-dot" : "regular fa-circle")} />
                      </button>
                      {summary?.loading ? (
                        <div className="qm-loading">
                          <i className="fas fa-circle-notch fa-spin" /> กำลังตรวจสอบความละเอียดของวิดีโอที่เลือก…
                        </div>
                      ) : (
                        VIDEO_TIERS.filter((t) => offered(t.cap, summary?.videoMaxShort ?? null)).map((t) => (
                          <button key={t.id} type="button" role="radio" aria-checked={videoPick === t.id} className={"qm-option compact" + (videoPick === t.id ? " selected" : "")} onClick={() => setVideoPick(t.id)}>
                            <div>
                              <div className="qm-tier-name">
                                สูงสุดไม่เกิน {t.name}
                                {t.badge ? <sup className="qm-badge">{t.badge}</sup> : null}
                              </div>
                              <div className="qm-tier-desc">(หรือต้นฉบับ)</div>
                            </div>
                            <i className={"qm-radio fa-" + (videoPick === t.id ? "solid fa-circle-dot" : "regular fa-circle")} />
                          </button>
                        ))
                      )}
                    </>
                  )}
                </div>
              </section>
            ) : null}
          </div>
          <p className="qm-tier-note qm-cap-note">
            <i className="fas fa-circle-info" /> ไฟล์ที่มีความละเอียดต่ำกว่าตัวเลือกที่กำหนด จะถูกดาวน์โหลดที่ความชัดสูงสุดเท่าที่มีของไฟล์นั้นๆ
          </p>
          <div className="qm-actions">
            <button type="button" className="qm-cancel" onClick={() => setQuality(null)}>
              ยกเลิก
            </button>
            <button type="button" className="qm-go" onClick={() => execute(ctx)}>
              <i className="fas fa-download" /> ดาวน์โหลด
            </button>
          </div>
        </div>
      </div>

      <DownloadDock progress={progress} onCancel={cancel} onDismiss={closeModal} onShare={sharePending} />
    </>
  );

  // ESC: closes the quality picker if it is open. True when it did.
  const escape = useCallback(() => {
    if (!quality) return false;
    setQuality(null);
    return true;
  }, [quality]);

  return { openQuality, isActive, cancel, runZipDownload, modals, escape };
}
