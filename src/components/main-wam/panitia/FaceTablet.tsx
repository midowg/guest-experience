"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CameraOff, ChevronDown, CircleCheck, Clock, LogOut, Maximize, Minimize, ScanFace, Search, SwitchCamera, WifiOff } from "lucide-react";
import { loadFaceEngine, MIN_EYE_DISTANCE, MIN_SHARPNESS, type FaceEngine, type FaceReading } from "@/components/hr/faceEngine";
import { useLang, useT } from "@/components/main-wam/i18n";
import { Avatar, Banner, Button, Segmented, Sheet, SrOnly, Text, TextField, useToast } from "@/components/main-wam/ui";
import { average, cosine } from "@/lib/hr/face-match";
import { clock as formatClock } from "@/lib/main-wam/i18n";
import { searchAttendees, splitAttendance, type AttendeeRow } from "@/lib/main-wam/panitia/attendance";
import {
  addToFaceQueue, faceProblem, FACE_QUEUE_KEY, matchSpots, pushRecent, readFaceQueue, recall, spotOf, STILL_SAME, TABLET_MAX_FACES, TABLET_TIMING, windowOf,
  type QueuedFace, type RecentEntry, type Remembered, type Spot, type TabletAnswer, type TabletData, type TabletFaceAnswer, type TabletRequest, type TabletRole, type WindowState,
} from "@/lib/main-wam/panitia/face-tablet";
import { wibTime } from "@/lib/main-wam/rundown";
import { mainWamApi } from "@/lib/routes";
import { errorText, PanitiaError, panitiaRequest, useOnline, usePanitiaApi, useLiveRefresh } from "./api";
import { canFullscreen, enterFullscreen, fullscreenOn, leaveFullscreen } from "./fullscreen";
import css from "./face-tablet.module.css";

/*
 * Absen mode tablet (KONTRAK §9 #39): face check-in on panitia's tablet, full screen, landscape (it
 * also works upright and on a phone). The camera stays on and follows every face (up to six) with
 * corner brackets; a face that looks at the tablet, near enough and sharp, is turned into SFace's
 * numbers here (two looks, averaged) and only the numbers go to the server, which says who it is and
 * records the check-in. Gold brackets and a name: recognised; grey brackets: not recognised. A face
 * just answered is not sent again for a while; its box keeps the answer while it stays, and starts
 * over if someone else steps into the same place. Without signal the numbers wait on the tablet
 * ("antre") and go out when it returns. "Catat manual" is the existing manual check-in. There is no
 * liveness check in this mode (the intro says so).
 */

export type TabletEngine = Pick<FaceEngine, "readAll" | "embed">;
export type FaceTabletClient = { identify(input: TabletRequest): Promise<TabletAnswer> };
export const serverFaceClient: FaceTabletClient = { identify: input => panitiaRequest<TabletAnswer>(mainWamApi.attendanceFace, { method: "POST", json: input }) };

type Props = {
  data: TabletData;
  /** Where "Selesai" goes (Absen sesi). */
  backHref: string;
  client?: FaceTabletClient;
  /** Tests and the preview give their own engine and camera. */
  loadEngine?: () => Promise<TabletEngine>;
  getStream?: (facing: "user" | "environment") => Promise<MediaStream>;
  /** Preview only: start without the tap (the camera is a drawn one). */
  autoStart?: boolean;
  /** Preview only: this is a sample, nothing is saved. */
  sample?: boolean;
};

const TICK_MS = 130;
/** Looks that are good in a row before a face is read, the embeddings averaged per face, and the looks spent before giving up. */
const STEADY = 2;
const READ_FRAMES = 2;
const MAX_LOOKS = 10;
/** Turned more than this many degrees is not looking at the tablet. */
const MAX_YAW = 30;
/** Two embeddings of one reading must agree, else it starts over (a face moved, two faces swapped). */
const READING_AGREES = 0.6;
const QUALITY = { minEyePx: MIN_EYE_DISTANCE, maxYaw: MAX_YAW };

type Tone = "lacak" | "baca" | "kenal" | "asing" | "antre";
type Shown = { tone: Tone; label: string; check: boolean; hint: "unknown" | "unsure" | null };
type Held = { shown: Shown; until: number };
type Track = Spot & {
  id: number; seen: number; look: FaceReading | null; phase: "lacak" | "baca" | "kirim";
  steady: number; looks: number; pending: number; frames: number[][];
  held: Held | null; embedding: number[] | null; checkAt: number; checking: boolean;
};
type DrawnFace = { id: number; left: number; top: number; width: number; height: number; tone: Tone; label: string; check: boolean; hint: Shown["hint"] };
type Pending = { track: Track; id: number; embedding: number[] };

type ProblemKind = "denied" | "none" | "busy" | "unsupported" | "failed";
class CameraProblem extends Error { constructor(public kind: ProblemKind) { super(kind); } }
const problemOf = (error: unknown): ProblemKind => {
  if (error instanceof CameraProblem) return error.kind;
  const name = error instanceof DOMException ? error.name : "";
  return name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "none" : name === "NotReadableError" ? "busy" : "failed";
};

/** Worth keeping the faces and trying again: no signal, the server busy or slow, or too many calls. A refusal of ours is not. */
const retryable = (error: unknown) => !(error instanceof PanitiaError) || error.status === 0 || error.status === 429 || error.status >= 500;

const faceKey = (face: QueuedFace) => `${face.sessionId}|${face.seenAt}|${face.embedding[0]}|${face.embedding[1]}`;
const loadQueue = (): QueuedFace[] => { try { return readFaceQueue(window.localStorage.getItem(FACE_QUEUE_KEY), new Date()); } catch { return []; } };
const saveQueue = (queue: readonly QueuedFace[]) => {
  try { if (queue.length) window.localStorage.setItem(FACE_QUEUE_KEY, JSON.stringify(queue)); else window.localStorage.removeItem(FACE_QUEUE_KEY); } catch { /* private mode: they live on this screen only */ }
};

/** The picture of this moment for the face model (a canvas copy, as the model runs one face after another); the video itself where a canvas is not available. */
function snapshot(video: HTMLVideoElement): CanvasImageSource {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return video;
    context.drawImage(video, 0, 0);
    return canvas;
  } catch { return video; }
}

const defaultStream = (facing: "user" | "environment") => {
  if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new CameraProblem("unsupported"));
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
};

export function FaceTablet({ data, backHref, client = serverFaceClient, loadEngine = () => loadFaceEngine({ faces: TABLET_MAX_FACES }), getStream = defaultStream, autoStart = false, sample: isSample = false }: Props) {
  const t = useT();
  const { lang } = useLang();
  const api = usePanitiaApi();
  const toast = useToast();
  const online = useOnline();
  const video = useRef<HTMLVideoElement>(null);
  const offset = useRef(Date.parse(data.now) - Date.now());
  const [sessionId, setSessionId] = useState(data.sessionId);
  const [rows, setRows] = useState<AttendeeRow[]>(data.rows);
  const [counts, setCounts] = useState(() => ({ present: data.rows.filter(row => row.checkedInAt).length, total: data.rows.length }));
  const [now, setNow] = useState(() => Date.parse(data.now));
  const [override, setOverride] = useState<{ sessionId: string; state: WindowState } | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<ProblemKind | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [faces, setFaces] = useState<DrawnFace[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  // What waits on the tablet from before. It is only drawn once the camera runs, so the server's empty first draw agrees with this.
  const [queue, setQueue] = useState<QueuedFace[]>(() => (typeof window === "undefined" ? [] : loadQueue()));
  const [noFaces, setNoFaces] = useState(data.enrolled === 0);
  const [announce, setAnnounce] = useState("");
  const [full, setFull] = useState(false);
  const [fullAvailable, setFullAvailable] = useState(false);
  const [picking, setPicking] = useState(false);
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const live = useRef({
    stream: null as MediaStream | null, engine: null as TabletEngine | null, timer: 0, stopped: true, facing: "user" as "user" | "environment",
    tracks: [] as Track[], nextId: 1, remembered: [] as Remembered<Held>[], outbox: [] as Pending[], inflight: false, sendTimer: 0,
    /** One embedding at a time (the face model runs one picture at a time). */
    queue: Promise.resolve() as Promise<unknown>,
    lock: null as { release(): Promise<void> } | null,
    sessionId: data.sessionId, open: false, flushing: false, starting: false,
  });

  const session = data.sessions.find(item => item.id === sessionId) ?? null;
  const computed: WindowState = session ? windowOf(session, new Date(now)) : "belum";
  const state: WindowState = override && override.sessionId === sessionId ? override.state : computed;
  const open = state === "buka";
  useEffect(() => { live.current.open = open; live.current.sessionId = sessionId; }, [open, sessionId]);
  const clockOf = (iso: string) => formatClock(lang, wibTime(iso));

  // The tablet's own clock may be off: the server's time at load plus the time since.
  useEffect(() => {
    offset.current = Date.parse(data.now) - Date.now();
    const timer = window.setInterval(() => { setNow(Date.now() + offset.current); setOverride(null); }, 15_000);
    return () => window.clearInterval(timer);
  }, [data.now]);

  useEffect(() => {
    const follow = () => { setFull(fullscreenOn()); setFullAvailable(canFullscreen()); };
    follow();
    document.addEventListener("fullscreenchange", follow);
    document.addEventListener("webkitfullscreenchange", follow);
    return () => { document.removeEventListener("fullscreenchange", follow); document.removeEventListener("webkitfullscreenchange", follow); };
  }, []);

  function stopCamera() {
    const s = live.current;
    window.clearTimeout(s.timer);
    window.clearTimeout(s.sendTimer);
    s.stream?.getTracks().forEach(track => track.stop());
    s.stream = null;
    s.lock?.release().catch(() => undefined);
    s.lock = null;
  }
  useEffect(() => () => { live.current.stopped = true; stopCamera(); leaveFullscreen(); }, []);

  /* ── The count and the list of people ────────────────────────────────────────────────────── */
  const poll = useCallback(() => {
    if (!sessionId) return;
    api.attendance(sessionId).then(answer => { setRows(answer.rows); setCounts({ present: answer.rows.filter(row => row.checkedInAt).length, total: answer.rows.length }); }, () => undefined);
  }, [api, sessionId]);
  useLiveRefresh(poll, 20_000, !running || manual);

  const markPresent = (id: string, at: string) => setRows(list => list.map(row => (row.id === id && !row.checkedInAt ? { ...row, checkedInAt: at, method: "manual" } : row)));

  /* ── Answers ─────────────────────────────────────────────────────────────────────────────── */
  const personLabel = (name: string, role: TabletRole) => (role === "bod" ? `${name} · ${t("tablet.role.bod")}` : name);

  /** What the box of a face shows for the server's answer, and how long it is not asked again. */
  function shownFor(answer: TabletFaceAnswer): { held: Held; said?: string; recent?: RecentEntry } {
    const at = performance.now();
    switch (answer.kind) {
      case "dikenali": {
        const { person } = answer;
        const label = answer.already && person.role !== "bod" ? t("tablet.box.already", { name: person.name }) : personLabel(person.name, person.role);
        const said = person.role === "bod" ? t("tablet.live.bod", { name: person.name }) : answer.recorded ? t("tablet.live.recorded", { name: person.name }) : t("tablet.live.already", { name: person.name });
        const entry = answer.recorded && answer.checkedInAt ? { key: person.employeeId, name: person.name, role: person.role, at: answer.checkedInAt, queued: false, photo: person.photo } : undefined;
        return { held: { shown: { tone: "kenal", label, check: true, hint: null }, until: at + TABLET_TIMING.holdKnown }, said, recent: entry };
      }
      case "ragu": return { held: { shown: { tone: "asing", label: t("tablet.box.unsure"), check: false, hint: "unsure" }, until: at + TABLET_TIMING.holdUnknown } };
      case "belum-terdaftar": return { held: { shown: { tone: "asing", label: t("tablet.box.notEnrolled"), check: false, hint: "unknown" }, until: at + TABLET_TIMING.holdUnknown } };
      case "di-luar-jam": return { held: { shown: { tone: "asing", label: t(answer.window === "belum" ? "tablet.window.belum" : "tablet.window.tutup"), check: false, hint: null }, until: at + TABLET_TIMING.holdUnknown } };
      default: return { held: { shown: { tone: "asing", label: t("tablet.box.unknown"), check: false, hint: "unknown" }, until: at + TABLET_TIMING.holdUnknown } };
    }
  }

  function remember(embedding: number[], held: Held) {
    const s = live.current;
    const at = performance.now();
    s.remembered = [...s.remembered.filter(item => item.until > at), { embedding, until: held.until, value: held }].slice(-60);
  }

  /** The server's answers for a batch of faces taken from the camera. */
  function apply(batch: Pending[], answer: TabletAnswer, sentFor: string) {
    const s = live.current;
    if (s.sessionId !== sentFor) return;
    setCounts(c => ({ present: answer.present, total: answer.total || c.total }));
    batch.forEach((item, index) => {
      const result = answer.faces[index] ?? { kind: "tidak-dikenali" as const };
      if (result.kind === "di-luar-jam") setOverride({ sessionId: sentFor, state: result.window });
      if (result.kind === "belum-terdaftar") setNoFaces(true);
      const { held, said, recent: entry } = shownFor(result);
      if (result.kind === "dikenali" && result.person.role !== "bod") markPresent(result.person.employeeId, result.checkedInAt ?? new Date().toISOString());
      if (entry) setRecent(list => pushRecent(list, entry));
      if (said) setAnnounce(said);
      if (item.track.id === item.id) {
        item.track.held = held; item.track.phase = "lacak"; item.track.steady = 0;
        if (result.kind === "dikenali") remember(item.embedding, held);
      }
    });
  }

  /** Keeps the faces on the tablet until there is signal. */
  function keepForLater(batch: Pending[], sentFor: string) {
    const at = new Date().toISOString();
    let next = loadQueue();
    for (const item of batch) next = addToFaceQueue(next, { sessionId: sentFor, embedding: item.embedding, seenAt: at });
    saveQueue(next);
    setQueue(next);
    const held: Held = { shown: { tone: "antre", label: t("tablet.box.queued"), check: false, hint: null }, until: performance.now() + TABLET_TIMING.holdKnown };
    for (const item of batch) if (item.track.id === item.id) { item.track.held = held; item.track.phase = "lacak"; item.track.steady = 0; remember(item.embedding, held); }
  }

  async function send(batch: Pending[]) {
    const s = live.current;
    const sentFor = s.sessionId;
    if (!sentFor) return;
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new PanitiaError("", 0);
      const answer = await client.identify({ sessionId: sentFor, faces: batch.map(item => ({ embedding: item.embedding })) });
      if (!s.stopped) apply(batch, answer, sentFor);
    } catch (error) {
      if (s.stopped) return;
      if (retryable(error)) keepForLater(batch, sentFor);
      else {
        toast.show({ text: t("tablet.error.send"), sub: errorText(error), tone: "error" });
        const held: Held = { shown: { tone: "asing", label: t("tablet.box.unknown"), check: false, hint: "unknown" }, until: performance.now() + TABLET_TIMING.holdUnknown };
        for (const item of batch) if (item.track.id === item.id) { item.track.held = held; item.track.phase = "lacak"; item.track.steady = 0; }
      }
    }
  }

  function pump() {
    const s = live.current;
    if (s.inflight || s.sendTimer || !s.outbox.length || s.stopped) return;
    // A short pause gathers the faces that finished reading together into one call.
    s.sendTimer = window.setTimeout(() => {
      s.sendTimer = 0;
      const batch = s.outbox.splice(0, TABLET_MAX_FACES);
      if (!batch.length) return;
      s.inflight = true;
      void send(batch).finally(() => { s.inflight = false; pump(); });
    }, TABLET_TIMING.batch);
  }

  /* ── The queue ───────────────────────────────────────────────────────────────────────────── */
  const flush = useCallback(async () => {
    const s = live.current;
    if (s.flushing || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    let waiting = loadQueue();
    if (!waiting.length) return;
    s.flushing = true;
    try {
      while (waiting.length) {
        const first = waiting[0].sessionId;
        const batch = waiting.filter(item => item.sessionId === first).slice(0, TABLET_MAX_FACES);
        try {
          const answer = await client.identify({ sessionId: first, faces: batch.map(item => ({ embedding: item.embedding, seenAt: item.seenAt })) });
          if (first === s.sessionId) {
            setCounts({ present: answer.present, total: answer.total });
            answer.faces.forEach(face => {
              if (face.kind !== "dikenali" || face.person.role === "bod") return;
              markPresent(face.person.employeeId, face.checkedInAt ?? new Date().toISOString());
              if (face.recorded && face.checkedInAt) setRecent(list => pushRecent(list, { key: face.person.employeeId, name: face.person.name, role: face.person.role, at: face.checkedInAt!, queued: false, photo: face.person.photo }));
            });
          }
        } catch (error) {
          // Our own refusal (the session is gone, the numbers are not a face's) will not change: the faces are dropped. Anything else waits.
          if (retryable(error)) break;
        }
        // What was sent (or refused for good) leaves the queue; what arrived meanwhile stays.
        const gone = new Set(batch.map(faceKey));
        waiting = loadQueue().filter(item => !gone.has(faceKey(item)));
        saveQueue(waiting);
        setQueue(waiting);
      }
    } finally { s.flushing = false; }
  }, [client]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (loadQueue().length) void flush(); }, 15_000);
    window.addEventListener("online", flush);
    void flush();
    return () => { window.clearInterval(timer); window.removeEventListener("online", flush); };
  }, [flush]);

  /* ── The camera loop ─────────────────────────────────────────────────────────────────────── */
  function embedAt(source: CanvasImageSource, points: NonNullable<FaceReading["points"]>) {
    const s = live.current;
    const run = s.queue.then(() => s.engine!.embed(source, points));
    s.queue = run.catch(() => undefined);
    return run;
  }

  /** Where a face's box goes on the screen: the whole picture fits the stage (contain, so no face is ever cut off), mirrored for the front camera. */
  function place(box: NonNullable<FaceReading["box"]>, element: HTMLVideoElement) {
    const width = element.clientWidth, height = element.clientHeight;
    const scale = Math.min(width / element.videoWidth, height / element.videoHeight);
    const dx = (width - element.videoWidth * scale) / 2, dy = (height - element.videoHeight * scale) / 2;
    const x = live.current.facing === "user" ? 1 - box.x - box.width : box.x;
    return { left: dx + x * element.videoWidth * scale, top: dy + box.y * element.videoHeight * scale, width: box.width * element.videoWidth * scale, height: box.height * element.videoHeight * scale };
  }

  /** A face that turned out to be someone else: a fresh box, nothing carried over. */
  function renew(track: Track) {
    Object.assign(track, { id: live.current.nextId++, steady: 0, looks: 0, pending: 0, frames: [], held: null, phase: "lacak", embedding: null, checking: false });
  }

  function tick() {
    const s = live.current;
    const element = video.current;
    if (s.stopped || !element || !s.engine) return;
    if (element.readyState >= 2 && element.videoWidth) {
      if (!s.open) {
        if (s.tracks.length) { s.tracks = []; s.outbox = []; setFaces([]); }
      } else {
        const t0 = performance.now();
        const looks = s.engine.readAll(element, t0).filter(look => look.box && look.points);
        const shorter = Math.min(element.videoWidth, element.videoHeight);
        const spots = looks.map(look => spotOf(look.box!));
        const matched = matchSpots(s.tracks, spots);
        for (const track of s.tracks) track.look = null;
        looks.forEach((look, i) => {
          const track = matched[i] >= 0 ? s.tracks[matched[i]] : (() => {
            const fresh: Track = { ...spots[i], id: s.nextId++, seen: t0, look: null, phase: "lacak", steady: 0, looks: 0, pending: 0, frames: [], held: null, embedding: null, checkAt: 0, checking: false };
            s.tracks.push(fresh);
            return fresh;
          })();
          Object.assign(track, spots[i], { seen: t0, look });
        });
        // A face out of sight takes its box and its answer with it.
        s.tracks = s.tracks.filter(track => track.look || t0 - track.seen < TABLET_TIMING.lost);

        let snap: CanvasImageSource | null = null;
        const picture = () => (snap ??= snapshot(element));
        for (const track of s.tracks) {
          const look = track.look;
          if (!look) continue;
          if (track.held && track.held.until < t0) { track.held = null; if (track.phase === "lacak") track.embedding = null; }
          const issue = faceProblem(look, shorter, QUALITY);
          // Still the person this box was answered as?
          if (track.embedding && track.held && !track.checking && t0 >= track.checkAt && !issue) {
            track.checking = true;
            const id = track.id, known = track.embedding;
            void embedAt(picture(), look.points!).then(({ embedding }) => {
              if (track.id === id && cosine(embedding, known) < STILL_SAME) renew(track);
            }).catch(() => undefined).finally(() => { if (track.id === id) { track.checking = false; track.checkAt = performance.now() + TABLET_TIMING.recheck; } });
          }
          if (track.phase === "baca") readLook(track, look, picture, issue);
          else if (track.phase === "lacak" && !track.held) {
            if (issue) track.steady = 0;
            else if ((track.steady += 1) >= STEADY) { track.phase = "baca"; track.looks = 0; track.frames = []; }
          }
        }

        setFaces(s.tracks.filter(track => track.look).map(track => {
          const look = track.look!;
          const issue = faceProblem(look, shorter, QUALITY);
          const shown: Shown = track.held?.shown ?? (track.phase !== "lacak" ? { tone: "baca", label: t("tablet.box.reading"), check: false, hint: null }
            : issue ? { tone: "lacak", label: t(issue === "dekat" ? "tablet.box.near" : "tablet.box.face"), check: false, hint: null } : { tone: "baca", label: t("tablet.box.reading"), check: false, hint: null });
          return { id: track.id, ...place(look.box!, element), ...shown };
        }));
      }
    }
    s.timer = window.setTimeout(tick, TICK_MS);
  }

  /** One look while reading: a sharp embedding goes into the track; with enough of them that agree, the face is ready. */
  function readLook(track: Track, look: FaceReading, picture: () => CanvasImageSource, issue: ReturnType<typeof faceProblem>) {
    if (track.frames.length >= READ_FRAMES) { finish(track); return; }
    // Turned away or too far in the middle of a reading, or too many looks without two sharp ones: start over.
    if (issue || (track.looks >= MAX_LOOKS && track.pending === 0)) { track.phase = "lacak"; track.steady = 0; track.frames = []; return; }
    if (track.pending > 0) return;
    track.looks += 1;
    track.pending += 1;
    const id = track.id;
    void embedAt(picture(), look.points!).then(({ embedding, sharpness }) => {
      if (track.id !== id || sharpness < MIN_SHARPNESS) return;
      if (track.frames.length && cosine(track.frames[0], embedding) < READING_AGREES) track.frames = [];
      track.frames.push(embedding);
    }).catch(() => undefined).finally(() => { if (track.id === id) track.pending -= 1; });
  }

  /** The reading is done: a face just answered takes that answer, any other goes to the server. */
  function finish(track: Track) {
    const s = live.current;
    const embedding = average(track.frames);
    track.frames = [];
    track.embedding = embedding; track.checkAt = performance.now() + TABLET_TIMING.recheck;
    const known = recall(s.remembered, embedding, performance.now());
    if (known) { track.held = { shown: known.value.shown, until: known.until }; track.phase = "lacak"; return; }
    track.phase = "kirim";
    s.outbox.push({ track, id: track.id, embedding });
    pump();
  }

  async function start(camera = facing) {
    const s = live.current;
    // One start at a time (a double tap, or the preview's effect running twice).
    if (s.starting) return;
    s.starting = true;
    setProblem(null); setStarting(true);
    // Full screen while the tap still counts (a tablet at the door shows nothing else).
    enterFullscreen();
    try {
      const [engine, stream] = await Promise.all([loadEngine(), getStream(camera)]);
      stopCamera();
      s.stream = stream; s.engine = engine; s.facing = camera; s.stopped = false; s.tracks = []; s.outbox = []; s.inflight = false;
      setRunning(true);
      for (let i = 0; i < 20 && !video.current; i += 1) await new Promise(resolve => requestAnimationFrame(resolve));
      if (!video.current) { stream.getTracks().forEach(track => track.stop()); return; }
      video.current.srcObject = stream;
      // A play() that a newer load interrupted is not a failure: the newer one plays.
      await video.current.play().catch(error => { if (!(error instanceof DOMException && error.name === "AbortError")) throw error; });
      const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
      s.lock = await wakeLock?.request("screen").catch(() => null) ?? null;
      tick();
    } catch (error) {
      stopCamera(); setRunning(false); leaveFullscreen();
      setProblem(problemOf(error));
    } finally {
      s.starting = false;
      setStarting(false);
    }
  }
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => { if (autoStart) void startRef.current(); }, [autoStart]);

  function switchCamera() {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    if (running) void start(next);
  }

  function chooseSession(id: string) {
    setPicking(false);
    if (id === sessionId) return;
    const s = live.current;
    s.tracks = []; s.outbox = []; s.remembered = [];
    s.sessionId = id;
    setSessionId(id); setOverride(null); setRecent([]); setFaces([]);
    api.attendance(id).then(answer => { setRows(answer.rows); setCounts({ present: answer.rows.filter(row => row.checkedInAt).length, total: answer.rows.length }); }, () => setRows([]));
  }

  async function record(person: AttendeeRow) {
    if (!sessionId) return;
    setBusy(person.id);
    try {
      const answer = await api.setPresent(sessionId, { employeeId: person.id, present: true });
      setRows(answer.rows);
      setCounts({ present: answer.rows.filter(row => row.checkedInAt).length, total: answer.rows.length });
      setRecent(list => pushRecent(list, { key: person.id, name: person.name, role: null, at: new Date().toISOString(), queued: false, photo: person.photo }));
      toast.show({ text: t("tablet.manual.toast", { name: person.name }), tone: "success" });
      setAnnounce(t("tablet.live.recorded", { name: person.name }));
    } catch (error) {
      toast.show({ text: errorText(error), tone: "error" });
    } finally { setBusy(null); }
  }

  /* ── What is drawn ───────────────────────────────────────────────────────────────────────── */
  const { absent } = useMemo(() => splitAttendance(rows), [rows]);
  const matches = useMemo(() => searchAttendees(query.trim() ? rows : absent, query), [rows, absent, query]);
  const percent = counts.total ? Math.round((counts.present / counts.total) * 100) : 0;
  const mirrored = facing === "user";
  const hintFace = faces.find(face => face.hint);
  const stripEntries: RecentEntry[] = [
    ...[...queue].reverse().filter(item => item.sessionId === sessionId).map((item, index) => ({ key: `q:${index}:${item.seenAt}`, name: t("tablet.recent.queuedName"), role: null, at: item.seenAt, queued: true, photo: null })),
    ...recent,
  ];
  const stateWord = (value: WindowState) => t(value === "buka" ? "tablet.session.open" : value === "tutup" ? "tablet.session.closed" : "tablet.session.notYet");
  const canRecord = open || state === "tutup";

  const problemText: Record<ProblemKind, [string, string]> = {
    denied: [t("tablet.problem.deniedTitle"), t("tablet.problem.deniedBody")],
    none: [t("tablet.problem.noneTitle"), t("tablet.problem.noneBody")],
    busy: [t("tablet.problem.busyTitle"), t("tablet.problem.busyBody")],
    unsupported: [t("tablet.problem.unsupportedTitle"), t("tablet.problem.unsupportedBody")],
    failed: [t("tablet.problem.failedTitle"), t("tablet.problem.failedBody")],
  };

  const picker = <button type="button" className={css.sessionButton} onClick={() => setPicking(true)} aria-haspopup="dialog" disabled={!data.sessions.length}>
    <span className={css.sessionText}>
      <strong>{session?.title ?? t("tablet.session.none")}</strong>
      {session && <small>{session.day} · {session.time} · {stateWord(state)}</small>}
    </span>
    <ChevronDown aria-hidden />
  </button>;

  const manualButton = <Button variant="primary" icon={Search} block onClick={() => setManual(true)} disabled={!sessionId}>{t("tablet.panel.manual")}</Button>;

  const sheets = <>
    <Sheet open={picking} onClose={() => setPicking(false)} title={t("tablet.session.pick")} history={false}>
      <ul className={css.sessionList}>
        {data.sessions.map(option => {
          const optionState = windowOf(option, new Date(now));
          return <li key={option.id}>
            <button type="button" className={css.sessionOption} aria-current={option.id === sessionId ? "true" : undefined} onClick={() => chooseSession(option.id)}>
              <span className={css.sessionText}><strong>{option.title}</strong><small>{option.day} · {option.time} · {stateWord(optionState)}</small></span>
              {option.id === sessionId && <CircleCheck aria-hidden />}
            </button>
          </li>;
        })}
      </ul>
    </Sheet>
    <Sheet open={manual} onClose={() => setManual(false)} title={t("tablet.manual.title")} history={false}>
      <div className={css.manual}>
        <Text variant="body-small" color="2">{t("tablet.manual.lead")}</Text>
        <TextField label={<SrOnly>{t("tablet.manual.search")}</SrOnly>} search icon={<Search />} placeholder={t("tablet.manual.search")} value={query} onChange={event => setQuery(event.target.value)} type="search" autoComplete="off" />
        {!canRecord && <Text variant="caption" color="2">{t("tablet.manual.notOpen")}</Text>}
        {matches.length > 0
          ? <ul className={css.people}>
            {matches.slice(0, 40).map(person => <li key={person.id}>
              <Avatar name={person.name} photo={person.photo} />
              <span className={css.sessionText}><strong>{person.name}</strong><small>{person.department}</small></span>
              {person.checkedInAt
                ? <span className={css.in}><CircleCheck aria-hidden /> {t("tablet.manual.present")}</span>
                : <Button variant="secondary" size="m" loading={busy === person.id} disabled={!canRecord || (busy !== null && busy !== person.id)} onClick={() => void record(person)} aria-label={t("tablet.manual.recordAria", { name: person.name })}>{t("tablet.manual.record")}</Button>}
            </li>)}
          </ul>
          : <Text variant="body" color="2">{query.trim() ? t("tablet.manual.none") : t("tablet.manual.allIn")}</Text>}
        {matches.length > 40 && <Text variant="caption" color="2">{t("tablet.manual.more")}</Text>}
      </div>
    </Sheet>
  </>;

  /* ── Before the camera runs ──────────────────────────────────────────────────────────────── */
  if (!running) {
    return <div className={css.tablet} data-sample={isSample || undefined}>
      <div className={css.intro}>
        <div className={css.card}>
          <span className={css.kicker}><ScanFace aria-hidden /> {t("tablet.kicker")}</span>
          <h1 className={css.title}>{t("tablet.title")}</h1>
          <p className={css.lead}>{t("tablet.intro.lead")}</p>
          <p className={css.phone} role="note"><strong>{t("tablet.intro.phoneTitle")}.</strong> {t("tablet.intro.phoneBody")}</p>
          {data.sessions.length ? <>
            {picker}
            <dl className={css.stats}>
              <div><dt>{t("tablet.intro.enrolled")}</dt><dd>{t("tablet.intro.enrolledOf", { n: data.enrolled, total: counts.total })}</dd></div>
              <div><dt>{t("tablet.panel.present")}</dt><dd>{t("tablet.intro.enrolledOf", { n: counts.present, total: counts.total })}</dd></div>
            </dl>
            <Segmented<"user" | "environment"> label={t("tablet.camera.label")} value={facing} onChange={setFacing}
              options={[{ value: "user", label: t("tablet.camera.front") }, { value: "environment", label: t("tablet.camera.back") }]} />
          </> : <Banner tone="info" title={t("tablet.session.none")}>{t("tablet.session.noneSub")}</Banner>}
          {problem && <div role="alert" className={css.problem}>
            <CameraOff aria-hidden />
            <div><strong>{problemText[problem][0]}</strong><p>{problemText[problem][1]}</p></div>
          </div>}
          {state !== "buka" && session && <p className={css.note} role="status"><Clock aria-hidden /> {state === "belum" ? t("tablet.window.belum") : t("tablet.window.tutup")}. {t(state === "belum" ? "tablet.window.belumSub" : "tablet.window.tutupSub", { time: clockOf(state === "belum" ? session.opens : session.closes) })}</p>}
          <div className={css.actions}>
            {sessionId && <Button variant="primary" icon={problem ? undefined : ScanFace} loading={starting} loadingLabel={t("tablet.intro.starting")} onClick={() => void start()}>{problem ? t("tablet.problem.retry") : t("tablet.intro.start")}</Button>}
            {problem && sessionId && <Button variant="secondary" icon={Search} onClick={() => setManual(true)}>{t("tablet.panel.manual")}</Button>}
          </div>
          <ul className={css.limits} aria-label={t("tablet.intro.limitsTitle")}>
            {(["liveness", "privacy", "manual", "unsure"] as const).map(key => <li key={key}>{t(`tablet.limit.${key}` as "tablet.limit.liveness")}</li>)}
          </ul>
          {isSample && <p className={css.note} role="note">{t("tablet.demo")}</p>}
          <Button variant="text" href={backHref}>{t("tablet.intro.back")}</Button>
        </div>
      </div>
      {sheets}
    </div>;
  }

  /* ── The camera runs ─────────────────────────────────────────────────────────────────────── */
  return <div className={css.tablet} data-sample={isSample || undefined}>
    <SrOnly><h1>{t("tablet.title")}</h1></SrOnly>
    <section className={css.stage} aria-label={t("tablet.stage")}>
      <video ref={video} className={mirrored ? css.mirror : undefined} muted playsInline aria-hidden />
      <div className={css.boxes} aria-hidden>
        {faces.map(face => <div key={face.id} className={`${css.box} ${css[face.tone]}`} style={{ transform: `translate(${face.left}px, ${face.top}px)`, width: face.width, height: face.height }}>
          <i /><i /><i /><i />
          <span className={css.label}>{face.check && <CircleCheck aria-hidden />}{face.label}</span>
        </div>)}
      </div>

      <div className={css.top}>{picker}</div>

      {state !== "buka" && session && <div className={css.cover} role="status">
        <Clock aria-hidden />
        <strong>{t(state === "belum" ? "tablet.window.belum" : "tablet.window.tutup")}</strong>
        <span>{t(state === "belum" ? "tablet.window.belumSub" : "tablet.window.tutupSub", { time: clockOf(state === "belum" ? session.opens : session.closes) })}</span>
      </div>}
      {state === "buka" && faces.length === 0 && <div className={css.idle} role="status"><ScanFace aria-hidden /> {t("tablet.hint.noFace")}</div>}
      {state === "buka" && hintFace && <div className={css.hint} role="status">
        <AlertTriangle aria-hidden /> {t(hintFace.hint === "unsure" ? "tablet.hint.unsure" : "tablet.hint.unknown")}
        <button type="button" className={css.hintButton} onClick={() => setManual(true)}>{t("tablet.panel.manual")}</button>
      </div>}
      {(!online) && <div className={css.offline} role="status"><WifiOff aria-hidden /><span><strong>{t("tablet.offline.title")}</strong> {t("tablet.offline.body")}</span></div>}
      {noFaces && state === "buka" && <div className={css.offline} role="status"><AlertTriangle aria-hidden /><span><strong>{t("tablet.problem.noFacesTitle")}</strong> {t("tablet.problem.noFacesBody")}</span></div>}

      <div className={css.strip} aria-label={t("tablet.recent.title")}>
        <h2>{t("tablet.recent.title")}</h2>
        {stripEntries.length
          ? <ol>{stripEntries.map(entry => <li key={entry.key} className={entry.queued ? css.queued : undefined}>
            <Avatar name={entry.queued ? "?" : entry.name} photo={entry.photo} size={32} />
            <span className={css.sessionText}><strong>{entry.name}{entry.role === "bod" ? ` · ${t("tablet.role.bod")}` : ""}</strong><small>{entry.queued ? t("tablet.recent.queued") : clockOf(entry.at)}</small></span>
          </li>)}</ol>
          : <p>{t("tablet.recent.empty")}</p>}
      </div>
    </section>

    <aside className={css.panel}>
      <div className={css.count}>
        <span className={css.cap}>{t("tablet.panel.present")}</span>
        <span className={css.big} aria-live="off"><strong>{counts.present}</strong> <small>{t("tablet.panel.of", { total: counts.total })}</small></span>
        <div className={css.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t("tablet.panel.present")}><span style={{ width: `${percent}%` }} /></div>
        <span className={css.caption}>{t("tablet.panel.percent", { percent, title: session?.title ?? "" })}</span>
        {queue.length > 0 && <span className={css.caption}><WifiOff aria-hidden /> {t("tablet.panel.queued", { n: queue.length })}</span>}
      </div>
      {manualButton}
      <div className={css.tools}>
        {fullAvailable && <Button variant="secondary" icon={full ? Minimize : Maximize} block onClick={() => (full ? leaveFullscreen() : enterFullscreen())} aria-pressed={full}>{t(full ? "tablet.panel.exitFullscreen" : "tablet.panel.fullscreen")}</Button>}
        <Button variant="secondary" icon={SwitchCamera} block onClick={switchCamera}>{t(facing === "user" ? "tablet.panel.cameraFront" : "tablet.panel.cameraBack")}</Button>
        <Button variant="text" icon={LogOut} block href={backHref}>{t("tablet.panel.stop")}</Button>
      </div>
      {isSample && <p className={css.note} role="note">{t("tablet.demo")}</p>}
    </aside>
    <SrOnly><span role="status" aria-live="polite">{announce}</span></SrOnly>
    {sheets}
  </div>;
}
