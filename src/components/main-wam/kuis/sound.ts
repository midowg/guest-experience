"use client";

/*
 * Kuis live's sounds on the big screen (rancangan §4: the venue's speakers; phones stay silent and
 * buzz). Made in the browser with Web Audio from the prototype (no files, no licence): the lobby's
 * music, a bed per level that gets tenser, the last five seconds' tick, time up with a drum roll, the
 * reveal (a fanfare when everyone was right), the scoreboard, and the podium's coin (a tick each half
 * turn, slowing) with a ding and a fanfare. A browser plays sound only after a click or a key: until
 * then nothing plays (the screen says so). Jeda holds everything, scheduled notes included.
 */

type Loop = { kind: "lobby" | "bed"; level: number; step: number; next: number; timer: number };

const CHORDS = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]];
const midi = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

export class KuisSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private loop: Loop | null = null;
  private roll: GainNode | null = null;
  private pending: { kind: Loop["kind"]; level: number } | null = null;
  private held = false;

  get unlocked() { return !!this.ctx && this.ctx.state === "running"; }

  /** After a click or a key: make the context (or wake it), and start what was waiting. */
  unlock() {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    try {
      if (!this.ctx) {
        this.ctx = new Context();
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.7;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 4;
        this.out.connect(comp); comp.connect(this.ctx.destination);
        const length = Math.floor(this.ctx.sampleRate * 2.5);
        this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      }
      if (this.held) return;
      const go = () => { if (this.pending) { const { kind, level } = this.pending; this.pending = null; this.startLoop(kind, level); } };
      if (this.ctx.state === "suspended") void this.ctx.resume().then(go, () => undefined); else go();
    } catch { this.ctx = null; }
  }

  private live() { return !!this.ctx && this.ctx.state === "running"; }
  private at() { return this.ctx!.currentTime + 0.01; }

  private env(gain: GainNode, t: number, attack: number, volume: number, decay: number) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  }

  private tone(freq: number, t: number, duration: number, volume = 0.1, type: OscillatorType = "sine", glide = 0, dest: AudioNode | null = this.out, attack = 0.006) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t + duration);
    this.env(gain, t, attack, volume, duration);
    osc.connect(gain); gain.connect(dest!);
    osc.start(t); osc.stop(t + duration + 0.05);
  }

  private hiss(t: number, duration: number, volume = 0.06, freq = 2000, type: BiquadFilterType = "bandpass", q = 0.8, glide = 0, dest: AudioNode | null = this.out, attack = 0.003) {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (glide) filter.frequency.exponentialRampToValueAtTime(glide, t + duration);
    filter.Q.value = q;
    const gain = ctx.createGain();
    this.env(gain, t, attack, volume, duration);
    source.connect(filter); filter.connect(gain); gain.connect(dest!);
    source.start(t, Math.random() * 0.8); source.stop(t + duration + 0.05);
  }

  private stopLoop() { if (this.loop) { window.clearInterval(this.loop.timer); this.loop = null; } }

  private startLoop(kind: Loop["kind"], level: number) {
    this.stopLoop();
    if (!this.live()) { this.pending = { kind, level }; return; }
    this.loop = { kind, level, step: 0, next: this.ctx!.currentTime + 0.08, timer: 0 };
    this.loop.timer = window.setInterval(() => this.pump(), 40);
    this.pump();
  }

  private pump() {
    const loop = this.loop;
    if (!loop || !this.live()) return;
    const bpm = loop.kind === "lobby" ? 104 : [92, 104, 116, 128][loop.level] ?? 104;
    const step = 60 / bpm / 2;
    while (loop.next < this.ctx!.currentTime + 0.2) {
      const t = loop.next;
      const s = loop.step;
      if (loop.kind === "lobby") {
        const chord = CHORDS[(s >> 3) % 4];
        const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
        this.tone(midi(chord[pattern[s % 8]] + 12), t, 0.3, 0.032, "triangle");
        if (s % 8 === 0) this.tone(midi(chord[0] - 12), t, 1.7, 0.05, "sine");
        if (s % 4 === 2) this.hiss(t, 0.04, 0.012, 7000, "highpass");
      } else {
        if (s % 2 === 0) this.tone(105, t, 0.17, 0.15, "sine", 46);
        if (loop.level >= 1 && s % 2 === 1) this.hiss(t, 0.035, 0.018, 8000, "highpass");
        if (loop.level >= 2 && s % 8 === 6) this.tone(midi(52 + loop.level), t, 0.22, 0.03, "triangle");
      }
      loop.next += step;
      loop.step += 1;
    }
  }

  private drumroll(t0: number, duration: number) {
    this.roll = this.ctx!.createGain();
    this.roll.gain.value = 1;
    this.roll.connect(this.out!);
    for (let x = 0; x < duration; x += 0.042) this.hiss(t0 + x, 0.07, 0.022 + 0.1 * Math.pow(x / duration, 1.6), 1500 + Math.random() * 500, "bandpass", 0.7, 0, this.roll);
  }

  private fanfare(t: number, big: boolean) {
    [0, 4, 7, 12].forEach((interval, i) => this.tone(midi(72 + interval), t + i * 0.11, 0.5, 0.09, "triangle"));
    [0, 4, 7, 12].forEach(interval => this.tone(midi(72 + interval), t + 0.46, big ? 1.6 : 1.1, 0.045, "triangle"));
    this.tone(midi(48), t + 0.46, 1.2, 0.12, "sine");
    this.hiss(t + 0.44, big ? 1.6 : 1.1, 0.05, 7000, "highpass");
  }

  lobby() { this.startLoop("lobby", 0); }
  bed(level: number) { this.startLoop("bed", level); }
  stop() { this.stopLoop(); this.pending = null; }
  cutRoll() { if (this.roll && this.ctx) { this.roll.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.02); this.roll = null; } }
  pop() { if (!this.live()) return; const t = this.at(); const n = 74 + [0, 2, 4, 7, 9, 12][Math.floor(Math.random() * 6)]; this.tone(midi(n), t, 0.14, 0.04, "triangle", midi(n + 5)); }
  tick(last: boolean) { if (!this.live()) return; const t = this.at(); this.tone(last ? 1760 : 1320, t, 0.06, 0.11, "triangle"); this.tone(660, t, 0.09, 0.06, "sine"); }
  level(level: number) {
    if (!this.live()) return;
    const t = this.at();
    const base = [57, 58, 59, 60][level] ?? 57;
    this.hiss(t, 0.7, 0.07, 400, "bandpass", 1.2, 4000, this.out, 0.35);
    const chord = level >= 2 ? [0, 3, 7, 10 + level] : [0, 4, 7, 12];
    chord.forEach((interval, i) => this.tone(midi(base + interval), t + 0.55 + i * 0.03, 1.1, 0.06, "triangle"));
    this.tone(midi(base - 24), t + 0.55, 1.2, 0.16 + level * 0.02, "sine");
  }
  timeUp() { if (!this.live()) return; const t = this.at(); this.tone(midi(45), t, 1.4, 0.2, "sine"); this.tone(midi(57), t, 0.9, 0.06, "triangle"); this.hiss(t, 0.5, 0.05, 5000, "highpass"); this.drumroll(t + 0.15, 1.85); }
  rollFor(seconds: number) { if (!this.live()) return; this.drumroll(this.at(), seconds); }
  whoosh() { if (!this.live()) return; this.hiss(this.at(), 1.4, 0.08, 300, "bandpass", 1.4, 2600, this.out, 0.6); }
  reveal(all: boolean) {
    if (!this.live()) return;
    const t = this.at();
    this.tone(midi(40), t, 0.35, 0.22, "sine", midi(28));
    this.hiss(t, 0.9, 0.045, 6500, "highpass");
    [72, 76, 79].forEach((n, i) => this.tone(midi(n), t + i * 0.07, 0.6, 0.07, "triangle"));
    if (all) this.fanfare(t + 0.3, false);
  }
  board() { if (!this.live()) return; const t = this.at(); this.hiss(t, 0.5, 0.06, 600, "bandpass", 1, 3000, this.out, 0.2); [67, 71, 74, 79].forEach((n, i) => this.tone(midi(n), t + 0.2 + i * 0.08, 0.4, 0.06, "triangle")); }
  winner(rank: number) { if (!this.live()) return; this.fanfare(this.at() + 0.25, rank === 1); }
  coinTick(progress: number) { if (!this.live()) return; const t = this.at(); this.tone(2300 - 900 * progress, t, 0.035, 0.07, "triangle"); this.hiss(t, 0.03, 0.03, 6500, "highpass"); }
  ding() { if (!this.live()) return; const t = this.at(); ([[1568, 0.13, 1.8], [2349, 0.06, 1.2], [3136, 0.035, 0.8], [4699, 0.015, 0.5]] as const).forEach(([f, v, d]) => this.tone(f, t, d, v, "sine")); }
  /** Jeda: every sound (the scheduled ones too) stops, and goes on from the same point. */
  hold(on: boolean) {
    this.held = on;
    if (!this.ctx) return;
    if (on) { if (this.ctx.state === "running") void this.ctx.suspend(); }
    else if (this.ctx.state === "suspended") this.unlock();
  }
}
