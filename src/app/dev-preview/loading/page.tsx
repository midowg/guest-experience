import { notFound } from "next/navigation";
import bk from "@/components/booking/booking.module.css";
import pw from "@/components/pra-wam/pra-wam.module.css";
import { AppLoading } from "@/components/ui/AppLoading";
import { WlmSplash } from "@/components/wellbeing/WlmSplash";

export const dynamic = "force-dynamic";

/**
 * Layout check for each app's loading screen (19 Nov 2026), held still: ?app=wlm (default), wam, wam-light,
 * main-wam, booking, tv. Each is what that app's loading.tsx shows while a page is fetched.
 */
export default async function DevLoadingPage({ searchParams }: { searchParams: Promise<{ app?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { app = "wlm" } = await searchParams;
  if (app === "wam" || app === "wam-light") return <div data-wam-look="werkudara" data-wam-theme={app === "wam" ? "dark" : "light"} style={{ display: "contents" }}>
    <div className={pw.app}><AppLoading tone="wam" name="WAM" /></div>
  </div>;
  if (app === "main-wam") return <AppLoading tone="main-wam" name="WAM" />;
  if (app === "booking") return <div className={bk.app}><AppLoading tone="booking" name="Booking Kantor" /></div>;
  if (app === "tv") return <AppLoading tone="tv" name="Werkudara" label="Memuat papan TV" />;
  return <WlmSplash />;
}
