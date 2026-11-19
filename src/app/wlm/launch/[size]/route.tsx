import { notFound } from "next/navigation";
import { launchSize, WLM_LAUNCH_SCREENS } from "@/lib/wellbeing/brand";
import { wlmLaunch } from "@/lib/server/wlm-preview";

/** An iPhone's launch screen for WLM, one per screen size, drawn at build (19 Nov 2026, brand.ts WLM_LAUNCH_SCREENS). */
export const dynamic = "force-static";
export const dynamicParams = false;
export const generateStaticParams = () => WLM_LAUNCH_SCREENS.map(screen => ({ size: launchSize(screen) }));

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const screen = WLM_LAUNCH_SCREENS.find(item => launchSize(item) === size);
  if (!screen) notFound();
  return wlmLaunch(screen[0] * screen[2], screen[1] * screen[2], screen[2]);
}
