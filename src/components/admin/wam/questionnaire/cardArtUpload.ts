import { AdminApiError, adminRequest } from "@/components/admin/shared/api";
import { putFile, putProblem } from "@/components/pra-wam/photoUpload";
import { artTypes, MAX_ART_BYTES, type ArtKind, type ArtMime } from "@/lib/pra-wam/cards";
import { praWamCardsApi } from "@/lib/routes";

/** The type of a picked file, by its type or, when the browser gives none, its name. */
export function artMimeOf(file: File): ArtMime | null {
  if (file.type in artTypes) return file.type as ArtMime;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : null;
}

/**
 * One picture of the card catalog, as profile photos go: the server agrees a key, type and size,
 * the browser puts the file in private storage, the server checks it and fills the slot.
 */
export async function uploadArt(kind: ArtKind, ref: string, file: File): Promise<void> {
  const mime = artMimeOf(file);
  if (!mime) throw new AdminApiError(`${file.name}: pilih gambar WebP, PNG, atau JPG.`);
  if (file.size > MAX_ART_BYTES) throw new AdminApiError(`${file.name}: lebih dari 3 MB. Perkecil dulu.`);
  const agreed = { kind, ref, mime, size: file.size };
  const start = await adminRequest<{ key: string; uploadUrl: string; token: string }>(praWamCardsApi.artStart, { method: "POST", body: JSON.stringify(agreed) });
  const problem = putProblem(await putFile(start.data!.uploadUrl, file, mime));
  if (problem) throw new AdminApiError(problem);
  await adminRequest(praWamCardsApi.artConfirm, { method: "POST", body: JSON.stringify({ ...agreed, key: start.data!.key, token: start.data!.token }) });
}
