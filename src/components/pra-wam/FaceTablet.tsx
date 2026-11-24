"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, Maximize, Minimize, ScanFace, SwitchCamera, Volume2, VolumeX, X, XCircle } from "lucide-react";
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
 * held or standing at the door. The camera stays on and follows every face with a box (up to five);
 * each one that looks at the tablet, near enough, is read for a moment (no button; up to three at
 * the same time), the server says who it is, and the answer shows on that face's box and on the
 * camera itself, big enough to read from a step away. A close call asks panitia on the tablet. The
 * same face is not sent again for a while. 23 Nov 2026, after the first try: an answer stays with
 * the face that was read (its numbers are checked again on the box), so someone stepping into the
 * same place mid-read gets their own box, not the last person's name.
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
export type TabletDemo = { faces: DrawnFace[]; banners: Banner[]; confirm: Confirm | null; recent: Recent[]; present: number };

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
/** How many faces the tablet follows at once, and how many of them it reads at the same time. */
export const MAX_FACES = 5;
const MAX_READING = 3;
/** Eyes at least this many pixels apart in the camera's picture: near enough to compare. */
const MIN_EYE_PX = 24;
/** Turned more than this is not looking at the tablet. */
const FACING_YAW = 20;
/** Steady this many looks in a row before reading. */
const STEADY = 3;
/** Looks taken while reading, of which at least two must be sharp. */
const READ_LOOKS = 8;
const BANNER_MS = 3200;
const MAX_BANNERS = 3;
/** How long a face just answered is not sent again (an unknown one, shorter). */
const HOLD_MS = 20_000;
const HOLD_UNKNOWN_MS = 6000;
/** A face with a name on its box is checked again this often: still the same person? */
const RECHECK_MS = 600;
/** Gone longer than this, a face's box (and its answer) is dropped. */
const LOST_MS = 500;
const MIN_SHARPNESS = 20;
/** Stricter than cocok: a face only takes a remembered answer when it is clearly the same person. */
const SAME_PERSON = 0.5;

type Hold = { until: number; tone: Tone; label: string };
type Spot = { cx: number; cy: number; size: number };
/**
 * One face the tablet follows. Its answer (hold) belongs to the face that was read: the numbers of
 * that face are kept, and the face in the box is compared with them again and again, so a new
 * person stepping into the same place gets a new box instead of the last one's name.
 */
type Track = Spot & {
  id: number; seen: number; look: FaceReading | null; steady: number; signals: FrameSignal[]; hold: Hold | null;
  phase: "lacak" | "baca" | "kirim"; looks: number; pending: number; frames: number[][]; still: HTMLCanvasElement | null; box: FaceBox | null;
  /** The numbers of the face this box was read as; null until read. */
  embedding: number[] | null; checkAt: number; checking: boolean;
};
type Remembered = { embedding: number[]; hold: Hold };

const spotOf = (box: FaceBox): Spot => ({ cx: box.x + box.width / 2, cy: box.y + box.height / 2, size: Math.sqrt(box.width * box.height) });
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map(part => part[0] ?? "").join("").toUpperCase();

/** What stops a face from being read now, said on its box; null when it can be read. */
export function faceProblem(look: Pick<FaceReading, "closeness" | "signal">, shorterSide: number): string | null {
  if (look.closeness * shorterSide < MIN_EYE_PX) return "Mendekat sedikit";
  if (!look.signal || Math.abs(look.signal.yaw) > FACING_YAW) return "Hadap ke kamera";
  return null;
}

/**
 * Which followed face each new look is: the nearest one, close by and about the same size, each
 * taken once (nearest pairs first); -1 for a face not seen before.
 */
export function matchSpots(tracks: readonly Spot[], looks: readonly Spot[]): number[] {
  const pairs: { track: number; look: number; gap: number }[] = [];
  tracks.forEach((track, i) => looks.forEach((look, j) => {
    const gap = Math.hypot(track.cx - look.cx, track.cy - look.cy);
    const ratio = look.size / Math.max(track.size, 1e-6);
    if (gap < Math.max(0.06, track.size * 0.6) && ratio > 0.65 && ratio < 1.55) pairs.push({ track: i, look: j, gap });
  }));
  pairs.sort((a, b) => a.gap - b.gap);
  const result = looks.map(() => -1);
  const taken = new Set<number>();
  for (const pair of pairs) {
    if (taken.has(pair.track) || result[pair.look] !== -1) continue;
    result[pair.look] = pair.track; taken.add(pair.track);
  }
  return result;
}

type Fullscreen = { fullscreenElement?: Element | null; webkitFullscreenElement?: Element | null; exitFullscreen?(): Promise<void>; webkitExitFullscreen?(): void };
type FullscreenTarget = { requestFullscreen?(): Promise<void>; webkitRequestFullscreen?(): void };
/** Full screen with Safari's older names too; false where the browser has none (an iPhone). */
const fullscreenOn = () => { const page = document as unknown as Fullscreen; return !!(page.fullscreenElement ?? page.webkitFullscreenElement); };
const canFullscreen = () => { const root = document.documentElement as unknown as FullscreenTarget; return !!(root.requestFullscreen ?? root.webkitRequestFullscreen); };
function enterFullscreen() {
  const root = document.documentElement as unknown as FullscreenTarget;
  if (fullscreenOn()) return;
  if (root.requestFullscreen) root.requestFullscreen()?.catch(() => undefined); else root.webkitRequestFullscreen?.();
}
function leaveFullscreen() {
  const page = document as unknown as Fullscreen;
  if (!fullscreenOn()) return;
  if (page.exitFullscreen) page.exitFullscreen()?.catch(() => undefined); else page.webkitExitFullscreen?.();
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
  const [banners, setBanners] = useState<(Banner & { id: number })[]>(() => (demo?.banners ?? []).map((banner, id) => ({ ...banner, id })));
  const [confirm, setConfirm] = useState<Confirm | null>(demo?.confirm ?? null);
  const [recent, setRecent] = useState<Recent[]>(demo?.recent ?? []);
  const [present, setPresent] = useState(demo?.present ?? overview.present);
  const [now, setNow] = useState(() => Date.now());
  const [full, setFull] = useState(false);
  const [fullAvailable, setFullAvailable] = useState(false);
  const live = useRef({
    stream: null as MediaStream | null, engine: null as FaceEngine | null, timer: 0, stopped: true, paused: false,
    tracks: [] as Track[], nextId: 1, nextBanner: 1, remembered: [] as Remembered[], audio: null as AudioContext | null, sound: true,
    lock: null as { release(): Promise<void> } | null, facing: "user" as "user" | "environment",
    /** One embedding at a time (the face model runs one picture at a time). */
    queue: Promise.resolve() as Promise<unknown>,
    /** One close call at a time; the next waits for panitia. */
    asking: Promise.resolve() as Promise<unknown>,
    resolveConfirm: null as ((choice: KioskCandidate | null) => void) | null,
  });

  useEffect(() => { live.current.sound = sound; }, [sound]);
  // The full screen button follows the browser (Esc or a swipe leaves it too).
  useEffect(() => {
    const follow = () => { setFull(fullscreenOn()); setFullAvailable(canFullscreen()); };
    follow();
    document.addEventListener("fullscreenchange", follow);
    document.addEventListener("webkitfullscreenchange", follow);
    return () => { document.removeEventListener("fullscreenchange", follow); document.removeEventListener("webkitfullscreenchange", follow); };
  }, []);
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

  /** A message on the camera for a few seconds; several people at once stack up (newest last). */
  function show(next: Banner) {
    const state = live.current;
    const id = state.nextBanner++;
    setBanners(list => [...list, { ...next, id }].slice(-MAX_BANNERS));
    chime(state.sound ? state.audio : null, next.tone);
    window.setTimeout(() => setBanners(list => list.filter(item => item.id !== id)), BANNER_MS);
  }

  /** Remembers a face's answer so it is not sent again for a while (wherever it stands next). */
  function remember(embedding: number[], hold: Hold) {
    const state = live.current;
    state.remembered = [...state.remembered.filter(item => item.hold.until > performance.now()), { embedding, hold }].slice(-60);
  }

  /** The face model on a copy of this moment's picture, one at a time. */
  function embedNow(element: HTMLVideoElement, points: NonNullable<FaceReading["points"]>): Promise<{ embedding: number[]; sharpness: number }> {
    const state = live.current;
    const engine = state.engine!;
    const copy = document.createElement("canvas");
    copy.width = element.videoWidth; copy.height = element.videoHeight;
    copy.getContext("2d")!.drawImage(element, 0, 0);
    const run = state.queue.then(() => engine.embed(copy, points));
    state.queue = run.catch(() => undefined);
    return run;
  }

  async function start(camera = facing) {
    const state = live.current;
    setProblem(null); setStarting(true);
    // Full screen while the tap still counts (a tablet at the door shows nothing else).
    enterFullscreen();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new PraWamApiError("Browser ini tidak bisa membuka kamera.");
      // Started by the tap, so the chime may play later.
      state.audio ??= typeof AudioContext !== "undefined" ? new AudioContext() : null;
      const { loadFaceEngine } = await import("@/components/hr/faceEngine");
      const [engine, stream] = await Promise.all([
        loadFaceEngine({ faces: MAX_FACES }),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: camera, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
      ]);
      stopCamera();
      state.stream = stream; state.engine = engine; state.facing = camera; state.stopped = false; state.paused = false; state.tracks = [];
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
    leaveFullscreen();
    setRunning(false); setFaces([]); setBanners([]); setConfirm(null);
  }

  /** Where a face's box goes on the screen: the picture fills the stage (cover), mirrored for the front camera. */
  function place(box: FaceBox, element: HTMLVideoElement) {
    const width = element.clientWidth, height = element.clientHeight;
    const scale = Math.max(width / element.videoWidth, height / element.videoHeight);
    const dx = (width - element.videoWidth * scale) / 2, dy = (height - element.videoHeight * scale) / 2;
    const x = live.current.facing === "user" ? 1 - box.x - box.width : box.x;
    return { left: dx + x * element.videoWidth * scale, top: dy + box.y * element.videoHeight * scale, width: box.width * element.videoWidth * scale, height: box.height * element.videoHeight * scale };
  }

  /** A face that turned out to be someone else: a fresh box, nothing carried over. */
  function renew(track: Track) {
    Object.assign(track, { id: live.current.nextId++, steady: 0, signals: [], hold: null, phase: "lacak", looks: 0, pending: 0, frames: [], still: null, box: null, embedding: null, checking: false });
  }

  function tick() {
    const state = live.current;
    const element = video.current;
    if (state.stopped || !element || !state.engine) return;
    if (!state.paused && element.readyState >= 2 && element.videoWidth) {
      const t = performance.now();
      const looks = state.engine.readAll(element, t).filter(look => look.box && look.points);
      const shorter = Math.min(element.videoWidth, element.videoHeight);
      const spots = looks.map(look => spotOf(look.box!));
      const matched = matchSpots(state.tracks, spots);
      for (const track of state.tracks) track.look = null;
      looks.forEach((look, i) => {
        const track = matched[i] >= 0 ? state.tracks[matched[i]] : (() => {
          const fresh: Track = { ...spots[i], id: state.nextId++, seen: t, look: null, steady: 0, signals: [], hold: null, phase: "lacak", looks: 0, pending: 0, frames: [], still: null, box: null, embedding: null, checkAt: 0, checking: false };
          state.tracks.push(fresh);
          return fresh;
        })();
        Object.assign(track, spots[i], { seen: t, look });
        if (look.signal) { track.signals.push(look.signal); if (track.signals.length > 200) track.signals.shift(); }
      });
      // A face out of sight takes its box and its answer with it.
      state.tracks = state.tracks.filter(track => track.look || (t - track.seen < LOST_MS && track.phase !== "lacak") || t - track.seen < 150);
      let reading = state.tracks.filter(track => track.phase !== "lacak").length;

      for (const track of state.tracks) {
        const look = track.look;
        if (!look) continue;
        if (track.hold && track.hold.until < t) { track.hold = null; if (track.phase === "lacak") track.embedding = null; }
        // Still the person this box was read as?
        if (track.embedding && !track.checking && t >= track.checkAt && !faceProblem(look, shorter)) {
          track.checking = true;
          const id = track.id, known = track.embedding;
          void embedNow(element, look.points!).then(({ embedding }) => {
            if (track.id !== id) return;
            if (cosine(embedding, known) < FACE_MATCH.cocok) renew(track);
          }).catch(() => undefined).finally(() => { if (track.id === id) { track.checking = false; track.checkAt = performance.now() + RECHECK_MS; } });
        }
        if (track.phase === "baca") sample(track, look, element, shorter, t);
        else if (track.phase === "lacak" && !track.hold) {
          const issue = faceProblem(look, shorter);
          if (issue) track.steady = 0;
          else if ((track.steady += 1) >= STEADY && reading < MAX_READING) { track.phase = "baca"; track.looks = 0; track.frames = []; reading += 1; }
        }
      }

      setFaces(state.tracks.filter(track => track.look).map(track => {
        const look = track.look!;
        const issue = faceProblem(look, shorter);
        const [tone, label]: [Tone, string | null] = track.hold ? [track.hold.tone, track.hold.label]
          : track.phase !== "lacak" ? ["baca", "Membaca wajah…"]
            : [issue ? "lacak" : "baca", issue ?? "Tahan sebentar…"];
        return { id: track.id, ...place(look.box!, element), tone, label, main: !issue || !!track.hold || track.phase !== "lacak" };
      }));
    }
    state.timer = window.setTimeout(tick, TICK_MS);
  }

  /** One look while reading: this moment's picture for the face model, the first one kept for the photo. */
  function sample(track: Track, look: FaceReading, element: HTMLVideoElement, shorter: number, t: number) {
    if (track.looks >= READ_LOOKS || track.frames.length + track.pending >= 3) {
      if (track.pending === 0) void identify(track, t);
      return;
    }
    track.looks += 1;
    if (faceProblem(look, shorter)) return;
    if (!track.still) {
      track.still = document.createElement("canvas");
      track.still.width = element.videoWidth; track.still.height = element.videoHeight;
      track.still.getContext("2d")!.drawImage(element, 0, 0);
      track.box = look.box;
    }
    const id = track.id;
    track.pending += 1;
    void embedNow(element, look.points!).then(({ embedding, sharpness }) => {
      if (track.id === id && sharpness >= MIN_SHARPNESS) track.frames.push(embedding);
    }).catch(() => undefined).finally(() => { if (track.id === id) track.pending -= 1; });
  }

  /** The looks are in: who is it (or the answer it already had)? The answer stays with this face only. */
  async function identify(track: Track, t: number) {
    const state = live.current;
    const id = track.id;
    const frames = track.frames, still = track.still, box = track.box, signals = track.signals.slice(-200);
    if (frames.length < 2 || !still || !box || !sameFace(frames)) { renew(track); return; }
    track.phase = "kirim";
    const embedding = average(frames);
    track.embedding = embedding; track.checkAt = t + RECHECK_MS;
    const mine = (hold: Hold) => { if (track.id === id) { track.hold = hold; track.phase = "lacak"; } };
    // Someone just answered, still standing there or back again: show that, do not ask again.
    const known = state.remembered.find(item => item.hold.until > performance.now() && cosine(item.embedding, embedding) >= SAME_PERSON);
    if (known) { mine(known.hold); return; }
    const until = (ms: number) => performance.now() + ms;
    try {
      const { blob, mime } = await cropSelfie(still, box);
      const answer = await client.identify(sessionId, { embedding, frameEmbeddings: frames, signals, mime, size: blob.size });
      if (state.stopped) return;
      if (answer.kind === "tidak-dikenali") {
        const hold: Hold = { until: until(HOLD_UNKNOWN_MS), tone: "bad", label: "Belum dikenali" };
        remember(embedding, hold); mine(hold);
        show({ tone: "bad", title: "Wajah belum dikenali", text: "Scan QR di ruang, atau lapor panitia." });
      } else if (answer.kind === "sudah") {
        const hold: Hold = { until: until(HOLD_MS), tone: "good", label: answer.person.name };
        remember(embedding, hold); mine(hold);
        show({ tone: "good", title: answer.person.name, text: `Sudah tercatat hadir ${clock(answer.checkedInAt)}` });
      } else if (answer.kind === "belum-setuju") {
        const hold: Hold = { until: until(HOLD_MS), tone: "warn", label: answer.person.name };
        remember(embedding, hold); mine(hold);
        show({ tone: "warn", title: `${answer.person.name} belum bisa absen wajah`, text: "Setujui dulu sekali lewat Absen pakai wajah di HP, atau scan QR." });
      } else {
        const chosen = answer.kind === "cocok" ? answer.candidate : await ask(answer.candidates, blob);
        if (state.stopped) return;
        if (!chosen) { const hold: Hold = { until: until(HOLD_UNKNOWN_MS), tone: "bad", label: "Tidak dicatat" }; remember(embedding, hold); mine(hold); return; }
        const done = await client.record(sessionId, chosen, blob, mime);
        if (state.stopped) return;
        setPresent(done.present);
        const hold: Hold = { until: until(HOLD_MS), tone: "good", label: done.person.name };
        remember(embedding, hold); mine(hold);
        show({ tone: "good", title: done.person.name, text: done.kind === "tercatat" ? `Tercatat hadir ${clock(done.checkedInAt)}` : `Sudah tercatat hadir ${clock(done.checkedInAt)}` });
        if (done.kind === "tercatat") {
          setRecent(list => [{ key: `${done.person.employeeId}-${done.checkedInAt}`, name: done.person.name, department: done.person.department, at: done.checkedInAt, tone: answer.kind === "konfirmasi" ? "warn" as const : "good" as const }, ...list].slice(0, 8));
        }
      }
    } catch (error) {
      mine({ until: until(4000), tone: "bad", label: "Coba lagi" });
      show({ tone: "bad", title: "Belum tercatat", text: errorText(error) });
    } finally {
      if (track.id === id && track.phase === "kirim") track.phase = "lacak";
      track.steady = 0;
    }
  }

  /** A close call: panitia picks who it is, or nobody. The camera waits meanwhile; the next close call waits its turn. */
  function ask(candidates: KioskCandidate[], blob: Blob): Promise<KioskCandidate | null> {
    const state = live.current;
    const turn = state.asking.then(() => state.stopped ? null : new Promise<KioskCandidate | null>(resolve => {
      state.paused = true;
      const photoUrl = URL.createObjectURL(blob);
      setConfirm({ candidates, photoUrl });
      chime(state.sound ? state.audio : null, "warn");
      const timer = window.setTimeout(() => finish(null), 30_000);
      function finish(choice: KioskCandidate | null) {
        window.clearTimeout(timer);
        state.resolveConfirm = null; state.paused = false;
        setConfirm(null);
        URL.revokeObjectURL(photoUrl);
        resolve(choice);
      }
      state.resolveConfirm = finish;
    }));
    state.asking = turn.catch(() => null);
    return turn;
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
        {fullAvailable && <button type="button" className={css.icon} onClick={() => full ? leaveFullscreen() : enterFullscreen()} aria-pressed={full} aria-label={full ? "Keluar dari layar penuh" : "Layar penuh"}>
          {full ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
        </button>}
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
        {banners.length
          ? <ol className={css.banners} role="status">{banners.map(banner => <li key={banner.id} className={`${css.banner} ${css[banner.tone]} ${banners.length > 1 ? css.compact : ""}`}>
            <span className={css.bannerIcon}>{banner.tone === "good" ? <CheckCircle2 aria-hidden /> : banner.tone === "warn" ? <AlertTriangle aria-hidden /> : <XCircle aria-hidden />}</span>
            <span><strong>{banner.title}</strong><span>{banner.text}</span></span>
          </li>)}</ol>
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
