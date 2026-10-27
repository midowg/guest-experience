import { z } from "zod";
import { manualDonationSchema } from "@/lib/validation";
import { addManualDonation, listDonations } from "@/lib/server/donations";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const idSchema = z.uuid();

/** GET: every donation of a CSR event, newest first (the committee's view, with phone numbers). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireApiAdmin();
    const id = validate(idSchema, (await params).id);
    await requireEventAccess(id);
    return success(await listDonations(id), "Daftar donasi dimuat.");
  });
}

/** POST: a donation handed over in person (cash or goods), recorded as received. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(idSchema, (await params).id);
    await requireEventAccess(id);
    return success(await addManualDonation(id, validate(manualDonationSchema, await readJson(request, 10_000))), "Donasi dicatat sebagai diterima.");
  });
}
