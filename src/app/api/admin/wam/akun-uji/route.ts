import { testAccountsSchema } from "@/lib/pra-wam/test-accounts";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { saveTestAccounts, testAccountsState } from "@/lib/server/pra-wam/test-accounts";

export const dynamic = "force-dynamic";

/** PUT {ids, carbonTestOnly}: the Akun uji list (any admin). Removing an account returns it to normal. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await saveTestAccounts(validate(testAccountsSchema, await readJson(request, 4_000)));
    return success(await testAccountsState(), "Akun uji disimpan.");
  });
}
