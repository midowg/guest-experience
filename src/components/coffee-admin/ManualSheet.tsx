"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import { errorMessage } from "@/components/admin/shared/api";
import { firstName } from "@/lib/coffee/access";
import { DRINKS, ICE_LEVELS, OTHER_DRINK, SUGAR_LEVELS, drinkBySlug, type Ice, type Sugar, type Temperature } from "@/lib/coffee/menu";
import { previousMonth, wibClock, wibDay } from "@/lib/coffee/quota";
import { OTHER_ROOM, ROOMS } from "@/lib/coffee/rooms";
import { manualAt } from "@/lib/coffee/schemas";
import { ITEM_KINDS, KIND_LABEL, type CoffeePerson, type CoffeeSettings, type ItemFor } from "@/lib/coffee/types";
import { fieldErrorsOf, type CoffeeAdminApi, type Done } from "./api";
import { MONTHS } from "./format";
import { Layer } from "./Layer";
import { PersonPicker } from "./PersonPicker";
import css from "./coffee-admin.module.css";

/** One key per opened sheet: sending the same record twice answers with the first one. randomUUID is missing on plain http, so the key is then drawn by hand. */
export function newKey(): string {
  const source = (typeof crypto === "undefined" ? undefined : crypto) as Partial<Crypto> | undefined;
  if (source?.randomUUID) return source.randomUUID();
  const drawn = source?.getRandomValues ? [...source.getRandomValues(new Uint8Array(32))] : null;
  const hex = Array.from({ length: 32 }, (_, index) => (drawn ? drawn[index] % 16 : Math.floor(Math.random() * 16)).toString(16));
  hex[12] = "4";
  hex[16] = "89ab"[Math.floor(Math.random() * 4)];
  const text = hex.join("");
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

/**
 * Catat manual: a request made outside the app, saved as done and marked "Dicatat manual". A
 * claim still counts against that month's quota and is refused when it is full (the server
 * decides; the line under the name only says what to expect). Not further back than the start of
 * last month. A panel from the side; a sheet from the bottom on a phone.
 */
export function ManualSheet({ api, now, actorName, settings, onClose, onSaved }: {
  api: CoffeeAdminApi; now: number; actorName: string; settings: CoffeeSettings | null; onClose: () => void; onSaved: (done: Done) => void;
}) {
  const titleId = useId();
  const uid = useId();
  const [start] = useState(() => new Date(now).toISOString());
  const [key] = useState(newKey);
  const today = wibDay(new Date(now).toISOString());
  const earliest = `${previousMonth(today.slice(0, 7))}-01`;
  const [day, setDay] = useState(() => wibDay(start));
  const [time, setTime] = useState(() => wibClock(start));
  const [kind, setKind] = useState<ItemFor>("klaim");
  const [person, setPerson] = useState<CoffeePerson | null>(null);
  const [guest, setGuest] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [room, setRoom] = useState<string>(ROOMS[0].name);
  const [roomOther, setRoomOther] = useState("");
  const [slug, setSlug] = useState(DRINKS[0].slug);
  const [other, setOther] = useState("");
  const [qty, setQty] = useState("1");
  const [temperature, setTemperature] = useState<Temperature>("panas");
  const [sugar, setSugar] = useState<Sugar>("Normal");
  const [ice, setIce] = useState<Ice>("Normal");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});

  const month = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : "";
  const [people, setPeople] = useState<{ month: string; list: CoffeePerson[] } | null>(null);
  const [peopleError, setPeopleError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!month) return;
    let live = true;
    api.people(month)
      .then(result => { if (live) { setPeople({ month, list: result.people }); setPeopleError(""); } })
      .catch((problem: unknown) => { if (live) setPeopleError(errorMessage(problem)); });
    return () => { live = false; };
  }, [api, month, attempt]);

  const drink = drinkBySlug(slug);
  const temps: Temperature[] = drink ? drink.temperatures : ["panas", "es"];
  const temp = temps.includes(temperature) ? temperature : temps[0];
  const monthLabel = month ? MONTHS[Number(month.slice(5)) - 1] : "";
  const quota = person && settings ? settings[person.group] : null;
  const used = person && people?.month === month ? people.list.find(item => item.id === person.id)?.used ?? null : null;
  const full = kind === "klaim" && quota !== null && used !== null && used >= quota;
  const count = Number(qty);
  const errors = {
    person: !person ? (kind === "tamu" ? "Pilih PIC tamu." : "Pilih nama karyawan.") : "",
    other: slug === OTHER_DRINK && !other.trim() ? "Tulis nama minumannya." : "",
    when: !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time) ? "Isi tanggal dan jam."
      : Date.parse(manualAt(day, time)) > now + 60_000 ? "Tanggal dan jam tidak boleh di masa depan."
        : day < earliest ? "Catat manual paling lama sampai awal bulan lalu." : "",
    qty: kind !== "klaim" && (!Number.isInteger(count) || count < 1 || count > 50) ? "Jumlah 1 sampai 50." : "",
    guestCount: kind === "tamu" && guestCount.trim() && (!Number.isInteger(Number(guestCount)) || Number(guestCount) < 1 || Number(guestCount) > 500) ? "Jumlah tamu 1 sampai 500, angka bulat." : "",
  };
  // Anything typed or chosen here that closing would throw away (audit F1-07).
  const touched = !!person || !!guest.trim() || !!guestCount.trim() || !!roomOther.trim() || !!other.trim() || kind !== "klaim" || slug !== DRINKS[0].slug
    || qty !== "1" || temperature !== "panas" || sugar !== "Normal" || ice !== "Normal" || room !== ROOMS[0].name || day !== wibDay(start) || time !== wibClock(start);
  const [asking, setAsking] = useState(false);
  /** Escape, a press outside, the X, Batal, the back gesture: nothing closes while saving, and typed input is asked about first. */
  const requestClose = () => {
    if (busy) return;
    if (touched) setAsking(true);
    else onClose();
  };
  const invalid = Object.values(errors).some(Boolean) || full;
  const shown = (name: keyof typeof errors, ...serverKeys: string[]) =>
    (tried ? errors[name] : "") || serverKeys.map(serverKey => serverErrors[serverKey]?.[0]).find(Boolean) || "";

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    setFailure("");
    if (invalid || !person || busy) return;
    setBusy(true);
    setServerErrors({});
    try {
      const done = await api.manual({
        kind, employeeId: person.id, date: day, time, slug, other: slug === OTHER_DRINK ? other.trim() : undefined, temperature: temp, sugar, ice, key,
        ...(kind === "klaim" ? {} : { qty: count, room: room === OTHER_ROOM ? roomOther.trim() || OTHER_ROOM : room }),
        ...(kind === "tamu" ? { guest: guest.trim() || undefined, guestCount: Number(guestCount) > 0 ? Number(guestCount) : undefined } : {}),
      });
      onSaved(done);
    } catch (problem) {
      setServerErrors(fieldErrorsOf(problem));
      setFailure(errorMessage(problem));
      setAttempt(value => value + 1); // the quota line may be out of date
      setBusy(false);
    }
  };

  return (
    <Layer onClose={requestClose} labelledBy={titleId} side>
      <form className={css.sheetForm} onSubmit={event => void save(event)} noValidate>
        <div className={css.sheetHead}>
          <div>
            <h2 id={titleId}>Catat manual</h2>
            <p className={css.muted}>Untuk permintaan di luar aplikasi. Tersimpan sebagai selesai dan ditandai “Dicatat manual”.</p>
          </div>
          <button type="button" className={css.iconButton} aria-label="Tutup" onClick={requestClose}><X size={20} aria-hidden /></button>
        </div>
        <div className={css.sheetBody}>
          <div className={css.twoCol}>
            <div className={css.field}>
              <label htmlFor={`${uid}-day`}>Tanggal</label>
              <input id={`${uid}-day`} type="date" value={day} min={earliest} max={today} onChange={event => setDay(event.target.value)}
                aria-invalid={!!shown("when", "date", "time")} aria-describedby={shown("when", "date", "time") ? `${uid}-when` : undefined} />
            </div>
            <div className={css.field}>
              <label htmlFor={`${uid}-time`}>Jam</label>
              <input id={`${uid}-time`} type="time" value={time} onChange={event => setTime(event.target.value)}
                aria-invalid={!!shown("when", "date", "time")} aria-describedby={shown("when", "date", "time") ? `${uid}-when` : undefined} />
            </div>
          </div>
          {shown("when", "date", "time") && <p id={`${uid}-when`} className={css.error}>{shown("when", "date", "time")}</p>}

          <fieldset className={css.fieldset}>
            <legend>Jenis</legend>
            <div className={css.segmented}>
              {ITEM_KINDS.map(item => (
                <label key={item} data-checked={kind === item ? "true" : undefined}>
                  <input type="radio" name={`${uid}-kind`} value={item} checked={kind === item} onChange={() => setKind(item)} data-autofocus={kind === item ? true : undefined} />
                  {KIND_LABEL[item]}
                </label>
              ))}
            </div>
          </fieldset>

          <PersonPicker
            id={`${uid}-person`} label={kind === "tamu" ? "PIC tamu" : "Nama karyawan"} value={person} onChange={setPerson}
            people={people?.list ?? []} loading={!people && !peopleError} error={shown("person", "employeeId")}
          />
          {peopleError && !people && (
            <div className={css.banner} data-tone="no" role="alert">
              <span>Daftar karyawan belum bisa dimuat. {peopleError}</span>
              <button type="button" className={css.textButton} onClick={() => { setPeopleError(""); setAttempt(value => value + 1); }}>Coba lagi</button>
            </div>
          )}
          {kind === "klaim" && person && quota !== null && used !== null && (
            <p className={css.claimLine} data-full={full ? "true" : undefined} role="status">
              {full
                ? `Jatah ${monthLabel} ${firstName(person.name)} sudah habis (${used} dari ${quota}). Bila untuk rapat, pilih Tim · rapat.`
                : `Ini klaim ke-${used + 1} dari ${quota} bulan ${monthLabel}.`}
            </p>
          )}
          {kind === "tim" && <p className={css.small}>Minuman tim saat rapat tidak memakai jatah, tetapi dicatat atas nama orangnya.</p>}
          {kind === "tamu" && (
            <div className={css.twoCol}>
              <div className={css.field}>
                <label htmlFor={`${uid}-guest`}>Tamu/instansi <span className={css.optional}>(opsional)</span></label>
                <input id={`${uid}-guest`} value={guest} maxLength={120} onChange={event => setGuest(event.target.value)} />
              </div>
              <div className={css.field}>
                <label htmlFor={`${uid}-count`}>Jumlah tamu <span className={css.optional}>(opsional)</span></label>
                <input id={`${uid}-count`} type="number" min={1} max={500} inputMode="numeric" value={guestCount} onChange={event => setGuestCount(event.target.value)}
                  aria-invalid={!!shown("guestCount", "guestCount")} aria-describedby={shown("guestCount", "guestCount") ? `${uid}-count-error` : undefined} />
                {shown("guestCount", "guestCount") && <p id={`${uid}-count-error`} className={css.error}>{shown("guestCount", "guestCount")}</p>}
              </div>
            </div>
          )}
          {kind !== "klaim" && (
            <div className={css.field}>
              <label htmlFor={`${uid}-room`}>Ruangan</label>
              <select id={`${uid}-room`} value={room} onChange={event => setRoom(event.target.value)}>
                {[...ROOMS.map(item => item.name), OTHER_ROOM].map(item => <option key={item}>{item}</option>)}
              </select>
            </div>
          )}
          {kind !== "klaim" && room === OTHER_ROOM && (
            <div className={css.field}>
              <label htmlFor={`${uid}-room-other`}>Nama ruangan <span className={css.optional}>(opsional)</span></label>
              <input id={`${uid}-room-other`} value={roomOther} maxLength={80} onChange={event => setRoomOther(event.target.value)} />
            </div>
          )}

          <div className={kind === "klaim" ? undefined : css.drinkRow}>
            <div className={css.field}>
              <label htmlFor={`${uid}-drink`}>Minuman</label>
              <select id={`${uid}-drink`} value={slug} onChange={event => setSlug(event.target.value)}>
                <optgroup label="Kopi">{DRINKS.filter(item => item.group === "kopi").map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</optgroup>
                <optgroup label="Non-kopi">{DRINKS.filter(item => item.group === "non-kopi").map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</optgroup>
                <option value={OTHER_DRINK}>Lainnya (tulis sendiri)</option>
              </select>
            </div>
            {kind !== "klaim" && (
              <div className={css.field}>
                <label htmlFor={`${uid}-qty`}>Jumlah</label>
                <input id={`${uid}-qty`} type="number" min={1} max={50} inputMode="numeric" value={qty} onChange={event => setQty(event.target.value)}
                  aria-invalid={!!shown("qty", "qty")} aria-describedby={shown("qty", "qty") ? `${uid}-qty-error` : undefined} />
              </div>
            )}
          </div>
          {shown("qty", "qty") && <p id={`${uid}-qty-error`} className={css.error}>{shown("qty", "qty")}</p>}
          {slug === OTHER_DRINK && (
            <div className={css.field}>
              <label htmlFor={`${uid}-other`}>Nama minuman</label>
              <input id={`${uid}-other`} value={other} maxLength={60} onChange={event => setOther(event.target.value)}
                aria-invalid={!!shown("other", "other")} aria-describedby={shown("other", "other") ? `${uid}-other-error` : undefined} />
              {shown("other", "other") && <p id={`${uid}-other-error`} className={css.error}>{shown("other", "other")}</p>}
            </div>
          )}

          <fieldset className={css.fieldset}>
            <legend>Suhu</legend>
            <div className={css.segmented}>
              {(["panas", "es"] as Temperature[]).map(item => (
                <label key={item} data-checked={temp === item ? "true" : undefined} data-disabled={!temps.includes(item) ? "true" : undefined}>
                  <input type="radio" name={`${uid}-temp`} checked={temp === item} disabled={!temps.includes(item)} onChange={() => setTemperature(item)} />
                  {item === "panas" ? "Panas" : "Es"}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className={css.fieldset}>
            <legend>Gula</legend>
            <div className={css.chips}>
              {SUGAR_LEVELS.map(level => (
                <label key={level} data-checked={sugar === level ? "true" : undefined}>
                  <input type="radio" name={`${uid}-sugar`} checked={sugar === level} onChange={() => setSugar(level)} />{level}
                </label>
              ))}
            </div>
          </fieldset>
          {temp === "es" && (
            <fieldset className={css.fieldset}>
              <legend>Takaran es</legend>
              <div className={css.chips}>
                {ICE_LEVELS.map(level => (
                  <label key={level} data-checked={ice === level ? "true" : undefined}>
                    <input type="radio" name={`${uid}-ice`} checked={ice === level} onChange={() => setIce(level)} />{level}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {failure && <div className={css.banner} data-tone="no" role="alert"><span>{failure}</span></div>}
        </div>
        <div className={css.sheetFoot}>
          <p className={css.small}>Dicatat oleh {actorName}</p>
          <button type="button" className={css.secondary} disabled={busy} onClick={requestClose}>Batal</button>
          <button type="submit" className={css.primary} disabled={busy} aria-disabled={tried && invalid ? true : undefined}>
            <Check size={18} aria-hidden />{busy ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </form>
      {asking && (
        <Layer onClose={() => setAsking(false)} labelledBy={`${uid}-discard`}>
          <div className={css.dialogHead}>
            <h2 id={`${uid}-discard`}>Buang isian catatan ini?</h2>
          </div>
          <p className={css.muted}>Yang sudah diisi belum tersimpan dan akan hilang.</p>
          <div className={css.dialogActions}>
            <button type="button" className={css.secondary} data-autofocus onClick={() => setAsking(false)}>Lanjut mengisi</button>
            <button type="button" className={css.danger} onClick={onClose}>Buang isian</button>
          </div>
        </Layer>
      )}
    </Layer>
  );
}
