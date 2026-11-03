import { handle, checkOrigin, success } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";
import { createMissingAccounts, listAccounts } from "@/lib/server/pra-wam/accounts";

export const dynamic = "force-dynamic";

/** GET: who has a Pra WAM account (super admin). */
export async function GET() {
  return handle(async () => {
    await requireSuperAdmin();
    return success(await listAccounts(), "Akun Pra WAM dimuat.");
  });
}

/** POST: create the accounts still missing, with the shared first password. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const result = await createMissingAccounts();
    return success({ ...result, ...(await listAccounts()) }, `${result.created} akun dibuat${result.skipped.length ? `, ${result.skipped.length} dilewati` : ""}.`);
  });
}
