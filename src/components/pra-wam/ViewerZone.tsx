"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
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

export function ViewerZoneProvider({ zone, manual, children }: { zone: ViewerZone; manual: boolean; children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    if (manual) return;
    const device = deviceZone();
    if (device === zone) return;
    writeZoneCookies(device, false);
    router.refresh();
  }, [manual, zone, router]);
  return <ZoneContext.Provider value={zone}>{children}</ZoneContext.Provider>;
}
