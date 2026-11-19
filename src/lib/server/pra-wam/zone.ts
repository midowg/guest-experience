import "server-only";
import { cookies } from "next/headers";
import { asViewerZone, ZONE_COOKIE, ZONE_MANUAL_COOKIE, type ViewerZone } from "@/lib/pra-wam/zone";

/** The viewer's time zone (19 Nov 2026) from their cookie; WIB until their device or Pengaturan says otherwise. */
export async function viewerZone(): Promise<ViewerZone> {
  try { return asViewerZone((await cookies()).get(ZONE_COOKIE)?.value); } catch { return "WIB"; }
}
/** The zone, and whether the person chose it in Pengaturan (else the device decides). */
export async function viewerZoneSetting(): Promise<{ zone: ViewerZone; manual: boolean }> {
  try {
    const store = await cookies();
    return { zone: asViewerZone(store.get(ZONE_COOKIE)?.value), manual: store.get(ZONE_MANUAL_COOKIE)?.value === "1" };
  } catch { return { zone: "WIB", manual: false }; }
}
