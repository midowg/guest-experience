import { moduleAllows } from "@/lib/main-wam/access";
import { kelolaTiles } from "@/lib/main-wam/panitia/attention";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { panitiaHome } from "@/lib/server/main-wam/panitia/summary";
import { KelolaCards } from "./BerandaCards";

/**
 * K01: the panitia's cards on Beranda, under Sekarang: Kelola (4 shortcuts: Rundown live, Absen,
 * Pengumuman, Moderasi with its badge; Absen only with the module on) and Perlu perhatian (only when
 * there is something). SLOT (fondasi): owner agen C; agen A's Beranda renders it as it is, so keep
 * the name and props. Returns nothing for anyone who is not panitia or admin (mainWamCan "kelola").
 *
 * Read on the server with the page (a few small queries, in parallel), so the cards arrive with
 * Beranda and nothing under them moves; a part that cannot be read is left out.
 */
export async function BerandaPanitia({ context, now }: { context: MainWamContext; now: Date }) {
  if (!moduleAllows(context.viewer, "kelola", context.settings.modules)) return null;
  const home = await panitiaHome(context, now).catch(() => ({ tiles: kelolaTiles(context.settings.modules, 0), attention: [] }));
  return <KelolaCards tiles={home.tiles} attention={home.attention} />;
}
