"use client";

import { useId, useRef, useState } from "react";
import { Flame, Snowflake, X } from "lucide-react";
import { ICE_LEVELS, SUGAR_LEVELS, drinkBySlug } from "@/lib/coffee/menu";
import { Layer } from "../Layer";
import { MAX_QTY, matches, type Draft, type GaPerson, type Line } from "./model";
import { Option, Photo, Stepper } from "./parts";
import css from "./ga.module.css";

const SHOWN = 4;

/**
 * One row of the order: hot or cold, how many, sugar, ice, and who it is for. A team member's drink
 * needs the person, picked from the employees (it is recorded under their name, without touching
 * their quota); the PIC is offered first. The focus starts on the drink’s name, not in the search
 * field: on the tablet that would throw the keyboard over the names to pick from.
 */
export function LineDialog({ line, isNew, pic, people, onClose, onSave, onRemove }: {
  line: Line; isNew: boolean; pic: Draft["pic"]; people: GaPerson[]; onClose: () => void; onSave: (line: Line) => void; onRemove: () => void;
}) {
  const drink = drinkBySlug(line.slug);
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
    onSave({ ...next, person: next.for === "tim" ? next.person : undefined, guestName: next.for === "tamu" ? next.guestName : undefined, ice: next.temperature === "es" ? next.ice : "Normal" });
  };
  if (!drink) return null;

  return (
    <Layer kind="dialog" labelledBy={titleId} onClose={onClose} rootClass={css.ga} panelClass={css.lineDialog}>
      <div className={css.dialogHead}>
        <Photo slug={line.slug} width={64} height={64} />
        <div className={css.grow}><h2 id={titleId} tabIndex={-1} data-autofocus>{drink.name}</h2><p className={css.mutedSmall}>{drink.description}</p></div>
        <button type="button" className={css.iconButton} aria-label="Tutup" onClick={onClose}><X aria-hidden size={22} /></button>
      </div>
      <div className={css.dialogBody}>
        <div className={css.dialogCols}>
          {drink.temperatures.length > 1 && (
            <fieldset className={css.field}>
              <legend>Suhu</legend>
              <div className={css.options} data-cols="2">
                <Option on={next.temperature === "panas"} onClick={() => patch({ temperature: "panas" })}><Flame aria-hidden size={18} />Panas</Option>
                <Option on={next.temperature === "es"} onClick={() => patch({ temperature: "es" })}><Snowflake aria-hidden size={18} />Es</Option>
              </div>
            </fieldset>
          )}
          <div className={css.field}>
            <span className={css.legendLike} id={qtyId}>Jumlah</span>
            <Stepper value={next.qty} min={1} max={MAX_QTY} onChange={qty => patch({ qty })} labelledBy={qtyId} />
          </div>
        </div>
        <fieldset className={css.field}>
          <legend>Gula</legend>
          <div className={css.options} data-cols="6">
            {SUGAR_LEVELS.map(level => <Option key={level} on={next.sugar === level} onClick={() => patch({ sugar: level })}>{level}</Option>)}
          </div>
        </fieldset>
        {next.temperature === "es" && (
          <fieldset className={css.field}>
            <legend>Takaran es</legend>
            <div className={css.options} data-cols="3">
              {ICE_LEVELS.map(level => <Option key={level} on={next.ice === level} onClick={() => patch({ ice: level })}>{level}</Option>)}
            </div>
          </fieldset>
        )}
        <fieldset className={css.field}>
          <legend>Untuk</legend>
          <div className={css.options} data-cols="2">
            <Option on={next.for === "tamu"} onClick={() => patch({ for: "tamu" })}>Tamu</Option>
            <Option on={next.for === "tim"} onClick={() => patch({ for: "tim" })}>Tim · rapat</Option>
          </div>
          {next.for === "tim" && (next.person ? (
            <div className={css.picked}>
              <span className={css.initial} aria-hidden>{next.person.name.trim().slice(0, 1).toUpperCase()}</span>
              <span className={css.grow}><strong>{next.person.name}</strong><span>Tidak memotong jatah, tetapi dicatat atas nama orang ini.</span></span>
              <button type="button" className={css.ghost} onClick={() => { patch({ person: undefined }); setQuery(""); }}>Ganti</button>
            </div>
          ) : (
            <>
              <label className={css.label} htmlFor={nameId}>Nama anggota tim</label>
              <input ref={search} id={nameId} className={css.input} value={query} maxLength={80} onChange={event => setQuery(event.target.value)}
                placeholder="Ketik untuk mencari, lalu pilih" aria-invalid={tried && needsPerson} aria-describedby={infoId} autoComplete="off" spellCheck={false} />
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
            </>
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
