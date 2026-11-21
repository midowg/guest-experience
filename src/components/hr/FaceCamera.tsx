"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { MAX_SELFIE_BYTES, SELFIE_SIDE } from "@/lib/hr/attendance";
import { average, sameFace } from "@/lib/hr/face-match";
import type { Copy } from "@/lib/hr/copy";
import { challengeDone, LIVENESS, stepDoneAt, type FrameSignal, type LivenessStep } from "@/lib/hr/liveness";
import { encodeWithinLimit, type PhotoMime } from "@/lib/pra-wam/photo";
import { loadFaceEngine, MIN_SHARPNESS, type FaceBox, type FaceReading } from "./faceEngine";
import { useCopy } from "./lang";
import styles from "./absen.module.css";

/** What one pass in front of the camera gives the screen that asked for it. */
export type FaceCapture = {
  /** The mean of the straight looks, length 1. */
  embedding: number[];
  /** Each straight look: before the first step, between the steps, after the last. */
  frameEmbeddings: number[][];
  /** Every frame from the first straight look on, for the server to judge the steps again. */
  signals: FrameSignal[];
  steps: LivenessStep[];
  selfie: { blob: Blob; mime: PhotoMime };
};

type Props = {
  /** The steps the server picked for this nonce. Keep the same array between renders. */
  steps: LivenessStep[];
  purpose: "absen" | "daftar";
  onDone(capture: FaceCapture): void;
  onCancel?(): void;
};

type Phase = "memuat" | "posisi" | "langkah" | "kembali" | "proses" | "gagal";

const TICK_MS = 100;
/** Each step, and each return to a straight look, within this. */
const STEP_TIMEOUT_MS = 12_000;
/** Straight looks in a row before one is taken. */
const STEADY = 3;
/** Eye distance as a share of the picture's shorter side. */
const CLOSE_MIN = 0.1;
const CLOSE_MAX = 0.4;

type Guide = keyof Copy["camera"]["guide"];
/** What to fix before a straight look counts (said in the person's language); null when the face is well placed. */
export function guidance(look: FaceReading): Guide | null {
  if (look.faces === 0 || !look.box) return look.faces > 1 ? "satu" : "bingkai";
  if (look.faces > 1) return "satu";
  if (look.closeness < CLOSE_MIN) return "dekat";
  if (look.closeness > CLOSE_MAX) return "jauh";
  const cx = look.box.x + look.box.width / 2;
  const cy = look.box.y + look.box.height / 2;
  if (Math.abs(cx - 0.5) > 0.16 || Math.abs(cy - 0.48) > 0.2) return "tengah";
  return null;
}
/** A camera that would not open, in words, with the other way to clock in. */
function cameraWords(error: unknown, t: Copy): string {
  const name = error instanceof DOMException ? error.name : "";
  const why = name === "NotAllowedError" || name === "SecurityError" ? t.camera.denied
    : name === "NotFoundError" || name === "OverconstrainedError" ? t.camera.notFound
      : name === "NotReadableError" ? t.camera.busy : t.camera.other;
  return `${why} ${t.camera.orHr}`;
}

/** Looking straight at the camera, eyes open, not smiling. */
const straight = (signal: FrameSignal) =>
  Math.abs(signal.yaw) <= 8 && signal.blinkLeft <= LIVENESS.eyeOpen && signal.blinkRight <= LIVENESS.eyeOpen && (signal.smileLeft + signal.smileRight) / 2 <= 0.35;

/** A square around the face (with the hair and chin), 480 px, as WebP or JPEG within 120 KB. */
async function selfieOf(video: HTMLVideoElement, box: FaceBox): Promise<{ blob: Blob; mime: PhotoMime }> {
  const width = video.videoWidth, height = video.videoHeight;
  const side = Math.min(width, height, Math.max(box.width * width, box.height * height) * 1.8);
  const cx = (box.x + box.width / 2) * width, cy = (box.y + box.height / 2) * height;
  const sx = Math.min(Math.max(0, cx - side / 2), width - side), sy = Math.min(Math.max(0, cy - side / 2), height - side);
  const canvas = document.createElement("canvas");
  canvas.width = SELFIE_SIDE; canvas.height = SELFIE_SIDE;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  context.drawImage(video, sx, sy, side, side, 0, 0, SELFIE_SIDE, SELFIE_SIDE);
  const { blob, mime } = await encodeWithinLimit((type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality)), MAX_SELFIE_BYTES);
  return { blob, mime };
}

/**
 * The front camera in an oval, for a clock-in or an enrolment: a straight look, then each step the
 * server picked (blink, turn, smile) with a straight look after each, then a selfie. The face is
 * followed and compared on this device; only the result goes to the screen that asked.
 */
export function FaceCamera({ steps, purpose, onDone, onCancel }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const done = useRef(onDone);
  const maskId = useId();
  const [phase, setPhase] = useState<Phase>("memuat");
  const [stepIndex, setStepIndex] = useState(0);
  const [hint, setHint] = useState<Guide | "buram" | null>(null);
  const { t } = useCopy();
  const words = useRef(t);
  useEffect(() => { words.current = t; });
  const [placed, setPlaced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { done.current = onDone; });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    const stopCamera = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; };
    const state = { phase: "posisi" as Phase, step: 0, from: 0, steady: 0, stepStartedAt: 0, signals: [] as FrameSignal[], captures: [] as number[][] };
    const fail = (text: string) => { stopped = true; stopCamera(); setError(text); setPhase("gagal"); };

    const finish = async (element: HTMLVideoElement, box: FaceBox) => {
      state.phase = "proses"; setPhase("proses"); setHint(null);
      if (!sameFace(state.captures)) return fail(words.current.camera.switched);
      if (steps.length && !challengeDone(steps, state.signals)) return fail(words.current.camera.movement);
      let selfie: { blob: Blob; mime: PhotoMime };
      try { selfie = await selfieOf(element, box); } catch { return fail(words.current.camera.photo); }
      // Closed (Batal, the back button) while the photo was being made: nothing is sent.
      if (stopped) return;
      stopped = true; stopCamera();
      done.current({ embedding: average(state.captures), frameEmbeddings: state.captures, signals: state.signals, steps, selfie });
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) return fail(words.current.camera.noCamera);
        const [engine, media] = await Promise.all([
          loadFaceEngine(),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }),
        ]);
        stream = media;
        if (stopped || !video.current) { stopCamera(); return; }
        video.current.srcObject = media;
        await video.current.play();
        if (stopped) return;
        setPhase("posisi");

        const tick = async () => {
          if (stopped || !video.current) return;
          const element = video.current;
          if (element.readyState >= 2) {
            const now = performance.now();
            const look = engine.read(element, now);
            const problem = guidance(look);
            setHint(problem); setPlaced(!problem);
            if (state.phase === "langkah" || state.phase === "kembali") {
              if (look.signal) state.signals.push(look.signal);
              if (state.signals.length > LIVENESS.maxFrames || now - state.stepStartedAt > STEP_TIMEOUT_MS) return fail(words.current.camera.timeout);
            }
            if (state.phase === "langkah" && look.signal) {
              const at = stepDoneAt(steps[state.step], state.signals, state.from);
              if (at >= 0) {
                state.from = at; state.step += 1; state.phase = "kembali"; state.stepStartedAt = now; state.steady = 0;
                setPhase("kembali"); setStepIndex(state.step);
              }
            } else if ((state.phase === "posisi" || state.phase === "kembali") && look.signal && look.points && look.box && !problem) {
              state.steady = straight(look.signal) ? state.steady + 1 : 0;
              if (state.steady >= STEADY) {
                state.steady = 0;
                const { embedding, sharpness } = await engine.embed(element, look.points);
                if (stopped) return;
                if (sharpness < MIN_SHARPNESS) setHint("buram");
                else {
                  state.captures.push(embedding);
                  if (state.phase === "posisi") { state.signals = [look.signal]; state.from = 0; }
                  if (state.step < steps.length) {
                    state.phase = "langkah"; state.stepStartedAt = now;
                    setPhase("langkah"); setStepIndex(state.step);
                  } else if (state.captures.length >= (steps.length ? 1 : 2)) {
                    return void finish(element, look.box);
                  } else {
                    // Foto cepat (no steps): a second straight look, to be sure it is one steady face.
                    state.phase = "kembali"; state.stepStartedAt = now;
                    setPhase("kembali");
                  }
                }
              }
            }
          }
          timer = window.setTimeout(() => void tick(), TICK_MS);
        };
        void tick();
      } catch (problem) {
        const camera = problem instanceof DOMException;
        fail(camera ? cameraWords(problem, words.current) : words.current.camera.engine);
      }
    })();
    return () => { stopped = true; window.clearTimeout(timer); stopCamera(); };
  }, [attempt, steps]);

  const prompt = phase === "memuat" ? ""
    : phase === "posisi" ? (steps.length ? t.camera.look : t.camera.lookHold)
    : phase === "langkah" ? t.liveness[steps[stepIndex]]
    : phase === "kembali" ? (steps.length ? t.camera.again : t.camera.hold)
    : phase === "proses" ? t.camera.checking : "";
  const hintText = hint === "buram" ? t.camera.blurry : hint ? t.camera.guide[hint] : null;
  const retry = () => { setError(null); setHint(null); setStepIndex(0); setPhase("memuat"); setAttempt(value => value + 1); };

  return <div className={styles.camera}>
    <div className={styles.viewport}>
      <video ref={video} muted playsInline aria-label={t.camera.video(purpose === "daftar")} />
      <svg className={styles.oval} viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden>
        <defs>
          <mask id={maskId}><rect width="300" height="400" fill="white" /><ellipse cx="150" cy="190" rx="108" ry="142" fill="black" /></mask>
        </defs>
        <rect width="300" height="400" className={styles.ovalShade} mask={`url(#${maskId})`} />
        <ellipse cx="150" cy="190" rx="108" ry="142" className={placed && phase !== "gagal" ? `${styles.ovalLine} ${styles.ovalLineOk}` : styles.ovalLine} />
      </svg>
      {phase === "memuat" && <div className={styles.loading}><span className={styles.spinner} aria-hidden />{t.camera.loading}</div>}
    </div>
    {steps.length > 0 && <ol className={styles.steps} aria-label={t.camera.steps(Math.min(stepIndex + 1, steps.length), steps.length)}>
      {steps.map((step, index) => <li key={step} className={`${styles.step} ${index < stepIndex ? styles.stepDone : index === stepIndex && phase === "langkah" ? styles.stepNow : ""}`} />)}
    </ol>}
    <p className={styles.prompt} aria-live="polite">{prompt}</p>
    {/* The oval turning green is said in words too. */}
    <p className={styles.hint} aria-live="polite">{phase === "gagal" || phase === "memuat" || phase === "proses" ? "" : hintText ?? (placed ? t.camera.placed : "")}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}>
      {phase === "gagal" && <button type="button" className={styles.primary} onClick={retry}><RotateCcw size={18} aria-hidden /> {t.common.tryAgain}</button>}
      {onCancel && <button type="button" className={styles.ghost} onClick={onCancel}>{t.common.cancel}</button>}
    </div>
    <p className={styles.foot}>{t.camera.foot}</p>
  </div>;
}
