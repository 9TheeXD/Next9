"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { fmtBytePair, fmtEta, fmtSpeed, haptic, HAPTIC } from "@/lib/photos/util";
import { isMediaFile, isVideoFile, type UploadFile, type UploadOrder } from "./model";
import { createUploadMeter, type MeterView, type UploadMeter } from "./uploadMeter";
import { createConcurrencyTuner } from "./uploadConcurrency";
import { readExifDate } from "@/lib/photos/exifDate";

// Upload flow of the album page: options modal (image quality + format), client-side compression,
// per-file XHR upload with byte progress, the status panel, cancel, the done popup, and folder uploads
// that recreate the folder tree as sub-albums.

// How many files are uploaded at once is tuned live by uploadConcurrency.ts. This caps the bytes in
// flight on top of that: the server holds each request body in memory until it is stored in R2, so a
// run of large videos must not all be sent together. One file always goes, whatever its size.
const UPLOAD_INFLIGHT_BYTES = 300 * 1024 * 1024;
const TUNER_TICK_MS = 500;
const newUploadSession = () => Math.random().toString(36).slice(2, 12);

const UPLOAD_QUALITY_LONG_EDGE: Record<string, number> = { fhd: 1920, hd: 1280 };
const UPLOAD_FORMAT_MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const UPLOAD_FORMAT_EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
// Files prepared ahead of the uploads that will need them. Compressing inside the upload slot left
// the connection idle for as long as the canvas work took — with three slots, all three stopped
// sending at once every few files. Preparing ahead keeps ready bytes waiting for a free slot.
const PREPARE_AHEAD = 2;
// Strictly one at a time, demand included. Decoding a full-size photo costs the phone its width ×
// height × 4 bytes — for the 3228 × 4566 originals a picker hands over, about 56 MB each — and
// several of those at once, on top of the uploads already in flight, is how a phone runs out of
// memory mid-run. One decode at a time is still enough to keep the wire fed.
const PREPARE_CONCURRENCY = 1;
// A failed upload is sent again before the tile is allowed to say so. Requests carry X-Upload-Order,
// which names the picked file for the life of the page, and the server answers a repeat of one it
// already stored with the photo it stored (no second copy) — so retrying costs nothing when the
// bytes did arrive and the reply was what went missing.
const UPLOAD_ATTEMPTS = 2;
const UPLOAD_RETRY_DELAY_MS = 900;

// Probed once: Safari's canvas cannot reliably encode webp, and asking per file is not free.
let webpOk: boolean | null = null;
function canEncodeWebp() {
  if (webpOk === null) {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      webpOk = c.toDataURL("image/webp").indexOf("image/webp") === 5;
    } catch {
      webpOk = false;
    }
  }
  return webpOk;
}

// Source dimensions without decoding the whole image: the load event fires once the header has been
// read, which is all the target size needs. Decoding a 4K photo at full size only to shrink it is
// both the slowest part of an upload and the part that makes a phone stutter.
function imageSize(file: File) {
  return new Promise<{ w: number; h: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: im.naturalWidth, h: im.naturalHeight });
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    im.src = url;
  });
}

async function compressImageFile(file: File, quality: string, format: string): Promise<File> {
  if (isVideoFile(file)) return file;
  if (quality === "original" && format === "keep") return file;
  try {
    // Header-only, and allowed to fail: it decides which edge the long-edge cap applies to, and
    // without it the decode simply happens at full size as it used to.
    let srcW = 0,
      srcH = 0;
    try {
      const size = await imageSize(file);
      srcW = size.w;
      srcH = size.h;
    } catch {}
    const longEdge = UPLOAD_QUALITY_LONG_EDGE[quality];
    let mime = UPLOAD_FORMAT_MIME[format] || file.type || "image/jpeg";
    if (mime === "image/webp" && !canEncodeWebp()) mime = "image/jpeg";

    let source: CanvasImageSource & { close?: () => void };
    let targetW: number, targetH: number;
    if ("createImageBitmap" in window) {
      // Scaled while it is decoded, off the main thread, so the full-size bitmap is never built.
      // Only one edge is ever given: the other follows the real aspect ratio, so a photo whose EXIF
      // rotation makes the probe report its edges the other way round comes out a little smaller
      // than asked for rather than stretched.
      const opts: ImageBitmapOptions = { resizeQuality: "high", imageOrientation: "from-image" };
      if (longEdge && Math.max(srcW, srcH) > longEdge) {
        if (srcW >= srcH) opts.resizeWidth = longEdge;
        else opts.resizeHeight = longEdge;
      }
      const bmp = await createImageBitmap(file, opts);
      source = bmp;
      targetW = bmp.width;
      targetH = bmp.height;
      // The probe was wrong about which edge is longer (or there was no probe): scale the rest of
      // the way on the canvas.
      if (longEdge && Math.max(targetW, targetH) > longEdge) {
        const scale = longEdge / Math.max(targetW, targetH);
        targetW = Math.max(1, Math.round(targetW * scale));
        targetH = Math.max(1, Math.round(targetH * scale));
      }
    } else {
      const url = URL.createObjectURL(file);
      const im = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      }).finally(() => URL.revokeObjectURL(url));
      source = im;
      targetW = im.naturalWidth;
      targetH = im.naturalHeight;
      if (longEdge && Math.max(targetW, targetH) > longEdge) {
        const scale = longEdge / Math.max(targetW, targetH);
        targetW = Math.max(1, Math.round(targetW * scale));
        targetH = Math.max(1, Math.round(targetH * scale));
      }
    }
    if (!targetW || !targetH) {
      source.close?.();
      return file;
    }

    // OffscreenCanvas encodes on a worker thread; the plain canvas blocks the page while it does.
    let blob: Blob | null = null;
    if (typeof OffscreenCanvas !== "undefined") {
      const oc = new OffscreenCanvas(targetW, targetH);
      oc.getContext("2d")!.drawImage(source, 0, 0, targetW, targetH);
      blob = await oc.convertToBlob({ type: mime, quality: 0.85 });
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.getContext("2d")!.drawImage(source, 0, 0, targetW, targetH);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.85));
    }
    // A phone that keeps a dozen decoded photos alive runs out of memory mid-upload.
    source.close?.();
    if (!blob) return file;
    // Re-encoding can come out bigger than the file that was picked (an already small JPEG, a flat
    // PNG). Sending what was picked is then both faster and better, as long as it is the format that
    // was asked for.
    if (blob.size >= file.size && mime === file.type) return file;
    let newName = file.name;
    if (format !== "keep" || mime !== file.type) newName = file.name.replace(/\.[^.]+$/, "") + (UPLOAD_FORMAT_EXT[mime] || ".jpg");
    return new File([blob], newName, { type: mime });
  } catch (e) {
    console.error("[compress] failed, uploading original", e);
    return file;
  }
}

type Phase = "preparing" | "uploading";
type StatusView = { title: string; pct: number; phase: Phase | null };

// Purely presentational: the upload loop reports what is happening and this decides what shows, so
// status changes milliseconds apart never flicker:
//   - a newly requested phase only shows once it has lasted PHASE_SETTLE_MS
//   - a phase that is on screen stays at least PHASE_HOLD_MS
//   - the bar never moves backwards
function createUploadStatus(render: (v: StatusView) => void) {
  // Preparing shows the moment it starts and stays half a second even when the file was ready sooner:
  // a phase that appears and vanishes within a few frames reads as a stutter, not as progress.
  const PHASE_SETTLE: Record<Phase, number> = { preparing: 0, uploading: 220 };
  const PHASE_HOLD: Record<Phase, number> = { preparing: 500, uploading: 450 };
  let shown: Phase | null = null,
    shownAt = 0,
    wanted: Phase | null = null,
    wantedAt = 0,
    timer: ReturnType<typeof setTimeout> | null = null,
    pct = 0;
  const labels: Record<Phase, string> = { preparing: "", uploading: "" };
  let title = "อัปโหลด";
  const emit = () => {
    if (shown) title = labels[shown];
    render({ title, pct, phase: shown });
  };
  function settle() {
    timer = null;
    if (wanted === shown) return;
    const now = Date.now();
    const settleFor = wanted ? PHASE_SETTLE[wanted] : 0;
    const holdFor = shown ? PHASE_HOLD[shown] : 0;
    const wait = Math.max(settleFor - (now - wantedAt), holdFor - (now - shownAt));
    if (wait > 0) {
      timer = setTimeout(settle, wait);
      return;
    }
    shown = wanted;
    shownAt = now;
    emit();
  }
  return {
    reset() {
      if (timer) clearTimeout(timer);
      timer = null;
      shown = wanted = null;
      pct = 0;
      emit();
    },
    setPhase(phase: Phase, label: string) {
      labels[phase] = label;
      const now = Date.now();
      if (shown === null) {
        shown = wanted = phase;
        shownAt = wantedAt = now;
        emit();
        return;
      }
      if (phase !== wanted) {
        wanted = phase;
        wantedAt = now;
      }
      if (phase === shown) {
        emit();
        return;
      }
      if (!timer) timer = setTimeout(settle, PHASE_SETTLE[phase]);
    },
    setProgress(value: number) {
      pct = Math.max(pct, Math.min(100, value));
      emit();
    },
    // Files appended to a running upload make the same work a smaller share of a bigger total, so the
    // percentage legitimately drops. The bar is monotonic by default (progress must never look like it
    // is going backwards mid-file); this is the one case that has to lower the ceiling.
    rebase(value: number) {
      pct = Math.min(100, Math.max(0, value));
      emit();
    },
    dispose() {
      if (timer) clearTimeout(timer);
    },
  };
}

// One tile in the grid for every file the visitor picked, in the order they picked them, from the
// moment the upload starts. The server hands back the photo id as each file lands, and the id is what
// lets the album grid put the real photo in the same slot the placeholder held.
export type UploadSlot = {
  key: string;
  name: string;
  // processing: stored, the server is still making thumbnails. done: processing finished but the photo
  // is not in this grid's list (it went into a sub-album, or the current sort/filter doesn't show it).
  // When it is in the list, the photo itself takes the tile's place and this status no longer shows.
  status: "preparing" | "pending" | "uploading" | "processing" | "done" | "failed";
  pct: number;
  id?: string;
  error?: string;
  order: UploadOrder;
};

export const UPLOAD_SLOT_LABEL: Record<UploadSlot["status"], string> = {
  preparing: "กำลังเตรียมไฟล์...",
  pending: "รอคิว...",
  uploading: "กำลังอัปโหลด...",
  processing: "กำลังประมวลผล...",
  done: "เสร็จแล้ว",
  failed: "ล้มเหลว",
};

export type UploadEnv = {
  albumId: () => string;
  authHeaders: () => Record<string, string>;
  toast: (m: ReactNode, t?: "success" | "error", sticky?: boolean) => void;
  hideToast: () => void;
  onFinished: (touchedOtherAlbums: boolean) => void;
  // Called the moment the server hands back a photo id, before any refresh can bring the photo in, so
  // the grid already knows where it belongs when it arrives.
  recordOrder: (id: string, order: UploadOrder) => void;
  // Brings finished photos into the grid; resolves once the grid has them (or has tried).
  onProcessed: () => Promise<void>;
  refreshNav: () => void;
};

export function useUploads(env: UploadEnv) {
  // Identifies this mount of the album page to the server, which uses it with UploadOrder to date each
  // photo by its picked position rather than by when its request happened to finish, and to recognise a
  // file it has already stored (X-Upload-Order in server.js). It has to be per mount, like the block/seq
  // counters it is paired with: one id per page load, with counters that start over on every album the
  // visitor opens, sent "<session>:1:1" again from the next album, and the server answered that upload
  // with the photo it had stored for the first one — the new file was never stored and its tile vanished.
  const [uploadSession] = useState(newUploadSession);
  const envRef = useRef(env);
  useEffect(() => {
    envRef.current = env;
  });
  const [optionsFor, setOptionsFor] = useState<{ files: UploadFile[]; folders: number; summary: string; hasImages: boolean; webp: boolean } | null>(null);
  const [quality, setQuality] = useState("original");
  const [format, setFormat] = useState("keep");
  const [panel, setPanel] = useState<{ open: boolean; count: string; notice: string }>({ open: false, count: "", notice: "" });
  // Size / speed / time left. A meter is made for each run and emits on a fixed beat, so every
  // figure is always on screen and only ever gets overwritten (see uploadMeter.ts). It is per-run
  // and not per-page: one that outlived its run left its files in the next run's total.
  const [meterView, setMeterView] = useState<MeterView | null>(null);
  const meterRef = useRef<UploadMeter | null>(null);
  // Set by the running upload so the bar can follow the bytes the meter counts.
  const meterSink = useRef<((v: MeterView) => void) | null>(null);
  const stopMeter = useCallback(() => {
    meterRef.current?.stop();
    meterRef.current = null;
    meterSink.current = null;
    setMeterView(null);
  }, []);
  const [status, setStatus] = useState<StatusView>({ title: "อัปโหลด", pct: 0, phase: null });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const uploading = useRef(false);
  // Every upload request in flight (several run at once), so cancel and leaving the page abort them all.
  const activeXhrs = useRef(new Set<XMLHttpRequest>());
  const [statusMachine] = useState(() => createUploadStatus(setStatus));
  const statusRef = useRef(statusMachine);
  const [isUploading, setIsUploading] = useState(false);
  const [queue, setQueue] = useState<UploadSlot[]>([]);
  // Every photo this run has put on the server, so "cancel and remove" can take them all back out —
  // including the ones that landed before the run was stopped or a later file failed.
  const batchIds = useRef<string[]>([]);
  // The running upload, while there is one. Files dropped mid-upload go straight into its work list, so
  // the counts and the bar take them in at once rather than when the current file finishes.
  const run = useRef<{ append: (files: UploadFile[]) => void } | null>(null);
  // Upload blocks (UploadOrder.block) the running upload has sent files for; cancel names them to the
  // server so it can stop and, if asked, trash everything it stored for them.
  const runBlocks = useRef(new Set<number>());
  // The quality and format last confirmed. Files dropped while an upload runs use them without asking
  // again: a modal popping up over a running upload was what made appending feel like starting over.
  const lastChoice = useRef({ quality: "original", format: "keep" });
  // By key, never by index: a file appended to a running upload must patch its own tile, and indices
  // shift as batches join the queue.
  const patchSlot = useCallback((key: string, patch: Partial<UploadSlot>) => {
    setQueue((q) => (q.some((slot) => slot.key === key) ? q.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)) : q));
  }, []);
  // startUploadFlow is created once, so it reaches the setter through a ref.
  const patchSlotRef = useRef(patchSlot);
  // The picked File behind every tile, by key, for as long as the tile exists: a tile whose upload
  // failed can then send the same file again without it being picked or dropped a second time.
  // (A File from a picker or a drop is a handle to the file on disk, not a copy in memory.)
  const filesByKey = useRef(new Map<string, UploadFile>());
  const queueRef = useRef<UploadSlot[]>([]);
  useEffect(() => {
    queueRef.current = queue;
    const live = new Set(queue.map((slot) => slot.key));
    filesByKey.current.forEach((_, k) => {
      if (!live.has(k)) filesByKey.current.delete(k);
    });
  }, [queue]);
  const clearQueue = useCallback(() => setQueue([]), []);
  const dropSlots = useCallback((keys: string[]) => {
    const gone = new Set(keys);
    setQueue((q) => q.filter((slot) => !gone.has(slot.key)));
  }, []);
  // Block and sequence counters for UploadOrder. block is null while there are no upload tiles, so the
  // next drop opens a new block; drops while tiles are showing join the block already there.
  const counters = useRef({ block: 0, seq: 0, open: null as number | null });
  useEffect(() => {
    if (!queue.length) counters.current.open = null;
  }, [queue.length]);
  // Tiles are added to the end of what is already there, in exactly the order the files came in.
  // Replacing the list was what made the grid jump: dropping files while an upload ran threw away the
  // running batch's tiles and rebuilt different ones in their place.
  const seedQueue = useCallback((files: UploadFile[], status: UploadSlot["status"] = "pending") => {
    const c = counters.current;
    if (c.open === null) c.open = ++c.block;
    const runId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    files.forEach((f, i) => {
      f.__slotKey = runId + ":" + i;
      f.__order = { block: c.open as number, seq: ++c.seq };
      filesByKey.current.set(f.__slotKey, f);
    });
    setQueue((q) => q.concat(files.map((f) => ({ key: f.__slotKey as string, name: f.name || "", status, pct: 0, order: f.__order as UploadOrder }))));
  }, []);
  const seedQueueRef = useRef(seedQueue);

  // Tiles on "processing" ask the server about their own photos. The album listing only returns
  // finished photos, so waiting for a photo to show up there never ended for one that failed
  // processing: its tile said "processing" forever. Polls only while such tiles exist.
  const waitingIds = queue
    .filter((slot) => slot.status === "processing" && slot.id)
    .map((slot) => slot.id as string)
    .join(",");
  useEffect(() => {
    if (!waitingIds) return;
    let stopped = false;
    let busy = false;
    const check = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const r = await fetch("/api/photos/images/status?ids=" + encodeURIComponent(waitingIds), { cache: "no-store" });
        const d = (await r.json()) as { images?: { id: string; status: string; error?: string | null }[] };
        if (stopped || !d.images) return;
        const byId = new Map(d.images.map((x) => [x.id, x]));
        const done: string[] = [];
        const failed: { id: string; error?: string }[] = [];
        for (const id of waitingIds.split(",")) {
          const row = byId.get(id);
          // Gone from the database, deleted, or out of retries: nothing more is coming for this tile.
          if (!row || row.status === "deleted" || row.status === "failed") failed.push({ id, error: row?.error || undefined });
          else if (row.status === "done") done.push(id);
        }
        const patchByIds = (ids: Set<string>, patch: (slot: UploadSlot) => Partial<UploadSlot>) =>
          setQueue((q) => q.map((slot) => (slot.id && ids.has(slot.id) && slot.status === "processing" ? { ...slot, ...patch(slot) } : slot)));
        if (failed.length) {
          const errs = new Map(failed.map((f) => [f.id, f.error]));
          patchByIds(new Set(errs.keys()), (slot) => ({ status: "failed", error: errs.get(slot.id as string) }));
          envRef.current.toast(`ประมวลผลไม่สำเร็จ ${failed.length} ไฟล์`, "error");
        }
        if (done.length) {
          // Refresh first, then settle the tiles, so a finished photo replaces its tile in one step
          // instead of the tile saying "done" for a moment before the photo arrives.
          await envRef.current.onProcessed();
          if (!stopped) patchByIds(new Set(done), () => ({ status: "done" }));
        }
      } catch {
        // Network blip: the next tick tries again.
      } finally {
        busy = false;
      }
    };
    const t = setInterval(check, 2500);
    check();
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [waitingIds]);

  useEffect(
    () => () => {
      // Leaving the page cancels the upload in progress.
      uploading.current = false;
      try {
        activeXhrs.current.forEach((x) => x.abort());
      } catch {}
      statusRef.current?.dispose();
    },
    [],
  );

  const handleFiles = useCallback((list: FileList | File[] | null, opts?: { folders?: number }) => {
    if (!list || !list.length) return;
    const files = Array.from(list) as UploadFile[];
    if (uploading.current) {
      // Mid-upload: the tiles join the end of the queue as waiting, and the running upload takes them.
      seedQueue(files, "pending");
      startUploadFlowRef.current(files, lastChoice.current.quality, lastChoice.current.format);
      envRef.current.toast(`เพิ่ม ${files.length} ไฟล์ต่อท้ายคิวอัปโหลดแล้ว`, "success");
      return;
    }
    // The tiles go up first, saying the files are being prepared, and the quality question follows on a
    // later frame. Dropping a pile of large files used to look frozen until the modal appeared, because
    // reading the list and probing the canvas happen before anything painted.
    seedQueue(files, "preparing");
    requestAnimationFrame(() => requestAnimationFrame(() => askQualityRef.current(files, opts)));
  }, [seedQueue]);

  const askQuality = useCallback((newFiles: UploadFile[], opts?: { folders?: number }) => {
    // Safari's canvas can't reliably encode webp — hide that option when unsupported.
    const webp = canEncodeWebp();
    // A second drop while the question is still open joins the same batch. Replacing it left the first
    // drop's tiles saying "preparing" for good, with nothing ever uploading them.
    setOptionsFor((prev) => {
      const files = prev ? prev.files.concat(newFiles) : newFiles;
      const folders = (prev?.folders || 0) + (opts?.folders || 0);
      const imgCount = files.filter((f) => !isVideoFile(f)).length;
      const vidCount = files.length - imgCount;
      let summary = imgCount && vidCount ? `${imgCount} รูป และ ${vidCount} วิดีโอ` : imgCount ? `${imgCount} รูป` : `${vidCount} วิดีโอ`;
      summary = `กำลังจะอัปโหลด ${summary}` + (folders ? ` ใน ${folders} โฟลเดอร์` : "");
      return { files, folders, summary, hasImages: !!imgCount, webp };
    });
  }, []);
  const askQualityRef = useRef(askQuality);
  useEffect(() => {
    askQualityRef.current = askQuality;
  });

  const uploadFileWithProgress = (url: string, formData: FormData, headers: Record<string, string>, onProgress: (loaded: number) => void) =>
    new Promise<{ success?: boolean; message?: string; images?: { id: string }[] }>((resolve, reject) => {
      // fetch() cannot report upload progress; XHR reports bytes as they leave.
      const xhr = new XMLHttpRequest();
      activeXhrs.current.add(xhr);
      const settle = () => activeXhrs.current.delete(xhr);
      xhr.open("POST", url);
      Object.keys(headers).forEach((k) => xhr.setRequestHeader(k, headers[k]));
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded);
      };
      xhr.onload = () => {
        settle();
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data);
        else reject(new Error((data && data.message) || "HTTP " + xhr.status));
      };
      xhr.onerror = () => {
        settle();
        reject(new Error("network"));
      };
      xhr.onabort = () => {
        settle();
        reject(new Error("aborted"));
      };
      xhr.send(formData);
    });

  const startUploadFlow = useCallback(async (files: UploadFile[], q: string, fmtChoice: string) => {
    // Each file carries the answers given for the batch it arrived in, so a batch dropped mid-upload
    // keeps its own quality and format when the runner reaches it.
    files.forEach((f) => {
      f.__quality = q;
      f.__format = fmtChoice;
      if (f.__slotKey) patchSlotRef.current(f.__slotKey, { status: "pending", pct: 0, id: undefined });
    });
    // Every caller seeds tiles first; this only guards a file that somehow arrives without one.
    const unseeded = files.filter((f) => !f.__slotKey);
    if (unseeded.length) seedQueueRef.current(unseeded);

    // An upload is already running: hand the files to it instead of starting a second run. Two runs
    // shared one status machine, which is why the bar stopped making sense and the tiles fought each other.
    if (uploading.current && run.current) {
      run.current.append(files);
      return;
    }

    const e = envRef.current;
    const st = statusRef.current;
    uploading.current = true;
    setIsUploading(true);
    setPanel({ open: true, count: "", notice: "" });
    batchIds.current = [];
    let completed = 0,
      completedImages = 0,
      completedVideos = 0;
    // Files on the wire, by tile key: how far each is (0..1). The tiles use this; the bytes are the
    // meter's business.
    const inFlight = new Map<string, number>();
    // The work list grows while it is being walked: whatever is dropped mid-upload is pushed onto the
    // end, and every total is read live from this list rather than from a count captured earlier.
    const work: UploadFile[] = files.slice();
    runBlocks.current = new Set(work.map((f) => f.__order?.block).filter((b): b is number => typeof b === "number"));
    const countLabel = () => `${Math.min(completed + inFlight.size, work.length)} / ${work.length}`;
    const uploadingLabel = (f: File) => (work.length === 1 ? `กำลังอัปโหลด ${f.name || "ไฟล์"}` : `กำลังอัปโหลด ${work.length} ไฟล์`);
    const preparingLabel = (i: number) => (work.length === 1 ? "กำลังเตรียมไฟล์…" : `กำลังเตรียมไฟล์ ${i + 1} / ${work.length}`);
    // What each file is expected to weigh once prepared, so the total is there before the first photo
    // has been compressed and only ever gets corrected afterwards.
    const meterFiles = (list: UploadFile[]) =>
      list.map((f) => ({ key: f.__slotKey as string, raw: f.size, quality: f.__quality || q, format: f.__format || fmtChoice, isVideo: isVideoFile(f) }));
    const meter = createUploadMeter((v) => {
      setMeterView(v);
      meterSink.current?.(v);
    });
    meterRef.current = meter;
    meter.addFiles(meterFiles(work));
    // The bar follows the bytes, not the file count: with the sizes known up front it can move
    // steadily instead of standing still and then jumping a whole file's worth.
    meterSink.current = (v) => {
      if (v.total > 0) st.setProgress(Math.min(completed >= work.length ? 100 : 99.5, (v.sent / v.total) * 100));
    };
    meter.start();

    // The pool's cursors live here because preparing ahead is driven by how far the uploads have got.
    let next = 0,
      active = 0,
      activeBytes = 0;
    const tuner = createConcurrencyTuner();

    // ----- Preparing ahead of the uploads -----
    // compressImageFile for a file the uploader has not reached yet. Its result waits in `prepared`,
    // so a free upload slot almost always has bytes ready instead of starting the canvas work itself.
    const prepared = new Map<string, Promise<File>>();
    let prepNext = 0,
      prepActive = 0;
    // Every compression queues behind the last, whether it was started ahead of time or because an
    // upload slot asked for it. PREPARE_CONCURRENCY alone only paced the work started ahead: three
    // slots starting together still put three full-size decodes in memory at once, on top of the
    // uploads already in flight.
    let prepGate: Promise<unknown> = Promise.resolve();
    const compressInTurn = (f: UploadFile) => {
      const job = prepGate.then(() => compressImageFile(f, f.__quality || q, f.__format || fmtChoice));
      prepGate = job.catch(() => {});
      return job;
    };
    const prepare = (i: number): Promise<File> => {
      const f = work[i];
      const key = f.__slotKey as string;
      let p = prepared.get(key);
      if (p) return p;
      if (i >= prepNext) prepNext = i + 1;
      prepActive++;
      p = compressInTurn(f)
        .then((out) => {
          // The real size replaces this file's guess, and the ratio it achieved re-estimates the
          // files still waiting — which is what makes the total settle after the first photo.
          meter.noteCompressed(key, out.size || f.size);
          return out;
        })
        .finally(() => {
          prepActive--;
          pumpPrepare();
        });
      prepared.set(key, p);
      return p;
    };
    function pumpPrepare() {
      while (uploading.current && prepActive < PREPARE_CONCURRENCY && prepNext < work.length && prepNext < next + PREPARE_AHEAD) prepare(prepNext);
    }

    // One file: take the prepared bytes (or prepare them now), upload, record where it landed.
    // Several run at once (see pool).
    const uploadOne = async (i: number) => {
      const rawFile = work[i];
      const slotKey = rawFile.__slotKey as string;
      patchSlotRef.current(slotKey, { status: "uploading", pct: 0 });
      // Only when this slot actually has to wait for the canvas: a file prepared ahead is ready now,
      // and flashing "preparing" for it is exactly the stutter this panel is meant to avoid.
      if (!prepared.has(slotKey) && !inFlight.size) st.setPhase("preparing", preparingLabel(i));
      const file = await prepare(i);
      prepared.delete(slotKey); // the compressed blob is on its way out; don't hold a second copy
      pumpPrepare();
      if (!uploading.current) return;
      const targetAlbumId = rawFile.__targetAlbumId || e.albumId();
      const formData = new FormData();
      formData.append("file", file);
      const fileBytes = file.size || rawFile.size || 0;
      inFlight.set(slotKey, 0);
      setPanel((p) => ({ ...p, count: countLabel() }));
      try {
        const headers = { ...envRef.current.authHeaders() };
        // Tells the server where this file belongs in the picked order, so the order survives files
        // arriving out of turn (see uploadSession). The server also uses it to recognise a file it
        // has already stored, which is what makes sending one again safe.
        if (rawFile.__order) headers["X-Upload-Order"] = `${uploadSession}:${rawFile.__order.block}:${rawFile.__order.seq}`;
        // Re-encoding dropped the EXIF block; pass the capture time on so the server can still store it.
        if (file !== rawFile) {
          const taken = await readExifDate(rawFile);
          if (taken) {
            headers["X-Taken-At"] = taken.date;
            if (taken.offset) headers["X-Taken-Offset"] = taken.offset;
          }
        }
        let lastSlotPct = -1;
        let lastLoaded = 0;
        const onProgress = (loaded: number) => {
          if (loaded > 0) st.setPhase("uploading", uploadingLabel(rawFile));
          tuner.sent(loaded - lastLoaded);
          lastLoaded = loaded;
          const frac = fileBytes ? Math.min(1, loaded / fileBytes) : 0;
          inFlight.set(slotKey, frac);
          meter.setLoaded(slotKey, loaded);
          const filePct = Math.round(frac * 100);
          if (filePct !== lastSlotPct) {
            lastSlotPct = filePct;
            patchSlotRef.current(slotKey, { status: "uploading", pct: filePct });
          }
        };
        // A phone that changes cell or loses its connection for a moment kills the request it is in
        // the middle of, and the reply to a request the server had already finished goes missing
        // with it. That is not a file the visitor has to deal with by hand, so it is simply sent
        // again; X-Upload-Order means the server hands back the copy it already has rather than
        // storing the photo twice (which is what "ลองอีกครั้ง" used to do).
        let data;
        for (let attempt = 1; ; attempt++) {
          try {
            data = await uploadFileWithProgress(`/api/photos/upload/${encodeURIComponent(targetAlbumId)}`, formData, headers, onProgress);
            break;
          } catch (err) {
            const msg = (err as Error).message;
            if (msg !== "network" || attempt >= UPLOAD_ATTEMPTS || !uploading.current) throw err;
            console.warn("[upload] retrying", rawFile.name, "after a network error");
            inFlight.set(slotKey, 0);
            meter.setLoaded(slotKey, 0);
            lastLoaded = 0;
            await new Promise((r) => setTimeout(r, UPLOAD_RETRY_DELAY_MS));
            if (!uploading.current) throw new Error("aborted");
          }
        }
        // A 200 that says it did not work is a failed file: without this its tile sat on "uploading".
        if (!data.success) throw new Error(data.message || "upload rejected");
        // The file is stored; the server still has to make the thumbnails, so the tile keeps its
        // place and says so until the real photo arrives in the grid.
        const newId = data.images && data.images[0] ? data.images[0].id : undefined;
        if (newId) {
          batchIds.current.push(newId);
          if (rawFile.__order) envRef.current.recordOrder(newId, rawFile.__order);
        }
        patchSlotRef.current(slotKey, { status: "processing", pct: 100, id: newId });
        inFlight.delete(slotKey);
        meter.finish(slotKey);
        completed++;
        if (isVideoFile(rawFile)) completedVideos++;
        else completedImages++;
        setPanel((p) => ({ ...p, count: countLabel() }));
      } catch (err) {
        inFlight.delete(slotKey);
        if ((err as Error).message === "aborted" || !uploading.current) return; // includes the server's "cancelled" (409) after a cancel
        patchSlotRef.current(slotKey, { status: "failed", error: (err as Error).message === "network" ? "เชื่อมต่อไม่ได้" : (err as Error).message });
        envRef.current.toast('อัปโหลด "' + (rawFile.name || "") + '" ไม่สำเร็จ', "error");
        // A failed file is finished work too: it must not hold the bar back behind the files after
        // it, and its bytes must leave the total or the readout can never reach it.
        completed++;
        meter.drop(slotKey);
        setPanel((p) => ({ ...p, count: countLabel() }));
      }
    };

    // The pool: up to tuner.limit files at once, started in picked order. One at a time left the
    // connection idle for the second or so the server spends storing each file in R2 before it answers;
    // with several in flight, that wait overlaps the next file's transfer. Where each file ends up in the
    // grid does not depend on which finishes first (tiles and photos are placed by UploadOrder).
    //
    // The run ends when nothing is in flight and nothing is left. Files dropped meanwhile are pushed onto
    // the work list and start straight away (append calls fill). A drop can't slip in between the last
    // file settling and the run being marked finished: that step runs as promise callbacks, which finish
    // before any new input event is handled.
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    const fill = () => {
      while (
        uploading.current &&
        active < tuner.limit &&
        next < work.length &&
        (!active || activeBytes + (work[next].size || 0) <= UPLOAD_INFLIGHT_BYTES)
      ) {
        const i = next++;
        const size = work[i].size || 0;
        active++;
        activeBytes += size;
        uploadOne(i).finally(() => {
          active--;
          activeBytes -= size;
          fill();
          if (!active) finish();
        });
      }
      pumpPrepare();
      if (!active) finish();
    };
    run.current = {
      append(added) {
        work.push(...added);
        added.forEach((f) => typeof f.__order?.block === "number" && runBlocks.current.add(f.__order.block));
        meter.addFiles(meterFiles(added));
        // The same finished work is now a smaller share of a bigger total.
        const v = meter.view();
        if (v.total > 0) st.rebase(Math.min(99.5, (v.sent / v.total) * 100));
        setPanel((p) => ({ ...p, count: countLabel() }));
        fill();
      },
    };
    // The count is the bottleneck only while every slot is taken by a file with bytes to send (or
    // already sent and waiting on the server) and more files are queued behind them.
    const tunerTimer = setInterval(() => {
      tuner.tick(next < work.length && active >= tuner.limit && inFlight.size >= tuner.limit);
      fill();
    }, TUNER_TICK_MS);
    st.reset();
    fill();
    await finished;
    clearInterval(tunerTimer);
    run.current = null;
    uploading.current = false;
    setIsUploading(false);
    st.reset();
    if (meterRef.current === meter) stopMeter();
    setPanel({ open: false, count: "", notice: "" });
    envRef.current.onFinished(work.some((f) => f.__targetAlbumId && f.__targetAlbumId !== envRef.current.albumId()));
    if (completedImages || completedVideos) {
      haptic(HAPTIC.success);
      setDoneMsg(
        completedImages && completedVideos
          ? `อัปโหลดสำเร็จ ${completedImages} รูป และ ${completedVideos} วิดีโอ`
          : completedImages
            ? `อัปโหลดสำเร็จ ${completedImages} รูป`
            : `อัปโหลดสำเร็จ ${completedVideos} วิดีโอ`,
      );
    }
  }, [stopMeter, uploadSession]);
  // handleFiles is created before startUploadFlow, so it reaches it through a ref.
  const startUploadFlowRef = useRef(startUploadFlow);

  // ----- Folder upload: recreate the selected/dropped folder tree as sub-albums -----
  const uploadWithFolders = useCallback(
    async (list: { file: File; dir: string }[]) => {
      const e = envRef.current;
      const normDir = (dir: string) =>
        String(dir || "")
          .split("/")
          .map((x) => x.trim().slice(0, 200))
          .filter(Boolean)
          .join("/");
      const media = list.filter((x) => isMediaFile(x.file)).map((x) => ({ file: x.file as UploadFile, dir: normDir(x.dir) }));
      if (!media.length) {
        e.toast("ไม่พบรูปหรือวิดีโอในโฟลเดอร์นี้", "error");
        return;
      }
      const dirs = [...new Set(media.map((x) => x.dir).filter(Boolean))];
      let map: Record<string, string> = {};
      if (dirs.length) {
        e.toast(
          <>
            <i className="fas fa-circle-notch fa-spin" /> กำลังสร้างโฟลเดอร์...
          </>,
          "success",
          true,
        );
        try {
          const r = await fetch("/api/photos/album-tree", {
            method: "POST",
            headers: { ...e.authHeaders(), "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ parentId: e.albumId(), paths: dirs }),
          });
          const d = await r.json();
          if (!d.success) {
            e.toast(d.message || "สร้างโฟลเดอร์ไม่สำเร็จ", "error");
            return;
          }
          map = d.map || {};
        } catch {
          e.toast("สร้างโฟลเดอร์ไม่สำเร็จ", "error");
          return;
        }
        e.hideToast();
        e.refreshNav();
      }
      const files = media.map((x) => {
        x.file.__targetAlbumId = x.dir ? map[x.dir] || e.albumId() : e.albumId();
        return x.file;
      });
      handleFiles(files, { folders: Object.keys(map).length });
    },
    [handleFiles],
  );

  const handleFolderInput = useCallback(
    (input: HTMLInputElement) => {
      const list = Array.from(input.files || []).map((f) => ({ file: f, dir: (f.webkitRelativePath || "").split("/").slice(0, -1).join("/") }));
      input.value = "";
      uploadWithFolders(list);
    },
    [uploadWithFolders],
  );

  const handleDroppedItems = useCallback(
    (dt: DataTransfer) => {
      // Entries and files must be taken synchronously inside the drop event.
      const entries = dt.items ? (Array.from(dt.items).map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean) as FileSystemEntry[]) : [];
      if (!entries.some((en) => en.isDirectory)) {
        handleFiles(dt.files);
        return;
      }
      (async () => {
        const e = envRef.current;
        e.toast(
          <>
            <i className="fas fa-circle-notch fa-spin" /> กำลังอ่านโฟลเดอร์...
          </>,
          "success",
          true,
        );
        const collected: { file: File; dir: string }[] = [];
        const walk = async (entry: FileSystemEntry): Promise<void> => {
          if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
            collected.push({ file, dir: entry.fullPath.replace(/^\/+/, "").split("/").slice(0, -1).join("/") });
          } else if (entry.isDirectory) {
            const reader = (entry as FileSystemDirectoryEntry).createReader();
            const children: FileSystemEntry[] = [];
            for (;;) {
              // readEntries returns results in chunks until an empty one
              const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
              if (!batch.length) break;
              children.push(...batch);
            }
            // readEntries has no defined order (it differs between browsers and runs), which made a
            // dropped folder's tiles come up in a different order each time. Sort the way a file
            // manager lists them: by name, numbers compared as numbers (IMG_2 before IMG_10).
            children.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true, sensitivity: "base" }));
            for (const child of children) await walk(child);
          }
        };
        try {
          for (const en of entries) await walk(en);
        } catch {
          e.toast("อ่านโฟลเดอร์ไม่สำเร็จ", "error");
          return;
        }
        e.hideToast();
        uploadWithFolders(collected);
      })();
    },
    [handleFiles, uploadWithFolders],
  );

  // remove: also take this run's photos back out of the album. /api/photos/images/delete-bulk is the
  // same soft delete a single photo's delete button uses — the rows get the [DELETED] marker and a
  // deleted_at, which is exactly what the trash view lists as individually deleted files, so the
  // photos are recoverable from ถังขยะ for the usual 30 days rather than purged. Without this,
  // stopping a run of 31 files after the third one failed left the ones that had already landed.
  // Cancel. The server is told first, then the requests are aborted: a request can already be past the
  // point where aborting it helps (the server has the whole file and is storing it), and those used to
  // finish anyway. Told first, the server drops whatever of these batches is still arriving or being
  // stored, and with remove it trashes every photo it stored for them, not only the ones whose reply
  // reached this page (the "one photo came back after cancel and move to trash" bug).
  const cancelUpload = useCallback(async (remove?: boolean) => {
    const e = envRef.current;
    const blocks = [...runBlocks.current];
    const knownIds = batchIds.current.slice();
    uploading.current = false;
    run.current = null;
    const told = fetch("/api/photos/upload-cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...e.authHeaders() },
      body: JSON.stringify({ session: uploadSession, blocks, remove: !!remove, ids: remove ? knownIds : [] }),
    })
      .then((r) => r.json())
      .catch(() => null);
    try {
      activeXhrs.current.forEach((x) => x.abort());
    } catch {}
    activeXhrs.current.clear();
    setCancelOpen(false);
    stopMeter();
    setPanel((p) => ({ ...p, open: false }));
    // Whatever is dropped next starts a new batch: the cancelled one accepts nothing more.
    counters.current.open = null;
    runBlocks.current = new Set();
    if (!remove) {
      setQueue((q) => q.filter((slot) => slot.status === "processing"));
      await told;
      return;
    }
    batchIds.current = [];
    setQueue([]);
    const d = await told;
    if (d && d.success) {
      if (d.trashed) e.toast(`ย้ายรูปที่อัปโหลดในรอบนี้ไปถังขยะแล้ว ${d.trashed} รูป`, "success");
    } else {
      // The server could not be told (offline?): at least trash the ones this page knows of.
      try {
        if (knownIds.length) {
          const r = await fetch("/api/photos/images/delete-bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...e.authHeaders() },
            body: JSON.stringify({ ids: knownIds }),
          });
          const dd = await r.json();
          if (!dd.success) throw new Error("failed");
          e.toast(`ย้ายรูปที่อัปโหลดในรอบนี้ไปถังขยะแล้ว ${knownIds.length} รูป`, "success");
        }
      } catch {
        e.toast("ย้ายรูปที่อัปโหลดในรอบนี้ไปถังขยะไม่สำเร็จ", "error");
      }
    }
    e.onFinished(false);
  }, [stopMeter, uploadSession]);

  const preparing = status.phase === "preparing";
  // One fixed row: size, speed, time left — always all three, always in the same places, only the
  // numbers changing. While the total is still being worked out a spinner stands in its place
  // ("5.8/[spin] MB"), so a figure that is about to change is never on screen; once it settles the
  // number appears there and from then on it is only ever corrected, never re-guessed.
  const bytes = meterView ? fmtBytePair(meterView.sent, meterView.total) : null;
  const metrics = bytes ? (
    <>
      <span className="up-metric up-metric-size">
        <span className="up-num">{bytes.done}</span>
        <span className="up-sep">/</span>
        {meterView!.provisional ? (
          <i className="fas fa-circle-notch fa-spin up-est" aria-label="กำลังคำนวณขนาดรวม" />
        ) : (
          <span className="up-num">{bytes.total}</span>
        )}
        <span className="up-unit">{bytes.unit}</span>
      </span>
      <span className="up-metric">
        <i className="fas fa-bolt" style={{ opacity: 0.7 }} /> <span className="up-num">{fmtSpeed(meterView!.bps)}</span>
      </span>
      <span className="up-metric">
        <i className="far fa-clock" /> <span className="up-num">{fmtEta(meterView!.etaSec)}</span>
      </span>
    </>
  ) : null;
  const panelView = (
    <div className="upload-summary" id="upSummary" style={{ margin: "16px auto", maxWidth: 1200, padding: "16px 20px", display: panel.open ? "block" : undefined }}>
      <div className="up-head">
        <span className="up-title" id="upTitle">
          {status.title}
        </span>
        <div className="up-side">
          <div className="up-metrics" id="upMetrics">
            {metrics}
          </div>
          <span className="up-count" id="upCount">
            {panel.count}
          </span>
          <button className="upload-cancel-btn" id="upCancelBtn" onClick={() => setCancelOpen(true)} style={{ display: isUploading ? "inline-block" : "none" }}>
            ยกเลิก
          </button>
        </div>
      </div>
      <div
        className={"bar-bg" + (preparing ? " up-preparing" : "") + (preparing && status.pct <= 0 ? " up-indeterminate" : "") + (preparing && status.pct > 0 ? " up-paused" : "")}
        style={{ marginTop: 10 }}
      >
        <div className="bar-fill" id="upBar" style={{ width: status.pct.toFixed(1) + "%" }} />
      </div>
      <div
        id="upNotice"
        style={{ display: panel.notice ? "block" : "none", padding: "8px 12px", marginTop: 8, borderRadius: 8, background: "#fff1f2", color: "#be123c", fontSize: ".78rem", lineHeight: 1.4, border: "1px solid #fecaca" }}
      >
        <i className="fas fa-exclamation-circle" style={{ marginRight: 6 }} />
        <span id="upNoticeText">{panel.notice}</span>
      </div>
      <div className="upload-items" id="upItems" style={{ marginTop: 12 }} />
    </div>
  );

  const radio = (name: string, value: string, cur: string, set: (v: string) => void, label: string, last?: boolean, style?: React.CSSProperties) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: last ? undefined : 6, cursor: "pointer", ...style }}>
      <input type="radio" name={name} value={value} checked={cur === value} onChange={() => set(value)} /> {label}
    </label>
  );

  const modals = (
    <>
      <div className={"quality-modal" + (optionsFor ? " show" : "")} id="uploadQualityModal">
        <div className="quality-card">
          <h3>
            <i className="fas fa-cloud-upload-alt" style={{ color: "var(--accent)", marginRight: 6 }} /> อัปโหลดไฟล์
          </h3>
          <p style={{ marginBottom: 14, color: "var(--text-light)", fontSize: "0.9rem" }} id="uqSummary">
            {optionsFor?.summary}
          </p>
          <div id="uqQualityBlock" style={{ marginBottom: 16, display: optionsFor?.hasImages ? "block" : "none" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 8, color: "var(--text-dark)" }}>คุณภาพรูปภาพ:</div>
            {radio("uqQuality", "original", quality, setQuality, "ต้นฉบับ (ไฟล์ใหญ่สุด)")}
            {radio("uqQuality", "fhd", quality, setQuality, "FHD (1080p — เร็วขึ้น)")}
            {radio("uqQuality", "hd", quality, setQuality, "HD (720p — เร็วที่สุด)", true)}
          </div>
          <div id="uqFormatBlock" style={{ marginBottom: 6, display: optionsFor?.hasImages ? "block" : "none" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 8, color: "var(--text-dark)" }}>นามสกุลไฟล์รูปภาพ:</div>
            {radio("uqFormat", "keep", format, setFormat, "เหมือนเดิม")}
            {radio("uqFormat", "jpg", format, setFormat, "JPG")}
            {radio("uqFormat", "png", format, setFormat, "PNG")}
            {radio("uqFormat", "webp", format, setFormat, "WEBP", true, { display: optionsFor?.webp ? "flex" : "none" })}
          </div>
          <div style={{ padding: "16px 0 0", display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              onClick={() => {
                dropSlots((optionsFor?.files || []).map((f) => f.__slotKey || ""));
                setOptionsFor(null);
              }}
              style={{ padding: "9px 18px", border: "1px solid #ddd", borderRadius: 8, background: "white", fontFamily: "'Prompt',sans-serif", cursor: "pointer" }}
            >
              ยกเลิก
            </button>
            <button
              onClick={() => {
                const files = optionsFor?.files || [];
                setOptionsFor(null);
                lastChoice.current = { quality, format };
                startUploadFlow(files, quality, format);
              }}
              style={{ padding: "9px 20px", border: "none", borderRadius: 8, background: "var(--accent)", color: "white", fontFamily: "'Prompt',sans-serif", fontWeight: 600, cursor: "pointer" }}
            >
              ตกลง
            </button>
          </div>
        </div>
      </div>

      <div className="modal-overlay" id="cancelModal" style={{ display: cancelOpen ? "flex" : "none" }}>
        <div className="modal-card">
          <h3>
            <i className="fas fa-hand-paper" style={{ color: "#f59e0b" }} /> ยกเลิกการอัปโหลด?
          </h3>
          <p>คุณต้องการจัดการรูปที่กำลังอัปโหลดอย่างไร?</p>
          <div className="modal-btns">
            <button className="modal-btn" onClick={() => cancelUpload(false)}>
              <i className="fas fa-stop-circle" style={{ color: "var(--text-light)" }} />
              <div>
                <div>ยกเลิกเฉพาะที่เหลือ</div>
                <div style={{ fontSize: ".75rem", fontWeight: 400 }}>รูปที่อัปโหลดสำเร็จแล้วจะยังคงอยู่</div>
              </div>
            </button>
            <button className="modal-btn danger" onClick={() => cancelUpload(true)}>
              <i className="fas fa-trash-alt" />
              <div>
                <div>ยกเลิกและย้ายไปถังขยะ</div>
                <div style={{ fontSize: ".75rem", fontWeight: 400 }}>รูปที่อัปโหลดสำเร็จแล้วในรอบนี้จะถูกย้ายไปถังขยะ กู้คืนได้ภายหลัง</div>
              </div>
            </button>
            <button className="modal-btn" onClick={() => setCancelOpen(false)} style={{ justifyContent: "center", marginTop: 8 }}>
              กลับไปต่อ
            </button>
          </div>
        </div>
      </div>

      <div className={"quality-modal" + (doneMsg ? " show" : "")} id="uploadDoneOverlay">
        <div className="quality-card" style={{ textAlign: "center" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "rgba(16,185,129,.12)",
              color: "#10b981",
              fontSize: "1.7rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <i className="fas fa-check" />
          </div>
          <h3 id="uploadDoneMsg" style={{ justifyContent: "center", marginBottom: 6, fontSize: "1.05rem", whiteSpace: "pre-line" }}>
            {doneMsg}
          </h3>
          <p style={{ color: "#6b7280", fontSize: "0.85rem", margin: "0 0 18px" }}>คุณสามารถปิดแท็บนี้ไปได้เลย</p>
          <button
            onClick={() => setDoneMsg(null)}
            style={{ width: "100%", padding: 12, border: "none", borderRadius: 10, background: "var(--accent)", color: "white", fontFamily: "'Prompt',sans-serif", fontSize: "0.95rem", fontWeight: 600, cursor: "pointer" }}
          >
            ตกลง
          </button>
        </div>
      </div>
    </>
  );

  // "ลองอีกครั้ง" on a failed tile. Two different failures:
  //   - the upload itself failed (no photo id): the kept File goes back into the upload, into the run
  //     in progress or a new one, with its original UploadOrder, so X-Upload-Order dates it into the
  //     same place among the files picked with it;
  //   - the file was stored but processing failed (the tile has an id): the server processes it again
  //     (POST /api/photos/images/:id/retry); nothing is sent again, and the tile goes back to
  //     "processing" so the status poll follows it.
  const retrySlot = useCallback(async (key: string) => {
    const slot = queueRef.current.find((x) => x.key === key);
    if (!slot || slot.status !== "failed") return;
    const e = envRef.current;
    if (slot.id) {
      patchSlotRef.current(key, { status: "processing", error: undefined });
      try {
        const r = await fetch(`/api/photos/images/${encodeURIComponent(slot.id)}/retry`, { method: "POST", headers: e.authHeaders() });
        const d = await r.json();
        if (!d.success) throw new Error(d.message || "retry failed");
      } catch {
        patchSlotRef.current(key, { status: "failed", error: "ลองใหม่ไม่สำเร็จ" });
        e.toast("ลองใหม่ไม่สำเร็จ", "error");
      }
      return;
    }
    const file = filesByKey.current.get(key);
    if (!file) {
      e.toast("ไม่พบไฟล์เดิมแล้ว กรุณาเลือกไฟล์ใหม่", "error");
      return;
    }
    patchSlotRef.current(key, { status: "pending", pct: 0, error: undefined });
    startUploadFlowRef.current([file], file.__quality || lastChoice.current.quality, file.__format || lastChoice.current.format);
  }, []);
  // × on a failed tile: the tile goes and the rest of the block closes up.
  const dismissSlot = useCallback((key: string) => dropSlots([key]), [dropSlots]);

  // ESC: closes the topmost of this hook's dialogs, the same way its own cancel/close button would.
  // True when it closed something.
  const escape = useCallback(() => {
    if (doneMsg) {
      setDoneMsg(null);
      return true;
    }
    if (cancelOpen) {
      setCancelOpen(false); // "กลับไปต่อ": the upload keeps going
      return true;
    }
    if (optionsFor) {
      dropSlots(optionsFor.files.map((f) => f.__slotKey || ""));
      setOptionsFor(null);
      return true;
    }
    return false;
  }, [doneMsg, cancelOpen, optionsFor, dropSlots]);

  return { handleFiles, handleFolderInput, handleDroppedItems, isActive: () => uploading.current, isUploading, cancelUpload, queue, clearQueue, retrySlot, dismissSlot, panelView, modals, escape };
}
