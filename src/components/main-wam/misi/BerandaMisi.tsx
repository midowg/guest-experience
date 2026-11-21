import { Suspense } from "react";
import { mainWamCan } from "@/lib/main-wam/access";
import { moduleOn } from "@/lib/main-wam/modules";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { loadMisi } from "@/lib/server/main-wam/misi/read";
import { MisiCard, MisiCardSkeleton } from "./MisiCard";

/**
 * Beranda's Misi card, for everyone but BOD while the module Misi is on (nothing otherwise, no trace).
 * It streams: Beranda shows at once with the card's skeleton, and the card replaces it once the points
 * and missions are read, so the cards above never wait for it. A failed read leaves the card out: a
 * card must never take Beranda down with it.
 */
export function BerandaMisi({ context, now }: { context: MainWamContext; now: Date }) {
  if (!moduleOn(context.settings.modules, "misi") || !mainWamCan(context.viewer, "misi")) return null;
  return <Suspense fallback={<MisiCardSkeleton />}><Loaded context={context} now={now} /></Suspense>;
}

async function Loaded({ context, now }: { context: MainWamContext; now: Date }) {
  let view: Awaited<ReturnType<typeof loadMisi>> | null = null;
  try {
    view = await loadMisi(context, now);
  } catch (error) {
    console.error("main-wam misi: kartu Beranda", error instanceof Error ? error.message : error);
  }
  if (!view) return null;
  const { settings, ...shown } = view;
  void settings;
  return <MisiCard view={shown} />;
}
