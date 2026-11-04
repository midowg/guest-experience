import type { PhotoMime } from "@/lib/pra-wam/photo";
import { praWamApi } from "@/lib/routes";
import { praWamRequest, PraWamApiError } from "./api";

/** PUT to storage with progress; 0 when no answer came at all. */
export function putFile(url: string, blob: Blob, mime: string, onProgress: (share: number) => void = () => undefined): Promise<number> {
  return new Promise(resolve => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", mime);
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    request.onload = () => resolve(request.status);
    request.onerror = () => resolve(0);
    request.send(blob);
  });
}

/** Why storage refused a PUT, in plain words; null when it took the file. */
export function putProblem(status: number): string | null {
  // No answer at all while online is the storage refusing this site (its CORS rule), not the network.
  if (status === 0) return navigator.onLine
    ? "Penyimpanan menolak unggahan dari aplikasi ini. Ini pengaturan server, bukan jaringanmu. Hubungi admin WAM."
    : "Kamu sedang offline. Sambungkan internet lalu coba lagi.";
  if (status < 200 || status >= 300) return `Penyimpanan menolak berkas ini (kode ${status}). Coba lagi, atau hubungi admin WAM bila terus terjadi.`;
  return null;
}

/**
 * A ready photo (320 × 320, at most 200 KB) as my profile photo: the server agrees the upload,
 * the browser puts it in storage, the server checks and keeps it. Progress ends at 1 while saving.
 */
export async function uploadProfilePhoto(blob: Blob, mime: PhotoMime, onProgress: (share: number) => void = () => undefined): Promise<void> {
  const agreed = { mime, size: blob.size };
  const start = await praWamRequest<{ key: string; uploadUrl: string; token: string }>(praWamApi.photoStart, { method: "POST", json: agreed });
  const problem = putProblem(await putFile(start.data.uploadUrl, blob, mime, share => onProgress(Math.min(share, 0.99))));
  if (problem) throw new PraWamApiError(problem);
  onProgress(1);
  await praWamRequest(praWamApi.photoConfirm, { method: "POST", json: { ...agreed, key: start.data.key, token: start.data.token } });
}
