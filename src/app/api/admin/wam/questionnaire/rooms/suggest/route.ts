import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { requireHrUnlocked } from "@/lib/server/pra-wam/hr-lock";
import { suggestPlacements } from "@/lib/server/pra-wam/stay";

export const dynamic = "force-dynamic";

/** POST: fills free beds with a suggestion from the stay answers; everyone placed stays. Admin + Data HR open. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const unlock = await requireHrUnlocked();
    const placed = await suggestPlacements(unlock);
    return success({ placed }, placed
      ? `${placed} orang ditempatkan. Tinjau setiap kamar.`
      : "Tidak ada yang ditempatkan: semua sudah dapat kamar, atau tidak ada kasur kosong yang cocok.");
  });
}
