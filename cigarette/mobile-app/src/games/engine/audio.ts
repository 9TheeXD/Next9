// Small Web Audio synthesiser for game sounds. Every sound is generated, so there are no files to
// download. Chimes go through a soft echo so the games sound calm rather than arcade-like.

type Wave = OscillatorType;

export interface ToneOptions {
  freq: number;
  dur?: number;
  type?: Wave;
  vol?: number;
  attack?: number;
  release?: number;
  /** Slide to this frequency over the tone. */
  glideTo?: number;
  /** Seconds from now. */
  delay?: number;
  /** Share of the sound sent to the echo, 0..1. */
  echo?: number;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private echoIn: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  muted = false;

  /** Must be called from a user gesture (first tap) before any sound plays on mobile. */
  unlock(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);

      // Echo: delay with lowpassed feedback.
      this.echoIn = ctx.createGain();
      this.echoIn.gain.value = 1;
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.27;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2400;
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      this.echoIn.connect(delay);
      delay.connect(lp).connect(fb).connect(delay);
      lp.connect(wet).connect(this.master);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    }
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running" && !this.muted;
  }

  tone(o: ToneOptions): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const dur = o.dur ?? 0.2;
    const attack = o.attack ?? 0.008;
    const release = o.release ?? dur * 0.8;
    const vol = o.vol ?? 0.2;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glideTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release);
    osc.connect(g);
    g.connect(this.master);
    if (o.echo && this.echoIn) {
      const send = ctx.createGain();
      send.gain.value = o.echo;
      g.connect(send).connect(this.echoIn);
    }
    osc.start(t0);
    osc.stop(t0 + attack + release + 0.05);
  }

  /** Bell-like note: a sine plus quieter inharmonic partials. */
  chime(freq: number, vol = 0.16, delay = 0): void {
    this.tone({ freq, vol, dur: 1.4, release: 1.3, delay, echo: 0.45 });
    this.tone({ freq: freq * 2.01, vol: vol * 0.35, dur: 0.8, release: 0.7, delay, echo: 0.3 });
    this.tone({ freq: freq * 3.02, vol: vol * 0.12, dur: 0.5, release: 0.45, delay });
  }

  /** Short filtered noise: whooshes, soft hits. */
  noise(o: { dur: number; vol?: number; freq?: number; q?: number; type?: BiquadFilterType; delay?: number; sweepTo?: number }): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? "bandpass";
    f.frequency.setValueAtTime(o.freq ?? 800, t0);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + o.dur);
    f.Q.value = o.q ?? 1.2;
    const g = ctx.createGain();
    const vol = o.vol ?? 0.15;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.05, o.dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random());
    src.stop(t0 + o.dur + 0.05);
  }

  destroy(): void {
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.echoIn = null;
  }
}

/** Major pentatonic scale: any sequence of these notes sounds pleasant together. */
export function pentatonic(step: number, base = 392): number {
  const steps = [0, 2, 4, 7, 9];
  const octave = Math.floor(step / 5);
  const idx = ((step % 5) + 5) % 5;
  return base * Math.pow(2, (steps[idx] + 12 * octave) / 12);
}
