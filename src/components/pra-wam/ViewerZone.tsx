"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ZONE_COOKIE, ZONE_MANUAL_COOKIE, zoneOfTimeZone, type ViewerZone } from "@/lib/pra-wam/zone";

/*
 * The viewer's time zone for every WAM screen (19 Nov 2026). The server reads it from a cookie;
 * here, unless the person chose one in Pengaturan, the device's own zone is written to that cookie
 * and the screen is read again once when it differs (someone who flew to Bali sees WITA).
 */
const ZoneContext = createContext<ViewerZone>("WIB");
export const useViewerZone = () => useContext(ZoneContext);

const YEAR = 365 * 24 * 60 * 60;
export function writeZoneCookies(zone: ViewerZone, manual: boolean) {
  document.cookie = `${ZONE_COOKIE}=${zone}; path=/; max-age=${YEAR}; samesite=lax`;
  document.cookie = manual ? `${ZONE_MANUAL_COOKIE}=1; path=/; max-age=${YEAR}; samesite=lax` : `${ZONE_MANUAL_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
export const deviceZone = () => zoneOfTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);

/**
 * `soft` (WG People, 21 Nov 2026): an app that keeps its own data and history does not want the whole
 * screen read again (it would close an open sheet and drop its history). The new zone is used at
 * once and "wk:zone" tells the app to fetch its data again.
 */
export function ViewerZoneProvider({ zone, manual, soft = false, children }: { zone: ViewerZone; manual: boolean; soft?: boolean; children: ReactNode }) {
  const router = useRouter();
  const [shown, setShown] = useState(zone);
  useEffect(() => {
    if (manual) return;
    const device = deviceZone();
    if (device === zone) return;
    writeZoneCookies(device, false);
    if (!soft) { router.refresh(); return; }
    const timer = window.setTimeout(() => { setShown(device); window.dispatchEvent(new Event("wk:zone")); }, 0);
    return () => window.clearTimeout(timer);
  }, [manual, zone, router, soft]);
  return <ZoneContext.Provider value={soft ? shown : zone}>{children}</ZoneContext.Provider>;
}
