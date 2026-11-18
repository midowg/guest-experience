import { Images } from "lucide-react";
import { ListRow } from "@/components/main-wam/ui";
import type { MwSession } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { serverT } from "@/lib/server/main-wam/lang";
import { sessionPhotoCount } from "@/lib/server/main-wam/momen/feed";

/**
 * P04: the row "Foto sesi ini (24)" in Detail sesi, to Momen filtered to the session (M01 tersaring).
 * SLOT (fondasi), owner agen B. A ListRow only: agen A renders it inside its own list card, with
 * "Info lainnya". Nothing while the session has no photos for everyone (or before the migration).
 */
export async function SessionPhotos({ session, context }: { session: MwSession; context: MainWamContext }) {
  const count = await sessionPhotoCount(context, session.id).catch(() => 0);
  if (count <= 0) return null;
  const t = await serverT();
  return <ListRow icon={<Images />} title={t("momen.sessionPhotos")} value={count} href={mainWamPath.moments({ sesi: session.id })} aria-label={t("momen.sessionPhotosLabel", { n: count })} />;
}
