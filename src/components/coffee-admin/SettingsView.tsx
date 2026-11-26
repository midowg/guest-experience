"use client";

import { useId, useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import { errorMessage } from "@/components/admin/shared/api";
import { PageHeader } from "@/components/console";
import { AUDIENCES, AUDIENCE_LABEL, GROUP_LABEL, OPTION_KEYS, OPTION_LABEL, type Audience, type CoffeeOptions, type DrinkOptions, type QuotaGroup } from "@/lib/coffee/menu";
import { COFFEE_MENU_MIGRATION_NAME } from "./sections";
import { OTHER_ROOM, ROOMS } from "@/lib/coffee/rooms";
import { coffeePath } from "@/lib/routes";
import { fieldErrorsOf, type CoffeeAdminApi, type SettingsData } from "./api";
import { Layer } from "./Layer";
import { coffeeAdminSection } from "./sections";
import css from "./coffee-admin.module.css";

const GROUPS: QuotaGroup[] = ["karyawan", "ga", "intern"];
const parse = (text: string) => /^\d{1,2}$/.test(text.trim()) && Number(text) <= 60 ? Number(text) : null;

function QuotaForm({ api, data, onSaved }: { api: CoffeeAdminApi; data: SettingsData; onSaved: (data: SettingsData, message: string) => void }) {
  const uid = useId();
  const textOf = (settings: SettingsData["settings"]): Record<QuotaGroup, string> => ({ karyawan: String(settings.karyawan), ga: String(settings.ga), intern: String(settings.intern) });
  const [text, setText] = useState(() => textOf(data.settings));
  // The form stays in place when the quotas are read again or saved (so the focus stays too). New
  // values from the server replace what is shown only while nothing typed here waits to be saved.
  const [base, setBase] = useState(data.settings);
  if (GROUPS.some(group => base[group] !== data.settings[group])) {
    const untouched = GROUPS.every(group => parse(text[group]) === base[group]);
    setBase(data.settings);
    if (untouched) setText(textOf(data.settings));
  }
  /** The groups whose quota would become 0: asked about before saving. */
  const [asking, setAsking] = useState<QuotaGroup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const values = { karyawan: parse(text.karyawan), ga: parse(text.ga), intern: parse(text.intern) };
  const changed = GROUPS.some(group => values[group] !== data.settings[group]);
  const invalid = GROUPS.some(group => values[group] === null);
  const errorOf = (group: QuotaGroup) => values[group] === null ? "Isi angka 0 sampai 60." : serverErrors[group]?.[0] ?? "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || invalid || !changed) return;
    // A quota of 0 closes claims for the whole group from the next claim on: never by a slip of the finger.
    const closing = GROUPS.filter(group => values[group] === 0 && data.settings[group] !== 0);
    if (closing.length) setAsking(closing);
    else void save();
  };
  const save = async () => {
    setAsking(null);
    setBusy(true); setFailure(""); setServerErrors({});
    try {
      const saved = await api.saveSettings({ karyawan: values.karyawan!, ga: values.ga!, intern: values.intern! });
      onSaved({ ...data, settings: saved.settings, holders: saved.holders, gaPin: saved.gaPin }, saved.message);
    } catch (problem) {
      setServerErrors(fieldErrorsOf(problem));
      setFailure(errorMessage(problem));
    } finally { setBusy(false); }
  };

  return (
    <form className={css.quotaForm} onSubmit={submit} noValidate>
      {GROUPS.map(group => (
        <div key={group}>
          <div className={css.quotaRow}>
            <label htmlFor={`${uid}-${group}`}>{GROUP_LABEL[group]}</label>
            <input id={`${uid}-${group}`} type="number" inputMode="numeric" min={0} max={60} value={text[group]} readOnly={busy}
              onChange={event => setText(current => ({ ...current, [group]: event.target.value }))}
              aria-invalid={!!errorOf(group)} aria-describedby={errorOf(group) ? `${uid}-${group}-error` : undefined} />
            <span>klaim</span>
          </div>
          {errorOf(group) && <p id={`${uid}-${group}-error`} className={css.error}>{errorOf(group)}</p>}
        </div>
      ))}
      {failure && <div className={css.banner} data-tone="no" role="alert"><span>{failure}</span></div>}
      <div className={css.formFoot}>
        <button type="submit" className={css.primary} disabled={busy || invalid || !changed}><Check size={18} aria-hidden />{busy ? "Menyimpan…" : "Simpan jatah"}</button>
        <span className={css.small} role="status">{busy ? "" : changed ? "Belum disimpan." : "Tersimpan."}</span>
      </div>
      {asking && (
        <Layer onClose={() => setAsking(null)} labelledBy={`${uid}-zero`}>
          <div className={css.dialogHead}>
            <h2 id={`${uid}-zero`}>Simpan jatah 0 untuk {asking.map(group => GROUP_LABEL[group]).join(" dan ")}?</h2>
            <button type="button" className={css.iconButton} aria-label="Tutup" onClick={() => setAsking(null)}><X size={20} aria-hidden /></button>
          </div>
          <p className={css.muted}>Kelompok dengan jatah 0 tidak bisa mengajukan klaim mulai klaim berikutnya. Klaim yang sudah ada tidak berubah.</p>
          <div className={css.dialogActions}>
            <button type="button" className={css.secondary} data-autofocus onClick={() => setAsking(null)}>Kembali</button>
            <button type="button" className={css.primary} onClick={() => void save()}>Simpan jatah</button>
          </div>
        </Layer>
      )}
    </form>
  );
}

const AUDIENCE_HINT: Record<Audience, string> = {
  klaim: "Karyawan mengambil sendiri di mesin, jadi bawaannya tidak ditanya apa pun.",
  tim: "Minuman tim saat rapat, disiapkan GA.",
  tamu: "Minuman tamu, disiapkan GA; juga yang tampil di buku menu tamu.",
};
const sameOptions = (a: CoffeeOptions, b: CoffeeOptions) => AUDIENCES.every(audience => OPTION_KEYS.every(option => a[audience][option] === b[audience][option]));

/**
 * Opsi minuman (F6): for each audience, whether a drink is asked its temperature, sugar and ice
 * level. Saved together with one button, like the quotas; they hold from the next order on, and
 * orders already made keep what they carry. Takaran es follows the temperature: without Suhu
 * there is no "Es" to ask the ice of, so its switch rests. `ready` false: the migration has not
 * run, everyone is asked everything and the switches cannot be saved yet.
 */
function OptionsForm({ api, data, onSaved }: { api: CoffeeAdminApi; data: SettingsData; onSaved: (data: SettingsData, message: string) => void }) {
  const uid = useId();
  const [draft, setDraft] = useState(data.options);
  // New values from the server (read again, or saved by another pengelola) replace the switches only while nothing here waits to be saved.
  const [base, setBase] = useState(data.options);
  if (!sameOptions(base, data.options)) {
    const untouched = sameOptions(draft, base);
    setBase(data.options);
    if (untouched) setDraft(data.options);
  }
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const ready = data.optionsReady;
  const changed = !sameOptions(draft, data.options);
  const flip = (audience: Audience, option: keyof DrinkOptions) => setDraft(current => {
    const next = { ...current[audience], [option]: !current[audience][option] };
    // Takaran es is only asked together with the temperature.
    if (!next.suhu) next.es = false;
    return { ...current, [audience]: next };
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !changed || !ready) return;
    setBusy(true); setFailure("");
    try {
      const saved = await api.saveOptions(draft);
      setDraft(saved.options);
      onSaved({ ...data, options: saved.options }, saved.message);
    } catch (problem) {
      setFailure(errorMessage(problem));
    } finally { setBusy(false); }
  };
  return (
    <form className={css.quotaForm} onSubmit={submit} noValidate>
      {!ready && <div className={css.banner} role="status"><span>Menunggu migrasi {COFFEE_MENU_MIGRATION_NAME}. Sampai dijalankan, semua opsi ditanyakan ke semua orang dan belum bisa diubah.</span></div>}
      <div className={css.optionGroups}>
        {AUDIENCES.map(audience => (
          <fieldset key={audience} className={css.optionGroup} disabled={busy || !ready}>
            <legend>{AUDIENCE_LABEL[audience]}</legend>
            <p className={css.small}>{AUDIENCE_HINT[audience]}</p>
            {OPTION_KEYS.map(option => {
              const rests = option === "es" && !draft[audience].suhu;
              return (
                <label key={option} className={css.switchRow} data-rests={rests || undefined}>
                  <span>{OPTION_LABEL[option]}{rests && <small>Nyalakan Suhu dulu</small>}</span>
                  <input type="checkbox" role="switch" id={`${uid}-${audience}-${option}`} checked={draft[audience][option]} disabled={rests} onChange={() => flip(audience, option)} />
                  <span className={css.switch} aria-hidden />
                  <span className={css.switchWord} aria-hidden>{draft[audience][option] ? "Ditanyakan" : "Tidak"}</span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      {failure && <div className={css.banner} data-tone="no" role="alert"><span>{failure}</span></div>}
      <div className={css.formFoot}>
        <button type="submit" className={css.primary} disabled={busy || !changed || !ready}><Check size={18} aria-hidden />{busy ? "Menyimpan…" : "Simpan opsi"}</button>
        <span className={css.small} role="status">{busy || !ready ? "" : changed ? "Belum disimpan." : "Tersimpan."}</span>
      </div>
    </form>
  );
}

/**
 * PIN GA: the four digits the GA officer types on the tablet to leave the guest menu book. Only
 * "sudah diatur" or "belum diatur" is known here: the PIN is typed, sent, and forgotten (the field
 * is emptied after saving, and the browser is told not to remember it).
 */
function PinForm({ api, set, onSaved }: { api: CoffeeAdminApi; set: boolean; onSaved: (message: string) => void }) {
  const uid = useId();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [tried, setTried] = useState(false);
  const valid = /^\d{4}$/.test(pin);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!valid) { setTried(true); return; }
    setBusy(true); setFailure("");
    try {
      const saved = await api.saveGaPin(pin);
      setPin(""); setTried(false);
      onSaved(saved.message);
    } catch (problem) {
      setFailure(fieldErrorsOf(problem).pin?.[0] ?? errorMessage(problem));
    } finally { setBusy(false); }
  };
  const error = tried && !valid ? "Isi PIN 4 angka." : "";
  return (
    <form className={css.quotaForm} onSubmit={submit} noValidate>
      <p className={css.pinState} data-set={set || undefined} role="status">{set ? "Sudah diatur" : "Belum diatur"}</p>
      <div>
        <div className={css.quotaRow}>
          <label htmlFor={`${uid}-pin`}>{set ? "PIN baru" : "PIN"}</label>
          <input id={`${uid}-pin`} type="password" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="off" value={pin} readOnly={busy}
            onChange={event => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} aria-invalid={!!error} aria-describedby={`${uid}-pin-help`} />
          <span>4 angka</span>
        </div>
        <p id={`${uid}-pin-help`} className={error ? css.error : css.small}>{error || "PIN tidak bisa dilihat lagi setelah disimpan. Lupa? Simpan PIN baru."}</p>
      </div>
      {failure && <div className={css.banner} data-tone="no" role="alert"><span>{failure}</span></div>}
      <div className={css.formFoot}>
        <button type="submit" className={css.primary} disabled={busy || !pin}><Check size={18} aria-hidden />{busy ? "Menyimpan…" : set ? "Ganti PIN" : "Simpan PIN"}</button>
      </div>
    </form>
  );
}

/**
 * Pengaturan: the monthly quotas (the pengelola may change them; they hold from the next claim
 * on), which options a drink is asked with per audience (F6), who holds the access (changed in Super admin → Akses admin) and the rooms (read only).
 */
export function SettingsView({ api, data, error, onRetry, onSaved }: {
  api: CoffeeAdminApi; data: SettingsData | null; error: string; onRetry: () => void; onSaved: (data: SettingsData, message: string) => void;
}) {
  const uid = useId();
  const section = coffeeAdminSection("pengaturan");
  return (
    <>
      <PageHeader title={section.label} subtitle={section.summary} />
      {error && !data && (
        <div className={css.banner} data-tone="no" role="alert">
          <span>Pengaturan belum bisa dimuat. {error}</span>
          <button type="button" className={css.textButton} onClick={onRetry}>Coba lagi</button>
        </div>
      )}
      <div className={css.settingsGrid}>
        <section className={css.panel} aria-labelledby={`${uid}-quota`} aria-busy={!data && !error}>
          <h2 id={`${uid}-quota`}>Jatah per bulan</h2>
          {data
            ? <QuotaForm api={api} data={data} onSaved={onSaved} />
            : !error && <span className={css.skeleton} style={{ height: 196 }} />}
          <dl className={css.kv} style={{ marginTop: 12 }}>
            <div><dt>Tamu</dt><dd>Tanpa batas, dicatat atas nama PIC</dd></div>
            <div><dt>Tim · rapat</dt><dd>Tanpa jatah, dicatat atas nama orangnya</dd></div>
          </dl>
          <p className={css.small}>Bulan kalender WIB. Klaim yang ditolak atau dibatalkan tidak memakai jatah. Perubahan berlaku mulai klaim berikutnya.</p>
        </section>
        <section className={`${css.panel} ${css.panelWide}`} aria-labelledby={`${uid}-options`} aria-busy={!data && !error}>
          <h2 id={`${uid}-options`}>Opsi minuman</h2>
          {data
            ? <OptionsForm api={api} data={data} onSaved={onSaved} />
            : !error && <span className={css.skeleton} style={{ height: 220 }} />}
          <p className={css.small} style={{ marginTop: 12 }}>Opsi yang tidak ditanyakan tidak tampil saat memesan dan tidak dicatat. Berlaku mulai pesanan berikutnya; pesanan yang sudah ada tidak berubah.</p>
        </section>
        <section className={css.panel} aria-labelledby={`${uid}-pin`} aria-busy={!data && !error}>
          <h2 id={`${uid}-pin`}>PIN GA</h2>
          {data
            ? <PinForm api={api} set={data.gaPin} onSaved={message => onSaved({ ...data, gaPin: true }, message)} />
            : !error && <span className={css.skeleton} style={{ height: 120 }} />}
          <p className={css.small} style={{ marginTop: 12 }}>Diminta di tablet GA saat petugas keluar dari buku menu tamu, supaya tamu tidak bisa membuka layar GA. Selama belum diatur, keluar hanya lewat pertanyaan.</p>
        </section>
        <section className={css.panel} aria-labelledby={`${uid}-access`} aria-busy={!data && !error}>
          <h2 id={`${uid}-access`}>Pemegang akses WG Coffee</h2>
          {!data ? !error && <span className={css.skeleton} style={{ height: 96 }} /> : data.holders.length ? (
            <ul className={css.recent}>
              {data.holders.map(holder => (
                <li key={holder.id}>
                  <span className={css.avatar} aria-hidden>{holder.name.trim()[0]?.toUpperCase() ?? "?"}</span>
                  <span className={css.recentText}><strong>{holder.name}</strong><span>{[holder.position, "menerima semua pesanan"].filter(Boolean).join(" · ")}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className={css.small}>Belum ada yang diberi akses. Super admin tetap bisa memproses.</p>}
          <p className={css.small} style={{ marginTop: 12 }}>Siapa pun yang lebih dulu membuka pesanan memprosesnya; pemesan melihat namanya. Akses diatur di Super admin → Akses admin.</p>
          <p className={css.small} style={{ marginTop: 8 }}>Mode GA (tablet, <code>{coffeePath.ga}</code>) bisa dibuka oleh kelompok GA (kategori DW di Data karyawan), Admin Booking, dan pemegang akses di atas. Masuknya di tablet dengan akun karyawan masing-masing.</p>
        </section>
        <section className={css.panel} aria-labelledby={`${uid}-room`}>
          <h2 id={`${uid}-room`}>Ruangan</h2>
          <ul className={css.plainList}>{[...ROOMS.map(room => room.name), `${OTHER_ROOM} (isi sendiri)`].map(room => <li key={room}>{room}</li>)}</ul>
          <p className={css.small} style={{ marginTop: 12 }}>Mengikuti denah kantor; tidak diubah dari sini.</p>
        </section>
      </div>
    </>
  );
}
