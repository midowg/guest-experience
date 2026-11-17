import type { MwSession } from "@/lib/main-wam/types";
import type { MainWamContext } from "@/lib/server/main-wam/gate";

/**
 * P04: the row "Foto sesi ini (24)" in Detail sesi, to Momen filtered to the session. SLOT
 * (fondasi): owner agen B; agen A's Detail sesi renders it as it is, so keep the name and props.
 */
export async function SessionPhotos({ session, context }: { session: MwSession; context: MainWamContext }) {
  void session; void context;
  return null;
}
