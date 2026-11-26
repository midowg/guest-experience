"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { BookOpen, CircleAlert, Coffee, CupSoda, Info, Plus, Send } from "lucide-react";
import { DRINKS, drinkLabel, optionsLabel, type DrinkGroup } from "@/lib/coffee/menu";
import { LineDialog } from "./LineDialog";
import { MAX_LINES, MAX_QTY, countLabel, counts, defaultLine, lineTag, type Draft, type GaPerson, type Line, type LineFor } from "./model";
import { Photo, ScreenHead, Stepper, useSettled } from "./parts";
import css from "./ga.module.css";

/**
 * Input cepat: tap a drink to add one (Panas · gula Normal, for a guest); "Ketuk untuk" switches
 * the taps to a team member, who is then asked for by name. Each row can be changed or removed.
 * Kirim sends the whole order to the pengelola once; while it is being sent nothing can be pressed twice.
 */
export function QuickInput({ draft, lines, setLines, people, sending, problem, onSend, onGuest, onBack }: {
  draft: Draft; lines: Line[]; setLines: Dispatch<SetStateAction<Line[]>>; people: GaPerson[]; sending: boolean; problem: string | null;
  onSend: () => void; onGuest: () => void; onBack: () => void;
}) {
  const [group, setGroup] = useState<DrinkGroup>("kopi");
  const [tapFor, setTapFor] = useState<LineFor>("tamu");
  const [editing, setEditing] = useState<{ line: Line; isNew: boolean } | null>(null);
  const settled = useSettled();
  const drinks = DRINKS.filter(drink => drink.group === group);
  const qtyOf = (slug: string) => lines.filter(line => line.slug === slug).reduce((sum, line) => sum + line.qty, 0);
  const { total } = counts(lines);
  const full = lines.length >= MAX_LINES;

  const add = (slug: string) => {
    if (sending || !settled()) return;
    if (tapFor === "tim") { if (!full) setEditing({ line: defaultLine(slug, "tim"), isNew: true }); return; }
    setLines(list => {
      const base = defaultLine(slug, "tamu");
      const same = list.find(line => line.for === "tamu" && !line.guestName && line.slug === slug && line.temperature === base.temperature && line.sugar === "Normal" && line.qty < MAX_QTY);
      if (same) return list.map(line => line === same ? { ...line, qty: line.qty + 1 } : line);
      return list.length >= MAX_LINES ? list : [...list, base];
    });
  };
  const setQty = (id: string, qty: number) => setLines(list => qty <= 0 ? list.filter(line => line.id !== id) : list.map(line => line.id === id ? { ...line, qty } : line));
  const save = (line: Line) => {
    setLines(list => editing?.isNew ? [...list, line] : list.map(item => item.id === line.id ? line : item));
    setEditing(null);
  };

  const sub = [draft.room, `PIC ${draft.pic.name}`, draft.guest, draft.guestCount ? `${draft.guestCount} orang` : ""].filter(Boolean).join(" · ");
  return (
    <div className={css.screen}>
      <ScreenHead title={draft.parent ? `Tambah lagi untuk #${draft.parent.no}` : "Input cepat"} sub={sub} onBack={onBack} backLabel={draft.parent ? "Beranda" : "Ubah data"}>
        <button type="button" className={css.secondary} disabled={sending} onClick={onGuest}><BookOpen aria-hidden size={20} />Serahkan ke tamu</button>
      </ScreenHead>
      <div className={css.quickGrid}>
        <section className={css.menuPane} aria-label="Menu minuman">
          <div className={css.menuBar}>
            <div className={css.segmented} role="group" aria-label="Jenis minuman">
              <button type="button" aria-pressed={group === "kopi"} onClick={() => setGroup("kopi")}><Coffee aria-hidden size={18} />Kopi</button>
              <button type="button" aria-pressed={group === "non-kopi"} onClick={() => setGroup("non-kopi")}><CupSoda aria-hidden size={18} />Non-kopi</button>
            </div>
            <div className={css.tapFor} role="group" aria-label="Minuman yang diketuk untuk">
              <span className={css.mutedSmall} aria-hidden>Ketuk untuk</span>
              <button type="button" aria-pressed={tapFor === "tamu"} onClick={() => setTapFor("tamu")}>Tamu</button>
              <button type="button" aria-pressed={tapFor === "tim"} onClick={() => setTapFor("tim")}>Tim · rapat</button>
            </div>
          </div>
          <ul className={css.drinkGrid}>
            {drinks.map(drink => {
              const qty = qtyOf(drink.slug);
              return (
                <li key={drink.slug}>
                  <button type="button" className={css.tile} onClick={() => add(drink.slug)} aria-label={`Tambah ${drink.name}${qty ? `, sudah ${qty}` : ""}`}>
                    <Photo slug={drink.slug} width={200} height={150} />
                    <span className={css.tileName}>{drink.name}</span>
                    <span className={css.tilePlus} aria-hidden><Plus size={20} /></span>
                    {qty > 0 && <span className={css.tileCount} aria-hidden>{qty}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={css.orderPane} aria-labelledby="ga-pesanan-judul">
          <h2 id="ga-pesanan-judul">Pesanan</h2>
          {lines.length === 0 ? (
            <div className={css.orderEmpty}>
              <Coffee aria-hidden size={28} />
              <p>Ketuk minuman di menu. Bawaannya Panas · gula Normal, untuk Tamu.</p>
            </div>
          ) : (
            <ul className={css.lines}>
              {lines.map(line => {
                const name = drinkLabel(line.slug);
                return (
                  <li key={line.id}>
                    <button type="button" className={css.lineBody} disabled={sending} onClick={() => setEditing({ line, isNew: false })} aria-label={`Ubah ${name}, ${lineTag(line.for, line.for === "tim" ? line.person?.name : line.guestName)}`}>
                      <Photo slug={line.slug} width={44} height={44} />
                      <span className={css.grow}>
                        <strong>{name}</strong>
                        <span>{optionsLabel(line.temperature, line.sugar, line.ice)}</span>
                        <span className={css.tag} data-for={line.for}>{lineTag(line.for, line.for === "tim" ? line.person?.name : line.guestName)}</span>
                      </span>
                    </button>
                    <Stepper value={line.qty} min={0} max={MAX_QTY} onChange={qty => { if (!sending) setQty(line.id, qty); }} name={name} />
                  </li>
                );
              })}
            </ul>
          )}
          <div className={css.orderFoot}>
            <p className={css.total} aria-live="polite">{total ? countLabel(lines) : "Belum ada minuman"}</p>
            {full && <p className={css.mutedSmall}>Paling banyak {MAX_LINES} baris per kiriman. Kirim dulu, lalu Tambah lagi.</p>}
            {problem
              ? <p className={css.problem} role="alert"><CircleAlert aria-hidden size={18} /><span>{problem}</span></p>
              : <p className={css.sendTo}><Info aria-hidden size={16} />Dikirim ke pengelola Werkudara Coffee (HR dan admin yang punya akses).</p>}
            <button type="button" className={`${css.primary} ${css.big}`} disabled={!total} aria-disabled={sending || undefined} onClick={() => { if (!sending) onSend(); }}>
              <Send aria-hidden size={20} />{sending ? "Mengirim…" : total ? `Kirim ${total} minuman` : "Kirim"}
            </button>
          </div>
        </section>
      </div>
      {editing && <LineDialog line={editing.line} isNew={editing.isNew} pic={draft.pic} people={people} onClose={() => setEditing(null)} onSave={save}
        onRemove={() => { setLines(list => list.filter(item => item.id !== editing.line.id)); setEditing(null); }} />}
    </div>
  );
}
