"use client";

import { Leaf } from "lucide-react";
import type { PersonalCarbonView } from "@/lib/main-wam/peserta/carbon-saya";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { Card, Pill } from "@/components/main-wam/ui";
import { CarbonBar, CarbonLegend } from "./CarbonBar";
import css from "./karbon.module.css";

/**
 * Beranda's Jejak karbon tile (the person's OWN footprint, "perkiraanmu"; the page has the whole event below) (prototipe .ft.gg), the left half of the pair beside Momen, for everyone
 * while the module is on: the green card (Card eco, white text). A "Jejak karbon" pill, the total in
 * big Barlow ("17,4" over "t CO₂e"), "perkiraan" and the sources in one line, and the thin stacked bar
 * (three shades of white on the green). Nothing counted yet: one line, "Perkiraan belum tersedia", no
 * figure, no bar. The whole tile is one link to the page.
 */
export function CarbonCard({ view, from }: { view: PersonalCarbonView; /** Where the page's back goes: Beranda (default) or Saya. */ from?: "saya" }) {
  const t = useT();
  const counted = view.kind === "ada";
  return <Card variant="eco" className={css.tile} href={mainWamPath.carbon(from)}>
    <span className={css.tileHead}><Pill icon={<Leaf />} className={css.tilePill}>{t("peserta.carbon.card.short")}</Pill></span>
    {counted
      ? <span className={css.tileBody}>
        <span className={css.tileEnd}><span className={css.tileNumber}>{view.total.value}</span><span className={css.tileUnit}>{view.total.unit}</span></span>
        <CarbonBar sources={view.sources} />
        <span className={css.tileSub}><span>{t("peserta.carbon.card.estimate")} ·</span>{" "}<CarbonLegend sources={view.sources} /></span>
      </span>
      : <span className={css.tileSub}>{t("peserta.carbon.card.waiting")}</span>}
  </Card>;
}
