import { minutesApi, type MinutePhoto } from "@/lib/pra-wam/minutes";
import { fitWithin, MOM_PHOTO_BYTES, MOM_PHOTO_STEPS } from "@/lib/pra-wam/minutes-photos";
import { sourceProblem } from "@/lib/pra-wam/photo";
import { praWamRequest, PraWamApiError } from "./api";
import { putFile, putProblem } from "./photoUpload";
import { decode } from "./ProfilePhoto";

/**
 * A picked photo made ready for the MoM (12 Nov 2026): upright, at most 1280 px on its long side,
 * JPEG of at most 400 KB (lowering the quality until it fits).
 */
export async function prepareMinutePhoto(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const problem = sourceProblem(file);
  if (problem) throw new PraWamApiError(problem);
  const picture = await decode(file);
  try {
    const { width, height } = fitWithin(picture.width, picture.height);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new PraWamApiError("Browser ini belum dapat memperkecil foto. Coba browser lain.");
    context.fillStyle = "#fff"; // JPEG has no transparency
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(picture.source, 0, 0, width, height);
    for (const quality of MOM_PHOTO_STEPS) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob || blob.type !== "image/jpeg") break;
      if (blob.size <= MOM_PHOTO_BYTES) return { blob, width, height };
    }
    throw new PraWamApiError("Foto belum dapat diperkecil sampai 400 KB. Coba foto lain.");
  } finally {
    picture.close();
  }
}

/** Puts a ready photo in storage and keeps it with the meeting's MoM; answers every photo. */
export async function uploadMinutePhoto(sessionId: string, photo: { blob: Blob; width: number; height: number }, onProgress: (share: number) => void = () => undefined): Promise<MinutePhoto[]> {
  const agreed = { size: photo.blob.size, width: photo.width, height: photo.height };
  const start = await praWamRequest<{ key: string; uploadUrl: string; token: string }>(minutesApi.photos(sessionId), { method: "POST", json: agreed });
  const problem = putProblem(await putFile(start.data.uploadUrl, photo.blob, "image/jpeg", share => onProgress(Math.min(share, 0.99))));
  if (problem) throw new PraWamApiError(problem);
  onProgress(1);
  const done = await praWamRequest<MinutePhoto[]>(minutesApi.photosConfirm(sessionId), { method: "POST", json: { ...agreed, key: start.data.key, token: start.data.token } });
  return done.data;
}
