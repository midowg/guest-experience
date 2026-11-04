import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { adminCards, removeTrials } from "@/lib/server/pra-wam/cards-admin";

export const dynamic = "force-dynamic";

/** DELETE: the trial cards drawn while the form was a draft (any admin). Real cards stay. */
export async function DELETE(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const removed = await removeTrials();
    return success({ removed, cards: await adminCards() }, removed ? `${removed} kartu uji dihapus.` : "Tidak ada kartu uji.");
  });
}
