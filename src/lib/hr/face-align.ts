/*
 * Absen harian (20 Nov 2026): the arithmetic between MediaPipe's face mesh and SFace. SFace reads
 * a 112 × 112 face whose eyes, nose and mouth corners sit on fixed points (the same five-point
 * template OpenCV's FaceRecognizerSF aligns to), so each face is turned, scaled and moved onto it
 * first. Pure, so it is tested without a browser; the drawing itself is in faceEngine.ts.
 */

export type Point = [number, number];
/** Image-left eye, image-right eye, nose tip, image-left mouth corner, image-right mouth corner. */
export type Points5 = [Point, Point, Point, Point, Point];
export type Landmark = { x: number; y: number };

export const SFACE_SIDE = 112;
/** Where the five points go in SFace's 112 × 112 input (OpenCV face_recognize.cpp). */
export const SFACE_TEMPLATE: Points5 = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

/**
 * MediaPipe face-mesh indices. "Right" is the person's own right, which is the image's left in a
 * camera picture that is not mirrored (MediaPipe always reads the picture as the camera took it).
 */
export const MESH = { rightEyeOuter: 33, rightEyeInner: 133, leftEyeInner: 362, leftEyeOuter: 263, noseTip: 1, mouthRight: 61, mouthLeft: 291 } as const;

const mid = (a: Landmark, b: Landmark): Landmark => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The five points in pixels, from normalized landmarks (0…1) of a picture `width` × `height`. */
export function points5FromMesh(landmarks: readonly Landmark[], width: number, height: number): Points5 {
  const px = (point: Landmark): Point => [point.x * width, point.y * height];
  return [
    px(mid(landmarks[MESH.rightEyeOuter], landmarks[MESH.rightEyeInner])),
    px(mid(landmarks[MESH.leftEyeInner], landmarks[MESH.leftEyeOuter])),
    px(landmarks[MESH.noseTip]),
    px(landmarks[MESH.mouthRight]),
    px(landmarks[MESH.mouthLeft]),
  ];
}

/** Distance between the eye centres in pixels: how big the face is in the picture. */
export const eyeDistance = (points: Points5) => Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);

/**
 * The head's turn in degrees from the person's own point of view (negative = their own left,
 * positive = their own right; see FrameSignal in liveness.ts), from where the nose tip sits between
 * the outer eye corners. Turning to their own right moves the nose to the picture's left. The nose
 * stands about 0.9 half-eye-widths in front of the eyes, hence the atan.
 */
export function yawFromMesh(landmarks: readonly Landmark[]): number {
  const right = landmarks[MESH.rightEyeOuter];
  const left = landmarks[MESH.leftEyeOuter];
  const nose = landmarks[MESH.noseTip];
  const half = (left.x - right.x) / 2;
  if (!(Math.abs(half) > 1e-6)) return 0;
  const offset = (nose.x - (right.x + left.x) / 2) / half;
  return Math.max(-90, Math.min(90, (-Math.atan2(offset, 0.9) * 180) / Math.PI));
}

/** A similarity transform: x' = a·x − b·y + tx, y' = b·x + a·y + ty (rotation, uniform scale, move). */
export type Similarity = { a: number; b: number; tx: number; ty: number };

/** The similarity that best moves `src` onto `dst` (least squares, Umeyama in two dimensions). */
export function similarityTransform(src: readonly Point[], dst: readonly Point[] = SFACE_TEMPLATE): Similarity {
  const n = src.length;
  if (n !== dst.length || n < 2) throw new Error("Titik wajah tidak lengkap.");
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i += 1) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1]; }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let dot = 0, cross = 0, norm = 0;
  for (let i = 0; i < n; i += 1) {
    const px = src[i][0] - sx, py = src[i][1] - sy;
    const qx = dst[i][0] - dx, qy = dst[i][1] - dy;
    dot += px * qx + py * qy;
    cross += px * qy - py * qx;
    norm += px * px + py * py;
  }
  if (!(norm > 0)) throw new Error("Titik wajah bertumpuk.");
  const a = dot / norm;
  const b = cross / norm;
  return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
}

export const applySimilarity = (t: Similarity, [x, y]: Point): Point => [t.a * x - t.b * y + t.tx, t.b * x + t.a * y + t.ty];

/** The same transform in the order canvas setTransform(a, b, c, d, e, f) wants. */
export const canvasMatrix = (t: Similarity): [number, number, number, number, number, number] => [t.a, t.b, -t.b, t.a, t.tx, t.ty];

/** RGBA pixels into SFace's input: planes of R, G, B (in that order), values 0…255. */
export function toTensorData(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const size = width * height;
  const data = new Float32Array(size * 3);
  for (let i = 0; i < size; i += 1) {
    data[i] = rgba[i * 4];
    data[size + i] = rgba[i * 4 + 1];
    data[size * 2 + i] = rgba[i * 4 + 2];
  }
  return data;
}

/**
 * How sharp a picture is: the variance of the Laplacian of its grey values. A blurred or shaky
 * face scores low; a flat picture scores 0.
 */
export function laplacianVariance(rgba: Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  const grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i += 1) grey[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  let sum = 0, sumSq = 0, count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const value = grey[i - width] + grey[i + width] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
      sum += value; sumSq += value * value; count += 1;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}
