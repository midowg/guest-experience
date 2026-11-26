"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, Search, Users, Zap } from "lucide-react";
import { OTHER_ROOM } from "@/lib/coffee/rooms";
import type { GaState } from "@/lib/coffee/types";
import { FloorMap } from "./FloorMap";
import { MAX_GUESTS, matches, type Draft, type GaPerson } from "./model";
import { ScreenHead, Stepper } from "./parts";
import css from "./ga.module.css";

const SHOWN = 4;

/**
 * Pesanan baru: the room (tapped on the floor plan, or a chip; "Lainnya" is typed) and the PIC are
 * enough. The guest's name or company and the head count may be skipped.
 */
export function NewOrder({ initial, rooms, people, onBack, onQuick, onGuest }: {
  initial: Draft | null; rooms: GaState["rooms"]; people: GaPerson[]; onBack: () => void; onQuick: (draft: Draft) => void; onGuest: (draft: Draft) => void;
}) {
  const known = initial ? rooms.find(room => room.name === initial.room) : undefined;
  const [spot, setSpot] = useState<string | null>(known?.spot ?? (initial ? OTHER_ROOM : null));
  const [otherRoom, setOtherRoom] = useState(initial && !known ? initial.room : "");
  const [pic, setPic] = useState<Draft["pic"] | null>(initial?.pic.id ? initial.pic : null);
  const [query, setQuery] = useState("");
  const [more, setMore] = useState(Boolean(initial?.guest || initial?.guestCount));
  const [guest, setGuest] = useState(initial?.guest ?? "");
  const [guestCount, setGuestCount] = useState(initial?.guestCount ?? 0);

  const room = spot === OTHER_ROOM ? otherRoom.trim() : rooms.find(item => item.spot === spot)?.name ?? "";
  const ready = Boolean(room && pic);
  const found = people.filter(person => matches(person, query));
  const picked = pic ? people.find(person => person.id === pic.id) : undefined;
  const draft = (): Draft => ({
    room, spot: spot === OTHER_ROOM ? undefined : spot ?? undefined, pic: pic!,
    guest: guest.trim() || undefined, guestCount: guestCount || undefined,
  });
  const typed = spot === OTHER_ROOM;
  const missing = !room && !pic ? (typed ? "Tulis nama tempat dan pilih PIC dulu." : "Pilih ruangan dan PIC dulu.") : !room ? (typed ? "Tulis nama tempatnya dulu." : "Pilih ruangan dulu.") : "Pilih PIC dulu.";

  return (
    <div className={css.screen}>
      <ScreenHead title="Pesanan baru" sub="Cukup ruangan dan PIC. Tamu dan jumlah orang boleh dilewati." onBack={onBack} backLabel="Beranda" />
      <div className={css.newGrid}>
        <section className={css.mapCard} aria-labelledby="ga-ruangan-judul">
          <h2 id="ga-ruangan-judul">Ruangan</h2>
          <p className={css.mutedSmall}>Ketuk ruangan di denah, atau pilih di samping.</p>
          <FloorMap rooms={rooms} selected={spot ?? undefined} onPick={setSpot} label="Denah kantor: pilih ruangan rapat" />
        </section>

        <section className={css.formCol} aria-label="Data pesanan">
          <fieldset className={css.field}>
            <legend>Ruangan</legend>
            <div className={css.chips}>
              {rooms.map(item => (
                <button key={item.spot} type="button" className={css.chip} aria-pressed={spot === item.spot} onClick={() => setSpot(item.spot)}>{item.name}</button>
              ))}
              <button type="button" className={css.chip} aria-pressed={spot === OTHER_ROOM} onClick={() => setSpot(OTHER_ROOM)}>{OTHER_ROOM}</button>
            </div>
            {spot === OTHER_ROOM && (
              <>
                <label className={css.label} htmlFor="ga-ruang-lain">Nama tempat</label>
                <input id="ga-ruang-lain" className={css.input} value={otherRoom} maxLength={80} onChange={event => setOtherRoom(event.target.value)} placeholder="Mis. Lobi depan" autoComplete="off" autoFocus />
              </>
            )}
          </fieldset>

          <div className={css.field}>
            <span className={css.legendLike} id="ga-pic-judul">PIC</span>
            {pic ? (
              <div className={css.picked}>
                <span className={css.initial} aria-hidden>{pic.name.trim().slice(0, 1).toUpperCase()}</span>
                <span className={css.grow}><strong>{pic.name}</strong><span>{[picked?.position, picked?.bu].filter(Boolean).join(" · ")}</span></span>
                <button type="button" className={css.ghost} onClick={() => setPic(null)}>Ganti</button>
              </div>
            ) : (
              <>
                <label className={css.search}>
                  <Search aria-hidden size={20} />
                  <span className={css.srOnly}>Cari karyawan PIC</span>
                  <input value={query} maxLength={80} onChange={event => setQuery(event.target.value)} placeholder="Cari nama, jabatan, atau BU" autoComplete="off" spellCheck={false} />
                </label>
                <ul className={css.people} aria-label="Karyawan">
                  {found.slice(0, SHOWN).map(person => (
                    <li key={person.id}>
                      <button type="button" onClick={() => { setPic({ id: person.id, name: person.name }); setQuery(""); }}>
                        <span className={css.initial} aria-hidden>{person.name.trim().slice(0, 1).toUpperCase()}</span>
                        <span><strong>{person.name}</strong><span>{[person.position, person.bu].filter(Boolean).join(" · ")}</span></span>
                      </button>
                    </li>
                  ))}
                  {found.length === 0 && <li className={css.mutedSmall}>Tidak ada nama yang cocok.</li>}
                </ul>
                {found.length > SHOWN && <p className={css.more}>{found.length - SHOWN} nama lain. Ketik untuk mempersempit.</p>}
              </>
            )}
          </div>

          <div className={css.field}>
            <button type="button" className={css.disclosure} aria-expanded={more} aria-controls="ga-tamu" onClick={() => setMore(!more)}>
              <Users aria-hidden size={20} /><span className={css.grow}>Tamu dan jumlah orang <span className={css.mutedSmall}>(opsional)</span></span>
              <ChevronDown aria-hidden size={20} className={css.chev} data-open={more || undefined} />
            </button>
            {more && (
              <div id="ga-tamu" className={css.guestFields}>
                <span className={css.grow}>
                  <label className={css.label} htmlFor="ga-tamu-nama">Tamu atau instansi</label>
                  <input id="ga-tamu-nama" className={css.input} value={guest} maxLength={120} onChange={event => setGuest(event.target.value)} placeholder="Mis. PT Sinar Jaya" autoComplete="off" />
                </span>
                <span>
                  <span className={css.label} id="ga-jumlah">Jumlah orang</span>
                  <Stepper value={guestCount} min={0} max={MAX_GUESTS} onChange={setGuestCount} labelledBy="ga-jumlah" />
                </span>
              </div>
            )}
          </div>

          <div className={css.formFoot}>
            <p className={css.mutedSmall} role="status">{ready ? "" : missing}</p>
            <button type="button" className={`${css.primary} ${css.big}`} disabled={!ready} onClick={() => onQuick(draft())}><Zap aria-hidden size={22} />Input cepat</button>
            <button type="button" className={css.secondary} disabled={!ready} onClick={() => onGuest(draft())}><BookOpen aria-hidden size={20} />Serahkan ke tamu</button>
          </div>
        </section>
      </div>
    </div>
  );
}
