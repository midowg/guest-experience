import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { BigScreen } from "@/components/main-wam/kuis/BigScreen";
import { MainWamTheme } from "@/components/main-wam/theme";
import { PAGE_COLORS } from "@/components/main-wam/theme";
import { kuisScreenApi } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { screenState } from "@/lib/server/main-wam/kuis/screen";
import { mainWamThemeInput } from "@/lib/server/main-wam/theme";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kuis live WAM", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ mode?: string | string[] }> };
/** Dark by default (a projector in a dim room); `?mode=light` (or `terang`) for a bright room or an LED wall in daylight. */
const modeOf = (mode: string | string[] | undefined) => (mode === "light" || mode === "terang" ? "light" : "dark");

export async function generateViewport({ searchParams }: Props): Promise<Viewport> {
  return { themeColor: PAGE_COLORS[modeOf((await searchParams).mode)] };
}

/**
 * Kuis live's big screen (projector/LED): /kuis/{key}, no sign-in, as an office TV. The key in the address
 * is the secret (only its hash is kept); a wrong or replaced key, or the module switched off, is "not
 * found". It keeps itself fresh through GET /api/kuis/{key}. Main WAM's theme: the admin's colours and
 * display face (never the KV images: this page is public), dark unless `?mode=light`.
 */
export default async function KuisScreenPage({ params, searchParams }: Props) {
  const { key } = await params;
  const { mode } = await searchParams;
  if (!isSupabaseConfigured()) notFound();
  const state = await screenState(key).catch(() => null);
  if (!state) notFound();
  const theme = await mainWamThemeInput().then(input => ({ ...input, images: null })).catch(() => null);
  return <MainWamTheme theme={theme} mode={modeOf(mode)}><BigScreen initial={state} feedUrl={kuisScreenApi(key)} /></MainWamTheme>;
}
