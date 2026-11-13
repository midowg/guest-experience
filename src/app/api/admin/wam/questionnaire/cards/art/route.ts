import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { adminCards, removeCharacterArt } from "@/lib/server/pra-wam/cards-admin";

export const dynamic = "force-dynamic";

/** DELETE: the old card's pictures (characters, backgrounds, accents, stickers), which the tokoh card never shows (any admin). The personas stay. */
export async function DELETE(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const removed = await removeCharacterArt();
    return success({ removed, cards: await adminCards() }, removed ? `${removed} gambar kartu lama dihapus.` : "Tidak ada gambar kartu lama.");
  });
}
