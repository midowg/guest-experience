"use client";

import { ChevronRight, Leaf } from "lucide-react";
import type { CarbonView } from "@/lib/main-wam/peserta/carbon";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { Card, IconBox } from "@/components/main-wam/ui";
import { CarbonBar, CarbonLegend } from "./CarbonBar";
import css from "./karbon.module.css";

/**
 * Beranda's Jejak karbon card, after the Momen card, for everyone while the module is on: a modern
 * list tile, left aligned, green. Leading a 44 tonal-green icon box; in the middle the name, one
 * line ("perkiraan · Hotel 53%, Perjalanan 27%, Makan 20%") and a thin three-shade green bar; at the
 * end the total ("13,6" in the accent green over "t CO₂e") and ›. Surface and thin frame as the other
 * cards; green only on the icon, the figure and the bar. Nothing counted yet: one line, "Perkiraan
 * belum tersedia", no figure, no bar. The whole tile is one link to the page; under 340 px the figure
 * drops below the bar, under 300 px the text goes under the icon.
 */
export function CarbonCard({ view, from }: { view: CarbonView; /** Where the page's back goes: Beranda (default) or Saya. */ from?: "saya" }) {
  const t = useT();
  const counted = view.kind === "ada";
  return <Card className={css.tile} href={mainWamPath.carbon(from)}>
    <IconBox icon={<Leaf />} tone="emisi" className={css.tileIcon} />
    <span className={css.tileMain}>
      <span className={css.tileTitle}>{t("peserta.carbon.card.title")}</span>
      {counted
        ? <>
          <span className={css.tileSub}><span>{t("peserta.carbon.card.estimate")} ·</span>{" "}<CarbonLegend sources={view.sources} /></span>
          <CarbonBar sources={view.sources} />
        </>
        : <span className={css.tileSub}>{t("peserta.carbon.card.waiting")}</span>}
    </span>
    {counted && <span className={css.tileEnd}><span className={css.tileNumber}>{view.total.value}</span><span className={css.tileUnit}>{view.total.unit}</span></span>}
    <ChevronRight aria-hidden className={css.cardChevron} />
  </Card>;
}
