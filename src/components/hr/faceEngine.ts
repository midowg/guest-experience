/*
 * Absen harian (20 Nov 2026): the face check that runs in the browser. Nothing of the face leaves
 * the phone for this: MediaPipe's face landmarker (Google, Apache-2.0) follows the face, and SFace
 * (OpenCV Zoo, Apache-2.0, public/people/models/) turns it into 128 numbers. Only their programs and
 * models are fetched, once, from the addresses below; the browser keeps them afterwards. Loaded
 * only on the screens that use the camera (Absen, enrolment, Kelola → Proses foto impor).
 */
import {
  canvasMatrix, eyeDistance, laplacianVariance, points5FromMesh, SFACE_SIDE, similarityTransform, toTensorData, yawFromMesh, type Points5,
} from "@/lib/hr/face-align";
import { normalize } from "@/lib/hr/face-match";
import type { FrameSignal } from "@/lib/hr/liveness";
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";

/** The packages' own files, by exact version, and the two models. */
const VISION_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const LANDMARKER_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const ORT_WASM = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";
export const SFACE_MODEL = "/people/models/sface-2021dec-int8.onnx";

/** Below this the face is too blurred to compare (variance of the Laplacian on the 112 px face). */
export const MIN_SHARPNESS = 20;
/** Smaller than this between the eyes (pixels in the picture) is too far away to compare. */
export const MIN_EYE_DISTANCE = 28;

export type FaceBox = { x: number; y: number; width: number; height: number };
/** One look at the picture: how many faces, and for exactly one, what it does and where it is. */
export type FaceReading = {
  faces: number;
  signal: FrameSignal | null;
  points: Points5 | null;
  /** The face's box, 0…1 of the picture. */
  box: FaceBox | null;
  /** Eye distance as a share of the picture's shorter side: how close the face is. */
  closeness: number;
};
export type Embedded = { embedding: number[]; sharpness: number };
export type ImageCheck = { ok: true; embedding: number[]; sharpness: number } | { ok: false; reason: "tidak_ada_wajah" | "lebih_dari_satu" | "buram" | "tidak_terbaca" };
export const imageProblemLabels: Record<Exclude<ImageCheck, { ok: true }>["reason"], string> = {
  tidak_ada_wajah: "Tidak ada wajah di foto",
  lebih_dari_satu: "Ada lebih dari satu wajah",
  buram: "Wajah terlalu kecil atau buram",
  tidak_terbaca: "Berkas tidak bisa dibuka sebagai gambar",
};

export type FaceEngine = {
  /** A video frame; `t` must grow from frame to frame (performance.now()). */
  read(video: HTMLVideoElement, t: number): FaceReading;
  /** The face at `points` in `source` as SFace's embedding (length 1). */
  embed(source: CanvasImageSource, points: Points5): Promise<Embedded>;
  /** A still photo (a GreatDay base photo, a picked file): one sharp face, or why not. */
  analyzeImage(source: Blob): Promise<ImageCheck>;
  /** How long loading took, and the last embedding, in milliseconds (for /dev-preview/wajah). */
  timings: { loadMs: number; embedMs: number };
};

type Ort = typeof import("onnxruntime-web/wasm");
let engine: Promise<FaceEngine> | null = null;

/** The engine, loaded once per page; a failed load is tried again on the next call. */
export function loadFaceEngine(): Promise<FaceEngine> {
  engine ??= create().catch(error => { engine = null; throw error; });
  return engine;
}

function score(result: FaceLandmarkerResult, name: string): number {
  const value = result.faceBlendshapes?.[0]?.categories.find(category => category.categoryName === name)?.score ?? 0;
  return Math.max(0, Math.min(1, value));
}

function reading(result: FaceLandmarkerResult, width: number, height: number, t: number): FaceReading {
  const faces = result.faceLandmarks?.length ?? 0;
  if (faces !== 1) return { faces, signal: null, points: null, box: null, closeness: 0 };
  const mesh = result.faceLandmarks[0];
  let left = 1, top = 1, right = 0, bottom = 0;
  for (const point of mesh) {
    if (point.x < left) left = point.x; if (point.x > right) right = point.x;
    if (point.y < top) top = point.y; if (point.y > bottom) bottom = point.y;
  }
  const points = points5FromMesh(mesh, width, height);
  return {
    faces,
    signal: { t, blinkLeft: score(result, "eyeBlinkLeft"), blinkRight: score(result, "eyeBlinkRight"), smileLeft: score(result, "mouthSmileLeft"), smileRight: score(result, "mouthSmileRight"), yaw: yawFromMesh(mesh) },
    points,
    box: { x: left, y: top, width: right - left, height: bottom - top },
    closeness: eyeDistance(points) / Math.max(1, Math.min(width, height)),
  };
}

const sizeOf = (source: CanvasImageSource): { width: number; height: number } => {
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  const sized = source as { width: number | SVGAnimatedLength; height: number | SVGAnimatedLength };
  return { width: Number(sized.width) || 0, height: Number(sized.height) || 0 };
};

async function create(): Promise<FaceEngine> {
  const started = performance.now();
  const [{ FilesetResolver, FaceLandmarker: Landmarker }, ort] = await Promise.all([
    import("@mediapipe/tasks-vision"),
    import("onnxruntime-web/wasm") as Promise<Ort>,
  ]);
  ort.env.wasm.wasmPaths = ORT_WASM;
  // No cross-origin isolation on this site, so one thread; SFace is small enough for that.
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = "error";
  const fileset = await FilesetResolver.forVisionTasks(VISION_WASM);
  const options = (runningMode: "VIDEO" | "IMAGE") => ({
    baseOptions: { modelAssetPath: LANDMARKER_MODEL },
    runningMode,
    // Two, so a second person in the picture is noticed rather than ignored.
    numFaces: 2,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.6,
    minFacePresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  const [video, session] = await Promise.all([
    Landmarker.createFromOptions(fileset, options("VIDEO")),
    // logSeverityLevel 3: errors only (the model's harmless "initializer in graph inputs" warnings stay quiet).
    ort.InferenceSession.create(SFACE_MODEL, { executionProviders: ["wasm"], graphOptimizationLevel: "all", logSeverityLevel: 3 }),
  ]);
  let still: Promise<FaceLandmarker> | null = null;
  const stillLandmarker = () => (still ??= Landmarker.createFromOptions(fileset, options("IMAGE")));

  const crop = document.createElement("canvas");
  crop.width = SFACE_SIDE; crop.height = SFACE_SIDE;
  const context = crop.getContext("2d", { willReadFrequently: true })!;
  const timings = { loadMs: 0, embedMs: 0 };

  const embed: FaceEngine["embed"] = async (source, points) => {
    const t0 = performance.now();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#000";
    context.fillRect(0, 0, SFACE_SIDE, SFACE_SIDE);
    context.setTransform(...canvasMatrix(similarityTransform(points)));
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);
    const pixels = context.getImageData(0, 0, SFACE_SIDE, SFACE_SIDE).data;
    const input = new ort.Tensor("float32", toTensorData(pixels, SFACE_SIDE, SFACE_SIDE), [1, 3, SFACE_SIDE, SFACE_SIDE]);
    const output = await session.run({ [session.inputNames[0]]: input });
    const embedding = normalize(Array.from(output[session.outputNames[0]].data as Float32Array));
    input.dispose();
    timings.embedMs = Math.round(performance.now() - t0);
    return { embedding, sharpness: laplacianVariance(pixels, SFACE_SIDE, SFACE_SIDE) };
  };

  const analyzeImage: FaceEngine["analyzeImage"] = async blob => {
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" }); }
    catch { return { ok: false, reason: "tidak_terbaca" }; }
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const result = (await stillLandmarker()).detect(canvas);
    const look = reading(result, canvas.width, canvas.height, 0);
    if (look.faces === 0) return { ok: false, reason: "tidak_ada_wajah" };
    if (look.faces > 1) return { ok: false, reason: "lebih_dari_satu" };
    if (!look.points || eyeDistance(look.points) < MIN_EYE_DISTANCE) return { ok: false, reason: "buram" };
    const { embedding, sharpness } = await embed(canvas, look.points);
    return sharpness < MIN_SHARPNESS ? { ok: false, reason: "buram" } : { ok: true, embedding, sharpness };
  };

  timings.loadMs = Math.round(performance.now() - started);
  return {
    read(source, t) {
      const { width, height } = sizeOf(source);
      if (!width || !height) return { faces: 0, signal: null, points: null, box: null, closeness: 0 };
      return reading(video.detectForVideo(source, t), width, height, t);
    },
    embed,
    analyzeImage,
    timings,
  };
}
