import { handle, success } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { loadHome } from "@/lib/server/main-wam/peserta/home";

export const dynamic = "force-dynamic";

/** GET: Beranda's Sekarang card and contextual card for the signed-in person (as the page shows them). */
export async function GET() {
  return handle(async () => {
    const context = await requireMainWamApi();
    return success(await loadHome(context, new Date()), "Beranda dimuat.");
  });
}
