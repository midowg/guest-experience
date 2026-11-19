"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VIEWER_ZONES, zoneNames, type ViewerZone } from "@/lib/pra-wam/zone";
import { deviceZone, writeZoneCookies } from "./ViewerZone";
import styles from "./pra-wam.module.css";

/**
 * Pengaturan → Zona waktu (19 Nov 2026): Otomatis (the device's zone) or one chosen by hand. Every
 * time in WAM is then read and picked in that zone; the office's rules stay in WIB.
 */
export function ZoneSwitch({ zone, manual }: { zone: ViewerZone; manual: boolean }) {
  const router = useRouter();
  const [choice, setChoice] = useState<"auto" | ViewerZone>(manual ? zone : "auto");
  const [device] = useState(() => typeof window === "undefined" ? zone : deviceZone());
  function choose(next: "auto" | ViewerZone) {
    setChoice(next);
    writeZoneCookies(next === "auto" ? deviceZone() : next, next !== "auto");
    router.refresh();
  }
  return <fieldset className={styles.form} style={{ border: 0, padding: 0, margin: 0 }}>
    <legend className={styles.label}>Jam di WAM ditampilkan dan dipilih dalam</legend>
    {(["auto", ...VIEWER_ZONES] as const).map(option => <label key={option} style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 44 }}>
      <input type="radio" name="zona" checked={choice === option} onChange={() => choose(option)} style={{ marginTop: 4 }} />
      <span>{option === "auto" ? <>Otomatis dari perangkat <strong>({device})</strong></> : zoneNames[option]}</span>
    </label>)}
    <p className={styles.hint}>Contoh: meeting yang dibuat pukul 14.00 WITA di Bali terbaca 13.00 WIB di Jogja. Jam ruang kantor tetap 07.00–22.00 WIB.</p>
  </fieldset>;
}
