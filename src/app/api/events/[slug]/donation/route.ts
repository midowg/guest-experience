import { donationInputSchema } from "@/lib/validation";
import { PROOF_MAX_BYTES, storeProof, submitDonation } from "@/lib/server/donations";
import { checkOrigin, enforceRateLimit, handle, success, validate } from "@/lib/server/http";
import { ServiceError } from "@/lib/server/config";

export const dynamic = "force-dynamic";

/**
 * A donation from the CSR page: a form with `payload` (the answers as JSON) and, for money, an
 * optional `proof` (photo or PDF of the transfer). The proof is stored only after the answers pass.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    checkOrigin(request);
    await enforceRateLimit(request, "donation", 10);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > PROOF_MAX_BYTES + 64_000) throw new ServiceError(413, "Ukuran bukti transfer maksimal 5 MB.");
    const { slug } = await params;
    const form = await request.formData().catch(() => { throw new ServiceError(400, "Isian donasi tidak terbaca. Muat ulang halaman."); });
    let raw: unknown;
    try { raw = JSON.parse(String(form.get("payload") ?? "")); } catch { throw new ServiceError(400, "Isian donasi tidak terbaca. Muat ulang halaman."); }
    const payload = validate(donationInputSchema, raw);
    const proof = form.get("proof");
    const proofKey = payload.category === "fund" && proof instanceof File && proof.size > 0 ? await storeProof(slug, proof) : "";
    const id = await submitDonation(slug, payload, proofKey);
    return success({ id }, "Terima kasih, donasi Anda tercatat dan menunggu konfirmasi panitia.");
  });
}
