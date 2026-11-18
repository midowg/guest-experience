import { Suspense } from "react";
import { moduleOn } from "@/lib/main-wam/modules";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { loadCarbon } from "@/lib/server/main-wam/peserta/carbon";
import { CarbonCard } from "./CarbonCard";
import { CarbonCardSkeleton } from "../Skeletons";

/**
 * Beranda's Jejak karbon card (after the Momen card), for everyone while the module is on: nothing
 * otherwise. It streams: Beranda shows at once with the card's skeleton and the number replaces it
 * once it is counted (it reads the people, rooms, trips and meals), so the cards above never wait for it.
 */
export function BerandaCarbon({ context, now }: { context: MainWamContext; now: Date }) {
  if (!moduleOn(context.settings.modules, "karbon")) return null;
  return <Suspense fallback={<CarbonCardSkeleton />}><Counted context={context} now={now} /></Suspense>;
}

async function Counted({ context, now }: { context: MainWamContext; now: Date }) {
  return <CarbonCard view={await loadCarbon(context, now)} />;
}
