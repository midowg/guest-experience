import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { loadCarbon } from "@/lib/server/main-wam/peserta/carbon";
import { CarbonScreen } from "./CarbonScreen";

/** What E01 Jejak karbon shows, for both of its addresses; the page has already called the gate (module karbon). */
export async function CarbonBody({ context }: { context: MainWamContext }) {
  return <CarbonScreen page={await loadCarbon(context, new Date())} />;
}
