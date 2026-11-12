import { minutesApi, type MinutePhoto } from "@/lib/pra-wam/minutes";
import { fitWithin, MOM_PHOTO_HD, photoLimitLabel, type MomPhotoRule } from "@/lib/pra-wam/minutes-photos";
import { sourceProblem } from "@/lib/pra-wam/photo";
import { praWamRequest, PraWamApiError } from "./api";
import { putFile, putProblem } from "./photoUpload";
import { decode } from "./ProfilePhoto";

/**
 * A picked photo made ready for the MoM: upright, JPEG, as the rule says (12 Nov 2026: Full HD,
 * 1920 px on its long side, at most 1 MB, at a quality that keeps it sharp; a photo too detailed
 * for that is made 1600 px). The quality is never lowered past the rule's last step.
 */
export async function prepareMinutePhoto(file: File, rule: MomPhotoRule = MOM_PHOTO_HD): Promise<{ blob: Blob; width: number; height: number }> {
  const problem = sourceProblem(file);
  if (problem) throw new PraWamApiError(problem);
  const picture = await decode(file);
  try {
    for (const side of rule.sides) {
      const { width, height } = fitWithin(picture.width, picture.height, side);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new PraWamApiError("Browser ini belum dapat memperkecil foto. Coba browser lain.");
      context.fillStyle = "#fff"; // JPEG has no transparency
      context.fillRect(0, 0, width, height);
      context.imageSmoothingQuality = "high";
      context.drawImage(picture.source, 0, 0, width, height);
      for (const quality of rule.steps) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
        if (!blob || blob.type !== "image/jpeg") throw new PraWamApiError("Browser ini belum dapat menyimpan foto sebagai JPEG. Coba browser lain.");
        if (blob.size <= rule.bytes) return { blob, width, height };
      }
    }
    throw new PraWamApiError(`Foto belum dapat dibuat ${photoLimitLabel(rule.bytes)} tanpa mengurangi ketajamannya. Coba foto lain.`);
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
