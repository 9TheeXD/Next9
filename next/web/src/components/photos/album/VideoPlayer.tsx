"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { fmtVideoTime, hotkey } from "@/lib/photos/util";
import { bitrate, neededShortSide, neighbour, pickAuto, pickFixed, readBandwidth, readPref, rungTitle, saveBandwidth, writePref, type QualityList, type QualityPref, type Rung } from "./videoQuality";
import { MorphMenu, MorphMenuItem, MorphMenuLabel } from "../ui/MorphMenu";

// The album viewer's custom video player (legacy setupCustomVideoPlayer): big play button, progress
// bar with buffered range and instant scrubbing, mute + volume, fullscreen, double-tap ±10 s with a
// ripple, keyboard (space/K, J/L, arrows, F, M, Shift+N/P), idle auto-hide, and a loading overlay
// with buffered % and measured download speed.

export type VideoPlayerHandle = {
  video: () => HTMLVideoElement | null;
  wrap: () => HTMLDivElement | null;
  fadeOut: (duration?: number) => Promise<void>;
  keydown: (e: KeyboardEvent) => void;
};

type Props = {
  active: boolean;
  src: string;
  poster: string;
  // Changes each time a video is opened, so the same file opened twice still restarts.
  openKey: number;
  onNav: (d: number) => void;
  /** The viewer's actions menu (shared rows), opened from the player's own ⋮. */
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  menuRows: React.ReactNode;
  onUiHidden: (hidden: boolean) => void;
  // True only while this clip is actually running. The viewer only clears itself out of the way
  // while something is playing; a paused clip, a finished one and a photo all keep their controls.
  onPlayState?: (playing: boolean) => void;
  // Quality ladder (see videoQuality.ts): where to read the list, and the URL of each quality.
  quality?: { listUrl: string; urlFor: (variant: string) => string };
};

// The user's volume/mute survive the fade-to-0 used between videos.
let desiredVolume = 1;
let desiredMuted = false;

// Ramp volume down to 0 so a pause/src swap never clicks. Does not restore the volume: the element
// is about to be paused or reused, and opening a video resets it from the user's preference.
function fadeOutVideoAudio(v: HTMLVideoElement | null, duration = 180) {
  return new Promise<void>((resolve) => {
    if (!v || v.paused || v.muted || v.volume === 0) {
      resolve();
      return;
    }
    const startVol = v.volume;
    const startTime = performance.now();
    function step(now: number) {
      const t = Math.min(1, Math.max(0, (now - startTime) / duration));
      v!.volume = startVol * (1 - t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer({ active, src, poster, openKey, onNav, menuOpen, onMenuOpenChange, menuRows, onUiHidden, onPlayState, quality }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerType = useRef("mouse");

  const [paused, setPaused] = useState(true);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [bigPlayHidden, setBigPlayHidden] = useState(false);
  const [played, setPlayed] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [time, setTime] = useState("0:00 / 0:00");
  const [muted, setMuted] = useState(desiredMuted || desiredVolume === 0);
  const [volume, setVolume] = useState(desiredVolume);
  const [loading, setLoading] = useState(false);
  // Only real status ("the network is slow"), never a "loading" caption: the spinner already says
  // that, and a word that repeats what the animation is doing is noise.
  const [loadingText, setLoadingText] = useState("");
  // How much of the video is buffered, shown inside the spinner — and only once the wait has gone on
  // long enough to be worth explaining. A number that flashes up for half a second says nothing.
  const [loadingPct, setLoadingPct] = useState<number | null>(null);
  // The last frame of the quality that was playing, held on screen while the next one loads.
  const [frozen, setFrozen] = useState(false);
  const freezeRef = useRef<HTMLCanvasElement>(null);
  // A quality change owns the overlay until its first frame is on screen; canplay/playing must not
  // take the spinner away before there is a picture behind it.
  const switching = useRef(false);
  const [seek, setSeek] = useState<{ right: boolean; amount: number; left: number; n: number } | null>(null);

  const loadStart = useRef(0);
  const loadingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const perfObs = useRef<PerformanceObserver | null>(null);
  const speedSamples = useRef<number[]>([]);
  const seekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- Quality ladder -----
  const [qList, setQList] = useState<QualityList | null>(null);
  const [qCur, setQCur] = useState<Rung | null>(null);
  const [qPref, setQPref] = useState<QualityPref>("auto");
  const [qMenu, setQMenu] = useState(false);
  const qListRef = useRef<QualityList | null>(null);
  const qCurRef = useRef<Rung | null>(null);
  const qPrefRef = useRef<QualityPref>("auto");
  const qualityRef = useRef(quality);
  useEffect(() => {
    qualityRef.current = quality;
  });
  const bwRef = useRef(4e6);
  const lastSwitchAt = useRef(0);
  const bufSample = useRef<{ t: number; end: number } | null>(null);
  const openToken = useRef(0);

  const fetchQualities = useCallback(async (timeoutMs = 4000): Promise<QualityList | null> => {
    const q = qualityRef.current;
    if (!q) return null;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(q.listUrl, { signal: ctl.signal, cache: "no-store" });
      if (!r.ok) return null;
      const d = await r.json();
      return d && d.original ? (d as QualityList) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }, []);

  const urlForRung = useCallback((r: Rung) => (r.variant === "original" || !qualityRef.current ? src : qualityRef.current.urlFor(r.variant)), [src]);

  // Changes quality mid-video: same moment, same playing/paused state.
  const PCT_AFTER_S = 3;
  const SLOW_AFTER_S = 4;
  const updateLoadingState = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const elapsed = (Date.now() - loadStart.current) / 1000;
    let pct: number | null = null;
    if (elapsed > PCT_AFTER_S && v.duration && v.buffered.length) {
      try {
        pct = Math.min(100, Math.round((v.buffered.end(v.buffered.length - 1) / v.duration) * 100));
      } catch {}
    }
    setLoadingPct(pct);
    setLoadingText(elapsed > SLOW_AFTER_S ? "เครือข่ายช้า กำลังพยายามโหลดต่อ…" : "");
  }, []);
  const showLoading = useCallback(() => {
    loadStart.current = Date.now();
    setLoading(true);
    setLoadingPct(null);
    setLoadingText("");
    if (loadingTimer.current) clearInterval(loadingTimer.current);
    loadingTimer.current = setInterval(updateLoadingState, 500);
  }, [updateLoadingState]);
  const hideLoading = useCallback(() => {
    // A quality change keeps the overlay until its own first frame arrives (see switchTo).
    if (switching.current) return;
    setLoading(false);
    setLoadingPct(null);
    setLoadingText("");
    if (loadingTimer.current) clearInterval(loadingTimer.current);
  }, []);

  // Copies what is on screen right now into the canvas that sits over the video, letterboxed the
  // same way the video itself is. Changing quality replaces the source, and a video element with a
  // fresh source has no picture: it fell back to the poster, so every quality change flashed the
  // whole photo away and back. The frame stays put instead, and the spinner sits on top of it.
  const freezeFrame = useCallback(() => {
    const v = videoRef.current,
      c = freezeRef.current,
      wrap = wrapRef.current;
    if (!v || !c || !wrap || !v.videoWidth || !v.videoHeight || v.readyState < 2) return false;
    // Never more pixels than the frame actually has: a 720p video held over a big screen gains
    // nothing from a 4K canvas, and on a phone that canvas is tens of megabytes.
    const fit = Math.min(wrap.clientWidth / v.videoWidth, wrap.clientHeight / v.videoHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.max(1, 1 / (fit || 1)));
    const w = Math.max(1, Math.round(wrap.clientWidth * dpr)),
      h = Math.max(1, Math.round(wrap.clientHeight * dpr));
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    try {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      const scale = Math.min(w / v.videoWidth, h / v.videoHeight);
      const dw = v.videoWidth * scale,
        dh = v.videoHeight * scale;
      ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } catch {
      return false;
    }
    setFrozen(true);
    return true;
  }, []);

  const switchTo = useCallback(
    (r: Rung) => {
      const v = videoRef.current;
      if (!v || qCurRef.current?.variant === r.variant) return;
      const at = v.currentTime;
      const wasPlaying = !v.paused;
      qCurRef.current = r;
      setQCur(r);
      lastSwitchAt.current = Date.now();
      bufSample.current = null;
      freezeFrame();
      switching.current = true;
      showLoading();
      v.src = urlForRung(r);
      v.load();
      v.addEventListener(
        "loadedmetadata",
        () => {
          try {
            v.currentTime = at;
          } catch {}
          if (wasPlaying) v.play().catch(() => {});
        },
        { once: true },
      );
      // The held frame goes only when the new source has actually painted one of its own —
      // requestVideoFrameCallback fires exactly then. Everything after it is a safety net so a
      // source that never arrives cannot leave the picture frozen for good.
      let done = false;
      const reveal = () => {
        if (done) return;
        done = true;
        switching.current = false;
        setFrozen(false);
        hideLoading();
        // Give back the frame's memory once it is off screen — on a phone it is tens of megabytes.
        setTimeout(() => {
          const c = freezeRef.current;
          if (c) c.width = c.height = 0;
        }, 400);
      };
      type RVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
      const rvfc = (v as RVFC).requestVideoFrameCallback;
      if (typeof rvfc === "function") rvfc.call(v, reveal);
      else v.addEventListener("canplay", () => requestAnimationFrame(reveal), { once: true });
      v.addEventListener("error", reveal, { once: true });
      setTimeout(reveal, 10000);
    },
    [urlForRung, freezeFrame, showLoading, hideLoading],
  );

  const choosePref = useCallback(
    (pref: QualityPref) => {
      qPrefRef.current = pref;
      setQPref(pref);
      writePref(pref);
      setQMenu(false);
      const list = qListRef.current;
      if (!list) return;
      switchTo(pref === "auto" ? pickAuto(list, bwRef.current) : pickFixed(list, pref));
    },
    [switchTo],
  );

  useEffect(() => {
    qMenuOpen.current = qMenu;
  }, [qMenu]);
  useEffect(() => {
    actionsMenuOpen.current = menuOpen;
  }, [menuOpen]);

  // Auto: measure bandwidth from buffer growth, step up when there is clearly room, down on a stall.
  useEffect(() => {
    if (!active || !src) return;
    const v = videoRef.current;
    if (!v) return;
    const tick = () => {
      const list = qListRef.current,
        cur = qCurRef.current;
      if (!list || !cur || !v.duration) return;
      let end = 0;
      try {
        for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + 0.5) end = Math.max(end, v.buffered.end(i));
      } catch {}
      const ahead = end - v.currentTime;
      const now = performance.now();
      const prev = bufSample.current;
      // The browser only keeps downloading while its buffer is short: sample then, and only real growth.
      if (prev && end > prev.end + 0.5 && ahead < 25) {
        const bps = ((end - prev.end) * bitrate(cur, list.duration)) / ((now - prev.t) / 1000);
        if (bps > 0 && Number.isFinite(bps)) {
          bwRef.current = bwRef.current * 0.7 + bps * 0.3;
          saveBandwidth(bwRef.current);
        }
      }
      bufSample.current = { t: now, end };
      if (qPrefRef.current !== "auto" || Date.now() - lastSwitchAt.current < 15000) return;
      const up = neighbour(list, cur, 1);
      if (up && ahead > 20 && (!up.height || up.height <= neededShortSide() * 1.15) && bitrate(up, list.duration) * 1.6 <= bwRef.current) switchTo(up);
    };
    const onWaiting = () => {
      const list = qListRef.current,
        cur = qCurRef.current;
      if (!list || !cur || qPrefRef.current !== "auto" || v.seeking || v.currentTime < 0.5) return;
      if (Date.now() - lastSwitchAt.current < 4000) return;
      const down = neighbour(list, cur, -1);
      if (down) {
        // A stall says the link is slower than thought: remember that for the next choice too.
        bwRef.current = Math.min(bwRef.current, bitrate(cur, list.duration));
        saveBandwidth(bwRef.current);
        switchTo(down);
      }
    };
    const id = setInterval(tick, 3000);
    v.addEventListener("waiting", onWaiting);
    return () => {
      clearInterval(id);
      v.removeEventListener("waiting", onWaiting);
    };
  }, [active, src, openKey, switchTo]);

  const setUiHidden = useCallback((h: boolean) => onUiHidden(h), [onUiHidden]);
  useEffect(() => {
    onPlayState?.(active && !paused);
  }, [active, paused, onPlayState]);

  // ----- Real download speed from the video's own requests (Resource Timing) -----
  const stopSpeedTracking = useCallback(() => {
    if (perfObs.current) {
      try {
        perfObs.current.disconnect();
      } catch {}
      perfObs.current = null;
    }
  }, []);
  const startSpeedTracking = useCallback(
    (url: string) => {
      stopSpeedTracking();
      speedSamples.current = [];
      if (!("PerformanceObserver" in window)) return;
      try {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
            if (!entry.name.includes(url)) continue;
            if (entry.transferSize > 0 && entry.duration > 0) {
              speedSamples.current.push((entry.transferSize * 8) / 1024 / 1024 / (entry.duration / 1000));
              if (speedSamples.current.length > 5) speedSamples.current.shift();
            }
          }
        });
        obs.observe({ type: "resource" });
        perfObs.current = obs;
      } catch {}
    },
    [stopSpeedTracking],
  );

  // Idle auto-hide (2 s while playing). On touch it also hides the lightbox chrome for a fully
  // immersive view; on desktop only the video's own bar hides.
  const qMenuOpen = useRef(false);
  const actionsMenuOpen = useRef(false);
  const hideAllVideoUI = useCallback(() => {
    // Both menus live in the controls: keep them up while either is open. Only the quality menu used
    // to count, so on a phone the ⋮ menu was hidden (opacity 0, pointer-events: none) two seconds
    // after it opened on a playing video — its rows vanished and stopped answering taps.
    if (qMenuOpen.current || actionsMenuOpen.current) return;
    setControlsHidden(true);
    setBigPlayHidden(true);
    if (lastPointerType.current === "touch") setUiHidden(true);
  }, [setUiHidden]);
  const showVideoUI = useCallback(() => {
    const v = videoRef.current;
    setControlsHidden(false);
    if (v?.paused) setBigPlayHidden(false);
    setUiHidden(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (v && !v.paused) hideTimer.current = setTimeout(hideAllVideoUI, 2000);
  }, [hideAllVideoUI, setUiHidden]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const showSeekIndicator = useCallback((right: boolean, amount: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    setSeek((cur) => ({ right, amount, left: right ? rect.width * 0.75 : rect.width * 0.25, n: (cur?.n || 0) + 1 }));
    if (seekTimer.current) clearTimeout(seekTimer.current);
    seekTimer.current = setTimeout(() => setSeek(null), 550);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else wrapRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = desiredMuted = !v.muted;
    setMuted(v.muted || v.volume === 0);
  }, []);

  // ----- open a video: reset the UI, restore volume preference, start playing -----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!active || !src) {
      v.pause();
      v.removeAttribute("src");
      hideLoading();
      stopSpeedTracking();
      return;
    }
    // Resetting the player UI for a newly opened video.
     
    setBuffered(0);
    setPlayed(0);
    setTime("0:00 / 0:00");
    setBigPlayHidden(false);
    setControlsHidden(false);
    setUiHidden(false);
    v.volume = desiredVolume;
    v.muted = desiredMuted;
    setVolume(desiredVolume);
    setMuted(desiredMuted || desiredVolume === 0);
    v.poster = poster || "";
    setQMenu(false);
    qListRef.current = null;
    qCurRef.current = null;
    setQList(null);
    setQCur(null);
    const token = ++openToken.current;
    const start = (url: string) => {
      v.src = url;
      v.load();
      v.play().catch(() => {});
    };
    if (!qualityRef.current) {
      start(src);
      return;
    }
    // The quality list is a small same-site request; it decides which file to start with. If it is
    // slow or fails, the original plays as before.
    bwRef.current = readBandwidth();
    const pref = readPref();
    qPrefRef.current = pref;
    setQPref(pref);
    lastSwitchAt.current = Date.now();
    bufSample.current = null;
    fetchQualities(1500).then((list) => {
      if (token !== openToken.current) return; // another video was opened meanwhile
      if (!list) {
        start(src);
        return;
      }
      const first = pref === "auto" ? pickAuto(list, bwRef.current) : pickFixed(list, pref);
      qListRef.current = list;
      qCurRef.current = first;
      setQList(list);
      setQCur(first);
      start(urlForRung(first));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, src, openKey]);

  useEffect(
    () => () => {
      if (loadingTimer.current) clearInterval(loadingTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (seekTimer.current) clearTimeout(seekTimer.current);
      stopSpeedTracking();
    },
    [stopSpeedTracking],
  );

  const keydown = useCallback(
    (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v || !e || typeof e.key !== "string") return;
      const key = e.key;
      if (hotkey(e, " ", "k")) {
        e.preventDefault();
        togglePlay();
        showVideoUI();
      } else if (hotkey(e, "j")) {
        v.currentTime = Math.max(0, v.currentTime - 10);
        showSeekIndicator(false, 10);
        showVideoUI();
      } else if (hotkey(e, "l")) {
        v.currentTime = Math.min(v.duration || v.currentTime, v.currentTime + 10);
        showSeekIndicator(true, 10);
        showVideoUI();
      } else if (key === "ArrowRight") {
        if (v.ended) {
          onNav(1);
          return;
        }
        v.currentTime = Math.min(v.duration || v.currentTime, v.currentTime + 5);
        showSeekIndicator(true, 5);
        showVideoUI();
      } else if (key === "ArrowLeft") {
        if (v.currentTime <= 2) {
          onNav(-1);
          return;
        }
        v.currentTime = Math.max(0, v.currentTime - 5);
        showSeekIndicator(false, 5);
        showVideoUI();
      } else if (hotkey(e, "n") && e.shiftKey) onNav(1);
      else if (hotkey(e, "p") && e.shiftKey) onNav(-1);
      else if (hotkey(e, "f")) toggleFullscreen();
      else if (hotkey(e, "m")) {
        toggleMute();
        showVideoUI();
      }
    },
    [togglePlay, showVideoUI, showSeekIndicator, onNav, toggleFullscreen, toggleMute],
  );

  useImperativeHandle(ref, () => ({ video: () => videoRef.current, wrap: () => wrapRef.current, fadeOut: (d) => fadeOutVideoAudio(videoRef.current, d), keydown }), [keydown]);

  // Scrubbing follows the pointer directly (not the throttled timeupdate) so the drag feels instant.
  const seekTo = (clientX: number) => {
    const v = videoRef.current;
    const rect = progressRef.current!.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setPlayed(pct * 100);
    if (v?.duration) setTime(fmtVideoTime(pct * v.duration) + " / " + fmtVideoTime(v.duration));
    return pct;
  };
  const endScrub = (e: React.PointerEvent) => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    const pct = seekTo(e.clientX);
    const v = videoRef.current;
    if (v?.duration) v.currentTime = pct * v.duration;
  };

  const icon = paused ? "fa-play" : "fa-pause";

  return (
    <div
      ref={wrapRef}
      className={"lb-video-wrap" + (active ? " active" : "")}
      id="lbVideoWrap"
      onPointerDownCapture={(e) => {
        lastPointerType.current = e.pointerType || "mouse";
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== "touch") showVideoUI();
      }}
      onClick={(e) => {
        const t = e.target as Element;
        if (t.closest(".lb-video-controls") || t.closest("#lbVideoBigPlay")) return;
        if (lastPointerType.current === "touch") {
          // Touch: tapping empty video area only shows/hides the UI, it never toggles play/pause.
          if (controlsHidden) showVideoUI();
          else hideAllVideoUI();
        } else {
          togglePlay();
          showVideoUI();
        }
      }}
      onDoubleClick={(e) => {
        if ((e.target as Element).closest(".lb-video-controls")) return;
        const v = videoRef.current;
        if (!v) return;
        const rect = wrapRef.current!.getBoundingClientRect();
        const isRight = e.clientX - rect.left > rect.width / 2;
        v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + (isRight ? 10 : -10)));
        showSeekIndicator(isRight, 10);
        showVideoUI();
      }}
    >
      <video
        ref={videoRef}
        id="lbVideo"
        {...{ "webkit-playsinline": "" }}
        playsInline
        onPlay={() => {
          setPaused(false);
          setBigPlayHidden(true);
          showVideoUI();
        }}
        onPause={() => {
          setPaused(true);
          setBigPlayHidden(false);
          setControlsHidden(false);
          setUiHidden(false);
          if (hideTimer.current) clearTimeout(hideTimer.current);
        }}
        onEnded={() => {
          setPaused(true);
          setControlsHidden(false);
          setBigPlayHidden(false);
          setUiHidden(false);
          if (hideTimer.current) clearTimeout(hideTimer.current);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (!v.duration || scrubbing.current) return;
          setPlayed((v.currentTime / v.duration) * 100);
          setTime(fmtVideoTime(v.currentTime) + " / " + fmtVideoTime(v.duration));
        }}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (!v.duration || !v.buffered.length) return;
          try {
            setBuffered(Math.min(100, (v.buffered.end(v.buffered.length - 1) / v.duration) * 100));
          } catch {}
        }}
        onLoadStart={() => {
          startSpeedTracking(src);
          showLoading();
        }}
        onWaiting={showLoading}
        onCanPlay={hideLoading}
        onPlaying={() => {
          hideLoading();
          stopSpeedTracking();
        }}
        onError={hideLoading}
      />
      {/* The picture that was on screen when the quality changed, held until the new one paints. */}
      <canvas ref={freezeRef} className={"lb-video-freeze" + (frozen ? " show" : "")} aria-hidden="true" />
      <div className={"lb-video-loading" + (loading ? " show" : "")} id="lbVideoLoading">
        <div className="lb-video-spin">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle className="lb-video-spin-track" cx="24" cy="24" r="21" />
            <circle className="lb-video-spin-arc" cx="24" cy="24" r="21" />
          </svg>
          {loadingPct !== null ? <span className="lb-video-spin-pct">{loadingPct}%</span> : null}
        </div>
        {loadingText ? (
          <div className="lb-video-loading-text" id="lbVideoLoadingText">
            {loadingText}
          </div>
        ) : null}
      </div>
      <button
        className={"lb-video-bigplay lg-glass" + (bigPlayHidden ? " hide" : "")}
        id="lbVideoBigPlay"
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
          showVideoUI();
        }}
      >
        <i className={"fas " + icon} />
      </button>
      <div key={seek?.n} className={"lb-video-seek-indicator" + (seek ? " show" : "")} id="lbVideoSeekIndicator" style={seek ? { left: seek.left } : undefined}>
        <i className={"fas " + (seek?.right === false ? "fa-backward" : "fa-forward")} />
        <span id="lbVideoSeekAmount">{(seek?.amount ?? 10) + " วินาที"}</span>
      </div>
      <div className={"lb-video-controls" + (controlsHidden ? " hide" : "")} id="lbVideoControls">
        <div
          ref={progressRef}
          className="lb-video-progress"
          id="lbVideoProgress"
          onPointerDown={(e) => {
            scrubbing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekTo(e.clientX);
            showVideoUI();
          }}
          onPointerMove={(e) => {
            if (scrubbing.current) seekTo(e.clientX);
          }}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
        >
          <div className="lb-video-buffered" id="lbVideoBuffered" style={{ width: buffered + "%" }} />
          <div className="lb-video-played" id="lbVideoPlayed" style={{ width: played + "%" }} />
          <div className="lb-video-scrubber" id="lbVideoScrubber" style={{ left: played + "%" }} />
        </div>
        <div className="lb-video-controls-row">
          <button
            id="lbVideoPlayBtn"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
              showVideoUI();
            }}
          >
            <i className={"fas " + icon} />
          </button>
          <button
            id="lbVideoMuteBtn"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
              showVideoUI();
            }}
          >
            <i className={"fas " + (muted ? "fa-volume-mute" : "fa-volume-up")} />
          </button>
          <input
            type="range"
            className="lb-video-volume"
            id="lbVideoVolume"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => {
              const v = videoRef.current;
              if (!v) return;
              v.volume = desiredVolume = parseFloat(e.target.value);
              v.muted = desiredMuted = v.volume === 0;
              setVolume(v.volume);
              setMuted(v.muted);
            }}
          />
          <span className="lb-video-time" id="lbVideoTime">
            {time}
          </span>
          <span style={{ flex: 1 }} />
          {qList ? (
            // The ⚙ button becomes the quality menu — the same MorphMenu as the photo viewer's
            // quality chip and every other menu, instead of a separate dark popup of its own.
            <MorphMenu
              open={qMenu}
              onOpenChange={(opening) => {
                setQMenu(opening);
                showVideoUI();
                if (!opening) return;
                // Waiting rungs may have finished since the video opened.
                const tk = openToken.current;
                fetchQualities().then((list) => {
                  if (!list || tk !== openToken.current) return;
                  qListRef.current = list;
                  setQList(list);
                });
              }}
              side="top"
              align="end"
              width={240}
              maxHeight="min(60vh, 420px)"
              triggerId="lbVideoQualityBtn"
              triggerGlass={false}
              triggerClassName="lb-video-quality-btn"
              triggerRadius={18}
              label="คุณภาพวิดีโอ"
              trigger={
                <>
                  <i className="fas fa-cog" />
                  {qCur?.badge ? <span className="lb-video-quality-chip">{qCur.badge}</span> : null}
                </>
              }
            >
              <MorphMenuLabel>คุณภาพ</MorphMenuLabel>
              <MorphMenuItem
                role="menuitemradio"
                aria-checked={qPref === "auto"}
                active={qPref === "auto"}
                onSelect={() => choosePref("auto")}
                trailing={qPref === "auto" ? <i className="fas fa-check" /> : null}
              >
                อัตโนมัติ{qPref === "auto" && qCur ? <small className="lb-vq-note"> ({rungTitle(qCur)})</small> : null}
              </MorphMenuItem>
              {[qList.original, ...qList.renditions]
                .sort((a, b) => (b.height || 99999) - (a.height || 99999))
                .map((r) => {
                  const isOriginal = r.variant === "original";
                  const waiting = !isOriginal && r.status !== "ready";
                  const chosen = qPref !== "auto" && qCur?.variant === r.variant;
                  return (
                    <MorphMenuItem
                      key={r.variant}
                      role="menuitemradio"
                      aria-checked={chosen}
                      active={chosen}
                      disabled={waiting}
                      onSelect={() => choosePref(isOriginal ? "original" : r.height || "original")}
                      trailing={waiting ? <em className="lb-vq-wait">รอคิว</em> : chosen ? <i className="fas fa-check" /> : null}
                    >
                      {rungTitle(r)}
                      {r.badge ? <sup className="lb-video-quality-badge">{r.badge}</sup> : null}
                      {isOriginal ? <small className="lb-vq-note"> · ต้นฉบับ</small> : null}
                    </MorphMenuItem>
                  );
                })}
            </MorphMenu>
          ) : null}
          <button
            id="lbVideoFsBtn"
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
          >
            <i className="fas fa-expand" />
          </button>
          <MorphMenu
            // Only while this player is the one on screen. The photo viewer's ⋮ shares the same
            // open state; with this hidden copy "open" too, its press-outside handler saw every tap
            // on the photo menu's rows as outside, closed the menu and swallowed the tap's click —
            // so on a phone (rows act on click) no row ever did anything.
            open={active && menuOpen}
            onOpenChange={(o) => {
              onMenuOpenChange(o);
              showVideoUI();
            }}
            side="top"
            align="end"
            width={240}
            maxHeight="min(60vh, 460px)"
            listId={active ? "lbSheet" : undefined}
            triggerId="lbVideoActionsBtn"
            triggerGlass={false}
            triggerClassName="lb-video-ctrl-trigger"
            triggerRadius={18}
            tone="viewer"
            label="ตัวเลือกเพิ่มเติม"
            trigger={<i className="fas fa-ellipsis-v" />}
          >
            {menuRows}
          </MorphMenu>
        </div>
      </div>
    </div>
  );
});
