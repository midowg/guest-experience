"use client";

import { useId, useState, type CSSProperties } from "react";
import { BedDouble, ChevronDown, CircleHelp, Footprints, Info, TrainFront, Utensils } from "lucide-react";
import { carbonFactorLines, type CarbonSource, type CarbonView } from "@/lib/main-wam/peserta/carbon";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { Card, EmptyState, IconBox, List, Pill, SectionHeader } from "@/components/main-wam/ui";
import css from "./karbon.module.css";

const SOURCE_ICON: Record<CarbonSource, typeof BedDouble> = { hotel: BedDouble, perjalanan: TrainFront, makan: Utensils };
const SWATCH = { 1: css.seg1, 2: css.seg2, 3: css.seg3 } as const;

/**
 * Jejak karbon (E01, revisi 18 Nov; opened from Beranda or Saya, BOD from Ringkasan): the total as an
 * estimate with "±N kg per orang" and when it was counted, "Dari mana asalnya" (a bar, then a row
 * per source with its share and what was counted), "Cara menghitung" (closed until opened), and the
 * note that it is counted automatically. No form, no payment, no trees. The bar never stands on colour
 * alone: every segment is a row with its name and percentage.
 */
export function CarbonScreen({ view, howOpen = false }: { view: CarbonView; /** Previews: "Cara menghitung" already open. */ howOpen?: boolean }) {
  const t = useT();
  if (view.kind === "belum") return <ScreenContent>
    <Card><EmptyState size="s" icon={<Footprints />} title={t("peserta.carbon.empty.title")}>{t("peserta.carbon.empty.text")}</EmptyState></Card>
    <p className={css.auto}><Info aria-hidden />{t("peserta.carbon.auto")}</p>
  </ScreenContent>;
  return <ScreenContent>
    <Card variant="emisi" as="article" className={css.main} aria-label={t("peserta.carbon.eyebrow")}>
      <div className={css.mainHead}>
        <span className={css.eyebrow}><IconBox icon={<Footprints />} tone="emisi" smallIcon />{t("peserta.carbon.eyebrow")}</span>
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
        <div className={css.bar} role="img" aria-label={view.barLabel}>
          {view.sources.map(source => <span key={source.key} className={`${css.seg} ${SWATCH[source.swatch]}`} style={{ "--share": source.percent } as CSSProperties} />)}
        </div>
        <List as="ul" label={t("peserta.carbon.sources")} inset={0}>
          {view.sources.map(source => {
            const Icon = SOURCE_ICON[source.key];
            return <li key={source.key} className={css.source}>
              <IconBox icon={<Icon />} />
              <span className={css.sourceText}>
                <span className={css.sourceTop}>
                  <span className={css.sourceName}><span className={`${css.swatch} ${SWATCH[source.swatch]}`} aria-hidden />{source.title}</span>
                  <span className={css.sourceValue}>{source.amount} · {source.percent}%</span>
                </span>
                {source.note && <span className={css.sourceNote}>{source.note}</span>}
              </span>
            </li>;
          })}
        </List>
      </div>
    </ScreenSection>

    <HowItIsCounted defaultOpen={howOpen} />
    <p className={css.auto}><Info aria-hidden />{t("peserta.carbon.auto")}</p>
  </ScreenContent>;
}

/** "Cara menghitung": a row that folds open (closed by default), the content is in the page, only hidden. */
function HowItIsCounted({ defaultOpen }: { defaultOpen: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <Card flush className={css.how}>
    <button type="button" className={css.howRow} aria-expanded={open} aria-controls={`${id}-isi`} onClick={() => setOpen(!open)}>
      <IconBox icon={<CircleHelp />} />
      <span className={css.howLabel}>{t("peserta.carbon.how")}</span>
      <ChevronDown aria-hidden className={css.howChevron} data-open={open || undefined} />
    </button>
    <div id={`${id}-isi`} className={css.howBody} hidden={!open}>
      <p className={css.howLead}>{t("peserta.carbon.how.formula")}</p>
      <p>{t("peserta.carbon.how.data")}</p>
      <p>{t("peserta.carbon.how.hotel")}</p>
      <h3 className={css.factorHead}>{t("peserta.carbon.how.factors")}</h3>
      <ul className={css.factors}>{carbonFactorLines(lang).map(line => <li key={line.key}>{line.text}</li>)}</ul>
    </div>
  </Card>;
}
