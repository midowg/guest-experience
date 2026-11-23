"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, QrCode, RotateCcw, ScanFace, X, XCircle } from "lucide-react";
import type { FaceBox, FaceEngine } from "@/components/hr/faceEngine";
import { CONSENT_VERSION, MAX_SELFIE_BYTES, SELFIE_SIDE } from "@/lib/hr/attendance";
import { copies } from "@/lib/hr/copy";
import { average, FACE_MATCH, matchPercent, sameFace } from "@/lib/hr/face-match";
import type { FrameSignal } from "@/lib/hr/liveness";
import type { FaceCheckInAnswer, FaceStartAnswer } from "@/lib/pra-wam/attendance";
import { encodeWithinLimit, type PhotoMime } from "@/lib/pra-wam/photo";
import { praWamApi, praWamPath } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "./api";
import { putFile, putProblem } from "./photoUpload";
import css from "./face-check-in.module.css";

/*
 * Absen pakai wajah (22 Nov 2026), in Detail sesi of a panitia's session, beside "Scan QR". A plain
 * camera (no oval, nothing taken by itself): the person presses "Ambil foto", which only works while
 * one face, near enough, looks straight at the camera (23 Nov). The frames around the
 * press become SFace's numbers on this phone, the photo goes to private storage, and the server
 * compares the numbers with the person's WG People face. Then the result: how alike, in percent
 * against the "batas cocok", the photo beside the WG People one, and what happened: hadir, hadir
 * waiting for panitia's look, or not alike (take again, or scan the QR).
 */

/** What the screen asks the server: step one, then the photo and the face (steps two and three). */
export type FaceClient = {
  start(sessionId: string): Promise<FaceStartAnswer>;
  send(sessionId: string, input: { token: string; blob: Blob; mime: PhotoMime; embedding: number[]; frameEmbeddings: number[][]; signals: FrameSignal[]; consent: boolean }): Promise<FaceCheckInAnswer>;
};

export const serverFaceClient: FaceClient = {
  async start(sessionId) { return (await praWamRequest<FaceStartAnswer>(praWamApi.faceCheckIn(sessionId), { method: "POST" })).data; },
  async send(sessionId, { token, blob, mime, embedding, frameEmbeddings, signals, consent }) {
    const upload = await praWamRequest<{ key: string; uploadUrl: string; token: string }>(praWamApi.faceCheckInPhoto(sessionId), { method: "POST", json: { token, mime, size: blob.size } });
    const problem = putProblem(await putFile(upload.data.uploadUrl, blob, mime));
    if (problem) throw new PraWamApiError(problem);
    return (await praWamRequest<FaceCheckInAnswer>(praWamApi.faceCheckInSubmit(sessionId), {
      method: "POST",
      json: { token, embedding, frameEmbeddings, signals, photo: { key: upload.data.key, mime, size: blob.size, token: upload.data.token }, ...(consent ? { consent: CONSENT_VERSION } : {}) },
    })).data;
  },
};

type Props = {
  sessionId: string;
  /** The check-in window is open now. */
  canTap: boolean;
  className?: string;
  /** /dev-preview only: answers without the server. */
  client?: FaceClient;
};

type Phase =
  | { kind: "siap" }
  | { kind: "kamera"; needsConsent: boolean }
  | { kind: "proses"; step: number }
  | { kind: "hasil"; answer: FaceCheckInAnswer }
  | { kind: "tanpa-wajah"; message: string }
  | { kind: "gagal"; message: string };

const TICK_MS = 120;
/** Frames kept before the press, for the server's check that they come from a camera. */
const KEEP_SIGNALS = 40;
const STEPS = ["Membaca wajah…", "Mengunggah foto…", "Mencocokkan dengan foto awal…"];
const THRESHOLD = matchPercent(FACE_MATCH.cocok);
const MIN_SHARPNESS = 20;
const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

/** How far the head may turn and still count as facing the camera, in degrees. */
export const FACING_YAW = 15;

/** What to fix, said under the camera; null when one face is well in view and looks at the camera. */
export function hintOf(faces: number, closeness: number, yaw: number | null): string | null {
  if (faces === 0) return "Arahkan wajahmu ke kamera";
  if (faces > 1) return "Pastikan hanya kamu yang terlihat";
  if (closeness < 0.08) return "Dekatkan wajah ke kamera";
  if (closeness > 0.42) return "Jauhkan sedikit wajahmu";
  if (yaw === null || Math.abs(yaw) > FACING_YAW) return "Hadapkan wajahmu lurus ke kamera";
  return null;
}

/** A square around the face in the still picture, 480 px, within 120 KB. */
async function cropSelfie(still: HTMLCanvasElement, box: FaceBox): Promise<{ blob: Blob; mime: PhotoMime }> {
  const width = still.width, height = still.height;
  const side = Math.min(width, height, Math.max(box.width * width, box.height * height) * 1.8);
  const cx = (box.x + box.width / 2) * width, cy = (box.y + box.height / 2) * height;
  const sx = Math.min(Math.max(0, cx - side / 2), width - side), sy = Math.min(Math.max(0, cy - side / 2), height - side);
  const canvas = document.createElement("canvas");
  canvas.width = SELFIE_SIDE; canvas.height = SELFIE_SIDE;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  context.drawImage(still, sx, sy, side, side, 0, 0, SELFIE_SIDE, SELFIE_SIDE);
  const { blob, mime } = await encodeWithinLimit((type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality)), MAX_SELFIE_BYTES);
  return { blob, mime };
}

function cameraProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Izin kamera ditolak. Izinkan kamera untuk situs ini, atau absen dengan scan QR.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Kamera depan tidak ditemukan. Absen dengan scan QR.";
  if (name === "NotReadableError") return "Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu, atau absen dengan scan QR.";
  return error instanceof PraWamApiError ? error.message : "Kamera atau pembaca wajah belum bisa dibuka. Coba lagi, atau absen dengan scan QR.";
}

/** The percent counting up once, unless motion is reduced. */
function useCountUp(target: number): number {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 900;
    let frame = 0;
    const started = performance.now();
    const run = (now: number) => {
      const share = duration ? Math.min(1, (now - started) / duration) : 1;
      setShown(Math.round(target * (1 - (1 - share) ** 3)));
      if (share < 1) frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

function Meter({ percent }: { percent: number }) {
  const shown = useCountUp(percent);
  const tone = percent >= THRESHOLD ? css.good : percent >= matchPercent(FACE_MATCH.perluCek) ? css.warn : css.bad;
  return <div className={css.meterBox}>
    <p className={css.score}><strong className={tone}>{shown}%</strong><span>kemiripan dengan foto awal</span></p>
    <div className={css.meter} role="meter" aria-label="Kemiripan wajah" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span className={`${css.fill} ${tone}`} style={{ width: `${shown}%` }} />
      <span className={css.mark} style={{ left: `${THRESHOLD}%` }} aria-hidden />
    </div>
    <p className={css.markLabel} style={{ paddingLeft: `calc(${THRESHOLD}% - 2.6rem)` }}>Batas cocok {THRESHOLD}%</p>
  </div>;
}

/** The result: what happened, how alike against the batas cocok, and the two photos. */
export function FaceResult({ answer, photoUrl, referenceUrl, onRetry, onDone }: { answer: FaceCheckInAnswer; photoUrl: string | null; referenceUrl: string | null; onRetry(): void; onDone(): void }) {
  const outcome = answer.kind === "tidak-cocok" ? { tone: css.bad, icon: <XCircle aria-hidden />, title: "Wajah belum cocok", text: "Belum tercatat. Cari tempat yang terang, lihat lurus ke kamera, lalu ambil ulang. Atau absen dengan scan QR." }
    : answer.kind === "sudah" ? { tone: css.good, icon: <CheckCircle2 aria-hidden />, title: "Kehadiranmu sudah tercatat", text: "Tidak perlu absen lagi untuk sesi ini." }
      : answer.status === "cocok" ? { tone: css.good, icon: <CheckCircle2 aria-hidden />, title: "Kamu tercatat hadir", text: "Wajahmu cocok dengan foto awal di WG People." }
        : { tone: css.warn, icon: <AlertTriangle aria-hidden />, title: "Tercatat, menunggu cek", text: "Wajahmu agak berbeda dari foto awal, jadi panitia akan melihat fotonya. Kamu tidak perlu absen lagi." };
  return <div className={css.body}>
    <span className={`${css.badge} ${outcome.tone}`}>{outcome.icon}</span>
    <h3 className={css.title} role="status">{outcome.title}</h3>
    <p className={css.text}>{outcome.text}</p>
    {answer.percent !== null && <Meter percent={answer.percent} />}
    {photoUrl && <div className={css.pair}>
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this browser */}
        <img src={photoUrl} alt="Foto absen" />
        <figcaption>Foto absen</figcaption>
      </figure>
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived storage address */}
        {referenceUrl ? <img src={referenceUrl} alt="Foto awal di WG People" /> : <span className={css.photoEmpty} />}
        <figcaption>Foto awal</figcaption>
      </figure>
    </div>}
    <div className={css.actions}>
      {answer.kind === "tidak-cocok"
        ? <>
          <button type="button" className="button button--primary" onClick={onRetry}><RotateCcw size={18} aria-hidden /> Ambil ulang</button>
          <a className="button button--secondary" href={praWamPath.scan}><QrCode size={18} aria-hidden /> Scan QR saja</a>
        </>
        : <button type="button" className="button button--primary" onClick={onDone}>Selesai</button>}
    </div>
  </div>;
}

export function FaceCheckIn({ sessionId, canTap, className, client = serverFaceClient }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const titleId = useId();
  const [phase, setPhase] = useState<Phase>({ kind: "siap" });
  const [hint, setHint] = useState<string | null>(null);
  /** One face, near enough, looking at the camera: only then can the photo be taken. */
  const [facing, setFacing] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const live = useRef({ stream: null as MediaStream | null, engine: null as FaceEngine | null, token: "", signals: [] as FrameSignal[], timer: 0, paused: false, closed: true, noteUntil: 0 });

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const stopCamera = () => {
    const state = live.current;
    window.clearTimeout(state.timer);
    state.stream?.getTracks().forEach(track => track.stop());
    state.stream = null;
  };
  useEffect(() => () => { live.current.closed = true; stopCamera(); }, []);

  /** Asks the server, opens the camera and the face reader, and follows the face until the press. */
  async function begin() {
    const state = live.current;
    state.closed = false;
    setHint(null); setFacing(false); state.noteUntil = 0; setEngineReady(false); setAgreed(false); setPhotoUrl(null);
    setPhase({ kind: "siap" });
    if (!dialog.current?.open) dialog.current?.showModal();
    try {
      const answer = await client.start(sessionId);
      if (state.closed) return;
      if (answer.kind === "sudah") { setRecorded(true); setPhase({ kind: "hasil", answer: { kind: "sudah", checkedInAt: answer.checkedInAt, method: answer.method, percent: null } }); return; }
      if (answer.kind === "tanpa-wajah") { setPhase({ kind: "tanpa-wajah", message: answer.message }); return; }
      state.token = answer.token;
      setReferenceUrl(answer.referenceUrl);
      setPhase({ kind: "kamera", needsConsent: answer.needsConsent });
      if (!navigator.mediaDevices?.getUserMedia) throw new PraWamApiError("Browser ini tidak bisa membuka kamera. Absen dengan scan QR.");
      const { loadFaceEngine } = await import("@/components/hr/faceEngine");
      const [engine, stream] = await Promise.all([
        loadFaceEngine(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 720 } }, audio: false }),
      ]);
      if (state.closed || !video.current) { stream.getTracks().forEach(track => track.stop()); return; }
      state.stream = stream; state.engine = engine; state.signals = []; state.paused = false;
      video.current.srcObject = stream;
      await video.current.play();
      setEngineReady(true);
      const tick = () => {
        if (state.closed || !video.current) return;
        if (!state.paused && video.current.readyState >= 2) {
          const look = engine.read(video.current, performance.now());
          if (look.signal) { state.signals.push(look.signal); if (state.signals.length > KEEP_SIGNALS) state.signals.shift(); }
          const problem = hintOf(look.faces, look.closeness, look.signal?.yaw ?? null);
          setFacing(problem === null);
          // A note from a failed press stays a moment before the live hint takes over again.
          if (performance.now() >= state.noteUntil) setHint(problem);
        }
        state.timer = window.setTimeout(tick, TICK_MS);
      };
      tick();
    } catch (problem) {
      stopCamera();
      if (!state.closed) setPhase({ kind: "gagal", message: problem instanceof DOMException ? cameraProblem(problem) : problem instanceof PraWamApiError ? problem.message : cameraProblem(problem) });
    }
  }

  /** The press: a few sharp looks at one face, the photo, then upload and compare. */
  async function shoot(needsConsent: boolean) {
    const state = live.current;
    const element = video.current;
    const engine = state.engine;
    if (!element || !engine) return;
    state.paused = true;
    const frames: number[][] = [];
    let still: HTMLCanvasElement | null = null;
    let box: FaceBox | null = null;
    for (let i = 0; i < 8 && frames.length < 3; i += 1) {
      const look = engine.read(element, performance.now());
      if (look.signal) state.signals.push(look.signal);
      if (look.faces === 1 && look.points && look.box && !hintOf(look.faces, look.closeness, look.signal?.yaw ?? null)) {
        if (!still) {
          still = document.createElement("canvas");
          still.width = element.videoWidth; still.height = element.videoHeight;
          still.getContext("2d")!.drawImage(element, 0, 0);
          box = look.box;
        }
        const { embedding, sharpness } = await engine.embed(element, look.points);
        if (sharpness >= MIN_SHARPNESS) frames.push(embedding);
      }
      await wait(140);
    }
    const note = (text: string) => { state.paused = false; state.noteUntil = performance.now() + 2500; setHint(text); };
    if (!still || !box || frames.length < 2) {
      note(!still ? "Wajah belum terlihat jelas. Lihat ke kamera, lalu tekan lagi." : "Foto buram. Tahan HP sebentar, lalu tekan lagi.");
      return;
    }
    if (!sameFace(frames)) { note("Wajah berganti saat difoto. Tekan lagi dengan wajahmu sendiri."); return; }
    const signals = state.signals.slice(-200);
    stopCamera();
    setPhase({ kind: "proses", step: 0 });
    try {
      const { blob, mime } = await cropSelfie(still, box);
      setPhotoUrl(URL.createObjectURL(blob));
      setPhase({ kind: "proses", step: 1 });
      // The upload goes first; the last step's words show while the server compares.
      const sent = client.send(sessionId, { token: state.token, blob, mime, embedding: average(frames), frameEmbeddings: frames, signals, consent: needsConsent });
      const later = window.setTimeout(() => { if (!state.closed) setPhase({ kind: "proses", step: 2 }); }, 700);
      // Long enough for the scan to be seen.
      const [done] = await Promise.all([sent, wait(1600)]).finally(() => window.clearTimeout(later));
      if (state.closed) return;
      if (done.kind !== "tidak-cocok") setRecorded(true);
      setPhase({ kind: "hasil", answer: done });
    } catch (problem) {
      if (!state.closed) setPhase({ kind: "gagal", message: errorText(problem) });
    }
  }

  function close() {
    if (phase.kind === "proses") return;
    live.current.closed = true;
    stopCamera();
    dialog.current?.close();
    trigger.current?.focus();
    if (recorded) router.refresh();
  }

  const answer = phase.kind === "hasil" ? phase.answer : null;
  const consentNeeded = phase.kind === "kamera" && phase.needsConsent;

  return <>
    <button ref={trigger} type="button" className={`button button--primary ${css.open} ${className ?? ""}`} disabled={!canTap} aria-haspopup="dialog" onClick={() => void begin()}>
      <ScanFace size={20} aria-hidden /> Absen pakai wajah
    </button>
    <dialog ref={dialog} className={css.sheet} aria-labelledby={titleId} aria-busy={phase.kind === "proses" || undefined}
      onCancel={event => { event.preventDefault(); close(); }}>
      <header className={css.head}>
        <h2 id={titleId}>Absen pakai wajah</h2>
        <button type="button" className={css.close} onClick={close} disabled={phase.kind === "proses"} aria-label="Tutup"><X aria-hidden /></button>
      </header>

      {(phase.kind === "siap" || phase.kind === "kamera") && <div className={css.body}>
        <div className={css.viewport}>
          <video ref={video} muted playsInline aria-label="Kamera depan" />
          {(!engineReady || phase.kind === "siap") && <div className={css.loading}><span className={css.spinner} aria-hidden />Menyiapkan kamera…</div>}
        </div>
        <p className={css.hint} aria-live="polite">{engineReady ? hint ?? "Wajah terlihat. Tekan Ambil foto." : ""}</p>
        {consentNeeded && <div className={css.consent}>
          <label><input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} /> Saya setuju wajahku dipakai untuk absen, sama seperti di WG People.</label>
          <details><summary>Baca selengkapnya</summary><ul>{copies.id.consent.map(line => <li key={line}>{line}</li>)}</ul></details>
        </div>}
        <button type="button" className={`button button--primary ${css.shutter}`} disabled={!engineReady || !facing || (consentNeeded && !agreed)} onClick={() => void shoot(consentNeeded)}>
          <Camera size={20} aria-hidden /> Ambil foto
        </button>
        <a className={css.alt} href={praWamPath.scan}><QrCode size={16} aria-hidden /> Scan QR saja</a>
      </div>}

      {phase.kind === "proses" && <div className={css.body}>
        <div className={`${css.photo} ${css.scanning}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob URL made in this browser */}
          {photoUrl ? <img src={photoUrl} alt="Foto yang baru diambil" /> : <span className={css.photoEmpty} />}
          <span className={css.scanLine} aria-hidden />
        </div>
        <p className={css.stepText} role="status">{STEPS[phase.step]}</p>
        <div className={css.progress} aria-hidden><span style={{ width: `${((phase.step + 1) / STEPS.length) * 90}%` }} /></div>
      </div>}

      {answer && <FaceResult answer={answer} photoUrl={photoUrl} referenceUrl={referenceUrl} onRetry={() => void begin()} onDone={close} />}

      {(phase.kind === "tanpa-wajah" || phase.kind === "gagal") && <div className={css.body}>
        <span className={`${css.badge} ${css.warn}`}><AlertTriangle aria-hidden /></span>
        <h3 className={css.title}>{phase.kind === "tanpa-wajah" ? "Wajah belum terdaftar" : "Belum bisa absen pakai wajah"}</h3>
        <p className={css.text} role="alert">{phase.message}</p>
        <div className={css.actions}>
          <a className="button button--primary" href={praWamPath.scan}><QrCode size={18} aria-hidden /> Scan QR saja</a>
          {phase.kind === "gagal" && <button type="button" className="button button--secondary" onClick={() => void begin()}><RotateCcw size={18} aria-hidden /> Coba lagi</button>}
        </div>
      </div>}
    </dialog>
  </>;
}
