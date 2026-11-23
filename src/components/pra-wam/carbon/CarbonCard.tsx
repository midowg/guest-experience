"use client";

import { useState } from "react";
import { BedDouble, Bike, Bus, Car, ChevronDown, ChevronRight, Droplets, Info, Leaf, Lightbulb, MapPin, PencilLine, TrainFront, Users, Utensils, type LucideIcon } from "lucide-react";
import { CARBON_REFERENCES, carbonFactorRows, groupModeLabel, ownModeLabel, tripLabel, type CarbonSource, type CarbonSourceView, type CarbonTravel, type CarbonView, type GroupTrip } from "@/lib/pra-wam/carbon";
import { Sheet } from "../Sheet";
import { CarbonTravelForm } from "./CarbonTravelForm";
import css from "./carbon.module.css";

const SOURCE_ICON: Record<CarbonSource, LucideIcon> = { perjalanan: TrainFront, kamar: BedDouble, makan: Utensils };
const FACTOR_ICON = { kereta: TrainFront, bus: Bus, mobil: Car, motor: Bike, kamar: BedDouble, makan: Utensils } as const;
const swatch = (n: 1 | 2 | 3) => css[`seg${n}`];

/** Small habits for the trip: no figures (nothing here is counted), no trees, no payment. */
const TIPS: { icon: LucideIcon; text: string }[] = [
  { icon: Droplets, text: "Bawa tumbler" },
  { icon: Utensils, text: "Ambil makan secukupnya" },
  { icon: Lightbulb, text: "Matikan AC saat keluar kamar" },
];

/** The participant's own part: the panitia's group trip, their own trip if any, whether they may change it, and the figure for an answer. */
export type CarbonFormProps = {
  trip: GroupTrip; travel: CarbonTravel | null; open: boolean;
  onSave: (travel: CarbonTravel | null) => void;
  estimate?: (travel: CarbonTravel | null) => CarbonView;
};

const PART_ORDER: CarbonSource[] = ["perjalanan", "kamar", "makan"];
const TITLES: Record<CarbonSource, string> = { perjalanan: "Perjalanan", kamar: "Kamar", makan: "Makan" };

/**
 * Beranda's Jejak karbon card for one person (Pra WAM, 23 Nov 2026), a small green app in a card
 * (rounded, a leaf, earth green with sky and sun accents): a leaf badge, "Jejak karbon" and
 * "Rincian ›" at the top; the figure beside a ring of the three parts; the parts as tiles with their
 * kilograms (so nothing stands on colour alone). Everyone counts with the panitia's group trip, so the
 * figure is there without filling anything; someone who travels on their own changes it from the
 * detail. Before the panitia set the trip: one line.
 */
export function CarbonCard({ view, form }: { view: CarbonView; form?: CarbonFormProps }) {
  const [sheet, setSheet] = useState<"detail" | "form" | null>(null);
  const close = () => setSheet(null);
  if (view.kind === "belum") return <section className={`${css.card} ${css.cardWaiting}`} aria-label="Jejak karbon">
    <Motif />
    <CardHead />
    <p className={css.waiting}>Angkamu muncul setelah panitia mengisi perjalanan.</p>
  </section>;
  const byKey = new Map(view.sources.map(source => [source.key, source]));
  return <>
    <button type="button" className={css.card} onClick={() => setSheet("detail")} aria-haspopup="dialog" aria-label={`Jejak karbon: perkiraan ${view.total.value} ${view.total.unit}. ${view.barLabel}. Buka rincian`}>
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
          const Icon = SOURCE_ICON[key];
          const source = byKey.get(key);
          return <span key={key} className={css.part}>
            <span className={css.partTop}><Icon aria-hidden />{source && <i className={swatch(source.swatch)} aria-hidden />}</span>
            <span className={css.partValue}>{source ? source.amount : "–"}</span>
            <span className={css.partName}>{TITLES[key]}</span>
          </span>;
        })}
      </span>
    </button>
    {sheet === "detail" && <Sheet open onClose={close} title="Jejak karbon" subtitle={`Perkiraan ${view.total.value} ${view.total.unit}`}>
      <CarbonDetail view={view} form={form} onEdit={() => setSheet("form")} />
    </Sheet>}
    {form && sheet === "form" && <Sheet open onClose={close} title="Perjalananmu">
      <CarbonTravelForm trip={form.trip} value={form.travel} estimate={form.estimate} onSave={travel => { form.onSave(travel); close(); }} />
    </Sheet>}
  </>;
}

/** "Kantor Yogyakarta → Kaliurang · Mobil / minibus", or their own trip. */
function answerText(form: CarbonFormProps): { title: string; sub: string } {
  if (!form.travel) return { title: tripLabel(form.trip), sub: `Bersama rombongan · ${groupModeLabel(form.trip.mode)}` };
  const own = form.travel.own;
  return { title: `Dari ${own.from}`, sub: ["Berangkat sendiri", ownModeLabel(own.mode), own.roundTrip ? "pulang-pergi" : "pergi saja"].join(" · ") };
}

function CardHead({ more }: { more?: boolean }) {
  return <span className={css.top}>
    <span className={css.badge}><Leaf aria-hidden /></span>
    <span className={css.title}>Jejak karbon</span>
    {more && <span className={css.more}>Rincian <ChevronRight aria-hidden /></span>}
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
    {form && <section className={css.mine} aria-label="Perjalananmu">
      <span className={css.rowIcon}>{form.travel ? <MapPin aria-hidden /> : <Users aria-hidden />}</span>
      <span className={css.mineText}><strong>{answerText(form).title}</strong><span>{answerText(form).sub}</span></span>
      {form.open && onEdit && <button type="button" className={css.edit} onClick={onEdit}><PencilLine aria-hidden />Ubah</button>}
    </section>}
    {form?.travel?.own.mode === "lainnya" && <p className={css.note}><Info aria-hidden />Kendaraan lain belum dihitung.</p>}
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
        <p>Data perjalanan × faktor emisi. Kendaraan dan kamar dibagi rata.</p>
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
