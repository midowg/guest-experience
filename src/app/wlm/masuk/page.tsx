import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { WellbeingLogin } from "@/components/wellbeing/WellbeingLogin";
import { safePraWamNext } from "@/lib/pra-wam/session-token";
import { WELLBEING_PATH, wellbeingPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { currentMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
/** A phone app: drawn under the notch (safe areas in CSS), and the keyboard shrinks the page so sheets keep their buttons in view. */
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };
export const metadata: Metadata = { title: { absolute: "Masuk · WLM" }, applicationName: "WLM", robots: { index: false, follow: false } };

/**
 * Masuk: Wellbeing's own sign-in page, with the WAM account (17 Nov 2026). Only a Wellbeing page
 * may be the way back (else Beranda); someone already signed in goes straight there.
 */
export default async function WellbeingSignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const asked = safePraWamNext((await searchParams).next);
  const next = asked?.startsWith(WELLBEING_PATH) ? asked : null;
  if (isSupabaseConfigured() && await currentMember()) redirect(next ?? wellbeingPath.home);
  return <WellbeingLogin next={next} />;
}
