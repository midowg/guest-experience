"use client";

import { ChevronRight, Footprints } from "lucide-react";
import type { CarbonView } from "@/lib/main-wam/peserta/carbon";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { Card, IconBox } from "@/components/main-wam/ui";
import css from "./karbon.module.css";

/**
 * Beranda's Jejak karbon card (revisi 18 Nov), after the Momen card, for everyone while the module
 * is on: the icon, the name, the total ("13,6 t CO₂e · perkiraan") and › to the page. Nothing
 * counted yet: "Perkiraan belum tersedia", still a way into the page. The whole card is one link.
 */
export function CarbonCard({ view, from }: { view: CarbonView; /** Where the page's back goes: Beranda (default) or Saya. */ from?: "saya" }) {
  const t = useT();
  return <Card variant="emisi" className={css.card} href={mainWamPath.carbon(from)}>
    <IconBox icon={<Footprints />} tone="emisi" />
    <span className={css.cardText}>
      <span className={css.cardTitle}>{t("peserta.carbon.card.title")}</span>
      {view.kind === "ada"
        ? <span className={css.cardFigure}><span className={css.cardNumber}>{view.total.value}</span><span className={css.cardUnit}>{view.total.unit}</span><span className={css.cardNote}>{t("peserta.carbon.card.estimate")}</span></span>
        : <span className={css.cardNote}>{t("peserta.carbon.card.waiting")}</span>}
    </span>
    <ChevronRight aria-hidden className={css.cardChevron} />
  </Card>;
}
