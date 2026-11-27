"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { GROUP_LABEL } from "@/lib/coffee/menu";
import { NO_ROOM, type RecapSummary } from "@/lib/coffee/recap";
import { Dots } from "./QueueCard";
import css from "./coffee-admin.module.css";

/*
 * Rekap → Ringkasan shows ONE breakdown at a time (27 Nov 2026, the owner: the four panels side by
 * side were far apart and squeezed). Each view is described as data (a head, lines, a total) and
 * drawn once: a table beside a mouse, a list of cards on a phone. The table shrinks to its content
 * (names left, numbers right beside them) instead of stretching over the panel.
 */

export type RecapView = "karyawan" | "minuman" | "pic" | "bu" | "kelompok" | "ruangan";
export const RECAP_VIEWS: { id: RecapView; label: string }[] = [
  { id: "karyawan", label: "Karyawan" }, { id: "minuman", label: "Minuman" }, { id: "pic", label: "PIC tamu" },
  { id: "bu", label: "BU" }, { id: "kelompok", label: "Kelompok" }, { id: "ruangan", label: "Ruangan" },
];

type Head = { label: string; num?: boolean };
type Line = { key: string; name: string; sub: string; cells: ReactNode[]; side: ReactNode; under?: ReactNode };
type Layout = { title: string; caption: string; first: string; heads: Head[]; lines: Line[]; total?: { cells: ReactNode[]; side: ReactNode }; empty: string; note?: string; bars?: boolean };

const plural = (count: number, one: string) => `${count} ${one}`;

function layoutOf(view: RecapView, summary: RecapSummary, title: string, manyMonths: boolean): Layout {
  switch (view) {
    case "karyawan": {
      return {
        title: "Per karyawan",
        caption: manyMonths ? `Jumlah klaim per karyawan · ${title}` : `Jatah terpakai per karyawan · ${title}`,
        first: "Nama",
        heads: [{ label: "Kelompok" }, { label: "BU" }, manyMonths ? { label: "Klaim", num: true } : { label: "Jatah terpakai" }, { label: "Tim · rapat", num: true }, { label: "Ditolak", num: true }],
        lines: summary.people.map(({ person, quota, used, team, refused }) => ({
          key: person.id, name: person.name,
          sub: `${[GROUP_LABEL[person.group], person.bu].filter(Boolean).join(" · ")}${team ? ` · tim · rapat ${team}` : ""}${refused ? ` · ditolak ${refused}` : ""}`,
          cells: [
            GROUP_LABEL[person.group], person.bu || "–",
            manyMonths ? used || "–" : <span className={css.quotaCell}><Dots used={used} quota={quota} /><span className={css.num}>{used}/{quota}</span>{quota > 0 && used >= quota && <span className={css.pill} data-tone="off">Habis</span>}</span>,
            team || "–", refused || "–",
          ],
          side: manyMonths
            ? <><strong className={css.num}>{used}</strong> klaim</>
            : <><Dots used={used} quota={quota} /><span className={css.num}>{quota > 0 && used >= quota ? "Habis" : `${used}/${quota}`}</span></>,
        })),
        empty: "Belum ada karyawan untuk ditampilkan.",
        note: manyMonths ? "Rentang lebih dari satu bulan: yang tampil jumlah klaim saja, tanpa perbandingan dengan jatah bulanan." : undefined,
      };
    }
    case "minuman": {
      const top = summary.drinks[0]?.count || 1;
      const all = summary.total || 1;
      const share = (count: number) => `${Math.round((count / all) * 100)}%`;
      return {
        title: "Per minuman", caption: `Minuman paling banyak dibuat · ${title}`, first: "Minuman", bars: true,
        heads: [{ label: "Grafik" }, { label: "Jumlah", num: true }, { label: "Porsi", num: true }],
        lines: summary.drinks.map(item => ({
          key: item.drink, name: item.drink, sub: `${share(item.count)} dari semua minuman`,
          cells: [<span key="bar" className={css.barTrack} aria-hidden><span style={{ width: `${(item.count / top) * 100}%` }} /></span>, item.count, share(item.count)],
          side: <strong className={css.num}>{item.count}</strong>,
          under: <span className={css.barTrack} aria-hidden><span style={{ width: `${(item.count / top) * 100}%` }} /></span>,
        })),
        total: { cells: ["", summary.drinks.reduce((sum, item) => sum + item.count, 0), summary.drinks.length ? "100%" : "–"], side: <strong className={css.num}>{summary.drinks.reduce((sum, item) => sum + item.count, 0)}</strong> },
        empty: "Tidak ada data untuk filter ini.",
      };
    }
    case "pic": {
      const sum = (pick: (pic: RecapSummary["pics"][number]) => number) => summary.pics.reduce((all, pic) => all + pick(pic), 0);
      return {
        title: "Per PIC tamu", caption: `Rapat, tamu, dan minuman tamu per PIC · ${title}`, first: "PIC",
        heads: [{ label: "Rapat", num: true }, { label: "Tamu (orang)", num: true }, { label: "Minuman", num: true }],
        lines: summary.pics.map(pic => ({
          key: pic.pic, name: pic.pic, sub: `${pic.meetings} rapat · ${pic.guests} tamu`,
          cells: [pic.meetings, pic.guests, pic.drinks], side: <><strong className={css.num}>{pic.drinks}</strong> minuman</>,
        })),
        total: { cells: [sum(pic => pic.meetings), sum(pic => pic.guests), sum(pic => pic.drinks)], side: <><strong className={css.num}>{sum(pic => pic.drinks)}</strong> minuman</> },
        empty: "Tidak ada tamu untuk filter ini.",
      };
    }
    case "bu": {
      const sum = (pick: (bu: RecapSummary["bus"][number]) => number) => summary.bus.reduce((all, bu) => all + pick(bu), 0);
      return {
        title: "Per BU", caption: `Minuman per unit bisnis · ${title}`, first: "BU",
        heads: [{ label: "Klaim", num: true }, { label: "Tamu", num: true }, { label: "Tim · rapat", num: true }, { label: "Total", num: true }],
        lines: summary.bus.map(bu => ({
          key: bu.bu || "-", name: bu.bu || "Tanpa BU", sub: `Klaim ${bu.klaim} · tamu ${bu.tamu} · tim · rapat ${bu.tim}`,
          cells: [bu.klaim, bu.tamu, bu.tim, <strong key="t">{bu.total}</strong>], side: <strong className={css.num}>{bu.total}</strong>,
        })),
        total: { cells: [sum(bu => bu.klaim), sum(bu => bu.tamu), sum(bu => bu.tim), <strong key="t">{sum(bu => bu.total)}</strong>], side: <strong className={css.num}>{sum(bu => bu.total)}</strong> },
        empty: "Tidak ada data untuk filter ini.", note: "Tamu dihitung ke BU PIC-nya.",
      };
    }
    case "kelompok": {
      const sum = (pick: (entry: RecapSummary["groups"][number]) => number) => summary.groups.reduce((all, entry) => all + pick(entry), 0);
      return {
        title: "Per kelompok", caption: `Karyawan, Tim GA, dan Intern · ${title}`, first: "Kelompok",
        heads: [{ label: "Orang", num: true }, { label: "Klaim", num: true }, { label: "Tim · rapat", num: true }, { label: "Ditolak", num: true }, { label: "Total", num: true }],
        lines: summary.groups.map(entry => ({
          key: entry.group, name: GROUP_LABEL[entry.group], sub: `${plural(entry.people, "orang")} · klaim ${entry.klaim} · tim · rapat ${entry.tim}`,
          cells: [entry.people, entry.klaim, entry.tim, entry.refused || "–", <strong key="t">{entry.total}</strong>], side: <strong className={css.num}>{entry.total}</strong>,
        })),
        total: { cells: [sum(entry => entry.people), sum(entry => entry.klaim), sum(entry => entry.tim), sum(entry => entry.refused) || "–", <strong key="t">{sum(entry => entry.total)}</strong>], side: <strong className={css.num}>{sum(entry => entry.total)}</strong> },
        empty: "Belum ada karyawan untuk ditampilkan.", note: "Tamu tidak masuk kelompok mana pun; lihat PIC tamu atau Ruangan.",
      };
    }
    case "ruangan": {
      const sum = (pick: (entry: RecapSummary["rooms"][number]) => number) => summary.rooms.reduce((all, entry) => all + pick(entry), 0);
      return {
        title: "Per ruangan", caption: `Pesanan rapat per ruang pertemuan · ${title}`, first: "Ruangan",
        heads: [{ label: "Rapat", num: true }, { label: "Tamu (orang)", num: true }, { label: "Minuman tamu", num: true }, { label: "Minuman tim", num: true }, { label: "Total", num: true }],
        lines: summary.rooms.map(entry => ({
          key: entry.room, name: entry.room, sub: `${entry.meetings} rapat · ${entry.guests} tamu · tim ${entry.tim}`,
          cells: [entry.meetings, entry.guests, entry.tamu, entry.tim || "–", <strong key="t">{entry.total}</strong>], side: <><strong className={css.num}>{entry.total}</strong> minuman</>,
        })),
        total: { cells: [sum(entry => entry.meetings), sum(entry => entry.guests), sum(entry => entry.tamu), sum(entry => entry.tim) || "–", <strong key="t">{sum(entry => entry.total)}</strong>], side: <><strong className={css.num}>{sum(entry => entry.total)}</strong> minuman</> },
        empty: "Tidak ada pesanan rapat untuk filter ini.",
        note: summary.rooms.some(entry => entry.room === NO_ROOM) ? "Tanpa ruangan: pesanan rapat yang tidak mengisi ruangan." : undefined,
      };
    }
  }
}

/** "Lihat per": one choice of six, a radio group (arrows move and choose, Home and End jump). */
export function RecapViewPicker({ value, onChange }: { value: RecapView; onChange: (view: RecapView) => void }) {
  const uid = useId();
  const move = (event: KeyboardEvent) => {
    const at = RECAP_VIEWS.findIndex(item => item.id === value);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? at + 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? at - 1 : event.key === "Home" ? 0 : event.key === "End" ? RECAP_VIEWS.length - 1 : null;
    if (step === null) return;
    event.preventDefault();
    const target = RECAP_VIEWS[(step + RECAP_VIEWS.length) % RECAP_VIEWS.length].id;
    onChange(target);
    document.getElementById(`${uid}-${target}`)?.focus();
  };
  return (
    <div className={css.viewPicker}>
      <span id={`${uid}-label`} className={css.viewPickerLabel}>Lihat per</span>
      <div className={css.viewChoices} role="radiogroup" aria-labelledby={`${uid}-label`} onKeyDown={move}>
        {RECAP_VIEWS.map(item => (
          <button key={item.id} type="button" role="radio" id={`${uid}-${item.id}`} aria-checked={value === item.id} tabIndex={value === item.id ? 0 : -1} onClick={() => onChange(item.id)}>{item.label}</button>
        ))}
      </div>
    </div>
  );
}

/** The chosen breakdown: its heading and caption (announced when the choice changes), then the table or the cards. */
export function RecapBreakdown({ view, summary, title, phone, manyMonths }: { view: RecapView; summary: RecapSummary; title: string; phone: boolean; manyMonths: boolean }) {
  const uid = useId();
  const layout = layoutOf(view, summary, title, manyMonths);
  return (
    <section className={css.breakdown} aria-labelledby={`${uid}-h`} data-view={view}>
      <div aria-live="polite" aria-atomic="true" className={css.breakdownHead}>
        <h2 id={`${uid}-h`}>{layout.title}</h2>
        <p className={css.viewCaption}>{layout.caption}</p>
      </div>
      {layout.note && <p className={css.viewNote}>{layout.note}</p>}
      {!layout.lines.length ? <p className={css.small}>{layout.empty}</p> : phone ? (
        <ul className={css.cardList}>
          {layout.lines.map(line => (
            <li key={line.key}>
              <span className={css.cardListMain}>
                <strong>{line.name}</strong>
                {layout.bars ? line.under : <span>{line.sub}</span>}
              </span>
              <span className={css.cardListSide}>{line.side}</span>
            </li>
          ))}
          {layout.total && <li className={css.cardTotal}><span className={css.cardListMain}><strong>Total</strong></span><span className={css.cardListSide}>{layout.total.side}</span></li>}
        </ul>
      ) : (
        <div className={css.tableBox} tabIndex={0} role="region" aria-label={`${layout.title}, tabel`}>
          <table className={css.sumTable} data-bars={layout.bars ? "true" : undefined}>
            <thead>
              <tr>
                <th scope="col">{layout.first}</th>
                {layout.heads.map((head, index) => <th key={index} scope="col" className={head.num ? css.num : undefined}>{layout.bars && index === 0 ? <span className={css.srOnly}>{head.label}</span> : head.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {layout.lines.map(line => (
                <tr key={line.key}>
                  <th scope="row"><span className={css.cellName} title={line.name}>{line.name}</span></th>
                  {line.cells.map((cell, index) => <td key={index} className={layout.heads[index].num ? css.num : layout.bars && index === 0 ? css.barCell : undefined}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
            {layout.total && (
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  {layout.total.cells.map((cell, index) => <td key={index} className={layout.heads[index].num ? css.num : undefined}>{cell}</td>)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}
