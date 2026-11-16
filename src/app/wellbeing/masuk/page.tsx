import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WellbeingLogin } from "@/components/wellbeing/WellbeingLogin";
import { safePraWamNext } from "@/lib/pra-wam/session-token";
import { WELLBEING_PATH, wellbeingPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { currentMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Masuk · Wellbeing" }, applicationName: "Wellbeing", robots: { index: false, follow: false } };

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
