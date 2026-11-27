"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { BookOpen, CircleAlert, Coffee, CupSoda, Info, Plus, Send } from "lucide-react";
import { DRINK_GROUPS, DRINK_GROUP_LABEL, PLACE_LABEL, drinkIn, drinkLabel, groupsIn, offeredTo, optionsLabel, placeOf, startChoice, type Drink, type DrinkGroup } from "@/lib/coffee/menu";
import { LineDialog } from "./LineDialog";
import { MAX_LINES, MAX_QTY, countLabel, counts, defaultLine, lineTag, type Draft, type GaOptions, type GaPerson, type Line, type LineFor } from "./model";
import { Photo, ScreenHead, Stepper, useSettled } from "./parts";
import css from "./ga.module.css";

/**
 * Input cepat: tap a drink to add one for a guest, with the bawaan of what guests are asked
 * (Panas · gula Normal while Pengaturan asks both; nothing when it asks nothing); "Ketuk untuk" switches
 * the taps to a team member, who is then asked for by name. Each row can be changed or removed.
 * Kirim sends the whole order to the pengelola once; while it is being sent nothing can be pressed twice.
 * F7: the grid follows "Ketuk untuk": Tamu shows the drinks of Buku tamu, Tim · rapat those of
 * Menu biasa (the pengelola ticks them in Menu), and says which; a kind without a drink there has no tab.
 */
const GROUP_ICON: Record<DrinkGroup, typeof Coffee> = { kopi: Coffee, "non-kopi": CupSoda };
export function QuickInput({ draft, lines, setLines, people, menu, options, sending, problem, onSend, onGuest, onBack }: {
  draft: Draft; lines: Line[]; setLines: Dispatch<SetStateAction<Line[]>>; people: GaPerson[]; menu: readonly Drink[]; options: GaOptions; sending: boolean; problem: string | null;
  onSend: () => void; onGuest: () => void; onBack: () => void;
}) {
  const [picked, setGroup] = useState<DrinkGroup>("kopi");
  const [tapFor, setTapFor] = useState<LineFor>("tamu");
  const [editing, setEditing] = useState<{ line: Line; isNew: boolean } | null>(null);
  /** A tap that could not add anything because the order is full: said out loud, not swallowed. */
  const [refused, setRefused] = useState(0);
  const settled = useSettled();
  const listed = offeredTo(menu, tapFor);
  const present = groupsIn(listed);
  const groups: readonly DrinkGroup[] = present.length ? present : DRINK_GROUPS;
  const group = groups.includes(picked) ? picked : groups[0];
  const drinks = listed.filter(drink => drink.group === group);
  const place = PLACE_LABEL[placeOf(tapFor)];
  // What a tapped drink starts with for a guest, in words ("" when guests are asked nothing).
  const first = startChoice(undefined, options.tamu);
  const bawaan = optionsLabel(first.temperature, first.sugar, first.ice);
  const qtyOf = (slug: string) => lines.filter(line => line.slug === slug).reduce((sum, line) => sum + line.qty, 0);
  const { total } = counts(lines);
  const full = lines.length >= MAX_LINES;

  const add = (drink: Drink) => {
    const slug = drink.slug;
    if (sending || !settled()) return;
    if (tapFor === "tim") { if (full) setRefused(count => count + 1); else setEditing({ line: defaultLine(drink, "tim", options), isNew: true }); return; }
    const base = defaultLine(drink, "tamu", options);
    // One more of a row only when it is the very same drink: the bawaan options, the ice level included
    // (Cucumber Ice changed to "es Sedikit" is another row), and no guest's name on it.
    const same = lines.find(line => line.for === "tamu" && !line.guestName && line.slug === slug && line.temperature === base.temperature && line.sugar === base.sugar && (base.temperature !== "es" || line.ice === base.ice) && line.qty < MAX_QTY);
    if (!same && full) { setRefused(count => count + 1); return; }
    setLines(list => same && list.includes(same) ? list.map(line => line === same ? { ...line, qty: line.qty + 1 } : line) : list.length >= MAX_LINES ? list : [...list, base]);
  };
  const handOver = () => { if (sending) return; if (full) setRefused(count => count + 1); else onGuest(); };
  const setQty = (id: string, qty: number) => setLines(list => qty <= 0 ? list.filter(line => line.id !== id) : list.map(line => line.id === id ? { ...line, qty } : line));
  const save = (line: Line) => {
    setLines(list => editing?.isNew ? [...list, line] : list.map(item => item.id === line.id ? line : item));
    setEditing(null);
  };

  const sub = [draft.room, `PIC ${draft.pic.name}`, draft.guest, draft.guestCount ? `${draft.guestCount} orang` : ""].filter(Boolean).join(" · ");
  return (
    <div className={css.screen}>
      <ScreenHead title={draft.parent ? `Tambah lagi untuk #${draft.parent.no}` : "Input cepat"} sub={sub} onBack={onBack} backLabel={draft.parent ? "Beranda" : "Ubah data"}>
        <button type="button" className={css.secondary} disabled={sending} aria-disabled={full || undefined} onClick={handOver}><BookOpen aria-hidden size={20} />Serahkan ke tamu</button>
      </ScreenHead>
      <div className={css.quickGrid}>
        <section className={css.menuPane} aria-label="Menu minuman">
          <div className={css.menuBar}>
            <div className={css.segmented} role="group" aria-label="Jenis minuman">
              {groups.map(key => {
                const Icon = GROUP_ICON[key];
                return <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)}><Icon aria-hidden size={18} />{DRINK_GROUP_LABEL[key]}</button>;
              })}
            </div>
            <div className={css.tapFor} role="group" aria-label="Minuman yang diketuk untuk">
              <span className={css.mutedSmall} aria-hidden>Ketuk untuk</span>
              <button type="button" aria-pressed={tapFor === "tamu"} onClick={() => setTapFor("tamu")}>Tamu</button>
              <button type="button" aria-pressed={tapFor === "tim"} onClick={() => setTapFor("tim")}>Tim · rapat</button>
            </div>
          </div>
          <p className={css.mutedSmall} role="status">{drinks.length ? `Menampilkan ${place}.` : `Belum ada minuman ${DRINK_GROUP_LABEL[group].toLowerCase()} di ${place}.`}</p>
          <ul className={css.drinkGrid}>
            {drinks.map(drink => {
              const qty = qtyOf(drink.slug);
              return (
                <li key={drink.slug}>
                  <button type="button" className={css.tile} onClick={() => add(drink)} aria-label={`Tambah ${drink.name}${qty ? `, sudah ${qty}` : ""}`}>
                    <Photo src={drink.photo} width={200} height={150} group={drink.group} />
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
              <p>Ketuk minuman di menu. {bawaan ? `Bawaannya ${bawaan}, untuk Tamu.` : "Bawaannya untuk Tamu."}</p>
            </div>
          ) : (
            <ul className={css.lines}>
              {lines.map(line => {
                const drink = drinkIn(menu, line.slug);
                const name = drinkLabel(line.slug, null, drink?.name);
                const chosen = optionsLabel(line.temperature, line.sugar, line.ice);
                return (
                  <li key={line.id}>
                    <button type="button" className={css.lineBody} disabled={sending} onClick={() => setEditing({ line, isNew: false })} aria-label={`Ubah ${name}, ${lineTag(line.for, line.for === "tim" ? line.person?.name : line.guestName)}`}>
                      <Photo src={drink?.photo} width={44} height={44} group={drink?.group} />
                      <span className={css.grow}>
                        <strong>{name}</strong>
                        {chosen && <span>{chosen}</span>}
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
            {full && (
              <p key={refused} className={refused ? css.fullNote : css.mutedSmall} role="status">
                {refused ? "Tidak ditambahkan: pesanan sudah penuh. " : ""}Paling banyak {MAX_LINES} baris per kiriman. Kirim dulu, lalu Tambah lagi.
              </p>
            )}
            {problem
              ? <p className={css.problem} role="alert"><CircleAlert aria-hidden size={18} /><span>{problem}</span></p>
              : <p className={css.sendTo}><Info aria-hidden size={16} />Dikirim ke pengelola WG Coffee (HR dan admin yang punya akses).</p>}
            <button type="button" className={`${css.primary} ${css.big}`} disabled={!total} aria-disabled={sending || undefined} onClick={() => { if (!sending) onSend(); }}>
              <Send aria-hidden size={20} />{sending ? "Mengirim…" : total ? `Kirim ${total} minuman` : "Kirim"}
            </button>
          </div>
        </section>
      </div>
      {editing && <LineDialog line={editing.line} isNew={editing.isNew} pic={draft.pic} people={people} menu={menu} options={options} onClose={() => setEditing(null)} onSave={save}
        onRemove={() => { setLines(list => list.filter(item => item.id !== editing.line.id)); setEditing(null); }} />}
    </div>
  );
}
