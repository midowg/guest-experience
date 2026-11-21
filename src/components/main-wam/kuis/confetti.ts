"use client";

/*
 * Light confetti on a canvas (rancangan §8: "konfeti dengan canvas ringan"), from the prototype. Its
 * colours are the theme's own tokens, read from the page (no colour is written here). Nothing with
 * "kurangi gerak" on: the caller does not start it.
 */

type Part = { x: number; y: number; vx: number; vy: number; r: number; vr: number; s: number; color: string; life: number; g: number; round: boolean };
const TOKENS = ["--mw-kuis-a", "--mw-kuis-b", "--mw-kuis-c", "--mw-kuis-d", "--mw-primary", "--mw-success", "--mw-kuis-medal-1"];

export class Confetti {
  private parts: Part[] = [];
  private frame = 0;
  private last = 0;
  private colors: string[] = [];

  constructor(private canvas: HTMLCanvasElement, private width: number, private height: number, private scale = Math.min(2, window.devicePixelRatio || 1)) {
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const style = getComputedStyle(canvas);
    this.colors = TOKENS.map(name => style.getPropertyValue(name).trim()).filter(Boolean);
  }

  private color() { return this.colors[Math.floor(Math.random() * this.colors.length)] ?? "currentColor"; }

  /** A burst from a point, upwards by default. */
  burst(x: number, y: number, count: number, options: { angle?: number; spread?: number; speed?: number; size?: number; life?: number; gravity?: number } = {}) {
    for (let i = 0; i < count; i += 1) {
      const angle = (options.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (options.spread ?? Math.PI * 0.9);
      const speed = (options.speed ?? 900) * (0.45 + Math.random() * 0.75);
      this.parts.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14, s: (options.size ?? 10) * (0.6 + Math.random() * 0.7), color: this.color(), life: (options.life ?? 2.4) * (0.7 + Math.random() * 0.5), g: options.gravity ?? 1300, round: Math.random() < 0.25 });
    }
    this.start();
  }

  /** Confetti falling over the whole screen. */
  rain(count: number, size = 16) {
    for (let i = 0; i < count; i += 1) {
      this.parts.push({ x: Math.random() * this.width, y: -20 - Math.random() * this.height * 0.6, vx: (Math.random() - 0.5) * 120, vy: 150 + Math.random() * 260, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 10, s: size * (0.6 + Math.random() * 0.7), color: this.color(), life: 6, g: 120, round: Math.random() < 0.25 });
    }
    this.start();
  }

  private start() {
    if (this.frame) return;
    this.last = performance.now();
    const step = (time: number) => {
      const dt = Math.min(0.05, (time - this.last) / 1000);
      this.last = time;
      this.draw(dt);
      this.frame = this.parts.length ? requestAnimationFrame(step) : 0;
    };
    this.frame = requestAnimationFrame(step);
  }

  private draw(dt: number) {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) { this.parts = []; return; }
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const drag = Math.pow(0.35, dt);
    this.parts = this.parts.filter(part => {
      part.vy += part.g * dt;
      part.vx *= drag;
      part.vy = part.vy * (part.vy > 0 ? Math.pow(0.6, dt) : drag);
      part.x += part.vx * dt; part.y += part.vy * dt; part.r += part.vr * dt; part.life -= dt;
      if (part.life <= 0 || part.y > this.height + 40) return false;
      ctx.save();
      ctx.globalAlpha = Math.min(1, part.life / 0.5);
      ctx.translate(part.x, part.y);
      ctx.rotate(part.r);
      ctx.fillStyle = part.color;
      if (part.round) { ctx.beginPath(); ctx.arc(0, 0, part.s * 0.35, 0, 6.28); ctx.fill(); }
      else { ctx.scale(1, Math.cos(part.r * 1.7)); ctx.fillRect(-part.s / 2, -part.s * 0.28, part.s, part.s * 0.56); }
      ctx.restore();
      return true;
    });
    if (!this.parts.length) ctx.clearRect(0, 0, this.width, this.height);
  }

  stop() { if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0; this.parts = []; }
}
