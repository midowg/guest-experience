"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, Lock } from "lucide-react";
import { DRINK_GROUPS, DRINK_GROUP_LABEL, ICE_LEVELS, SUGAR_LEVELS, asksIce, drinkIn, drinkLabel, fitChoice, groupsIn, offeredTo, optionsLabel, startChoice, type Drink, type DrinkGroup, type DrinkOptions } from "@/lib/coffee/menu";
import { GUEST_NAME_MAX } from "@/lib/coffee/schemas";
import { ExitDialog, type BookExit } from "./ExitDialog";
import type { BookState, Pick } from "./hold";
import { newLineId, type Line } from "./model";
import { Photo, useSettled } from "./parts";
import css from "./ga.module.css";

/**
 * "Serahkan ke tamu": the tablet becomes a menu book. A black cover with only the gold Pegasus,
 * then paper pages. The guest reads "Anda", never a word about quota or free drinks, and no
 * employee data but the name of the PIC GA chose. It is given no API and no list of people: what
 * the guests pick goes back to GA's order panel as Tamu rows, and GA sends. Leaving needs the PIN
 * GA (`exit`; a question while the pengelola has not set one). `menu` is the pengelola's menu and
 * `options` what a guest is asked with a drink (Pengaturan): the pages show only those. Of the
 * menu the book shows the drinks ticked "Buku tamu" (F7), and a tab only for a kind that has one.
 *
 * After the F3 audit: what the guests picked is handed up as it changes (`onKeep`) and given back
 * after a reload (`saved`), so a reload lands on this book again and loses nothing. `locked`: the
 * tablet was reloaded in guest mode and nothing could be restored; only the cover and the way out
 * for the GA officer are left. A long press, a pull or a selection finds nothing to open here.
 */
export function GuestBook({ room, picName, guest, max, menu, options, saved, locked = false, exit, onKeep, onDone }: {
  room: string; picName: string; guest?: string; max: number; menu: readonly Drink[]; options: DrinkOptions; saved?: BookState; locked?: boolean; exit: BookExit; onKeep?: (book: BookState) => void; onDone: (lines: Line[]) => void;
}) {
  const [open, setOpen] = useState(saved?.open ?? false);
  const [picked, setGroup] = useState<DrinkGroup>("kopi");
  const [drink, setDrink] = useState<Drink | null>(null);
  const [picks, setPicks] = useState<Pick[]>(saved?.picks ?? []);
  const [thanks, setThanks] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const view = !open ? "cover" : thanks ? "thanks" : drink ? `drink:${drink.slug}` : "menu";
  // Each page ignores the second tap of the press that turned to it; so does the list of picks
  // after one was removed (the row below moved up under the finger).
  const settled = useSettled(`${view}:${picks.length}`);
  const pageRef = useRef<HTMLDivElement>(null);
  const cover = useRef<HTMLButtonElement>(null);
  // The focus follows the page, not the tab of the menu (a keyboard user stays on Kopi / Non-kopi).
  useEffect(() => { (pageRef.current ?? cover.current)?.focus(); }, [view]);
  const keep = useRef(onKeep);
  useEffect(() => { keep.current = onKeep; }, [onKeep]);
  useEffect(() => { keep.current?.({ open, picks }); }, [open, picks]);

  const finish = () => onDone(picks.map(pick => ({
    id: newLineId(), for: "tamu", slug: pick.slug, ...fitChoice(pick, options), qty: 1, guestName: pick.name.trim() || undefined,
  })));
  const listed = offeredTo(menu, "tamu");
  const present = groupsIn(listed);
  const groups: readonly DrinkGroup[] = present.length ? present : DRINK_GROUPS;
  const group = groups.includes(picked) ? picked : groups[0];
  const drinks = listed.filter(item => item.group === group);
  const nameOf = (slug: string) => drinkLabel(slug, null, drinkIn(menu, slug)?.name);
  const asksAny = options.suhu || options.gula;
  const split = Math.ceil(drinks.length * 0.4);
  const full = picks.length >= max;
  const turn = (action: () => void) => () => { if (settled()) action(); };

  return (
    <div className={css.book} role="region" aria-label="Buku menu tamu" onContextMenu={event => event.preventDefault()} onDragStart={event => event.preventDefault()}>
      <div className={css.bookBar}>
        <button type="button" className={css.bookExit} onClick={turn(() => setConfirm(true))}><Lock aria-hidden size={16} />Mode GA</button>
      </div>

      {!open ? (
        <button ref={cover} type="button" className={css.cover} onClick={turn(() => { if (!locked) setOpen(true); })} aria-label={locked ? "Buku menu tertutup" : "Buka buku menu"}>
          <span className={css.coverFrame} aria-hidden />
          <span className={css.goldMark} aria-hidden />
          <span className={css.coverHint}>{locked ? "Mohon panggil petugas kami" : "Ketuk untuk membuka"}</span>
        </button>
      ) : (
        <div className={css.spread} ref={pageRef} tabIndex={-1}>
          {thanks ? (
            <>
              <div className={css.page}>
                <div className={css.pageCentre}>
                  <span className={css.goldMarkSmall} aria-hidden />
                  <h2 className={css.bookTitle}>{picks.length ? "Pilihan Anda sudah kami terima" : "Belum ada pilihan"}</h2>
                  <Ornament />
                  <p className={css.bookLead}>{picks.length ? `Terima kasih. Minuman Anda segera kami siapkan dan antar ke ${room}.` : "Silakan kembali ke menu untuk memilih minuman Anda."}</p>
                </div>
              </div>
              <div className={css.page}>
                <h3 className={css.bookHeading}>Pilihan di meja ini</h3>
                <ul className={css.pickList}>
                  {picks.map(pick => (
                    <li key={pick.id}>
                      <span className={css.grow}><strong>{nameOf(pick.slug)}</strong>{optionsLabel(pick.temperature, pick.sugar, pick.ice) && <span>{optionsLabel(pick.temperature, pick.sugar, pick.ice)}</span>}</span>
                      {pick.name.trim() && <span className={css.pickName}>{pick.name.trim()}</span>}
                      <button type="button" className={css.bookRemove} onClick={turn(() => setPicks(list => list.filter(item => item.id !== pick.id)))} aria-label={`Hapus ${nameOf(pick.slug)}${pick.name.trim() ? ` untuk ${pick.name.trim()}` : ""}`}>Hapus</button>
                    </li>
                  ))}
                </ul>
                <div className={css.bookActions}>
                  {full
                    ? <p className={css.bookMeta}>Meja ini sudah penuh. Silakan serahkan kembali ke petugas kami.</p>
                    : <button type="button" className={css.inkButton} onClick={turn(() => { setThanks(false); setDrink(null); })}>Tamu berikutnya memilih</button>}
                  <button type="button" className={css.lineButton} onClick={turn(() => setConfirm(true))}>Serahkan kembali ke GA</button>
                </div>
              </div>
            </>
          ) : drink ? (
            <GuestOptions key={drink.slug} drink={drink} options={options} full={full} onBack={turn(() => setDrink(null))} onPick={pick => { if (!settled() || full) return; setPicks(list => [...list, { ...pick, id: newLineId() }]); setThanks(true); }} />
          ) : (
            <>
              {/* The book’s tabs: on the right page when it lies open, on top when the tablet stands upright. */}
              <div className={css.ribbons} role="group" aria-label="Bagian menu">
                {groups.map(key => <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)}>{DRINK_GROUP_LABEL[key]}</button>)}
              </div>
              <div className={css.page}>
                <span className={css.goldMarkSmall} aria-hidden />
                <p className={css.greeting}>{guest ? <>Disajikan khusus untuk <em>{guest}</em></> : <>Selamat datang di Werkudara</>}</p>
                <p className={css.bookMeta}>Bersama {picName} · {room}</p>
                <h2 className={css.bookTitle}>{DRINK_GROUP_LABEL[group]}</h2>
                <Ornament />
                {full
                  ? <p className={css.bookLead} role="status">Pesanan untuk meja ini sudah penuh. Silakan serahkan kembali ke petugas kami.</p>
                  : <p className={css.bookLead}>{asksAny ? `Silakan pilih minuman Anda. Ketuk untuk mengatur ${[options.suhu ? "suhu" : "", options.gula ? "gula" : ""].filter(Boolean).join(" dan ")}.` : "Silakan pilih minuman Anda."}</p>}
                <BookItems drinks={drinks.slice(0, split)} onPick={item => { if (settled()) setDrink(item); }} />
              </div>
              <div className={`${css.page} ${css.pageTabbed}`}>
                <BookItems drinks={drinks.slice(split)} onPick={item => { if (settled()) setDrink(item); }} />
                {picks.length > 0 && (
                  <div className={css.picksBar}>
                    <span>{picks.length} pilihan sudah tercatat</span>
                    <button type="button" className={css.lineButton} onClick={turn(() => setThanks(true))}>Lihat pilihan</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {confirm && <ExitDialog count={picks.length} exit={exit} onStay={() => setConfirm(false)} onLeave={finish} />}
    </div>
  );
}

function Ornament() {
  return (
    <svg className={css.ornament} viewBox="0 0 160 12" aria-hidden>
      <line x1="0" y1="6" x2="66" y2="6" /><path d="M80 1 L85 6 L80 11 L75 6 Z" /><line x1="94" y1="6" x2="160" y2="6" />
    </svg>
  );
}

function BookItems({ drinks, onPick }: { drinks: Drink[]; onPick: (drink: Drink) => void }) {
  return (
    <ul className={css.bookItems}>
      {drinks.map(drink => (
        <li key={drink.slug}>
          <button type="button" onClick={() => onPick(drink)}>
            <Photo src={drink.photo} width={72} height={72} group={drink.group} />
            <span><strong>{drink.name}</strong><span>{drink.description}</span></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function GuestOptions({ drink, options, full, onBack, onPick }: { drink: Drink; options: DrinkOptions; full: boolean; onBack: () => void; onPick: (pick: Omit<Pick, "id">) => void }) {
  const [start] = useState(() => startChoice(drink, options));
  const [temperature, setTemperature] = useState(start.temperature);
  const [sugar, setSugar] = useState(start.sugar ?? "Normal");
  const [ice, setIce] = useState(start.ice ?? "Normal");
  const asksAny = options.suhu || options.gula;
  const [name, setName] = useState("");
  return (
    <>
      <div className={css.page}>
        <button type="button" className={css.bookBack} onClick={onBack}><ChevronLeft aria-hidden size={20} />Kembali ke menu</button>
        <Photo className={css.bookPhoto} src={drink.photo} alt={drink.name} width={360} height={360} group={drink.group} />
        <h2 className={css.bookTitle}>{drink.name}</h2>
        <Ornament />
        <p className={css.bookLead}>{drink.description}</p>
      </div>
      <div className={css.page}>
        <h3 className={css.bookHeading}>{asksAny ? "Atur sesuai selera Anda" : "Minuman pilihan Anda"}</h3>
        {!options.suhu ? null : drink.temperatures.length > 1 ? (
          <fieldset className={css.bookField}>
            <legend>Suhu</legend>
            <div className={css.bookOptions} data-cols="2">
              <BookOption on={temperature === "panas"} onClick={() => setTemperature("panas")}>Panas</BookOption>
              <BookOption on={temperature === "es"} onClick={() => setTemperature("es")}>Es</BookOption>
            </div>
          </fieldset>
        ) : <p className={`${css.bookMeta} ${css.bookNote}`}>Disajikan {drink.temperatures[0] === "es" ? "dingin dengan es" : "panas"}.</p>}
        {options.gula && (
          <fieldset className={css.bookField}>
            <legend>Gula</legend>
            <div className={css.bookOptions} data-cols="3">
              {SUGAR_LEVELS.map(level => <BookOption key={level} on={sugar === level} onClick={() => setSugar(level)}>{level}</BookOption>)}
            </div>
          </fieldset>
        )}
        {asksIce(options) && temperature === "es" && (
          <fieldset className={css.bookField}>
            <legend>Takaran es</legend>
            <div className={css.bookOptions} data-cols="3">
              {ICE_LEVELS.map(level => <BookOption key={level} on={ice === level} onClick={() => setIce(level)}>{level}</BookOption>)}
            </div>
          </fieldset>
        )}
        <label className={css.bookLabel} htmlFor="ga-tamu-nama-anda">Nama Anda <span>(opsional, agar minuman tidak tertukar)</span></label>
        <input id="ga-tamu-nama-anda" className={css.bookInput} value={name} maxLength={GUEST_NAME_MAX} onChange={event => setName(event.target.value)} autoComplete="off" spellCheck={false} />
        <div className={css.bookActions}>
          {full
            ? <p className={css.bookMeta} role="status">Pesanan untuk meja ini sudah penuh. Silakan serahkan kembali ke petugas kami.</p>
            : <button type="button" className={css.inkButton} onClick={() => onPick({ slug: drink.slug, ...fitChoice({ temperature, sugar, ice }, options), name })}>Pilih minuman ini</button>}
        </div>
      </div>
    </>
  );
}

function BookOption({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={css.bookOption} aria-pressed={on} onClick={onClick}>{children}</button>;
}
