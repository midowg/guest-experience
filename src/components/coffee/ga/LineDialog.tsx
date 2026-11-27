"use client";

import { useId, useRef, useState } from "react";
import { Flame, Snowflake, X } from "lucide-react";
import { ICE_LEVELS, PLACE_LABEL, SUGAR_LEVELS, asksIce, drinkIn, fillChoice, showsIn, type Drink } from "@/lib/coffee/menu";
import { Layer } from "../Layer";
import { MAX_QTY, matches, type Draft, type GaOptions, type GaPerson, type Line } from "./model";
import { Option, Photo, Stepper, raiseOnFocus } from "./parts";
import css from "./ga.module.css";

const SHOWN = 4;

/**
 * One row of the order: how many, who it is for, and hot or cold, sugar and ice as far as that
 * audience is asked them (`options`, from Pengaturan: a guest's row and a team member's may differ,
 * and the controls follow "Untuk" as it is changed). A team member's drink
 * needs the person, picked from the employees (it is recorded under their name, without touching
 * their quota); the PIC is offered first. The focus starts on the drink’s name, not in the search
 * field: on the tablet that would throw the keyboard over the names to pick from.
 */
export function LineDialog({ line, isNew, pic, people, menu, options, onClose, onSave, onRemove }: {
  line: Line; isNew: boolean; pic: Draft["pic"]; people: GaPerson[]; menu: readonly Drink[]; options: GaOptions; onClose: () => void; onSave: (line: Line) => void; onRemove: () => void;
}) {
  const drink = drinkIn(menu, line.slug);
  const [next, setNext] = useState<Line>(line);
  const [query, setQuery] = useState("");
  const [tried, setTried] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const titleId = useId(), qtyId = useId(), nameId = useId(), infoId = useId();
  const patch = (change: Partial<Line>) => setNext(current => ({ ...current, ...change }));
  const needsPerson = next.for === "tim" && !next.person;
  const offered = [...people.filter(person => person.id === pic.id), ...people.filter(person => person.id !== pic.id)].filter(person => matches(person, query));
  const done = () => {
    if (needsPerson) { setTried(true); search.current?.focus(); return; }
    onSave({ ...next, ...shown, person: next.for === "tim" ? next.person : undefined, guestName: next.for === "tamu" ? next.guestName : undefined });
  };
  if (!drink) return null;
  // What this row's audience is asked now, and the row's values made whole for it (a row that was a guest's may lack what the team is asked).
  const asked = options[next.for];
  const shown = fillChoice(next, drink, asked);
  // F7: a guest is served from Buku tamu, the team from Menu biasa. A drink that is in one only cannot be moved to the other audience (the server refuses it).
  const forGuest = showsIn(drink, "guestBook") || next.for === "tamu", forTeam = showsIn(drink, "regular") || next.for === "tim";

  return (
    <Layer kind="dialog" labelledBy={titleId} onClose={onClose} rootClass={css.ga} panelClass={css.lineDialog}>
      <div className={css.dialogHead}>
        <Photo src={drink.photo} width={64} height={64} group={drink.group} />
        <div className={css.grow}><h2 id={titleId} tabIndex={-1} data-autofocus>{drink.name}</h2><p className={css.mutedSmall}>{drink.description}</p></div>
        <button type="button" className={css.iconButton} aria-label="Tutup" onClick={onClose}><X aria-hidden size={22} /></button>
      </div>
      <div className={css.dialogBody}>
        <div className={css.dialogCols}>
          {asked.suhu && drink.temperatures.length > 1 && (
            <fieldset className={css.field}>
              <legend>Suhu</legend>
              <div className={css.options} data-cols="2">
                <Option on={shown.temperature === "panas"} onClick={() => patch({ temperature: "panas" })}><Flame aria-hidden size={18} />Panas</Option>
                <Option on={shown.temperature === "es"} onClick={() => patch({ temperature: "es" })}><Snowflake aria-hidden size={18} />Es</Option>
              </div>
            </fieldset>
          )}
          <div className={css.field}>
            <span className={css.legendLike} id={qtyId}>Jumlah</span>
            <Stepper value={next.qty} min={1} max={MAX_QTY} onChange={qty => patch({ qty })} labelledBy={qtyId} />
          </div>
        </div>
        {asked.gula && (
          <fieldset className={css.field}>
            <legend>Gula</legend>
            <div className={css.options} data-cols="6">
              {SUGAR_LEVELS.map(level => <Option key={level} on={shown.sugar === level} onClick={() => patch({ sugar: level })}>{level}</Option>)}
            </div>
          </fieldset>
        )}
        {asksIce(asked) && shown.temperature === "es" && (
          <fieldset className={css.field}>
            <legend>Takaran es</legend>
            <div className={css.options} data-cols="3">
              {ICE_LEVELS.map(level => <Option key={level} on={shown.ice === level} onClick={() => patch({ ice: level })}>{level}</Option>)}
            </div>
          </fieldset>
        )}
        <fieldset className={css.field}>
          <legend>Untuk</legend>
          <div className={css.options} data-cols="2">
            <Option on={next.for === "tamu"} disabled={!forGuest} onClick={() => patch({ for: "tamu" })}>Tamu</Option>
            <Option on={next.for === "tim"} disabled={!forTeam} onClick={() => patch({ for: "tim" })}>Tim · rapat</Option>
          </div>
          {(!forGuest || !forTeam) && <p className={css.mutedSmall}>{drink.name} hanya ada di {PLACE_LABEL[forGuest ? "guestBook" : "regular"]}, jadi hanya untuk {forGuest ? "Tamu" : "Tim · rapat"}.</p>}
          {next.for === "tim" && (next.person ? (
            <div className={css.picked}>
              <span className={css.initial} aria-hidden>{next.person.name.trim().slice(0, 1).toUpperCase()}</span>
              <span className={css.grow}><strong>{next.person.name}</strong><span>Tidak memotong jatah, tetapi dicatat atas nama orang ini.</span></span>
              <button type="button" className={css.ghost} onClick={() => { patch({ person: undefined }); setQuery(""); }}>Ganti</button>
            </div>
          ) : (
            // The names sit right under the field, and the field rises to the top of the dialog when it is typed in: the on-screen keyboard covers neither.
            <div className={css.searchBlock} data-raise>
              <label className={css.label} htmlFor={nameId}>Nama anggota tim</label>
              <input ref={search} id={nameId} className={css.input} value={query} maxLength={80} onChange={event => setQuery(event.target.value)} onFocus={event => raiseOnFocus(event.currentTarget)}
                placeholder="Ketik untuk mencari, lalu pilih" aria-invalid={tried && needsPerson} aria-describedby={infoId} autoComplete="off" spellCheck={false} enterKeyHint="search" />
              {offered.length > 0 && (
                <div className={css.chips}>
                  {offered.slice(0, SHOWN).map(person => (
                    <button key={person.id} type="button" className={css.chip} onClick={() => { patch({ person: { id: person.id, name: person.name } }); setTried(false); }}>{person.name}{person.id === pic.id ? " (PIC)" : ""}</button>
                  ))}
                </div>
              )}
              <p id={infoId} className={tried && needsPerson ? css.error : css.mutedSmall} role={tried && needsPerson ? "alert" : undefined}>
                {tried && needsPerson ? "Pilih orangnya dulu: minuman tim dicatat atas nama orangnya."
                  : offered.length === 0 ? "Tidak ada nama yang cocok."
                  : offered.length > SHOWN ? `${offered.length - SHOWN} nama lain. Ketik untuk mempersempit.`
                  : "Tidak memotong jatah, tetapi dicatat atas nama orang ini."}
              </p>
            </div>
          ))}
        </fieldset>
      </div>
      <div className={css.dialogFoot}>
        {!isNew && <button type="button" className={css.dangerText} onClick={onRemove}>Hapus</button>}
        <span className={css.grow} />
        <button type="button" className={css.secondary} onClick={onClose}>Batal</button>
        <button type="button" className={css.primary} onClick={done}>{isNew ? "Tambahkan" : "Simpan"}</button>
      </div>
    </Layer>
  );
}
