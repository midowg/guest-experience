import { notFound } from "next/navigation";
import { MainWamTheme, type MainWamMode } from "@/components/main-wam/theme";
import { ToastProvider } from "@/components/main-wam/ui";
import { KitGallery } from "./Gallery";

export const dynamic = "force-dynamic";

/**
 * Development-only gallery of the Main WAM kit (no sign-in, 404 in production).
 * ?mode=dark for the prepared dark tokens; ?aksen=%23B45309 to try an event accent through the theme
 * (invalid or unreadable colours fall back to the default, see the console).
 */
export default async function MainWamKitPage({ searchParams }: { searchParams: Promise<{ mode?: string; aksen?: string; utama?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { mode, aksen, utama } = await searchParams;
  const theme = { accent: aksen ?? null, primary: utama ?? null };
  const chosen: MainWamMode = mode === "dark" ? "dark" : mode === "system" ? "system" : "light";
  return <MainWamTheme theme={theme} mode={chosen}>
    <ToastProvider><KitGallery /></ToastProvider>
  </MainWamTheme>;
}
