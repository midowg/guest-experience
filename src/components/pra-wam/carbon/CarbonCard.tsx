"use client";

import { useState } from "react";
import { BedDouble, Bus, Check, ChevronDown, ChevronRight, Droplets, Info, Leaf, Lightbulb, MapPin, PencilLine, TrainFront, Utensils, type LucideIcon } from "lucide-react";
import { CARBON_REFERENCES, OTHER_ROUTE, carbonFactorRows, modeLabel, type CarbonRoute, type CarbonSource, type CarbonSourceView, type CarbonTravel, type CarbonView } from "@/lib/pra-wam/carbon";
import { Sheet } from "../Sheet";
import { CarbonTravelForm } from "./CarbonTravelForm";
import css from "./carbon.module.css";

const SOURCE_ICON: Record<CarbonSource, LucideIcon> = { perjalanan: TrainFront, kamar: BedDouble, makan: Utensils };
const FACTOR_ICON = { kereta: TrainFront, bus: Bus, kamar: BedDouble, makan: Utensils } as const;
const swatch = (n: 1 | 2 | 3) => css[`seg${n}`];

/** Small habits for the trip: no figures (nothing here is counted), no trees, no payment. */
const TIPS: { icon: LucideIcon; text: string }[] = [
  { icon: Droplets, text: "Bawa tumbler" },
  { icon: Utensils, text: "Ambil makan secukupnya" },
  { icon: Lightbulb, text: "Matikan AC saat keluar kamar" },
];

/** The participant's own part: the panitia's routes, their answer, whether they may still answer, and the figure for an answer. */
export type CarbonFormProps = { routes: CarbonRoute[]; travel: CarbonTravel | null; open: boolean; onSave: (travel: CarbonTravel) => void; estimate?: (travel: CarbonTravel) => CarbonView };

const PART_ICON: Record<CarbonSource, LucideIcon> = SOURCE_ICON;
const PART_ORDER: CarbonSource[] = ["perjalanan", "kamar", "makan"];

/**
 * Beranda's Jejak karbon card for one person (Pra WAM, 23 Nov 2026), a small green app in a card
 * ("Organic Biophilic": rounded, a leaf, earth green with sky and sun accents): a leaf badge, the
 * title and the "For Tomorrow" chip. Before they answer: the three parts as tiles, Kamar and Makan
 * already ticked (they come from the event), Perjalanan waiting, and "Isi perjalananmu" (a step-by-step
 * sheet, CarbonTravelForm). Once answered: the figure beside a ring of the three parts, then the parts
 * as tiles with their kilograms (so nothing stands on colour alone), and "Rincian". Closed and not
 * answered: one line to ask the panitia.
 */
export function CarbonCard({ view, form }: { view: CarbonView; form?: CarbonFormProps }) {
  const [sheet, setSheet] = useState<"detail" | "form" | null>(null);
  const close = () => setSheet(null);
  const formSheet = form && sheet === "form" && <Sheet open onClose={close} title="Perjalananmu">
    <CarbonTravelForm routes={form.routes} value={form.travel} estimate={form.estimate} onSave={travel => { form.onSave(travel); close(); }} />
  </Sheet>;
  if (view.kind === "belum") {
    const parts = <span className={css.parts}>
      {PART_ORDER.map(key => {
        const Icon = PART_ICON[key];
        const ready = key !== "perjalanan";
        return <span key={key} className={`${css.part} ${ready ? "" : css.partTodo}`}>
          <span className={css.partTop}><Icon aria-hidden />{ready ? <Check aria-label="siap" className={css.partOk} /> : null}</span>
          <span className={css.partName}>{TITLES[key]}</span>
          <span className={css.partState}>{ready ? "Otomatis" : "Isi kamu"}</span>
        </span>;
      })}
    </span>;
    if (form?.open) return <>
      <button type="button" className={css.card} onClick={() => setSheet("form")} aria-haspopup="dialog" aria-label="Jejak karbon perjalananmu. Kamar dan makan sudah otomatis. Isi perjalananmu">
        <Motif />
        <CardHead />
        <span className={css.lead}>Tinggal 1 langkah</span>
        {parts}
        <span className={css.cta}>Isi perjalananmu<ChevronRight aria-hidden /></span>
      </button>
      {formSheet}
    </>;
    return <section className={`${css.card} ${css.cardWaiting}`} aria-label="Jejak karbon perjalananmu">
      <Motif />
      <CardHead />
      {parts}
      <p className={css.waiting}>{form ? "Pengisian sudah ditutup. Hubungi panitia." : "Angkamu belum tersedia."}</p>
    </section>;
  }
  const byKey = new Map(view.sources.map(source => [source.key, source]));
  return <>
    <button type="button" className={css.card} onClick={() => setSheet("detail")} aria-haspopup="dialog" aria-label={`Jejak karbon perjalananmu: perkiraan ${view.total.value} ${view.total.unit}. ${view.barLabel}. Buka rincian`}>
      <Motif />
      <CardHead />
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
            <span className={css.partValue}>{source ? source.amount : "–"}</span>
            <span className={css.partName}>{TITLES[key]}</span>
          </span>;
        })}
      </span>
      <span className={css.foot}><span className={css.more}>Rincian <ChevronRight aria-hidden /></span></span>
    </button>
    {sheet === "detail" && <Sheet open onClose={close} title="Jejak karbon perjalananmu" subtitle={`Perkiraan ${view.total.value} ${view.total.unit}`}>
      <CarbonDetail view={view} form={form} onEdit={() => setSheet("form")} />
    </Sheet>}
    {formSheet}
  </>;
}

const TITLES: Record<CarbonSource, string> = { perjalanan: "Perjalanan", kamar: "Kamar", makan: "Makan" };

/** "Jakarta · Kereta · pulang-pergi · shuttle". */
function answerText(form: CarbonFormProps): string {
  const travel = form.travel!;
  const route = form.routes.find(item => item.id === travel.routeId);
  const way = route ? `${route.from} · ${modeLabel(route.mode)}` : "Rute lain";
  return [way, travel.roundTrip ? "pulang-pergi" : "pergi saja", travel.shuttle ? "shuttle" : ""].filter(Boolean).join(" · ");
}

function CardHead() {
  return <span className={css.top}>
    <span className={css.badge}><Leaf aria-hidden /></span>
    <span className={css.title}>Jejak karbon</span>
    <span className={css.chip}>For Tomorrow</span>
  </span>;
}

/** The three parts as a ring, a leaf in the middle (decoration: the tiles below say the same in words). */
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

/** The sheet's content (also the prototype's). */
export function CarbonDetail({ view, form, onEdit }: { view: Extract<CarbonView, { kind: "ada" }>; form?: CarbonFormProps; onEdit?: () => void }) {
  const [how, setHow] = useState(false);
  return <div className={css.detail}>
    {form?.travel && <section className={css.mine} aria-label="Jawabanmu">
      <span className={css.rowIcon}><MapPin aria-hidden /></span>
      <span className={css.mineText}><strong>{answerText(form)}</strong></span>
      {form.open && onEdit && <button type="button" className={css.edit} onClick={onEdit}><PencilLine aria-hidden />Ubah</button>}
    </section>}
    {form?.travel?.routeId === OTHER_ROUTE && <p className={css.note}><Info aria-hidden />Rute lain belum dihitung.</p>}
    <section aria-labelledby="karbon-asal">
      <h3 id="karbon-asal" className={css.h}>Asalnya</h3>
      <ul className={css.rows}>
        {view.sources.map(source => {
          const Icon = SOURCE_ICON[source.key];
          return <li key={source.key} className={css.row}>
            <span className={css.rowIcon}><Icon aria-hidden /></span>
            <span className={css.rowText}>
              <span className={css.rowTop}><strong>{source.title}</strong><span className={css.rowValue}>{source.amount} · {source.percent}%</span></span>
              <span className={css.rowBar} aria-hidden><i className={swatch(source.swatch)} style={{ width: `${Math.max(source.percent, 4)}%` }} /></span>
              <span className={css.rowNote}>{source.note}</span>
            </span>
          </li>;
        })}
      </ul>
    </section>

    <section className={css.how}>
      <button type="button" className={css.howRow} aria-expanded={how} aria-controls="karbon-cara" onClick={() => setHow(!how)}>
        <span className={css.rowIcon}><Info aria-hidden /></span>
        <span className={css.howText}><strong>Cara menghitung</strong></span>
        <ChevronDown aria-hidden className={css.chevron} data-open={how || undefined} />
      </button>
      <div id="karbon-cara" className={css.howBody} hidden={!how}>
        <p>Data perjalanan × faktor emisi. Bus dan kamar dibagi rata.</p>
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
