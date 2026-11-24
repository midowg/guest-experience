"use client";

import { useId, useState } from "react";
import { BedDouble, Bus, Car, ChevronDown, Droplet, Flame, Footprints, Globe2, Info, Laptop, Leaf, Lightbulb, Smartphone, TrainFront, Trash2, Utensils, Zap, Bike, CupSoda, type LucideIcon } from "lucide-react";
import { carbonCatalog, type CarbonSourceView, type CatalogKey } from "@/lib/main-wam/peserta/carbon";
import { answerOfDraft, carbonPageFromModel, draftOf, draftProblems, sameDraft, type CarbonDraft, type CarbonPageModel, type CarbonPageView } from "@/lib/main-wam/peserta/carbon-saya";
import { CARBON_REFERENCES, type CarbonTravel } from "@/lib/pra-wam/carbon";
import { mainWamApi } from "@/lib/routes";
import { useLang, useT } from "@/components/main-wam/i18n";
import { failText, mwRequest } from "@/components/main-wam/peserta/request";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { Card, EmptyState, EyebrowLabel, IconBox, Pill, useToast } from "@/components/main-wam/ui";
import { CarbonBar, swatchClass } from "./CarbonBar";
import { CarbonForm } from "./CarbonForm";
import css from "./karbon.module.css";

const CATALOG_ICON: Record<CatalogKey, LucideIcon> = {
  kereta: TrainFront, bus: Bus, mobil: Car, motor: Bike, makan: Utensils, botol: CupSoda, hotel: BedDouble, laptop: Laptop, hp: Smartphone, listrik: Zap, air: Droplet, lpg: Flame, sampah: Trash2,
};

/**
 * Jejak karbon (E01; opened from Beranda or Saya), per person and a calculator like Pra WAM's (24 Nov 2026):
 * first the person's OWN footprint (the figure in kg CO₂e, against the participants' average; it follows what
 * they type), "Hitung jejakmu" (tiles: what the event's data fills, and what only they know: their own trip, bottles,
 * laptop hours, phone charges; Simpan), "Dari mana asalnya" (a bar and a row per source), "Langkah kecil", then
 * "Detail keseluruhan" (folds open: the whole event's total, participants, average, the person's own place against
 * it, the event's sources and "Katalog emisi" with every factor and where it comes from). Only the person's own
 * numbers and the totals: no other name. No payment, no trees. The bar never stands on colour alone: every
 * segment is a row with its name and percentage. `sample` (previews, demo): "Contoh", and nothing is saved.
 */
export function CarbonScreen({ model, howOpen = false, overallOpen = false, sample = false, initialSheet = false }: {
  model: CarbonPageModel;
  /** Previews: "Katalog emisi" already open (which opens "Detail keseluruhan" too). */
  howOpen?: boolean;
  /** Previews: "Detail keseluruhan" already open. */
  overallOpen?: boolean;
  sample?: boolean;
  /** Previews: the "Berangkat sendiri" sheet open from the start. */
  initialSheet?: boolean;
}) {
  const t = useT();
  const { lang } = useLang();
  const toast = useToast();
  const [saved, setSaved] = useState<CarbonTravel | null>(model.answer);
  const [draft, setDraft] = useState<CarbonDraft>(() => draftOf(model.answer));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // What is counted: the draft, but an own trip that is not complete counts as the group's (Pra WAM's rule).
  const problems = draftProblems(draft);
  const counted = answerOfDraft(problems.own ? { ...draft, own: null } : draft, new Date(model.now));
  const { mine, overall, result } = carbonPageFromModel(model, counted, lang);
  const dirty = !sameDraft(draft, draftOf(saved));

  async function save() {
    if (saving || problems.any) return;
    setSaving(true);
    setError("");
    try {
      const answer = answerOfDraft(draft);
      if (sample) { await new Promise(resolve => setTimeout(resolve, 400)); setSaved(answer); }
      else {
        const { data } = await mwRequest<CarbonTravel>(mainWamApi.carbon, { method: "PUT", json: { own: answer.own, bottles: answer.bottles, laptopHours: answer.laptopHours, phoneCharges: answer.phoneCharges } });
        setSaved(data);
      }
      toast.show({ text: t("peserta.carbon.form.saved"), tone: "success" });
    } catch (problem) { setError(failText(problem)); } finally { setSaving(false); }
  }

  return <ScreenContent>
    {mine.kind === "ada" && result
      ? <>
        <Card as="article" variant="eco" className={css.main} aria-label={t("peserta.carbon.me.eyebrow")}>
          <Leaf aria-hidden className={css.mainLeaf} />
          <div className={css.mainHead}>
            <span className={css.eyebrow}><Leaf aria-hidden />{t("peserta.carbon.me.eyebrow")}</span>
            <span className={css.estimate}><i aria-hidden />{sample ? t("peserta.carbon.sample") : dirty ? t("peserta.carbon.form.unsaved") : t("peserta.carbon.estimate")}</span>
          </div>
          <div className={css.figure} aria-live="polite"><span className={css.number}>{mine.total.value}</span><span className={css.unit}>{mine.total.unit}</span></div>
          {mine.compare && <span className={css.perPerson}>{mine.compare.text}</span>}
          {mine.compare && <span className={css.updated}>{t("peserta.carbon.me.average")}: {mine.compare.average}</span>}
          <span className={css.updated}>{mine.complete ? t("peserta.carbon.me.complete") : t("peserta.carbon.me.assumed")}</span>
          <span className={css.updated}>{t("peserta.carbon.updated", { when: mine.updated })}</span>
        </Card>

        <ScreenSection>
          <EyebrowLabel as="h2">{t("peserta.carbon.form.title")}</EyebrowLabel>
          <CarbonForm result={result} draft={draft} onDraft={setDraft} open={model.open} storage={model.storage} saving={saving} error={error} onSave={save} sample={sample} initialSheet={initialSheet} />
        </ScreenSection>

        <ScreenSection>
          <EyebrowLabel as="h2">{t("peserta.carbon.fromWhere")}</EyebrowLabel>
          <SourceRows sources={mine.sources} bar />
        </ScreenSection>

        <ScreenSection>
          <EyebrowLabel as="h2">{t("peserta.carbon.tips")}</EyebrowLabel>
          <Card>
            <ul className={css.tips}>
              {mine.tips.map(tip => <li key={tip} className={css.tip}><Lightbulb aria-hidden /><span>{tip}</span></li>)}
            </ul>
          </Card>
        </ScreenSection>
      </>
      : <Card><EmptyState size="s" icon={<Footprints />} title={t("peserta.carbon.me.empty.title")}>{t("peserta.carbon.me.empty.text")}</EmptyState></Card>}

    {overall.kind === "ada"
      ? <OverallDetail overall={overall} mine={mine} open={overallOpen || howOpen} howOpen={howOpen} />
      : mine.kind === "belum" && <Card><EmptyState size="s" icon={<Globe2 />} title={t("peserta.carbon.empty.title")}>{t("peserta.carbon.empty.text")}</EmptyState></Card>}
    <p className={css.auto}><Info aria-hidden />{t("peserta.carbon.auto")}</p>
  </ScreenContent>;
}

/** A bar and a card of rows, one per source: its name, amount, share and what was counted. */
function SourceRows({ sources, bar = false }: { sources: CarbonSourceView[]; bar?: boolean }) {
  const t = useT();
  return <div className={css.sources}>
    {bar && <CarbonBar sources={sources} tall label={sources.map(source => `${source.title} ${source.percent}%`).join(", ")} />}
    <ul className={css.srcList} aria-label={t("peserta.carbon.sources")}>
      {sources.map(source => <li key={source.key} className={css.source}>
        <span className={css.sourceTop}>
          <span className={css.sourceName}><span className={`${css.swatch} ${swatchClass(source.swatch)}`} aria-hidden />{source.title}</span>
          <span className={css.sourceValue}>{source.amount} · {source.percent}%</span>
        </span>
        <span className={css.sourceBar} aria-hidden><i className={swatchClass(source.swatch)} style={{ width: `${Math.max(source.percent, 4)}%` }} /></span>
        {source.note && <span className={css.sourceNote}>{source.note}</span>}
      </li>)}
    </ul>
  </div>;
}

/** "Detail keseluruhan": a card that folds open (closed by default); the content is in the page, only hidden. */
function OverallDetail({ overall, mine, open: openAtFirst, howOpen }: { overall: Extract<CarbonPageView["overall"], { kind: "ada" }>; mine: CarbonPageView["mine"]; open: boolean; howOpen: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(openAtFirst);
  const id = useId();
  const stats: { label: string; value: string; unit?: string }[] = [
    { label: t("peserta.carbon.all.total"), value: overall.total.value, unit: overall.total.unit },
    ...(overall.people ? [{ label: t("peserta.carbon.all.people"), value: overall.people }] : []),
    ...(overall.average ? [{ label: t("peserta.carbon.all.average"), value: overall.average }] : []),
    ...(mine.kind === "ada" ? [{ label: t("peserta.carbon.all.yours"), value: `${mine.total.value} kg` }] : []),
  ];
  return <Card flush className={css.how}>
    <button type="button" className={css.howRow} aria-expanded={open} aria-controls={`${id}-isi`} onClick={() => setOpen(!open)}>
      <IconBox icon={<Globe2 />} tone="emisi" />
      <span className={css.howText}>
        <span className={css.howLabel}>{t("peserta.carbon.all.title")}</span>
        <span className={css.howSub}>{t("peserta.carbon.all.sub")} · {overall.total.value} {overall.total.unit}</span>
      </span>
      <ChevronDown aria-hidden className={css.howChevron} data-open={open || undefined} />
    </button>
    <div id={`${id}-isi`} className={css.allBody} hidden={!open}>
      <dl className={css.stats}>
        {stats.map(stat => <div key={stat.label} className={css.stat}>
          <dt className={css.statLabel}>{stat.label}</dt>
          <dd className={css.statValue}><span>{stat.value}</span>{stat.unit && <span className={css.statUnit}>{stat.unit}</span>}</dd>
        </div>)}
      </dl>
      <h3 className={css.factorHead}>{t("peserta.carbon.all.sources")}</h3>
      <SourceRows sources={overall.sources} bar />
      <EmissionCatalog defaultOpen={howOpen} nested />
    </div>
  </Card>;
}

/** "Katalog emisi": a card that folds open (closed by default); the content is in the page, only hidden. */
function EmissionCatalog({ defaultOpen, nested = false }: { defaultOpen: boolean; nested?: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <Card flush className={`${css.how} ${nested ? css.nestedHow : ""}`}>
    <button type="button" className={css.howRow} aria-expanded={open} aria-controls={`${id}-isi`} onClick={() => setOpen(!open)}>
      <IconBox icon={<Info />} tone="emisi" />
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
      <p className={css.refs}>
        <span>{t("peserta.carbon.cat.refs")}:</span>{" "}
        {CARBON_REFERENCES.map((ref, index) => <span key={ref.url}>
          <a href={ref.url} target="_blank" rel="noopener noreferrer" title={ref.title}>{ref.short}</a>{index < CARBON_REFERENCES.length - 1 ? ", " : ""}
        </span>)}
      </p>
      <p className={css.catNote}><Pill tone="warning">{t("peserta.carbon.cat.check")}</Pill><span>{t("peserta.carbon.cat.note")}</span></p>
    </div>
  </Card>;
}
