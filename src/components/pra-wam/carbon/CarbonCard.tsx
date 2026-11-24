"use client";

import { useState } from "react";
import { BedDouble, Bike, Bus, Car, ChevronDown, ChevronRight, CupSoda, Droplets, Info, Laptop, Leaf, Lightbulb, Smartphone, TrainFront, Utensils, type LucideIcon } from "lucide-react";
import { CARBON_REFERENCES, carbonFactorRows, tileKg, type CarbonInput, type CarbonSource, type CarbonSourceView, type CarbonTravel, type CarbonView, type GroupTrip, type Swatch } from "@/lib/pra-wam/carbon";
import { Sheet } from "../Sheet";
import { CarbonCalculator } from "./CarbonCalculator";
import css from "./carbon.module.css";

const PART_ICON: Record<CarbonSource, LucideIcon> = { perjalanan: Car, kamar: BedDouble, makan: Utensils, perangkat: Laptop };
const PART_ORDER: CarbonSource[] = ["perjalanan", "kamar", "makan", "perangkat"];
const TITLES: Record<CarbonSource, string> = { perjalanan: "Perjalanan", kamar: "Kamar", makan: "Makan & minum", perangkat: "Perangkat" };
const FACTOR_ICON = { kereta: TrainFront, bus: Bus, mobil: Car, motor: Bike, kamar: BedDouble, makan: Utensils, botol: CupSoda, laptop: Laptop, hp: Smartphone, listrik: Lightbulb } as const;
const swatch = (n: Swatch) => css[`seg${n}`];

/** Small habits for the trip: no figures (nothing here is counted), no trees, no payment. */
const TIPS: { icon: LucideIcon; text: string }[] = [
  { icon: Droplets, text: "Bawa tumbler" },
  { icon: Utensils, text: "Ambil makan secukupnya" },
  { icon: Lightbulb, text: "Matikan AC saat keluar kamar" },
];

/** The participant's own part, and what the calculator needs to show the locked tiles. */
export type CarbonFormProps = {
  trip: GroupTrip; nights: number; occupants: number; meals: number;
  travel: CarbonTravel | null; open: boolean;
  inputFor: (travel: CarbonTravel) => CarbonInput | null;
  onSave: (travel: CarbonTravel) => void | Promise<unknown>;
};

/**
 * Beranda's Jejak karbon card for one person (Pra WAM, 23 Nov 2026), a small green app in a card:
 * a leaf badge, "Jejak karbon" and "Rincian ›" at the top, the figure beside a ring of the parts, and
 * the parts as tiles with their kilograms (so nothing stands on colour alone). Tapping it opens the
 * calculator (CarbonCalculator: a grid of tiles, the panitia's values locked, the person's own
 * fields, the total growing on top), then how it is counted with the sources, and small habits.
 */
export function CarbonCard({ view, form, compact = false }: { view: CarbonView; form?: CarbonFormProps; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  // Always in the page and only opened or closed, like Agenda's sheet (24 Nov 2026): a <dialog>
  // inserted and shown in the same moment sat above the bottom bar on a phone.
  const sheet = <Sheet open={open} onClose={() => setOpen(false)} title="Jejak karbon">
    <CarbonDetail form={form} onSaved={() => setOpen(false)} />
  </Sheet>;
  // Beranda (24 Nov 2026): one row the size of the other cards (Kamar, Apa itu WAM?), still green;
  // the figure on its line, the parts and the calculator in the sheet.
  if (compact) {
    const line = view.kind === "ada" ? `${view.total.value} ${view.total.unit} · perkiraan` : "Angkamu muncul setelah panitia mengisi perjalanan.";
    const inner = <>
      <span className={css.badge}><Leaf aria-hidden /></span>
      <span className={css.rowText}><strong>Jejak karbon</strong><span>{line}</span></span>
      {view.kind === "ada" && <ChevronRight className={css.rowChevron} aria-hidden />}
    </>;
    if (view.kind === "belum") return <section className={`${css.card} ${css.cardRow} ${css.cardWaiting}`} aria-label="Jejak karbon">{inner}</section>;
    return <>
      <button type="button" className={`${css.card} ${css.cardRow}`} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Jejak karbon: perkiraan ${view.total.value} ${view.total.unit}. ${view.barLabel}. Buka rincian`}>{inner}</button>
      {sheet}
    </>;
  }
  if (view.kind === "belum") return <section className={`${css.card} ${css.cardWaiting}`} aria-label="Jejak karbon">
    <Motif />
    <CardHead />
    <p className={css.waiting}>Angkamu muncul setelah panitia mengisi perjalanan.</p>
  </section>;
  const byKey = new Map(view.sources.map(source => [source.key, source]));
  return <>
    <button type="button" className={css.card} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Jejak karbon: perkiraan ${view.total.value} ${view.total.unit}. ${view.barLabel}. Buka rincian`}>
      <Motif />
      <CardHead more />
      <span className={css.hero}>
        <span className={css.figureBlock}>
          <span className={css.number}>{view.total.value}</span>
          <span className={css.unit}>{view.total.unit} · perkiraan</span>
        </span>
        <Ring sources={view.sources} />
      </span>
      <span className={css.parts}>
        {PART_ORDER.map(key => {
          const Icon = PART_ICON[key];
          const source = byKey.get(key);
          return <span key={key} className={css.part}>
            <span className={css.partTop}><Icon aria-hidden />{source && <i className={swatch(source.swatch)} aria-hidden />}</span>
            <span className={css.partValue}>{tileKg(source?.kg ?? 0)}</span>
            <span className={css.partName}>{TITLES[key]}</span>
          </span>;
        })}
      </span>
    </button>
    {sheet}
  </>;
}

function CardHead({ more }: { more?: boolean }) {
  return <span className={css.top}>
    <span className={css.badge}><Leaf aria-hidden /></span>
    <span className={css.title}>Jejak karbon</span>
    {more && <span className={css.more}>Rincian <ChevronRight aria-hidden /></span>}
  </span>;
}

/** The parts as a ring, a leaf in the middle (decoration: the tiles below say the same in words). */
function Ring({ sources }: { sources: CarbonSourceView[] }) {
  const r = 38, length = 2 * Math.PI * r, gap = sources.length > 1 ? 5 : 0;
  const starts = sources.map((_, index) => sources.slice(0, index).reduce((sum, item) => sum + (item.percent / 100) * length, 0));
  return <span className={css.ring} aria-hidden>
    <svg viewBox="0 0 96 96" focusable="false">
      <circle cx="48" cy="48" r={r} className={css.ringTrack} />
      {sources.map((source, index) => {
        const size = Math.max((source.percent / 100) * length - gap, 2);
        return <circle key={source.key} cx="48" cy="48" r={r} className={`${css.ringSeg} ${swatch(source.swatch)}`} strokeDasharray={`${size} ${length - size}`} strokeDashoffset={-starts[index]} />;
      })}
    </svg>
    <span className={css.ringLeaf}><Leaf /></span>
  </span>;
}

/** A leaf's veins, large and faint at the card's corner: decoration only. */
function Motif() {
  return <svg className={css.motif} viewBox="0 0 120 120" aria-hidden focusable="false">
    <path d="M18 104C18 52 52 18 104 18c0 52-34 86-86 86Z" />
    <path d="M18 104 92 30M46 76h26M46 76V50M64 58h20M64 58V38" />
  </svg>;
}

/** The sheet: the calculator, how it is counted (sources at its very bottom), small habits. */
export function CarbonDetail({ form, onSaved }: { form?: CarbonFormProps; onSaved?: () => void }) {
  const [how, setHow] = useState(false);
  return <div className={css.detail}>
    {form && <CarbonCalculator trip={form.trip} nights={form.nights} occupants={form.occupants} meals={form.meals} travel={form.travel} open={form.open}
      inputFor={form.inputFor} onSave={async travel => { await form.onSave(travel); onSaved?.(); }} />}

    <section className={css.how}>
      <button type="button" className={css.howRow} aria-expanded={how} aria-controls="karbon-cara" onClick={() => setHow(!how)}>
        <span className={css.rowIcon}><Info aria-hidden /></span>
        <span className={css.howText}><strong>Cara menghitung</strong></span>
        <ChevronDown aria-hidden className={css.chevron} data-open={how || undefined} />
      </button>
      <div id="karbon-cara" className={css.howBody} hidden={!how}>
        <p>Isian × faktor emisi. Kendaraan dan kamar dibagi rata.</p>
        <ul className={css.factors}>
          {carbonFactorRows().map(row => {
            const Icon = FACTOR_ICON[row.key];
            return <li key={row.key}>
              <Icon aria-hidden />
              <span className={css.factorText}><strong>{row.name}</strong><span>{row.unit}</span></span>
              <span className={css.factorValue}>{row.value}</span>
            </li>;
          })}
        </ul>
        <p className={css.refs}>
          <span>Sumber:</span>{" "}
          {CARBON_REFERENCES.map((ref, index) => <span key={ref.url}>
            <a href={ref.url} target="_blank" rel="noopener noreferrer" title={ref.title}>{ref.short}</a>{index < CARBON_REFERENCES.length - 1 ? ", " : ""}
          </span>)}
        </p>
      </div>
    </section>

    <section aria-labelledby="karbon-langkah">
      <h3 id="karbon-langkah" className={css.h}>Langkah kecil</h3>
      <ul className={css.tips}>
        {TIPS.map(({ icon: Icon, text }) => <li key={text}><Icon aria-hidden /><span>{text}</span></li>)}
      </ul>
    </section>
  </div>;
}
