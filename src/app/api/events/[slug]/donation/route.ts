import { donationInputSchema } from "@/lib/validation";
import { PROOF_MAX_BYTES, storeProof, submitDonation } from "@/lib/server/donations";
import { checkOrigin, enforceRateLimit, handle, success, validate } from "@/lib/server/http";
import { ServiceError } from "@/lib/server/config";
import { getPublicEvent } from "@/lib/server/events";

export const dynamic = "force-dynamic";

/**
 * A donation from the CSR page: a form with `payload` (the answers as JSON) and an optional `proof`:
 * the transfer (photo or PDF) for money, a photo of the goods otherwise, already made smaller on the
 * donor's phone. A goods photo is required when the committee says so. Stored only after the answers pass.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    checkOrigin(request);
    // One form may send several gifts (one request each).
    await enforceRateLimit(request, "donation", 30);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > PROOF_MAX_BYTES + 64_000) throw new ServiceError(413, "Ukuran foto atau bukti maksimal 5 MB.");
    const { slug } = await params;
    const form = await request.formData().catch(() => { throw new ServiceError(400, "Isian donasi tidak terbaca. Muat ulang halaman."); });
    let raw: unknown;
    try { raw = JSON.parse(String(form.get("payload") ?? "")); } catch { throw new ServiceError(400, "Isian donasi tidak terbaca. Muat ulang halaman."); }
    const payload = validate(donationInputSchema, raw);
    const proof = form.get("proof");
    const hasPhoto = proof instanceof File && proof.size > 0;
    if (payload.category !== "fund" && !hasPhoto && (await getPublicEvent(slug))?.donation.goodsPhotoRequired) {
      throw new ServiceError(422, "Sertakan foto barangnya.", { proof: ["Unggah foto barang."] });
    }
    const proofKey = hasPhoto ? await storeProof(slug, proof) : "";
    const id = await submitDonation(slug, payload, proofKey);
    return success({ id }, "Terima kasih, donasi Anda tercatat dan menunggu konfirmasi panitia.");
  });
}
