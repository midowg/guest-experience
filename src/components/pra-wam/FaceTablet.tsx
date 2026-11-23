"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ScanFace, SwitchCamera, Volume2, VolumeX, X, XCircle } from "lucide-react";
import type { FaceBox, FaceEngine, FaceReading } from "@/components/hr/faceEngine";
import { average, cosine, FACE_MATCH, sameFace } from "@/lib/hr/face-match";
import type { FrameSignal } from "@/lib/hr/liveness";
import { windowState } from "@/lib/pra-wam/attendance";
import type { KioskAnswer, KioskCandidate, KioskIdentify, KioskOverview, KioskRecorded } from "@/lib/pra-wam/face-kiosk";
import type { PhotoMime } from "@/lib/pra-wam/photo";
import { instantLabel, zoneSuffix } from "@/lib/pra-wam/zone";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "./api";
import { cropSelfie } from "./FaceCheckIn";
import { putFile, putProblem } from "./photoUpload";
import { useViewerZone } from "./ViewerZone";
import css from "./face-tablet.module.css";

/*
 * Mode tablet (23 Nov 2026): absen wajah like a KAI station gate. Panitia opens it on a tablet,
 * held or standing at the door. The camera stays on and follows every face with a box; the nearest
 * one that looks at the tablet, near enough, is read for a moment (no button), the server says who
 * it is, and the answer shows on the camera itself, big enough to read from a step away, then the
 * next person. A close call asks panitia on the tablet. The same face is not sent again for a while.
 * Recorded as "wajah", the same as the phone's own check-in (src/lib/pra-wam/face-kiosk.ts).
 */

export type TabletClient = {
  identify(sessionId: string, input: KioskIdentify): Promise<KioskAnswer>;
  record(sessionId: string, candidate: KioskCandidate, blob: Blob, mime: PhotoMime): Promise<KioskRecorded>;
};

export const serverTabletClient: TabletClient = {
  async identify(sessionId, input) { return (await praWamRequest<KioskAnswer>(praWamApi.faceTablet(sessionId), { method: "POST", json: input })).data; },
  async record(sessionId, candidate, blob, mime) {
    const problem = putProblem(await putFile(candidate.upload.uploadUrl, blob, mime));
    if (problem) throw new PraWamApiError(problem);
    return (await praWamRequest<KioskRecorded>(praWamApi.faceTabletRecord(sessionId), {
      method: "POST", json: { token: candidate.token, photo: { key: candidate.upload.key, mime, size: blob.size, token: candidate.upload.token } },
    })).data;
  },
};

export type Tone = "lacak" | "baca" | "good" | "warn" | "bad";
export type DrawnFace = { id: number; left: number; top: number; width: number; height: number; tone: Tone; label: string | null; main: boolean };
export type Banner = { tone: "good" | "warn" | "bad"; title: string; text: string };
export type Recent = { key: string; name: string; department: string; at: string; tone: "good" | "warn" };
export type Confirm = { candidates: KioskCandidate[]; photoUrl: string | null };
/** /dev-preview only: a still picture of the running screen, without a camera. */
export type TabletDemo = { faces: DrawnFace[]; banner: Banner | null; confirm: Confirm | null; recent: Recent[]; present: number };

type Props = {
  sessionId: string;
  title: string;
  when: string;
  overview: KioskOverview;
  backHref: string;
  client?: TabletClient;
  demo?: TabletDemo;
};

const TICK_MS = 100;
/** Eyes at least this many pixels apart in the camera's picture: near enough to compare. */
const MIN_EYE_PX = 24;
/** Turned more than this is not looking at the tablet. */
const FACING_YAW = 20;
/** Steady this many looks in a row before reading. */
const STEADY = 3;
const BANNER_MS = 3200;
/** How long a face just answered is not sent again (an unknown one, shorter). */
const HOLD_MS = 20_000;
const HOLD_UNKNOWN_MS = 6000;
const MIN_SHARPNESS = 20;
const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

type Hold = { until: number; tone: Tone; label: string };
type Track = { id: number; cx: number; cy: number; seen: number; steady: number; signals: FrameSignal[]; hold: Hold | null };
type Remembered = { embedding: number[]; hold: Hold };

const centre = (box: FaceBox) => ({ cx: box.x + box.width / 2, cy: box.y + box.height / 2 });
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0] ?? "").join("").toUpperCase();

/** What stops a face from being read now, said on its box; null when it can be read. */
export function faceProblem(look: Pick<FaceReading, "closeness" | "signal">, shorterSide: number): string | null {
  if (look.closeness * shorterSide < MIN_EYE_PX) return "Mendekat sedikit";
  if (!look.signal || Math.abs(look.signal.yaw) > FACING_YAW) return "Hadap ke kamera";
  return null;
}

/** A short two-note chime for a check-in, unless the sound is off. */
function chime(audio: AudioContext | null, tone: "good" | "warn" | "bad") {
  if (!audio) return;
  const notes = tone === "good" ? [880, 1320] : tone === "warn" ? [660, 660] : [330, 247];
  notes.forEach((frequency, i) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const at = audio.currentTime + i * 0.13;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at); oscillator.stop(at + 0.24);
  });
}

export function FaceTablet({ sessionId, title, when, overview, backHref, client = serverTabletClient, demo }: Props) {
  const zone = useViewerZone();
  const video = useRef<HTMLVideoElement>(null);
  const [running, setRunning] = useState(!!demo);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [sound, setSound] = useState(true);
  const [faces, setFaces] = useState<DrawnFace[]>(demo?.faces ?? []);
  const [banner, setBanner] = useState<Banner | null>(demo?.banner ?? null);
  const [confirm, setConfirm] = useState<Confirm | null>(demo?.confirm ?? null);
  const [recent, setRecent] = useState<Recent[]>(demo?.recent ?? []);
  const [present, setPresent] = useState(demo?.present ?? overview.present);
  const [now, setNow] = useState(() => Date.now());
  const live = useRef({
    stream: null as MediaStream | null, engine: null as FaceEngine | null, timer: 0, bannerTimer: 0, stopped: true, busy: false, paused: false,
    track: null as Track | null, nextId: 1, remembered: [] as Remembered[], audio: null as AudioContext | null, sound: true, lock: null as { release(): Promise<void> } | null,
    resolveConfirm: null as ((choice: KioskCandidate | null) => void) | null, facing: "user" as "user" | "environment",
  });

  useEffect(() => { live.current.sound = sound; }, [sound]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => () => { live.current.stopped = true; stopCamera(); }, []);

  const window_ = overview.opens && overview.closes ? { opens: overview.opens, closes: overview.closes } : null;
  const state = window_ ? windowState(window_, new Date(now)) : "belum";
  const clock = (iso: string) => `${instantLabel(iso, zone)}${zoneSuffix(zone)}`;
  const closedText = !window_ ? "Sesi belum punya jam." : state === "belum" ? `Absen dibuka ${clock(window_.opens)}.` : state === "tutup" ? `Absen sudah ditutup ${clock(window_.closes)}.` : null;

  function stopCamera() {
    const state = live.current;
    window.clearTimeout(state.timer);
    state.stream?.getTracks().forEach(track => track.stop());
    state.stream = null;
    state.lock?.release().catch(() => undefined);
    state.lock = null;
  }

  function show(next: Banner) {
    const state = live.current;
    window.clearTimeout(state.bannerTimer);
    setBanner(next);
    chime(state.sound ? state.audio : null, next.tone);
    state.bannerTimer = window.setTimeout(() => setBanner(null), BANNER_MS);
  }

  /** Remembers this face's answer so it is not sent again for a while. */
  function remember(embedding: number[], hold: Hold) {
    const state = live.current;
    state.remembered = [...state.remembered.filter(item => item.hold.until > performance.now()), { embedding, hold }].slice(-40);
    if (state.track) state.track.hold = hold;
  }

  async function start(camera = facing) {
    const state = live.current;
    setProblem(null); setStarting(true);
    // Full screen while the tap still counts (a tablet at the door shows nothing else).
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()?.catch(() => undefined);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new PraWamApiError("Browser ini tidak bisa membuka kamera.");
      // Started by the tap, so the chime may play later.
      state.audio ??= typeof AudioContext !== "undefined" ? new AudioContext() : null;
      const { loadFaceEngine } = await import("@/components/hr/faceEngine");
      const [engine, stream] = await Promise.all([
        loadFaceEngine({ faces: 4 }),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: camera, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
      ]);
      stopCamera();
      state.stream = stream; state.engine = engine; state.facing = camera; state.stopped = false; state.busy = false; state.paused = false; state.track = null;
      setRunning(true);
      for (let i = 0; i < 20 && !video.current; i += 1) await new Promise(resolve => requestAnimationFrame(resolve));
      if (!video.current) { stream.getTracks().forEach(track => track.stop()); return; }
      video.current.srcObject = stream;
      await video.current.play();
      const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
      state.lock = await wakeLock?.request("screen").catch(() => null) ?? null;
      tick();
    } catch (error) {
      stopCamera(); setRunning(false);
      const name = error instanceof DOMException ? error.name : "";
      setProblem(name === "NotAllowedError" || name === "SecurityError" ? "Izin kamera ditolak. Izinkan kamera untuk situs ini, lalu mulai lagi."
        : name === "NotFoundError" || name === "OverconstrainedError" ? "Kamera ini tidak ditemukan. Coba kamera yang lain."
          : name === "NotReadableError" ? "Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu, lalu mulai lagi."
            : error instanceof PraWamApiError ? error.message : "Kamera atau pembaca wajah belum bisa dibuka. Coba lagi.");
    } finally {
      setStarting(false);
    }
  }

  function stop() {
    const state = live.current;
    state.stopped = true;
    state.resolveConfirm?.(null);
    stopCamera();
    if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => undefined);
    setRunning(false); setFaces([]); setBanner(null); setConfirm(null);
  }

  /** Where a face's box goes on the screen: the picture fills the stage (cover), mirrored for the front camera. */
  function place(box: FaceBox, element: HTMLVideoElement) {
    const width = element.clientWidth, height = element.clientHeight;
    const scale = Math.max(width / element.videoWidth, height / element.videoHeight);
    const dx = (width - element.videoWidth * scale) / 2, dy = (height - element.videoHeight * scale) / 2;
    const x = live.current.facing === "user" ? 1 - box.x - box.width : box.x;
    return { left: dx + x * element.videoWidth * scale, top: dy + box.y * element.videoHeight * scale, width: box.width * element.videoWidth * scale, height: box.height * element.videoHeight * scale };
  }

  function tick() {
    const state = live.current;
    const element = video.current;
    if (state.stopped || !element || !state.engine) return;
    if (!state.paused && element.readyState >= 2 && element.videoWidth) {
      const t = performance.now();
      const looks = state.engine.readAll(element, t).filter(look => look.box && look.points);
      const shorter = Math.min(element.videoWidth, element.videoHeight);
      // The nearest face is the one in front of the tablet; the others wait their turn.
      const main = looks.reduce<FaceReading | null>((best, look) => !best || look.box!.width * look.box!.height > best.box!.width * best.box!.height ? look : best, null);
      let mainLabel: string | null = null;
      let mainTone: Tone = "lacak";
      if (main?.box) {
        const { cx, cy } = centre(main.box);
        const track = state.track && Math.hypot(state.track.cx - cx, state.track.cy - cy) < 0.15 && t - state.track.seen < 1200 ? state.track : null;
        const current: Track = track ?? { id: state.nextId++, cx, cy, seen: t, steady: 0, signals: [], hold: null };
        current.cx = cx; current.cy = cy; current.seen = t;
        if (main.signal) { current.signals.push(main.signal); if (current.signals.length > 200) current.signals.shift(); }
        state.track = current;
        if (current.hold && current.hold.until < t) current.hold = null;
        if (current.hold) { mainTone = current.hold.tone; mainLabel = current.hold.label; }
        else if (state.busy) { mainTone = "baca"; mainLabel = "Membaca wajah…"; }
        else {
          const issue = faceProblem(main, shorter);
          if (issue) { current.steady = 0; mainLabel = issue; }
          else {
            current.steady += 1;
            mainLabel = "Tahan sebentar…";
            if (current.steady >= STEADY) { state.busy = true; void read(current); }
          }
        }
      } else if (state.track && t - state.track.seen > 1200) state.track = null;
      setFaces(looks.map((look, index) => ({
        id: look === main ? state.track?.id ?? 0 : -(index + 1), ...place(look.box!, element),
        tone: look === main ? mainTone : "lacak", label: look === main ? mainLabel : null, main: look === main,
      })));
    }
    state.timer = window.setTimeout(tick, TICK_MS);
  }

  /** A few sharp looks at the face in front, then who it is (or the answer it already had). */
  async function read(track: Track) {
    const state = live.current;
    const element = video.current!;
    const engine = state.engine!;
    try {
      const frames: number[][] = [];
      let still: HTMLCanvasElement | null = null;
      let box: FaceBox | null = null;
      for (let i = 0; i < 8 && frames.length < 3 && !state.stopped; i += 1) {
        const look = engine.readAll(element, performance.now()).filter(item => item.box && item.points)
          .map(item => ({ item, gap: Math.hypot(centre(item.box!).cx - track.cx, centre(item.box!).cy - track.cy) }))
          .sort((a, b) => a.gap - b.gap)[0];
        if (look && look.gap < 0.15 && !faceProblem(look.item, Math.min(element.videoWidth, element.videoHeight))) {
          if (look.item.signal) track.signals.push(look.item.signal);
          if (!still) {
            still = document.createElement("canvas");
            still.width = element.videoWidth; still.height = element.videoHeight;
            still.getContext("2d")!.drawImage(element, 0, 0);
            box = look.item.box;
          }
          const { embedding, sharpness } = await engine.embed(element, look.item.points!);
          if (sharpness >= MIN_SHARPNESS) frames.push(embedding);
        }
        await wait(110);
      }
      if (state.stopped || !still || !box || frames.length < 2 || !sameFace(frames)) { track.steady = 0; return; }
      const embedding = average(frames);
      // Someone just answered, still standing there or back again: show that, do not ask again.
      const known = state.remembered.find(item => item.hold.until > performance.now() && cosine(item.embedding, embedding) >= FACE_MATCH.cocok);
      if (known) { track.hold = known.hold; return; }

      const { blob, mime } = await cropSelfie(still, box);
      const answer = await client.identify(sessionId, { embedding, frameEmbeddings: frames, signals: track.signals.slice(-200), mime, size: blob.size });
      if (state.stopped) return;
      const until = (ms: number) => performance.now() + ms;
      if (answer.kind === "tidak-dikenali") {
        remember(embedding, { until: until(HOLD_UNKNOWN_MS), tone: "bad", label: "Belum dikenali" });
        show({ tone: "bad", title: "Wajah belum dikenali", text: "Scan QR di ruang, atau lapor panitia." });
      } else if (answer.kind === "sudah") {
        remember(embedding, { until: until(HOLD_MS), tone: "good", label: answer.person.name });
        show({ tone: "good", title: answer.person.name, text: `Sudah tercatat hadir ${clock(answer.checkedInAt)}` });
      } else if (answer.kind === "belum-setuju") {
        remember(embedding, { until: until(HOLD_MS), tone: "warn", label: answer.person.name });
        show({ tone: "warn", title: `${answer.person.name} belum bisa absen wajah`, text: "Setujui dulu sekali lewat Absen pakai wajah di HP, atau scan QR." });
      } else {
        const chosen = answer.kind === "cocok" ? answer.candidate : await ask(answer.candidates, blob);
        if (!chosen) { remember(embedding, { until: until(HOLD_UNKNOWN_MS), tone: "bad", label: "Tidak dicatat" }); return; }
        track.hold = { until: until(HOLD_MS), tone: "baca", label: chosen.name };
        const done = await client.record(sessionId, chosen, blob, mime);
        if (state.stopped) return;
        setPresent(done.present);
        remember(embedding, { until: until(HOLD_MS), tone: "good", label: done.person.name });
        show({ tone: "good", title: done.person.name, text: done.kind === "tercatat" ? `Tercatat hadir ${clock(done.checkedInAt)}` : `Sudah tercatat hadir ${clock(done.checkedInAt)}` });
        if (done.kind === "tercatat") {
          setRecent(list => [{ key: `${done.person.employeeId}-${done.checkedInAt}`, name: done.person.name, department: done.person.department, at: done.checkedInAt, tone: answer.kind === "konfirmasi" ? "warn" as const : "good" as const }, ...list].slice(0, 8));
        }
      }
    } catch (error) {
      track.hold = { until: performance.now() + 4000, tone: "bad", label: "Coba lagi" };
      show({ tone: "bad", title: "Belum tercatat", text: errorText(error) });
    } finally {
      track.steady = 0;
      state.busy = false;
    }
  }

  /** A close call: panitia picks who it is, or nobody. The camera waits meanwhile. */
  function ask(candidates: KioskCandidate[], blob: Blob): Promise<KioskCandidate | null> {
    const state = live.current;
    state.paused = true;
    const photoUrl = URL.createObjectURL(blob);
    setConfirm({ candidates, photoUrl });
    chime(state.sound ? state.audio : null, "warn");
    return new Promise(resolve => {
      const timer = window.setTimeout(() => finish(null), 30_000);
      function finish(choice: KioskCandidate | null) {
        window.clearTimeout(timer);
        state.resolveConfirm = null; state.paused = false;
        setConfirm(null);
        URL.revokeObjectURL(photoUrl);
        resolve(choice);
      }
      state.resolveConfirm = finish;
    });
  }

  function switchCamera() {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    if (running && !demo) void start(next);
  }

  const mirrored = facing === "user";
  return <div className={css.tablet}>
    {!running && <div className={css.intro}>
      <div className={css.card}>
        <span className={css.eyebrow}><ScanFace size={16} aria-hidden /> Mode tablet · absen wajah</span>
        <h1>{title}</h1>
        <p className={css.when}>{when}</p>
        <dl className={css.stats}>
          <div><dt>Bisa dikenali</dt><dd>{overview.withFace}<small> dari {overview.total} peserta</small></dd></div>
          <div><dt>Sudah hadir</dt><dd>{present}</dd></div>
        </dl>
        <fieldset className={css.cameras}>
          <legend>Kamera</legend>
          <label><input type="radio" name="kamera" checked={facing === "user"} onChange={() => setFacing("user")} /><span><strong>Depan</strong>Tablet ditaruh di pintu, menghadap peserta</span></label>
          <label><input type="radio" name="kamera" checked={facing === "environment"} onChange={() => setFacing("environment")} /><span><strong>Belakang</strong>Tablet dipegang panitia</span></label>
        </fieldset>
        {closedText && <p className={css.notice} role="status">{closedText} Mode tablet bisa dibuka sekarang; wajah baru tercatat saat absen dibuka.</p>}
        {problem && <p className={css.error} role="alert">{problem}</p>}
        <button type="button" className={`button button--primary ${css.startButton}`} onClick={() => void start()} disabled={starting}>
          {starting ? <><span className={css.spinner} aria-hidden /> Menyiapkan kamera…</> : <><ScanFace size={20} aria-hidden /> Mulai</>}
        </button>
        <p className={css.small}>Yang belum punya wajah di WG People, atau belum pernah menyetujui absen wajah, absen dengan scan QR.</p>
        <a className={css.back} href={backHref}><ChevronLeft size={18} aria-hidden /> Kembali ke daftar hadir</a>
      </div>
    </div>}

    {running && <div className={css.stage}>
      {demo ? <div className={css.demoPicture} aria-hidden /> : <video ref={video} className={mirrored ? css.mirror : undefined} muted playsInline aria-label="Kamera" />}

      <div className={css.boxes} aria-hidden>
        {faces.map(face => <div key={face.id} className={`${css.box} ${css[face.tone]} ${face.main ? css.main : ""}`}
          style={{ transform: `translate(${face.left}px, ${face.top}px)`, width: face.width, height: face.height }}>
          <i /><i /><i /><i />
          {face.tone === "baca" && <span className={css.sweep} />}
          {face.label && <span className={css.label}>{face.label}</span>}
        </div>)}
      </div>

      <header className={css.bar}>
        <div className={css.barTitle}><strong>{title}</strong><span>{when}</span></div>
        <span className={css.count} aria-live="polite"><strong>{present}</strong>/{overview.total} hadir</span>
        <button type="button" className={css.icon} onClick={switchCamera} aria-label={facing === "user" ? "Pakai kamera belakang" : "Pakai kamera depan"}><SwitchCamera aria-hidden /></button>
        <button type="button" className={css.icon} onClick={() => setSound(on => !on)} aria-pressed={sound} aria-label={sound ? "Matikan suara" : "Nyalakan suara"}>{sound ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}</button>
        <button type="button" className={css.icon} onClick={stop} aria-label="Hentikan mode tablet"><X aria-hidden /></button>
      </header>

      {recent.length > 0 && <aside className={css.recent} aria-label="Baru absen">
        <h2>Baru absen</h2>
        <ol>{recent.map(item => <li key={item.key}>
          <span className={`${css.avatar} ${css[item.tone]}`}>{initials(item.name)}</span>
          <span className={css.who}><strong>{item.name}</strong><small>{item.department}</small></span>
          <time>{instantLabel(item.at, zone)}</time>
        </li>)}</ol>
      </aside>}

      <div className={css.bottom}>
        {banner
          ? <div className={`${css.banner} ${css[banner.tone]}`} role="status" key={`${banner.title}-${banner.text}`}>
            <span className={css.bannerIcon}>{banner.tone === "good" ? <CheckCircle2 aria-hidden /> : banner.tone === "warn" ? <AlertTriangle aria-hidden /> : <XCircle aria-hidden />}</span>
            <span><strong>{banner.title}</strong><span>{banner.text}</span></span>
          </div>
          : <div className={css.idle} role="status"><ScanFace aria-hidden /> {closedText ?? "Hadapkan wajah ke kamera untuk absen"}</div>}
      </div>

      {confirm && <div className={css.confirm} role="dialog" aria-modal="true" aria-labelledby="tablet-confirm">
        <div className={css.confirmCard}>
          <h2 id="tablet-confirm">{confirm.candidates.length === 1 ? `Benar ini ${confirm.candidates[0].name}?` : "Siapa ini?"}</h2>
          <p>Wajahnya agak berbeda dari foto di WG People. Panitia, cocokkan dulu.</p>
          <div className={css.compare}>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this browser */}
              {confirm.photoUrl ? <img src={confirm.photoUrl} alt="Wajah di depan tablet" /> : <span className={css.photoEmpty} />}
              <figcaption>Di depan tablet</figcaption>
            </figure>
            {confirm.candidates.map(candidate => <figure key={candidate.employeeId}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived storage address */}
              {candidate.referenceUrl ? <img src={candidate.referenceUrl} alt={`Foto ${candidate.name} di WG People`} /> : <span className={css.photoEmpty} />}
              <figcaption>{candidate.name}<small>{candidate.department} · {candidate.percent}% mirip</small></figcaption>
            </figure>)}
          </div>
          <div className={css.confirmActions}>
            {confirm.candidates.map(candidate => <button key={candidate.employeeId} type="button" className="button button--primary" onClick={() => live.current.resolveConfirm?.(candidate)}>
              <CheckCircle2 size={18} aria-hidden /> Ya, {firstName(candidate.name)}
            </button>)}
            <button type="button" className="button button--secondary" onClick={() => live.current.resolveConfirm?.(null)}>Bukan, jangan catat</button>
          </div>
        </div>
      </div>}
    </div>}
  </div>;
}
