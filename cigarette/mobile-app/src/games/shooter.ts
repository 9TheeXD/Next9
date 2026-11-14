// "Star Guardian" — a vertical space shooter. Drag to fly, the ship fires by itself. Waves get
// harder without end, a boss comes every fifth wave, and coins buy permanent upgrades in the hangar
// (no level cap). Fast and absorbing: there is no attention left over for a craving.

import type { GameDefinition, GameEnv, GameInstance, PointerInfo } from "./engine/types";
import { Particles, Floaters, makeSprite, makeStars, roundRectPath, clamp, rgba, shade, TAU, FONT_DISPLAY, FONT_BODY, rng, glow, type Star } from "./engine/fx";
import { Button, drawCard, drawCoin, glassPanel } from "./engine/ui";
import { pentatonic } from "./engine/audio";
import { wallet, UPGRADES } from "./engine/economy";
import { drawShip, shipFlame } from "./art/skins";

type EnemyKind = "drone" | "zig" | "gunner" | "tank" | "diver" | "boss";

interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  max: number;
  r: number;
  t: number;
  fire: number;
  hit: number;
  phase: number;
  targetY: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  r: number;
  enemy: boolean;
  color: string;
}

interface Drop {
  x: number;
  y: number;
  vy: number;
  kind: "coin" | "spread" | "shield" | "heal";
  value: number;
  t: number;
}

const ENEMY_STYLE: Record<EnemyKind, { color: string; hp: number; r: number; score: number }> = {
  drone: { color: "#ff5a7a", hp: 22, r: 15, score: 10 },
  zig: { color: "#ffc93c", hp: 18, r: 14, score: 12 },
  gunner: { color: "#b06cff", hp: 40, r: 17, score: 20 },
  tank: { color: "#3ddc84", hp: 110, r: 22, score: 35 },
  diver: { color: "#ff8a3d", hp: 26, r: 14, score: 18 },
  boss: { color: "#ff3d6e", hp: 1600, r: 52, score: 500 },
};

export const shooterGame: GameDefinition = {
  id: "shooter",
  title: "ยานพิทักษ์ดาว",
  tagline: "ยิงฝ่าดงศัตรู บอสทุก 5 ด่าน อัปยานได้ไม่จำกัด",
  why: "เกมเร็วที่ต้องหลบและเล็งตลอดเวลา สมองไม่มีที่ว่างให้คิดถึงบุหรี่ เก็บเหรียญไปอัปยานให้แรงขึ้นเรื่อยๆ",
  category: "action",
  minutes: "3–10 นาที",
  palette: ["#070a24", "#4fa8ff"],
  create: (env) => new ShooterGame(env),
};

type State = "intro" | "hangar" | "play" | "over";

class ShooterGame implements GameInstance {
  private w = 0;
  private h = 0;
  private state: State = "intro";
  private stateT = 0;
  private time = 0;
  private px = 0;
  private py = 0;
  private hp = 100;
  private maxHp = 100;
  private fireT = 0;
  private droneT = 0;
  private spreadT = 0;
  private shieldT = 0;
  private hurtT = 0;
  private drag: { id: number; ox: number; oy: number } | null = null;
  private keys = new Set<string>();
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private drops: Drop[] = [];
  private wave = 0;
  private toSpawn = 0;
  private spawnT = 0;
  private waveBanner = 0;
  private waveGap = 0;
  private score = 0;
  private runCoins = 0;
  private kills = 0;
  private shake = 0;
  private stars: Star[][] = [makeStars(60, 1), makeStars(40, 2), makeStars(25, 3)];
  private bg: HTMLCanvasElement | null = null;
  private shipSprite: HTMLCanvasElement | null = null;
  private skin = "ship_falcon";
  private particles = new Particles();
  private floaters = new Floaters();
  private flyBtn = new Button("ออกบิน", "#2f8cff");
  private hangarBtn = new Button("โรงเก็บยาน (อัปเกรด)", "#ffffff", "ghost");
  private againBtn = new Button("บินอีกครั้ง", "#2f8cff");
  private toHangarBtn = new Button("อัปเกรดยาน", "#ffffff", "ghost");
  private backBtn = new Button("ออกบิน", "#2f8cff");
  private hangarRows: { id: string; y: number; btn: Button }[] = [];
  private rand = rng(Date.now() % 88888);
  private best = 0;
  private earned = 0;

  constructor(private env: GameEnv) {
    this.best = parseInt(env.store.get("best") || "0", 10) || 0;
    this.skin = wallet.equipped("shipSkin") || "ship_falcon";
  }

  // ── Stats from permanent upgrades ────────────────────────────────────────
  private stat(id: string) {
    return wallet.level(id);
  }
  private damage() {
    return 10 * Math.pow(1.15, this.stat("ship_damage"));
  }
  private fireInterval() {
    return Math.max(0.045, 0.26 / (1 + 0.13 * this.stat("ship_rate")));
  }
  private guns() {
    return Math.min(7, 1 + Math.floor(this.stat("ship_guns") / 2)) + (this.spreadT > 0 ? 2 : 0);
  }
  private magnet() {
    return 70 + 28 * this.stat("ship_magnet");
  }

  private start() {
    this.skin = wallet.equipped("shipSkin") || "ship_falcon";
    this.buildShip();
    this.maxHp = 100 + 20 * this.stat("ship_hp");
    this.hp = this.maxHp;
    this.px = this.w / 2;
    this.py = this.h - 110;
    this.enemies = [];
    this.bullets = [];
    this.drops = [];
    this.wave = 0;
    this.score = 0;
    this.runCoins = 0;
    this.kills = 0;
    this.spreadT = 0;
    this.shieldT = 2; // spawn protection
    this.nextWave();
    this.state = "play";
    this.stateT = 0;
    this.env.emit({ type: "start" });
  }

  private nextWave() {
    this.wave++;
    this.waveBanner = 2;
    this.toSpawn = this.wave % 5 === 0 ? 1 : 6 + this.wave * 2;
    this.spawnT = 1.2;
    if (this.wave % 5 === 0) this.env.sfx.tone({ freq: 110, dur: 1.2, vol: 0.12, type: "sawtooth", glideTo: 70 });
    else this.env.sfx.chime(pentatonic(this.wave % 8, 330), 0.08);
  }

  private hpScale() {
    return Math.pow(1.13, this.wave - 1);
  }

  private spawnEnemy() {
    const w = this.wave;
    if (w % 5 === 0) {
      const s = ENEMY_STYLE.boss;
      const hp = s.hp * Math.pow(1.35, w / 5 - 1);
      this.enemies.push({ kind: "boss", x: this.w / 2, y: -80, vx: 70, vy: 60, hp, max: hp, r: s.r, t: 0, fire: 2, hit: 0, phase: 0, targetY: this.h * 0.2 });
      return;
    }
    const pool: EnemyKind[] = ["drone", "drone", "zig"];
    if (w >= 2) pool.push("gunner");
    if (w >= 3) pool.push("diver", "zig");
    if (w >= 4) pool.push("tank");
    if (w >= 7) pool.push("gunner", "diver");
    const kind = pool[Math.floor(this.rand() * pool.length)];
    const s = ENEMY_STYLE[kind];
    const hp = s.hp * this.hpScale();
    const x = 30 + this.rand() * (this.w - 60);
    const speed = (90 + this.rand() * 60) * (1 + Math.min(1.2, w * 0.03));
    this.enemies.push({
      kind,
      x,
      y: -30,
      vx: kind === "zig" ? 0 : (this.rand() - 0.5) * 40,
      vy: kind === "tank" ? speed * 0.55 : speed,
      hp,
      max: hp,
      r: s.r,
      t: this.rand() * 6,
      fire: 1 + this.rand() * 1.5,
      hit: 0,
      phase: 0,
      targetY: this.h * (0.15 + this.rand() * 0.25),
    });
  }

  private enemyShot(x: number, y: number, angle: number, speed: number) {
    if (this.bullets.length > 500) return;
    this.bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, dmg: 9 * (1 + this.wave * 0.07), r: 5, enemy: true, color: "#ff7ab0" });
  }

  private kill(e: Enemy) {
    e.hp = 0;
    const st = ENEMY_STYLE[e.kind];
    this.kills++;
    this.score += Math.round(st.score * (1 + this.wave * 0.1));
    this.particles.burst(e.x, e.y, st.color, e.kind === "boss" ? 80 : 18, { speed: e.kind === "boss" ? 360 : 220, size: 3, gravity: 0, life: 0.8 });
    this.particles.burst(e.x, e.y, "#fff2c2", 6, { speed: 140, size: 2, kind: "spark", gravity: 0, life: 0.4 });
    this.particles.ring(e.x, e.y, st.color, e.r * 3, 0.45);
    this.shake = Math.max(this.shake, e.kind === "boss" ? 18 : 3);
    this.env.sfx.noise({ dur: e.kind === "boss" ? 1.2 : 0.25, vol: e.kind === "boss" ? 0.2 : 0.08, freq: 600, sweepTo: 80, type: "lowpass" });
    const coins = e.kind === "boss" ? 12 + this.wave : this.rand() < 0.55 ? 1 : 0;
    for (let i = 0; i < coins; i++) this.drops.push({ x: e.x + (this.rand() - 0.5) * e.r * 2, y: e.y, vy: 40 + this.rand() * 80, kind: "coin", value: 1 + Math.floor(this.wave / 4), t: 0 });
    if (this.rand() < (e.kind === "boss" ? 1 : 0.05)) {
      const kinds: Drop["kind"][] = ["spread", "shield", "heal"];
      this.drops.push({ x: e.x, y: e.y, vy: 70, kind: kinds[Math.floor(this.rand() * 3)], value: 0, t: 0 });
    }
    if (e.kind === "boss") this.floaters.add("ล้มบอสแล้ว!", this.w / 2, this.h * 0.35, "#ffe58a", 30, 1.6);
  }

  private hurt(dmg: number) {
    if (this.shieldT > 0 || this.hurtT > 0) return;
    this.hp -= dmg;
    this.hurtT = 0.35;
    this.shake = Math.max(this.shake, 8);
    this.env.sfx.tone({ freq: 160, dur: 0.2, vol: 0.1, type: "square", glideTo: 90 });
    if (this.hp <= 0) this.gameOver();
  }

  private gameOver() {
    this.hp = 0;
    this.particles.burst(this.px, this.py, shipFlame(this.skin), 60, { speed: 300, size: 3, gravity: 0, life: 1.2 });
    this.state = "over";
    this.stateT = 0;
    const reached = this.wave;
    if (reached > this.best) {
      this.best = reached;
      this.env.store.set("best", String(reached));
    }
    this.earned = this.runCoins + this.wave * 3;
    this.env.emit({ type: "end", coins: this.earned, score: this.score, best: this.best, summary: `ถึงด่าน ${reached} · ยิงไป ${this.kills} ลำ`, stats: { wave: reached, kills: this.kills } });
  }

  private buildShip() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const size = 56;
    this.shipSprite = makeSprite(size * 1.6, size * 1.6, dpr, (c) => {
      c.translate(size * 0.8, size * 0.8);
      drawShip(c, size, this.skin, 0);
    });
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    if (!this.px) {
      this.px = w / 2;
      this.py = h - 110;
    }
    this.px = clamp(this.px, 20, w - 20);
    this.py = clamp(this.py, 60, h - 30);
    this.buildShip();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.bg = makeSprite(w, h, dpr, (c) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#03041a");
      g.addColorStop(0.6, "#0a0f33");
      g.addColorStop(1, "#140a2e");
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      const r = rng(31);
      for (const col of ["#3b2bd1", "#b0287a", "#1c6fd8"]) {
        const x = r() * w;
        const y = r() * h;
        const rad = Math.max(w, h) * (0.3 + r() * 0.3);
        const rg = c.createRadialGradient(x, y, 0, x, y, rad);
        rg.addColorStop(0, rgba(col, 0.22));
        rg.addColorStop(1, rgba(col, 0));
        c.fillStyle = rg;
        c.fillRect(0, 0, w, h);
      }
      // Distant planet
      const pxp = w * 0.82;
      const pyp = h * 0.18;
      const pr = Math.min(w, h) * 0.12;
      const pg = c.createRadialGradient(pxp - pr * 0.4, pyp - pr * 0.4, pr * 0.1, pxp, pyp, pr);
      pg.addColorStop(0, "#7ea6ff");
      pg.addColorStop(1, "#1d2a6b");
      c.fillStyle = pg;
      c.beginPath();
      c.arc(pxp, pyp, pr, 0, TAU);
      c.fill();
      c.strokeStyle = "rgba(170,200,255,0.35)";
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(pxp, pyp, pr * 1.7, pr * 0.35, -0.3, 0, TAU);
      c.stroke();
    });
  }

  // ── Input ────────────────────────────────────────────────────────────────

  pointer(p: PointerInfo) {
    if (this.state === "intro" || this.state === "over") {
      const btns = this.state === "intro" ? [this.flyBtn, this.hangarBtn] : [this.againBtn, this.toHangarBtn];
      for (const b of btns) {
        if (p.type === "down" && b.hit(p.x, p.y)) b.pressed = true;
        if (p.type === "up") {
          if (b.pressed && b.hit(p.x, p.y) && this.stateT > 0.4) {
            if (b === this.flyBtn || b === this.againBtn) this.start();
            else {
              this.state = "hangar";
              this.stateT = 0;
            }
          }
          b.pressed = false;
        }
      }
      return;
    }
    if (this.state === "hangar") {
      const all = [this.backBtn, ...this.hangarRows.map((r) => r.btn)];
      for (const b of all) {
        if (p.type === "down" && b.hit(p.x, p.y)) b.pressed = true;
        if (p.type === "up") {
          if (b.pressed && b.hit(p.x, p.y) && this.stateT > 0.2) {
            if (b === this.backBtn) this.start();
            else {
              const row = this.hangarRows.find((r) => r.btn === b);
              if (row && wallet.upgrade(row.id)) {
                this.env.sfx.chime(pentatonic(6 + wallet.level(row.id) % 5), 0.1);
                this.particles.burst(b.x + b.w / 2, b.y + b.h / 2, "#ffd76a", 16, { speed: 140, size: 3, gravity: 0, life: 0.6 });
              } else this.env.sfx.tone({ freq: 200, dur: 0.12, vol: 0.06, type: "triangle" });
            }
          }
          b.pressed = false;
        }
      }
      return;
    }
    if (p.type === "down") this.drag = { id: p.id, ox: this.px - p.x, oy: this.py - p.y };
    else if (p.type === "move" && this.drag && this.drag.id === p.id) {
      this.px = clamp(p.x + this.drag.ox, 18, this.w - 18);
      this.py = clamp(p.y + this.drag.oy, 70, this.h - 24);
    } else if ((p.type === "up" || p.type === "cancel") && this.drag && this.drag.id === p.id) this.drag = null;
  }

  key(code: string, down: boolean) {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"].includes(code)) {
      if (down) this.keys.add(code);
      else this.keys.delete(code);
      return true;
    }
    if (down && (code === "Enter" || code === "Space") && this.state !== "play" && this.stateT > 0.5) {
      this.start();
      return true;
    }
    return false;
  }

  // ── Update ───────────────────────────────────────────────────────────────

  update(dt: number) {
    this.time += dt;
    this.stateT += dt;
    this.particles.update(dt);
    this.floaters.update(dt);
    for (const b of [this.flyBtn, this.hangarBtn, this.againBtn, this.toHangarBtn, this.backBtn, ...this.hangarRows.map((r) => r.btn)]) b.update(dt);
    this.shake = Math.max(0, this.shake - dt * 40);
    if (this.state !== "play") return;

    const sp = 340;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) this.px -= sp * dt;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) this.px += sp * dt;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) this.py -= sp * dt;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) this.py += sp * dt;
    this.px = clamp(this.px, 18, this.w - 18);
    this.py = clamp(this.py, 70, this.h - 24);

    this.spreadT = Math.max(0, this.spreadT - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.waveBanner = Math.max(0, this.waveBanner - dt);

    // Engine flame
    if (!this.env.reducedMotion) this.particles.burst(this.px, this.py + 22, shipFlame(this.skin), 1, { speed: 60, size: 3, gravity: 300, life: 0.25, spread: 0.6, angle: Math.PI / 2 });

    // Player fire
    this.fireT -= dt;
    if (this.fireT <= 0) {
      this.fireT = this.fireInterval();
      const n = this.guns();
      const dmg = this.damage();
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.12;
        this.bullets.push({ x: this.px + (i - (n - 1) / 2) * 6, y: this.py - 22, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, dmg, r: 4, enemy: false, color: shipFlame(this.skin) });
      }
      if (this.time % 0.2 < dt) this.env.sfx.tone({ freq: 880, dur: 0.03, vol: 0.02, type: "square" });
    }
    // Drones
    const dl = this.stat("ship_drone");
    if (dl > 0) {
      this.droneT -= dt;
      if (this.droneT <= 0) {
        this.droneT = 0.4;
        const count = dl >= 5 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          const side = k === 0 ? -1 : 1;
          const dx = this.px + side * 34;
          const target = this.nearestEnemy(dx, this.py);
          const a = target ? Math.atan2(target.y - this.py, target.x - dx) : -Math.PI / 2;
          this.bullets.push({ x: dx, y: this.py - 4, vx: Math.cos(a) * 600, vy: Math.sin(a) * 600, dmg: this.damage() * 0.45 * (1 + dl * 0.12), r: 3, enemy: false, color: "#9ef0ff" });
        }
      }
    }

    // Spawning
    if (this.toSpawn > 0) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnEnemy();
        this.toSpawn--;
        this.spawnT = Math.max(0.18, 0.8 - this.wave * 0.03) * (0.6 + this.rand() * 0.8);
      }
    } else if (this.enemies.length === 0) {
      this.waveGap += dt;
      if (this.waveGap > 1.2) {
        this.waveGap = 0;
        this.nextWave();
      }
    }

    // Enemies
    for (const e of this.enemies) {
      e.t += dt;
      e.hit = Math.max(0, e.hit - dt * 6);
      switch (e.kind) {
        case "zig":
          e.x += Math.sin(e.t * 3) * 160 * dt;
          e.y += e.vy * dt;
          break;
        case "gunner":
          if (e.y < e.targetY) e.y += e.vy * dt;
          else e.x += Math.sin(e.t) * 60 * dt;
          e.fire -= dt;
          if (e.fire <= 0 && e.y > 0) {
            e.fire = Math.max(0.7, 1.8 - this.wave * 0.04);
            this.enemyShot(e.x, e.y + e.r, Math.atan2(this.py - e.y, this.px - e.x), 260 + this.wave * 6);
          }
          if (e.t > 14) e.y += 120 * dt;
          break;
        case "diver":
          if (e.phase === 0) {
            e.y += e.vy * 0.6 * dt;
            if (e.y > e.targetY) {
              e.phase = 1;
              const a = Math.atan2(this.py - e.y, this.px - e.x);
              e.vx = Math.cos(a) * 420;
              e.vy = Math.sin(a) * 420;
            }
          } else {
            e.x += e.vx * dt;
            e.y += e.vy * dt;
          }
          break;
        case "boss": {
          if (e.y < e.targetY) e.y += e.vy * dt;
          e.x += e.vx * dt;
          if (e.x < e.r + 10 || e.x > this.w - e.r - 10) e.vx = -e.vx;
          e.fire -= dt;
          if (e.fire <= 0) {
            e.phase = (e.phase + 1) % 3;
            if (e.phase === 0) {
              e.fire = 1.4;
              for (let i = 0; i < 12; i++) this.enemyShot(e.x, e.y + 20, Math.PI / 2 + (i - 5.5) * 0.14, 230);
            } else if (e.phase === 1) {
              e.fire = 1.6;
              for (let i = 0; i < 20; i++) this.enemyShot(e.x, e.y, e.t * 2 + (i / 20) * TAU, 180);
            } else {
              e.fire = 1.1;
              const a = Math.atan2(this.py - e.y, this.px - e.x);
              for (let i = -2; i <= 2; i++) this.enemyShot(e.x, e.y + 30, a + i * 0.08, 320);
            }
          }
          break;
        }
        default:
          e.x += e.vx * dt;
          e.y += e.vy * dt;
      }
      e.x = clamp(e.x, -40, this.w + 40);
      // Ramming the player
      if (Math.hypot(e.x - this.px, e.y - this.py) < e.r + 14) {
        this.hurt(e.kind === "boss" ? 40 : 22);
        if (e.kind !== "boss") this.kill(e);
      }
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0 && e.y < this.h + 60);

    // Bullets
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.enemy) {
        if (Math.hypot(b.x - this.px, b.y - this.py) < b.r + 10) {
          b.y = -9999;
          this.hurt(b.dmg);
        }
      } else {
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          if (Math.abs(b.x - e.x) < e.r + b.r && Math.abs(b.y - e.y) < e.r + b.r) {
            e.hp -= b.dmg;
            e.hit = 1;
            if (this.rand() < 0.3) this.particles.burst(b.x, b.y, "#ffffff", 1, { speed: 80, size: 1.5, gravity: 0, life: 0.2 });
            b.y = -9999;
            if (e.hp <= 0) this.kill(e);
            break;
          }
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.y > -40 && b.y < this.h + 40 && b.x > -40 && b.x < this.w + 40);
    this.enemies = this.enemies.filter((e) => e.hp > 0);

    // Drops
    const mag = this.magnet();
    for (const d of this.drops) {
      d.t += dt;
      const dx = this.px - d.x;
      const dy = this.py - d.y;
      const dist = Math.hypot(dx, dy);
      if (dist < mag) {
        d.x += (dx / dist) * 520 * dt;
        d.y += (dy / dist) * 520 * dt;
      } else d.y += d.vy * dt;
      if (dist < 22) {
        d.y = this.h + 999;
        if (d.kind === "coin") {
          this.runCoins += d.value;
          this.env.sfx.tone({ freq: 1320, dur: 0.05, vol: 0.04 });
        } else if (d.kind === "spread") {
          this.spreadT = 8;
          this.floaters.add("ยิงกระจาย!", this.px, this.py - 40, "#9ef0ff", 20);
        } else if (d.kind === "shield") {
          this.shieldT = 6;
          this.floaters.add("โล่พลังงาน!", this.px, this.py - 40, "#a5f3fc", 20);
        } else {
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.35);
          this.floaters.add("ซ่อมยาน!", this.px, this.py - 40, "#86efac", 20);
        }
        if (d.kind !== "coin") this.env.sfx.chime(pentatonic(8), 0.09);
      }
    }
    this.drops = this.drops.filter((d) => d.y < this.h + 30);
  }

  private nearestEnemy(x: number, y: number) {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd && e.y > 0) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  private drawEnemy(c: CanvasRenderingContext2D, e: Enemy) {
    const st = ENEMY_STYLE[e.kind];
    const col = e.hit > 0 ? "#ffffff" : st.color;
    c.save();
    c.translate(e.x, e.y);
    glow(c, 0, 0, e.r * 2.2, st.color, 0.25);
    const g = c.createLinearGradient(0, -e.r, 0, e.r);
    g.addColorStop(0, shade(col, 0.3));
    g.addColorStop(1, shade(col, -0.35));
    c.fillStyle = g;
    c.beginPath();
    const r = e.r;
    switch (e.kind) {
      case "drone":
        c.moveTo(0, r);
        c.lineTo(r, -r * 0.6);
        c.lineTo(0, -r * 0.2);
        c.lineTo(-r, -r * 0.6);
        break;
      case "zig":
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + e.t * 3;
          c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        break;
      case "gunner":
        c.moveTo(-r, -r * 0.5);
        c.lineTo(r, -r * 0.5);
        c.lineTo(r * 0.6, r * 0.7);
        c.lineTo(0, r);
        c.lineTo(-r * 0.6, r * 0.7);
        break;
      case "tank":
        roundRectPath(c, -r, -r * 0.8, r * 2, r * 1.6, r * 0.4);
        break;
      case "diver":
        c.moveTo(0, r * 1.2);
        c.lineTo(r * 0.7, -r);
        c.lineTo(-r * 0.7, -r);
        break;
      default: {
        // boss
        c.moveTo(0, r * 0.9);
        c.lineTo(r * 1.1, r * 0.1);
        c.lineTo(r * 0.9, -r * 0.6);
        c.lineTo(r * 0.3, -r * 0.4);
        c.lineTo(0, -r * 0.8);
        c.lineTo(-r * 0.3, -r * 0.4);
        c.lineTo(-r * 0.9, -r * 0.6);
        c.lineTo(-r * 1.1, r * 0.1);
      }
    }
    c.closePath();
    c.fill();
    c.strokeStyle = shade(st.color, -0.5);
    c.lineWidth = 2;
    c.stroke();
    // Core
    const core = e.kind === "boss" ? r * 0.28 : r * 0.3;
    glow(c, 0, e.kind === "boss" ? 0 : -r * 0.1, core * 2.4, "#ffffff", 0.5 + 0.3 * Math.sin(e.t * 8));
    c.fillStyle = "#fff6d6";
    c.beginPath();
    c.arc(0, e.kind === "boss" ? 0 : -r * 0.1, core * 0.6, 0, TAU);
    c.fill();
    c.restore();
    if (e.kind !== "boss" && e.hp < e.max) {
      c.fillStyle = "rgba(0,0,0,0.5)";
      c.fillRect(e.x - r, e.y - r - 8, r * 2, 3);
      c.fillStyle = st.color;
      c.fillRect(e.x - r, e.y - r - 8, r * 2 * (e.hp / e.max), 3);
    }
  }

  private renderHangar() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    ctx.fillStyle = "rgba(4,6,24,0.78)";
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `800 24px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("โรงเก็บยาน", w / 2, 18);
    // Balance
    const coins = wallet.coins();
    ctx.font = `800 18px ${FONT_DISPLAY}`;
    const label = coins.toLocaleString();
    const tw = ctx.measureText(label).width;
    drawCoin(ctx, w / 2 - tw / 2 - 14, 64, 10);
    ctx.fillStyle = "#ffd76a";
    ctx.textAlign = "left";
    ctx.fillText(label, w / 2 - tw / 2 + 2, 55);
    // Ship preview
    ctx.save();
    ctx.translate(w / 2, 118 + Math.sin(this.time * 2) * 4);
    drawShip(ctx, 56, this.skin, this.time);
    ctx.restore();
    // Upgrade rows
    const list = UPGRADES.filter((u) => u.game === "shooter");
    const top = 162;
    const rowH = Math.min(64, (h - top - 90) / list.length);
    const cw = Math.min(w - 24, 440);
    const x0 = (w - cw) / 2;
    if (this.hangarRows.length !== list.length) this.hangarRows = list.map((u) => ({ id: u.id, y: 0, btn: new Button("", "#2f8cff") }));
    list.forEach((u, i) => {
      const y = top + i * rowH;
      glassPanel(ctx, x0, y, cw, rowH - 6, 14, 0.08);
      const lvl = wallet.level(u.id);
      const cost = wallet.upgradeCost(u.id);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = `700 15px ${FONT_DISPLAY}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`${u.name}  ขั้น ${lvl}`, x0 + 14, y + 8);
      ctx.font = `500 11px ${FONT_BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fillText(u.desc, x0 + 14, y + 30, cw - 140);
      const row = this.hangarRows[i];
      row.btn.label = `${cost.toLocaleString()}`;
      row.btn.color = coins >= cost ? "#f0a71a" : "#555b77";
      row.btn.place(x0 + cw - 62, y + (rowH - 6 - 38) / 2, 100, 38);
      row.btn.render(ctx);
      drawCoin(ctx, row.btn.x + 14, row.btn.y + 19, 8);
    });
    this.backBtn.place(w / 2, h - 70, Math.min(320, w - 40), 50);
    this.backBtn.render(ctx);
  }

  render() {
    const { ctx } = this.env;
    const w = this.w;
    const h = this.h;
    ctx.save();
    if (this.shake && !this.env.reducedMotion) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    if (this.bg) ctx.drawImage(this.bg, 0, 0, w, h);
    // Parallax stars scrolling down
    this.stars.forEach((layer, k) => {
      const speed = [0.02, 0.05, 0.1][k];
      ctx.fillStyle = `rgba(200,215,255,${0.25 + k * 0.2})`;
      for (const s of layer) {
        const y = ((s.y + this.time * speed) % 1) * h;
        ctx.beginPath();
        ctx.arc(s.x * w, y, s.r * (0.5 + k * 0.35), 0, TAU);
        ctx.fill();
      }
    });

    for (const d of this.drops) {
      if (d.kind === "coin") drawCoin(ctx, d.x, d.y, 7 + Math.sin(d.t * 8) * 0.8);
      else {
        const col = d.kind === "spread" ? "#9ef0ff" : d.kind === "shield" ? "#a5f3fc" : "#86efac";
        glow(ctx, d.x, d.y, 26, col, 0.6);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 10, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#0b1027";
        ctx.font = `800 12px ${FONT_DISPLAY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(d.kind === "spread" ? "S" : d.kind === "shield" ? "O" : "+", d.x, d.y + 1);
      }
    }
    for (const e of this.enemies) this.drawEnemy(ctx, e);

    // Bullets
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const b of this.bullets) {
      if (b.enemy) {
        ctx.fillStyle = "rgba(255,90,160,0.35)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#ffd1e6";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = rgba(b.color.startsWith("#") ? b.color : "#9ef0ff", 0.35);
        ctx.lineWidth = b.r * 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = b.r * 1.1;
        ctx.stroke();
      }
    }
    ctx.restore();

    if (this.state === "play" || this.state === "intro") {
      // Drones
      const dl = this.stat("ship_drone");
      if (dl > 0 && this.state === "play") {
        for (const side of dl >= 5 ? [-1, 1] : [-1]) {
          const dx = this.px + side * 34;
          const dy = this.py + 6 + Math.sin(this.time * 4 + side) * 3;
          glow(ctx, dx, dy, 14, "#9ef0ff", 0.5);
          ctx.fillStyle = "#cdfaff";
          ctx.beginPath();
          ctx.arc(dx, dy, 5, 0, TAU);
          ctx.fill();
        }
      }
      if (this.shipSprite && this.state === "play") {
        const s = this.shipSprite;
        const sw = 56 * 1.6;
        ctx.globalAlpha = this.hurtT > 0 && Math.sin(this.time * 60) > 0 ? 0.4 : 1;
        ctx.drawImage(s, this.px - sw / 2, this.py - sw / 2, sw, sw);
        ctx.globalAlpha = 1;
        if (this.shieldT > 0) {
          ctx.strokeStyle = `rgba(160,240,255,${0.5 + 0.3 * Math.sin(this.time * 10)})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(this.px, this.py, 34, 0, TAU);
          ctx.stroke();
        }
      }
    }
    this.particles.render(ctx);
    this.floaters.render(ctx);
    ctx.restore();

    // HUD
    if (this.state === "play") {
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.font = `800 24px ${FONT_DISPLAY}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(this.score.toLocaleString(), 14, 10);
      ctx.font = `600 12px ${FONT_BODY}`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(`ด่าน ${this.wave}`, 14, 40);
      // Coins this run
      ctx.textAlign = "right";
      ctx.font = `800 18px ${FONT_DISPLAY}`;
      ctx.fillStyle = "#ffd76a";
      ctx.fillText(`${this.runCoins}`, w - 14, 12);
      drawCoin(ctx, w - 24 - ctx.measureText(`${this.runCoins}`).width, 22, 8);
      // HP
      const bw = Math.min(160, w * 0.4);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      roundRectPath(ctx, w - 14 - bw, 40, bw, 8, 4);
      ctx.fill();
      ctx.fillStyle = this.hp / this.maxHp < 0.3 ? "#ff5a7a" : "#5eead4";
      roundRectPath(ctx, w - 14 - bw, 40, Math.max(0, bw * (this.hp / this.maxHp)), 8, 4);
      ctx.fill();
      // Boss bar
      const boss = this.enemies.find((e) => e.kind === "boss");
      if (boss) {
        const bb = w - 60;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        roundRectPath(ctx, 30, 60, bb, 10, 5);
        ctx.fill();
        ctx.fillStyle = "#ff3d6e";
        roundRectPath(ctx, 30, 60, bb * (boss.hp / boss.max), 10, 5);
        ctx.fill();
        ctx.font = `700 11px ${FONT_DISPLAY}`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`บอส ด่าน ${this.wave}`, w / 2, 73);
      }
      if (this.waveBanner > 0) {
        ctx.globalAlpha = Math.min(1, this.waveBanner);
        ctx.font = `900 34px ${FONT_DISPLAY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = this.wave % 5 === 0 ? "#ff7a9a" : "#ffffff";
        ctx.fillText(this.wave % 5 === 0 ? `บอสมาแล้ว!` : `ด่าน ${this.wave}`, w / 2, h * 0.42);
        ctx.globalAlpha = 1;
      }
    }

    if (this.state === "hangar") this.renderHangar();
    else if (this.state === "intro") {
      drawCard(ctx, w, h, {
        title: "ยานพิทักษ์ดาว",
        subtitle: "ลากนิ้วเพื่อบิน ยานยิงเอง",
        body: "หลบกระสุนชมพู เก็บเหรียญทองไปอัปยานที่โรงเก็บยาน ด่านยากขึ้นเรื่อยๆ ไม่มีที่สิ้นสุด บอสมาทุก 5 ด่าน",
        accent: "#2f8cff",
        buttons: [this.flyBtn, this.hangarBtn],
        appear: this.stateT * 3,
        chips: this.best ? [`ไปได้ไกลสุด ด่าน ${this.best}`] : undefined,
        icon: (c) => drawShip(c, 52, this.skin, this.time),
      });
    } else if (this.state === "over") {
      drawCard(ctx, w, h, {
        title: "ยานถูกยิงตก",
        subtitle: `ไปถึงด่าน ${this.wave} · ยิงไป ${this.kills} ลำ`,
        bigValue: this.score.toLocaleString(),
        bigLabel: "คะแนน",
        chips: [`ไกลสุด ด่าน ${this.best}`],
        coins: this.earned,
        accent: "#2f8cff",
        buttons: [this.againBtn, this.toHangarBtn],
        appear: this.stateT * 2.5,
      });
    }
  }
}
