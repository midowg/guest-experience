"use client";

import { useId, useState } from "react";
import { BedDouble, Bus, ChevronDown, Droplet, Flame, Footprints, Info, Leaf, TrainFront, Trash2, Utensils, Zap, type LucideIcon } from "lucide-react";
import { carbonCatalog, type CarbonSource, type CarbonView, type CatalogKey } from "@/lib/main-wam/peserta/carbon";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { Card, EmptyState, IconBox, List, Pill, SectionHeader } from "@/components/main-wam/ui";
import { CarbonBar, swatchClass } from "./CarbonBar";
import css from "./karbon.module.css";

const SOURCE_ICON: Record<CarbonSource, LucideIcon> = { hotel: BedDouble, perjalanan: TrainFront, makan: Utensils };
const CATALOG_ICON: Record<CatalogKey, LucideIcon> = { kereta: TrainFront, bus: Bus, makan: Utensils, hotel: BedDouble, listrik: Zap, air: Droplet, lpg: Flame, sampah: Trash2 };

/**
 * Jejak karbon (E01, revisi 18 Nov; opened from Beranda or Saya, BOD from Ringkasan): the total as an
 * estimate with "±N kg per orang" and when it was counted, "Dari mana asalnya" (a bar, then a row
 * per source with its share and what was counted), "Katalog emisi" (closed until opened: the formula, every
 * factor with its unit marked "Perlu dicek", and that emissions are only recorded, never offset), and the
 * note that it is counted automatically. No form, no payment, no trees. The bar never stands on colour
 * alone: every segment is a row with its name and percentage.
 */
export function CarbonScreen({ view, howOpen = false }: { view: CarbonView; /** Previews: "Katalog emisi" already open. */ howOpen?: boolean }) {
  const t = useT();
  if (view.kind === "belum") return <ScreenContent>
    <Card><EmptyState size="s" icon={<Footprints />} title={t("peserta.carbon.empty.title")}>{t("peserta.carbon.empty.text")}</EmptyState></Card>
    <p className={css.auto}><Info aria-hidden />{t("peserta.carbon.auto")}</p>
  </ScreenContent>;
  return <ScreenContent>
    <Card as="article" className={css.main} aria-label={t("peserta.carbon.eyebrow")}>
      <div className={css.mainHead}>
        <span className={css.eyebrow}><IconBox icon={<Leaf />} tone="emisi" smallIcon />{t("peserta.carbon.eyebrow")}</span>
        <Pill>{t("peserta.carbon.estimate")}</Pill>
      </div>
      <div className={css.figureBlock}>
        <div className={css.figure}><span className={css.number}>{view.total.value}</span><span className={css.unit}>{view.total.unit}</span></div>
        {view.perPerson && <span className={css.perPerson}>{view.perPerson}</span>}
      </div>
      <span className={css.updated}>{t("peserta.carbon.updated", { when: view.updated })}</span>
    </Card>

    <ScreenSection>
      <SectionHeader title={t("peserta.carbon.fromWhere")} />
      <div className={css.sources}>
        <CarbonBar tall sources={view.sources} label={view.barLabel} />
        <List as="ul" label={t("peserta.carbon.sources")} inset={0}>
          {view.sources.map(source => {
            const Icon = SOURCE_ICON[source.key];
            return <li key={source.key} className={css.source}>
              <IconBox icon={<Icon />} tone="emisi" />
              <span className={css.sourceText}>
                <span className={css.sourceTop}>
                  <span className={css.sourceName}><span className={`${css.swatch} ${swatchClass(source.swatch)}`} aria-hidden />{source.title}</span>
                  <span className={css.sourceValue}>{source.amount} · {source.percent}%</span>
                </span>
                {source.note && <span className={css.sourceNote}>{source.note}</span>}
              </span>
            </li>;
          })}
        </List>
      </div>
    </ScreenSection>

    <EmissionCatalog defaultOpen={howOpen} />
    <p className={css.auto}><Info aria-hidden />{t("peserta.carbon.auto")}</p>
  </ScreenContent>;
}

/** "Katalog emisi": a card that folds open (closed by default); the content is in the page, only hidden. */
function EmissionCatalog({ defaultOpen }: { defaultOpen: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <Card flush className={css.how}>
    <button type="button" className={css.howRow} aria-expanded={open} aria-controls={`${id}-isi`} onClick={() => setOpen(!open)}>
      <IconBox icon={<Info />} />
      <span className={css.howText}>
        <span className={css.howLabel}>{t("peserta.carbon.cat.title")}</span>
        <span className={css.howSub}>{t("peserta.carbon.cat.sub")}</span>
      </span>
      <ChevronDown aria-hidden className={css.howChevron} data-open={open || undefined} />
    </button>
    <div id={`${id}-isi`} className={css.howBody} hidden={!open}>
      <p className={css.howLead}>{t("peserta.carbon.cat.formula")}</p>
      <p>{t("peserta.carbon.cat.data")}</p>
      <h3 className={css.factorHead}>{t("peserta.carbon.cat.factors")}</h3>
      <ul className={css.catalog}>
        {carbonCatalog(lang).map(row => {
          const Icon = CATALOG_ICON[row.key];
          return <li key={row.key} className={css.catRow}>
            <span className={css.catIcon}><Icon aria-hidden /></span>
            <span className={css.catText}><span className={css.catName}>{row.name}</span><span className={css.catUnit}>{row.unit}</span></span>
            <span className={css.catValue}>{row.value}</span>
          </li>;
        })}
      </ul>
      <p className={css.catNote}><Pill tone="warning">{t("peserta.carbon.cat.check")}</Pill><span>{t("peserta.carbon.cat.note")}</span></p>
    </div>
  </Card>;
}
