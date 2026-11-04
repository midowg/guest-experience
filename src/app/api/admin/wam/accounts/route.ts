import { handle, checkOrigin, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { createMissingAccounts, listAccounts } from "@/lib/server/pra-wam/accounts";

export const dynamic = "force-dynamic";

/** GET: who has a Pra WAM account (any admin). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await listAccounts(), "Akun Pra WAM dimuat.");
  });
}

/** POST: create the accounts still missing, with the shared first password. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const result = await createMissingAccounts();
    return success({ ...result, ...(await listAccounts()) }, `${result.created} akun dibuat${result.skipped.length ? `, ${result.skipped.length} dilewati` : ""}.`);
  });
}
