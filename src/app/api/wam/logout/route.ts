import { checkOrigin, handle, success } from "@/lib/server/http";
import { signOut } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: sign out of Pra WAM on this device. */
export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    await signOut();
    return success(null, "Berhasil keluar.");
  });
}
