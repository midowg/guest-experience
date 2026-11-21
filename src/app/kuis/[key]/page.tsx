import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { BigScreen } from "@/components/main-wam/kuis/BigScreen";
import { MainWamTheme } from "@/components/main-wam/theme";
import { PAGE_COLORS } from "@/components/main-wam/theme";
import { kuisScreenApi } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { screenState } from "@/lib/server/main-wam/kuis/screen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kuis live WAM", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const viewport: Viewport = { themeColor: PAGE_COLORS.dark };

/**
 * Kuis live's big screen (projector/LED): /kuis/{key}, no sign-in, as an office TV. The key in the address
 * is the secret (only its hash is kept); a wrong or replaced key, or the module switched off, is "not
 * found". It keeps itself fresh through GET /api/kuis/{key}. Main WAM's dark theme of its own.
 */
export default async function KuisScreenPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isSupabaseConfigured()) notFound();
  const state = await screenState(key).catch(() => null);
  if (!state) notFound();
  return <MainWamTheme mode="dark"><BigScreen initial={state} feedUrl={kuisScreenApi(key)} /></MainWamTheme>;
}
