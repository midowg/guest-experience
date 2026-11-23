"use client";

import { useState } from "react";
import { BedDouble, Bus, ChevronDown, ChevronRight, Droplets, Info, Leaf, Lightbulb, MapPin, PencilLine, Recycle, TrainFront, Utensils, type LucideIcon } from "lucide-react";
import { CARBON_REFERENCES, OTHER_ROUTE, carbonFactorRows, routeLabel, type CarbonRoute, type CarbonSource, type CarbonSourceView, type CarbonTravel, type CarbonView } from "@/lib/pra-wam/carbon";
import { Sheet } from "../Sheet";
import { CarbonTravelForm } from "./CarbonTravelForm";
import css from "./carbon.module.css";

const SOURCE_ICON: Record<CarbonSource, LucideIcon> = { perjalanan: TrainFront, kamar: BedDouble, makan: Utensils };
const FACTOR_ICON = { kereta: TrainFront, bus: Bus, kamar: BedDouble, makan: Utensils } as const;
const swatch = (n: 1 | 2 | 3) => css[`seg${n}`];

/** Small habits for the trip: no figures (nothing here is counted), no trees, no payment. */
const TIPS: { icon: LucideIcon; text: string }[] = [
  { icon: Droplets, text: "Bawa tumbler sendiri dan isi ulang di titik air minum." },
  { icon: Utensils, text: "Ambil porsi secukupnya, habiskan yang sudah diambil." },
  { icon: Lightbulb, text: "Matikan AC dan lampu saat keluar kamar." },
  { icon: Recycle, text: "Pisahkan sampah organik dan plastik di tempat yang disediakan." },
];

/** The participant's own part: the panitia's routes, their answer, and whether they may still answer. */
export type CarbonFormProps = { routes: CarbonRoute[]; travel: CarbonTravel | null; open: boolean; onSave: (travel: CarbonTravel) => void };

/**
 * Beranda's Jejak karbon card for one person (Pra WAM, 23 Nov 2026): the one deep-green card in the
 * app, its chip "For Tomorrow" after WAM's theme "Shaping for Tomorrow".
 * Before they answer: one call to action, "Isi perjalananmu", which opens their form (a sheet: pick a
 * route the panitia listed, same way back or not, shuttle or not; never a distance). Once answered:
 * the figure with "Perkiraan selama Pra WAM", a thin bar, the three parts in columns (name and share,
 * so the bar never stands on colour alone), and a foot line with "Rincian". The detail (a sheet; the
 * total only in its subtitle, so the card is not repeated): their answer with "Ubah" while the form is
 * open, where it comes from, how it is counted (the sources as small links at its very bottom), and
 * small habits. The form closed and no answer: say so and who to ask.
 */
export function CarbonCard({ view, form }: { view: CarbonView; form?: CarbonFormProps }) {
  const [sheet, setSheet] = useState<"detail" | "form" | null>(null);
  const close = () => setSheet(null);
  const formSheet = form && sheet === "form" && <Sheet open onClose={close} title="Perjalananmu ke Pra WAM" subtitle="Sekali isi, bisa diubah selama formulir dibuka">
    <CarbonTravelForm routes={form.routes} value={form.travel} onSave={travel => { form.onSave(travel); close(); }} />
  </Sheet>;
  if (view.kind === "belum") {
    if (form?.open) return <>
      <button type="button" className={css.card} onClick={() => setSheet("form")} aria-haspopup="dialog">
        <Motif />
        <CardHead />
        <span className={css.ask}>Isi perjalananmu sekali saja, cukup memilih dari daftar. Angkamu langsung muncul di sini.</span>
        <span className={css.cta}><MapPin aria-hidden />Isi perjalananmu<ChevronRight aria-hidden /></span>
      </button>
      {formSheet}
    </>;
    return <section className={`${css.card} ${css.cardWaiting}`} aria-label="Jejak karbon perjalananmu">
      <Motif />
      <CardHead />
      <p className={css.waiting}>{form ? "Pengisian perjalanan sudah ditutup. Hubungi panitia bila perjalananmu belum tercatat." : "Angkamu muncul setelah data perjalanan dan kamarmu lengkap."}</p>
    </section>;
  }
  return <>
    <button type="button" className={css.card} onClick={() => setSheet("detail")} aria-haspopup="dialog" aria-label={`Jejak karbon perjalananmu: perkiraan ${view.total.value} ${view.total.unit} selama Pra WAM. ${view.barLabel}. Buka rincian`}>
      <Motif />
      <CardHead />
      <span className={css.figureBlock}>
        <span className={css.figure}><span className={css.number}>{view.total.value}</span><span className={css.unit}>{view.total.unit}</span></span>
        <span className={css.caption}>Perkiraan selama Pra WAM</span>
      </span>
      <Bar sources={view.sources} />
      <span className={css.legend}>{view.sources.map(source => <span key={source.key} className={css.legendItem}>
        <span className={css.legendName}><i className={swatch(source.swatch)} aria-hidden />{source.title}</span>
        <span className={css.legendValue}>{source.percent}%</span>
      </span>)}</span>
      <span className={css.foot}><span>Dihitung dari data acaramu</span><span className={css.more}>Rincian <ChevronRight aria-hidden /></span></span>
    </button>
    {sheet === "detail" && <Sheet open onClose={close} title="Jejak karbon perjalananmu" subtitle={`Perkiraan ${view.total.value} ${view.total.unit} selama Pra WAM`}>
      <CarbonDetail view={view} form={form} onEdit={() => setSheet("form")} />
    </Sheet>}
    {formSheet}
  </>;
}

/** "Jakarta · Kereta · 513 km, pulang-pergi, dengan shuttle", or the other way. */
function answerText(form: CarbonFormProps): string {
  const travel = form.travel!;
  const route = form.routes.find(item => item.id === travel.routeId);
  const way = route ? routeLabel(route) : "Rute lain, perjalanan belum dihitung";
  return [way, travel.roundTrip ? "pulang-pergi" : "pergi saja", travel.shuttle ? "dengan shuttle" : "tanpa shuttle"].join(", ");
}

function CardHead() {
  return <span className={css.head}>
    <span className={css.chip}><Leaf aria-hidden />For Tomorrow</span>
    <span className={css.title}>Jejak karbon perjalananmu</span>
  </span>;
}

function Bar({ sources }: { sources: CarbonSourceView[] }) {
  return <span className={css.bar} aria-hidden>
    {sources.map(source => <i key={source.key} className={swatch(source.swatch)} style={{ flexGrow: Math.max(source.percent, 3) }} />)}
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
      <span className={css.mineText}><strong>Perjalananmu</strong><span>{answerText(form)}</span></span>
      {form.open && onEdit && <button type="button" className={css.edit} onClick={onEdit}><PencilLine aria-hidden />Ubah</button>}
    </section>}
    {form?.travel?.routeId === OTHER_ROUTE && <p className={css.note}><Info aria-hidden />Kamu memilih rute lain, jadi perjalananmu belum ikut dihitung. Kamar dan makan tetap dihitung.</p>}
    <section aria-labelledby="karbon-asal">
      <h3 id="karbon-asal" className={css.h}>Dari mana asalnya</h3>
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
        <span className={css.howText}><strong>Cara menghitung</strong><span>Data perjalananmu × faktor emisi</span></span>
        <ChevronDown aria-hidden className={css.chevron} data-open={how || undefined} />
      </button>
      <div id="karbon-cara" className={css.howBody} hidden={!how}>
        <p>Perjalanan, kamar, dan porsi makan diambil dari data acaramu yang diisi panitia. Emisi bus dibagi rata ke penumpangnya, emisi kamar dibagi rata ke penghuninya.</p>
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
        <p className={css.quiet}>Emisi hanya dicatat untuk laporan dampak, tanpa penebusan atau kontribusi.</p>
        <p className={css.refs}>
          <span>Sumber data:</span>{" "}
          {CARBON_REFERENCES.map((ref, index) => <span key={ref.url}>
            <a href={ref.url} target="_blank" rel="noopener noreferrer" title={ref.title}>{ref.short}</a>{index < CARBON_REFERENCES.length - 1 ? ", " : ""}
          </span>)}
        </p>
      </div>
    </section>

    <section aria-labelledby="karbon-langkah">
      <h3 id="karbon-langkah" className={css.h}>Langkah kecil selama acara</h3>
      <ul className={css.tips}>
        {TIPS.map(({ icon: Icon, text }) => <li key={text}><Icon aria-hidden /><span>{text}</span></li>)}
      </ul>
    </section>

  </div>;
}
