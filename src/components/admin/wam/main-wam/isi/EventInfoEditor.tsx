"use client";

import { useId, useState } from "react";
import { Card, ConsoleButton, PageHeader, Pill, type Crumb } from "@/components/console";
import { adminRequest } from "@/components/admin/shared/api";
import { shortDate } from "@/lib/main-wam/admin/labels";
import { carbonFilled, carbonInputSchema, eventInfoOf, eventInfoSchema, type EventInfoInput } from "@/lib/main-wam/admin/event-info";
import type { AdminPerson } from "@/lib/main-wam/admin/people";
import type { CarbonInputs, MainWamContacts, MainWamSettings } from "@/lib/main-wam/types";
import { mainWamAdminApi, wamAdminPath } from "@/lib/routes";
import { ContentTabs, described, Field, MessageLine, NumberInput, PersonSelect, problemsOf, SwitchRow, useRun, Waiting, type Message, type Problems } from "./fields";
import css from "./isi.module.css";

type Stay = { date: string; time: string } | null;
const CONTACTS: { key: keyof MainWamContacts; label: string; hint: string }[] = [
  { key: "umum", label: "Panitia utama", hint: "Bantuan umum di aplikasi." },
  { key: "kamar", label: "Kamar", hint: "Tombol Bantuan kamar." },
  { key: "perjalanan", label: "Perjalanan", hint: "Bila koordinator langkah kosong." },
];
const BILLS: { key: Exclude<keyof CarbonInputs, "final">; label: string; unit: string }[] = [
  { key: "listrikKwh", label: "Listrik", unit: "kWh" }, { key: "airM3", label: "Air", unit: "m³" }, { key: "lpgKg", label: "LPG", unit: "kg" }, { key: "sampahKg", label: "Sampah", unit: "kg" },
];

/**
 * Admin WAM → Main WAM → Info acara (agen E): the event's name and town, the hotel with its
 * address, check-in and check-out, who to call, and the hotel's bills for Jejak karbon (filled
 * after the event; optional). Each card saves on its own.
 */
export function EventInfoEditor({ initial, people, crumbs, title }: { initial: MainWamSettings; people: readonly AdminPerson[]; crumbs: readonly Crumb[]; title: string }) {
  const id = useId();
  const [settings, setSettings] = useState(initial);
  const first = eventInfoOf(initial);
  const [event, setEvent] = useState({ name: first.name, venue: first.venue });
  const [hotel, setHotel] = useState({ hotel: first.hotel, address: first.address, checkIn: first.checkIn as Stay, checkOut: first.checkOut as Stay });
  const [contacts, setContacts] = useState<MainWamContacts>(first.contacts);
  const [carbon, setCarbon] = useState<CarbonInputs>(first.carbon);
  const [problems, setProblems] = useState<Problems>({});
  const [message, setMessage] = useState<Message>(null);
  const { busy, run } = useRun(setMessage);
  const locked = !settings.migrated || busy !== null;
  // What is saved now, so a card's Simpan is primary only while it has changes (as on Pengaturan).
  const saved = eventInfoOf(settings);
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const dirty = {
    acara: !same({ name: event.name.trim(), venue: event.venue.trim() }, { name: saved.name, venue: saved.venue }),
    hotel: !same({ hotel: hotel.hotel.trim(), address: hotel.address.trim(), checkIn: hotel.checkIn, checkOut: hotel.checkOut }, { hotel: saved.hotel, address: saved.address, checkIn: saved.checkIn, checkOut: saved.checkOut }),
    kontak: !same(contacts, saved.contacts),
    tagihan: !same(carbon, saved.carbon),
  };
  const saveButton = (part: keyof typeof dirty, onClick: () => void, extraDisabled = false) =>
    <ConsoleButton variant={dirty[part] ? "primary" : "secondary"} disabled={locked || !dirty[part] || extraDisabled} onClick={onClick}>{busy === part ? "Menyimpan…" : dirty[part] ? "Simpan" : "Tersimpan"}</ConsoleButton>;

  async function save(part: string, body: EventInfoInput) {
    const checked = eventInfoSchema.safeParse(body);
    if (!checked.success) {
      const found: Problems = {};
      for (const issue of checked.error.issues) found[issue.path.join(".")] ??= issue.message;
      setProblems(found);
      return;
    }
    setProblems({});
    await run(part, async () => {
      const result = await adminRequest<MainWamSettings>(mainWamAdminApi.eventInfo, { method: "PUT", body: JSON.stringify(checked.data) });
      setSettings(result.data!);
      return result.message;
    }, error => setProblems(problemsOf(error)));
  }
  const stayField = (key: "checkIn" | "checkOut", label: string) => {
    const value = hotel[key];
    const clear = () => { setHotel({ ...hotel, [key]: null }); setProblems({}); };
    const change = (patch: Partial<NonNullable<Stay>>) => {
      const next = { date: value?.date ?? settings.event.startDate, time: value?.time ?? (key === "checkIn" ? "14:00" : "12:00"), ...patch };
      setHotel({ ...hotel, [key]: next.date ? next : null });
      setProblems({});
    };
    const error = problems[key] ?? problems[`${key}.date`] ?? problems[`${key}.time`];
    return <div className={css.field} role="group" aria-labelledby={`${id}-${key}`}>
      <span className={css.label} id={`${id}-${key}`}>{label} <span className={css.optional}>(boleh kosong)</span></span>
      <div className={css.dateTime}>
        <input className="input" type="date" aria-label={`Tanggal ${label.toLowerCase()}`} {...described(`${id}-${key}-date`, error)} value={value?.date ?? ""}
          onChange={event => { if (event.target.value) change({ date: event.target.value }); else clear(); }} />
        <input className="input" type="time" step={300} aria-label={`Jam ${label.toLowerCase()}`} value={value?.time ?? ""} disabled={!value} onChange={event => event.target.value && change({ time: event.target.value })} />
      </div>
      {error && <p id={`${id}-${key}-date-error`} className={css.error}>{error}</p>}
    </div>;
  };
  const filled = carbonFilled(carbon);
  const carbonValid = carbonInputSchema.safeParse(carbon).success;

  return <div className={css.page}>
    <PageHeader crumbs={crumbs} title={title} subtitle="Hotel, check-in dan check-out, kontak panitia, dan tagihan hotel untuk Jejak karbon." />
    <ContentTabs current="info" />
    {!settings.migrated && <Waiting what="Info acara" />}
    <MessageLine message={message} />
    <div className={css.cards}>
      <Card title="Acara" id={`${id}-acara`}>
        <Field id={`${id}-name`} label="Nama acara" error={problems.name}>
          <input className="input" {...described(`${id}-name`, problems.name)} value={event.name} maxLength={80} disabled={!settings.migrated} onChange={change => { setEvent({ ...event, name: change.target.value }); setProblems({}); }} />
        </Field>
        <Field id={`${id}-venue`} label="Kota" optional error={problems.venue}>
          <input className="input" {...described(`${id}-venue`, problems.venue)} value={event.venue} maxLength={150} placeholder="mis. Kota Batu" disabled={!settings.migrated} onChange={change => { setEvent({ ...event, venue: change.target.value }); setProblems({}); }} />
        </Field>
        <p className={css.small}>Tanggal acara: {shortDate(settings.event.startDate)} sampai {shortDate(settings.event.endDate)}. Diatur di <a href={wamAdminPath.events}>Acara dan modul</a>.</p>
        <div className={css.cardActions}>
          {saveButton("acara", () => void save("acara", event))}
        </div>
      </Card>

      <Card title="Hotel" id={`${id}-hotel`}>
        <Field id={`${id}-hotelName`} label="Nama hotel" optional error={problems.hotel}>
          <input className="input" {...described(`${id}-hotelName`, problems.hotel)} value={hotel.hotel} maxLength={150} placeholder="mis. Hotel (contoh)" disabled={!settings.migrated} onChange={change => { setHotel({ ...hotel, hotel: change.target.value }); setProblems({}); }} />
        </Field>
        <Field id={`${id}-address`} label="Alamat" optional error={problems.address}>
          <textarea className="textarea" rows={2} {...described(`${id}-address`, problems.address)} value={hotel.address} maxLength={300} placeholder="mis. Jl. Contoh No. 1, Kota Batu" disabled={!settings.migrated} onChange={change => { setHotel({ ...hotel, address: change.target.value }); setProblems({}); }} />
        </Field>
        {stayField("checkIn", "Check-in")}
        {stayField("checkOut", "Check-out")}
        <div className={css.cardActions}>
          {saveButton("hotel", () => void save("hotel", hotel))}
        </div>
      </Card>

      <Card title="Kontak panitia" id={`${id}-kontak`}>
        <p className={css.small}>Tombol Hubungi di aplikasi membuka WhatsApp orang ini.</p>
        {CONTACTS.map(contact => <Field key={contact.key} id={`${id}-${contact.key}`} label={contact.label} optional hint={contact.hint}>
          <PersonSelect id={`${id}-${contact.key}`} people={people} value={contacts[contact.key]} onChange={value => setContacts({ ...contacts, [contact.key]: value })} />
        </Field>)}
        <div className={css.cardActions}>
          {saveButton("kontak", () => void save("kontak", { contacts }))}
        </div>
      </Card>

      <Card title="Tagihan hotel" id={`${id}-tagihan`}>
        <p className={css.small}>Untuk Jejak karbon, diisi sesudah acara dan tidak wajib. Selama kosong, perkiraan memakai kamar-malam.</p>
        <div className={css.pair}>
          {BILLS.map(bill => <Field key={bill.key} id={`${id}-${bill.key}`} label={bill.label} optional error={problems[`carbon.${bill.key}`]}>
            <NumberInput id={`${id}-${bill.key}`} value={carbon[bill.key]} suffix={bill.unit} error={problems[`carbon.${bill.key}`]}
              onChange={value => { const next = { ...carbon, [bill.key]: value }; setCarbon({ ...next, final: next.final && carbonFilled(next) === 4 }); setProblems({}); }} />
          </Field>)}
        </div>
        <SwitchRow title="Tandai final" sub={filled === 4 ? "Angka tagihan sudah pasti." : `Bisa setelah keempat angka diisi (${filled} dari 4).`} checked={carbon.final} disabled={filled < 4}
          onChange={final => setCarbon({ ...carbon, final })} />
        <div className={css.cardActions}>
          {saveButton("tagihan", () => void save("tagihan", { carbon }), !carbonValid)}
          {settings.carbon.final ? <Pill tone="ok">Final</Pill> : carbonFilled(settings.carbon) ? <Pill tone="warn">Sementara</Pill> : <Pill>Belum ada</Pill>}
        </div>
      </Card>
    </div>
  </div>;
}
