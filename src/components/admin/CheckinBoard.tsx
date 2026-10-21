"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CircleCheck, CircleX, Search, Undo2, Users } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { codeFromScan, type CheckinGuest } from "@/lib/tickets";
import type { EventRecord } from "@/lib/types";
import { adminRequest, errorMessage } from "./api";
import { QrScanner } from "./QrScanner";
import styles from "./admin.module.css";

type Result = { tone: "welcome" | "again" | "error"; guest?: CheckinGuest; message: string };
type Filter = "all" | "waiting" | "arrived";

/** What the door staff needs at a glance: who it is, how many, and anything to take care of. */
export function CheckinResult({ result, timezone }: { result: Result; timezone: string }) {
  const { guest } = result;
  return <div className={styles.checkinResult} data-tone={result.tone} role="status">
    <p className={styles.checkinResultTitle}>
      {result.tone === "welcome" ? <CircleCheck size={22} aria-hidden="true" /> : result.tone === "again" ? <AlertTriangle size={22} aria-hidden="true" /> : <CircleX size={22} aria-hidden="true" />}
      {result.tone === "welcome" ? "Silakan masuk" : result.tone === "again" ? "Sudah check-in sebelumnya" : "Tidak bisa check-in"}
    </p>
    {guest ? <>
      <p className={styles.checkinName}>{guest.name}</p>
      <p>{guest.organization}{guest.party_size > 1 && <> · <strong>{guest.party_size} orang</strong> (dengan pendamping)</>}</p>
      {result.tone === "again" && guest.checked_in_at && <p>Pertama kali pukul {formatTime(guest.checked_in_at, timezone)}. Pastikan ini bukan tiket yang dipakai dua kali.</p>}
      {guest.allergy && <p className={styles.checkinFlag}>Alergi: {guest.allergy}</p>}
      {guest.access && <p className={styles.checkinFlag}>Akses: {guest.access}</p>}
    </> : <p>{result.message}</p>}
  </div>;
}

/** Door check-in for one event: QR scanning, the last result, and the list of expected guests. */
export function CheckinBoard({ event, initial, migrated }: { event: EventRecord; initial: CheckinGuest[]; migrated: boolean }) {
  const [guests, setGuests] = useState(initial);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("waiting");
  const base = `/api/admin/events/${event.id}/checkin`;

  const send = useCallback(async (body: { code: string } | { rsvp_id: string }) => {
    setBusy(true);
    try {
      const response = await adminRequest<{ guest: CheckinGuest; first_time: boolean }>(base, { method: "POST", body: JSON.stringify(body) });
      const { guest, first_time } = response.data!;
      setGuests(list => list.map(item => item.rsvp_id === guest.rsvp_id ? guest : item));
      setResult({ tone: first_time ? "welcome" : "again", guest, message: response.message });
    } catch (cause) {
      setResult({ tone: "error", message: errorMessage(cause) });
    } finally { setBusy(false); }
  }, [base]);

  const onScan = useCallback((text: string) => {
    const code = codeFromScan(text);
    if (!code) { setResult({ tone: "error", message: "QR ini bukan tiket undangan Werkudara." }); return; }
    void send({ code });
  }, [send]);

  async function undo(guest: CheckinGuest) {
    if (!guest.ticket_id || !window.confirm(`Batalkan check-in ${guest.name}?`)) return;
    try {
      await adminRequest(base, { method: "DELETE", body: JSON.stringify({ ticket_id: guest.ticket_id }) });
      setGuests(list => list.map(item => item.rsvp_id === guest.rsvp_id ? { ...item, checked_in_at: null } : item));
      setResult(null);
    } catch (cause) { setResult({ tone: "error", message: errorMessage(cause) }); }
  }

  const arrived = guests.filter(guest => guest.checked_in_at);
  const people = (list: CheckinGuest[]) => list.reduce((sum, guest) => sum + guest.party_size, 0);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return guests.filter(guest => (filter === "all" || (filter === "arrived") === !!guest.checked_in_at)
      && (!words || `${guest.name} ${guest.organization}`.toLowerCase().includes(words)));
  }, [guests, query, filter]);

  if (!migrated) return <Notice tone="warning">Tiket dan check-in menunggu migrasi <code>202610210003_tickets_checkin.sql</code>. Daftar tamu hadir tetap bisa dilihat di tab RSVP.</Notice>;
  return <div className="stack">
    <div className={styles.checkinStats} role="list" aria-label="Ringkasan kedatangan">
      <div role="listitem"><span>Sudah datang</span><strong>{arrived.length} <small>dari {guests.length} tamu</small></strong></div>
      <div role="listitem"><span>Orang di lokasi</span><strong>{people(arrived)} <small>dari {people(guests)}</small></strong></div>
    </div>

    <section className={styles.guestCard} aria-label="Pindai tiket">
      <QrScanner onScan={onScan} paused={busy} />
      {result && <CheckinResult result={result} timezone={event.timezone} />}
    </section>

    <section className={styles.guestCard} aria-labelledby="checkin-list-title">
      <h2 id="checkin-list-title" className={styles.guestCardTitle}><Users size={18} aria-hidden="true" /> Daftar tamu hadir</h2>
      <label className={styles.checkinSearch}>
        <Search size={16} aria-hidden="true" />
        <input type="search" placeholder="Cari nama atau instansi" aria-label="Cari nama atau instansi" value={query} onChange={e => setQuery(e.target.value)} />
      </label>
      <div className={styles.galleryFilters} role="group" aria-label="Saring tamu">
        {([["waiting", "Belum datang", guests.length - arrived.length], ["arrived", "Sudah datang", arrived.length], ["all", "Semua", guests.length]] as const).map(([key, label, n]) =>
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} ({n})</button>)}
      </div>
      {shown.length === 0 ? <p>Tidak ada tamu yang cocok.</p> : <ul className={styles.checkinList}>
        {shown.map(guest => <li key={guest.rsvp_id} data-arrived={guest.checked_in_at ? "" : undefined}>
          <div>
            <strong>{guest.name}</strong>
            <span>{[guest.organization, guest.party_size > 1 ? `${guest.party_size} orang` : "", guest.allergy ? "alergi" : "", guest.access ? "akses khusus" : ""].filter(Boolean).join(" · ")}</span>
          </div>
          {guest.checked_in_at
            ? <div className={styles.checkinDone}><span><CircleCheck size={16} aria-hidden="true" /> {formatTime(guest.checked_in_at, event.timezone)}</span><button type="button" onClick={() => void undo(guest)} aria-label={`Batalkan check-in ${guest.name}`}><Undo2 size={16} aria-hidden="true" /></button></div>
            : <Button type="button" disabled={busy} onClick={() => void send({ rsvp_id: guest.rsvp_id })}>Check-in</Button>}
        </li>)}
      </ul>}
    </section>
  </div>;
}
