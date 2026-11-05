import { encodeProof, fitWithin, type ProofMime, type SelfCheckInAnswer } from "@/lib/pra-wam/attendance";
import { praWamApi } from "@/lib/routes";
import { praWamRequest, PraWamApiError } from "./api";
import { putFile, putProblem } from "./photoUpload";
import { decode } from "./ProfilePhoto";

/*
 * The Zoom screenshot of an online "Saya hadir": made small here in the browser (at most 2000 px
 * on its longer side, at most 1.5 MB, WebP or JPEG), then the same two steps as a profile photo:
 * the server agrees the upload, the browser puts it in storage, and the check-in names it.
 */

/** The picked picture, upright, at most 2000 px, within 1.5 MB. */
export async function shrinkProof(file: File): Promise<{ blob: Blob; mime: ProofMime }> {
  const picture = await decode(file);
  try {
    const { width, height } = fitWithin(picture.width, picture.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new PraWamApiError("Browser ini belum dapat memperkecil gambar. Coba browser lain.");
    context.fillStyle = "#fff"; // JPEG has no transparency
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(picture.source, 0, 0, width, height);
    try {
      return await encodeProof((mime, quality) => new Promise(resolve => canvas.toBlob(resolve, mime, quality)));
    } catch (error) {
      throw new PraWamApiError(error instanceof Error ? error.message : "Gambar belum dapat diperkecil. Coba tangkapan layar lain.");
    }
  } finally {
    picture.close();
  }
}

type Started = { kind: "unggah"; key: string; uploadUrl: string; token: string } | SelfCheckInAnswer;

/**
 * Uploads the ready screenshot and signs the person in online. Progress ends at 1 while the
 * server checks it. Someone already signed in gets their check-in back without an upload.
 */
export async function checkInOnline(sessionId: string, blob: Blob, mime: ProofMime, onProgress: (share: number) => void = () => undefined): Promise<{ answer: SelfCheckInAnswer; message: string }> {
  const agreed = { mime, size: blob.size };
  const start = await praWamRequest<Started>(praWamApi.selfCheckInProof(sessionId), { method: "POST", json: agreed });
  if (start.data.kind !== "unggah") return { answer: start.data, message: start.message };
  const problem = putProblem(await putFile(start.data.uploadUrl, blob, mime, share => onProgress(Math.min(share, 0.99))));
  if (problem) throw new PraWamApiError(problem);
  onProgress(1);
  const done = await praWamRequest<SelfCheckInAnswer>(praWamApi.selfCheckIn(sessionId), { method: "POST", json: { mode: "online", proof: { ...agreed, key: start.data.key, token: start.data.token } } });
  return { answer: done.data, message: done.message };
}

/** "Di kantor": one tap. */
export async function checkInOffline(sessionId: string): Promise<{ answer: SelfCheckInAnswer; message: string }> {
  const done = await praWamRequest<SelfCheckInAnswer>(praWamApi.selfCheckIn(sessionId), { method: "POST", json: { mode: "offline" } });
  return { answer: done.data, message: done.message };
}
