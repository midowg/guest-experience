"use client";

import { useState } from "react";
import { BedDouble, Bus, ChevronDown, ChevronRight, Droplets, Info, Leaf, Lightbulb, Recycle, TrainFront, Utensils, type LucideIcon } from "lucide-react";
import { CARBON_REFERENCES, carbonFactorRows, type CarbonSource, type CarbonSourceView, type CarbonView } from "@/lib/pra-wam/carbon";
import { Sheet } from "../Sheet";
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

/**
 * Beranda's Jejak karbon card for one person (Pra WAM, 23 Nov 2026): a deep green card (the one
 * place the app goes green, so it reads as green, under WAM's theme "Shaping for Tomorrow"), "Jejak karbon kamu" with a leaf, the figure in
 * big Poppins, "perkiraan" and the sources in words, and a thin bar. The whole card opens the detail
 * (a sheet, the total in its subtitle so the card is not repeated): where it comes from, how it is
 * counted (the sources as small links at its very bottom), and small habits. The bar never stands on colour alone: every part is also a row with its name and share.
 */
export function CarbonCard({ view }: { view: CarbonView }) {
  const [open, setOpen] = useState(false);
  if (view.kind === "belum") return <section className={`${css.card} ${css.cardWaiting}`} aria-label="Jejak karbon kamu">
    <CardHead />
    <p className={css.waiting}>Perkiraan muncul setelah perjalanan dan kamarmu diisi panitia.</p>
  </section>;
  return <>
    <button type="button" className={css.card} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Jejak karbon kamu, perkiraan ${view.total.value} ${view.total.unit}. ${view.barLabel}. Buka rincian`}>
      <Motif />
      <CardHead />
      <span className={css.figure}><span className={css.number}>{view.total.value}</span><span className={css.unit}>{view.total.unit}</span></span>
      <Bar sources={view.sources} />
      <span className={css.legend}>{view.sources.map(source => <span key={source.key} className={css.legendItem}><i className={swatch(source.swatch)} aria-hidden />{source.title} {source.percent}%</span>)}</span>
      <span className={css.more}>Lihat rincian <ChevronRight aria-hidden /></span>
    </button>
    {open && <Sheet open onClose={() => setOpen(false)} title="Jejak karbon kamu" subtitle={`Perkiraan ${view.total.value} ${view.total.unit} untuk perjalanan Pra WAM`}>
      <CarbonDetail view={view} />
    </Sheet>}
  </>;
}

function CardHead() {
  return <span className={css.head}>
    <span className={css.chip}><Leaf aria-hidden />For Tomorrow</span>
    <span className={css.title}>Jejak karbon kamu</span>
    <span className={css.estimate}><i aria-hidden />Perkiraan</span>
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
export function CarbonDetail({ view }: { view: Extract<CarbonView, { kind: "ada" }> }) {
  const [how, setHow] = useState(false);
  return <div className={css.detail}>
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
        <span className={css.howText}><strong>Cara menghitung</strong><span>Data kegiatan × faktor emisi</span></span>
        <ChevronDown aria-hidden className={css.chevron} data-open={how || undefined} />
      </button>
      <div id="karbon-cara" className={css.howBody} hidden={!how}>
        <p>Perjalanan, kamar, dan jumlah makan diambil dari data acaramu. Bus dibagi jumlah penumpang, kamar dibagi jumlah penghuni.</p>
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
