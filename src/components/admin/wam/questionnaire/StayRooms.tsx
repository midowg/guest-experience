"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BedDouble, CheckCircle2, Plus, Search, Send, Sparkles, Trash2, Undo2, UserMinus } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { SectionToolbar } from "@/components/console";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { praWamStayApi } from "@/lib/routes";
import type { StayBoard, StayCard, StayRoom } from "@/lib/server/pra-wam/stay";
import styles from "./stay.module.css";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const roomGender = (room: StayRoom) => room.people.find(person => person.gender)?.gender ?? null;
const free = (room: StayRoom) => room.capacity - room.people.length;

/**
 * Admin WAM → Kuesioner → Kamar (Penpot "K3 · Pairing kamar"), with Data HR open: the hotel's rooms
 * as cards (who is in, what to check, "sudah ditinjau"), the people still waiting, an automatic
 * suggestion for the free beds, moving people by hand, and publishing to participants' Beranda.
 * Every change goes to the server, which checks the rules again; the page then reloads its data.
 */
export function StayRooms({ board }: { board: StayBoard }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [text, setText] = useState("");
  const [textErrors, setTextErrors] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const run = async (action: () => Promise<{ message: string }>, after?: () => void) => {
    setBusy(true); setMessage(null);
    try {
      const result = await action();
      setMessage({ tone: "success", text: result.message });
      after?.();
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: errorMessage(error) });
      return false;
    } finally { setBusy(false); }
    return true;
  };
  const send = (url: string, method: string, body?: unknown) => () => adminRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const place = (person: StayCard, roomId: string | null) => run(send(praWamStayApi.place, "PUT", { employeeId: person.id, roomId }));

  const addRooms = async () => {
    setTextErrors([]);
    setBusy(true); setMessage(null);
    try {
      const result = await adminRequest<{ added: number }>(praWamStayApi.rooms, { method: "POST", body: JSON.stringify({ text }) });
      setMessage({ tone: "success", text: result.message });
      setText("");
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: errorMessage(error) });
      const fields = (error as { fieldErrors?: Record<string, string[]> }).fieldErrors;
      if (fields?.text) setTextErrors(fields.text);
    } finally { setBusy(false); }
  };

  const filled = board.rooms.filter(room => room.people.length > 0).length;
  const beds = board.rooms.reduce((sum, room) => sum + room.capacity, 0);
  const placed = board.rooms.reduce((sum, room) => sum + room.people.length, 0);
  const search = query.trim().toLowerCase();
  const matches = (room: StayRoom) => !search || room.name.toLowerCase().includes(search) || room.people.some(person => person.name.toLowerCase().includes(search));
  const shownRooms = board.rooms.filter(matches);
  const shownWaiting = board.waiting.filter(person => !search || person.name.toLowerCase().includes(search));
  const roomsFor = (person: StayCard, except?: string) => board.rooms.filter(room => room.id !== except).map(room => {
    const gender = roomGender(room);
    const full = free(room) <= 0;
    const other = !!person.gender && !!gender && gender !== person.gender;
    return { room, disabled: full || other, note: full ? "penuh" : other ? gender!.toLowerCase() : `sisa ${free(room)}` };
  });

  const personRow = (person: StayCard, room?: StayRoom) => <li key={person.id} className={styles.person}>
    <span className={styles.avatar} aria-hidden>{initials(person.name)}</span>
    <div className={styles.who}>
      <strong>{person.name}</strong>
      <small>{[person.department, person.gender ?? "Belum mengisi bagian menginap"].filter(Boolean).join(" · ")}</small>
      {person.facts.length > 0 && <ul className={styles.facts} aria-label={`Isian menginap ${person.name}`}>{person.facts.map(fact => <li key={fact}>{fact}</li>)}</ul>}
    </div>
    <div className={styles.personActions}>
      <label className="sr-only" htmlFor={`move-${person.id}`}>{room ? `Pindahkan ${person.name}` : `Masukkan ${person.name} ke kamar`}</label>
      <select id={`move-${person.id}`} className="select" value="" disabled={busy} onChange={event => { if (event.target.value) void place(person, event.target.value); }}>
        <option value="">{room ? "Pindah ke…" : "Masukkan ke kamar…"}</option>
        {roomsFor(person, room?.id).map(({ room: target, disabled, note }) => <option key={target.id} value={target.id} disabled={disabled}>Kamar {target.name} ({note})</option>)}
      </select>
      {room && <button type="button" className={styles.iconButton} disabled={busy} onClick={() => void place(person, null)} aria-label={`Keluarkan ${person.name} dari kamar ${room.name}`} title="Keluarkan dari kamar"><UserMinus size={18} aria-hidden /></button>}
    </div>
  </li>;

  return <div className="stack">
    {confirmDialog}
    <SectionToolbar title="Pairing kamar">
      <Button type="button" variant="secondary" disabled={busy || !board.rooms.length || !board.waiting.length} onClick={() => void run(send(praWamStayApi.suggest, "POST"))}>
        <Sparkles size={18} aria-hidden /> Usulkan otomatis
      </Button>
      {board.publishedAt
        ? <Button type="button" variant="secondary" disabled={busy} onClick={async () => {
          if (await confirm({ title: "Tarik kamar dari Beranda?", body: "Peserta tidak lagi melihat kamar dan teman sekamarnya sampai diterbitkan lagi.", confirmLabel: "Tarik" })) void run(send(praWamStayApi.publish, "PUT", { published: false }));
        }}><Undo2 size={18} aria-hidden /> Tarik dari peserta</Button>
        : <Button type="button" disabled={busy || !placed} onClick={async () => {
          if (await confirm({ title: "Terbitkan kamar ke peserta?", body: `Setiap peserta yang sudah dapat kamar melihat nomor kamar dan nama teman sekamarnya di Beranda WAM. Perubahan sesudahnya langsung terlihat.${board.waiting.length ? ` ${board.waiting.length} orang masih menunggu kamar.` : ""}`, confirmLabel: "Terbitkan" })) void run(send(praWamStayApi.publish, "PUT", { published: true }));
        }}><Send size={18} aria-hidden /> Terbitkan ke peserta</Button>}
    </SectionToolbar>
    <p className={styles.muted}>
      {board.rooms.length ? `${filled} dari ${board.rooms.length} kamar terisi · ${placed} dari ${beds} kasur` : "Belum ada kamar."}
      {` · ${board.waiting.length} orang menunggu kamar`}
      {board.unanswered ? ` · ${board.unanswered} belum mengisi bagian menginap` : ""}
    </p>

    {board.publishedAt
      ? <Notice tone="success">Terbit sejak {when(board.publishedAt)}. Peserta melihat kamarnya di Beranda; setiap perubahan di sini langsung terlihat.</Notice>
      : <Notice tone="info">Belum terbit. Peserta belum melihat apa pun sampai kamu menekan &quot;Terbitkan ke peserta&quot;.</Notice>}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}

    <details className={styles.add} open={!board.rooms.length}>
      <summary><Plus size={18} aria-hidden /> Tambah kamar</summary>
      <div className={styles.addBody}>
        <label htmlFor="stay-rooms">Satu kamar per baris: nomor, jenis, kapasitas. Rentang nomor boleh, misalnya &quot;201-210, Twin bed, 2&quot;.</label>
        <textarea id="stay-rooms" className="textarea" rows={5} value={text} onChange={event => setText(event.target.value)} placeholder={"208, Twin bed, 2\n301-305, Triple, 3\nSuite 1, 4"}
          aria-invalid={textErrors.length ? true : undefined} aria-describedby={textErrors.length ? "stay-rooms-error" : undefined} />
        {textErrors.length > 0 && <ul id="stay-rooms-error" className={styles.errors}>{textErrors.map(error => <li key={error}>{error}</li>)}</ul>}
        <div><Button type="button" disabled={busy || !text.trim()} onClick={() => void addRooms()}><Plus size={18} aria-hidden /> Tambahkan</Button></div>
      </div>
    </details>

    {(board.rooms.length > 0 || board.waiting.length > 0) && <label className={styles.search}>
      <Search size={18} aria-hidden />
      <span className="sr-only">Cari kamar atau nama</span>
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nomor kamar atau nama" />
    </label>}

    {board.waiting.length > 0 && <section className={styles.waiting} aria-labelledby="stay-waiting">
      <h3 id="stay-waiting"><AlertTriangle size={20} aria-hidden /> {board.waiting.length} peserta belum mendapat kamar</h3>
      {shownWaiting.length ? <ul className={styles.people}>{shownWaiting.map(person => personRow(person))}</ul> : <p className={styles.muted}>Tidak ada yang cocok dengan pencarian.</p>}
    </section>}

    {board.rooms.length > 0 && <ul className={styles.rooms}>
      {shownRooms.map(room => {
        const left = free(room);
        const status = left === 0 ? `Penuh ${room.people.length}/${room.capacity}` : room.people.length ? `Sisa ${left} · ${room.people.length}/${room.capacity}` : `Kosong · 0/${room.capacity}`;
        return <li key={room.id} className={`${styles.room} ${room.blocked.length ? styles.roomBlocked : ""}`}>
          <div className={styles.roomHead}>
            <div>
              <h3>Kamar {room.name}</h3>
              <p className={styles.muted}>{[room.kind, `kapasitas ${room.capacity} orang`].filter(Boolean).join(" · ")}{roomGender(room) ? ` · ${roomGender(room)}` : ""}</p>
            </div>
            <span className={`${styles.status} ${left === 0 ? styles.statusFull : room.people.length ? styles.statusPart : ""}`}>{left === 0 && <CheckCircle2 size={14} aria-hidden />}{status}</span>
          </div>
          {room.people.length ? <ul className={styles.people}>{room.people.map(person => personRow(person, room))}</ul> : <p className={styles.muted}>Belum ada penghuni.</p>}
          {room.blocked.map(note => <p key={note} className={styles.blocked}><AlertTriangle size={16} aria-hidden /> {note}</p>)}
          {room.notes.length > 0 && <ul className={styles.notes} aria-label={`Perlu dicek di kamar ${room.name}`}>{room.notes.map(note => <li key={note}>{note}</li>)}</ul>}
          <div className={styles.roomFoot}>
            <label className={styles.check}>
              <input type="checkbox" checked={room.reviewed} disabled={busy || !room.people.length} onChange={event => void run(send(praWamStayApi.room(room.id), "PATCH", { reviewed: event.target.checked }))} />
              Sudah ditinjau
            </label>
            <RoomEdit room={room} busy={busy} onSave={change => run(send(praWamStayApi.room(room.id), "PATCH", change))} />
            <button type="button" className={styles.iconButton} disabled={busy} aria-label={`Hapus kamar ${room.name}`} title="Hapus kamar" onClick={async () => {
              if (await confirm({ title: `Hapus kamar ${room.name}?`, body: room.people.length ? `${room.people.length} penghuninya kembali ke daftar menunggu.` : "Kamar ini kosong.", confirmLabel: "Hapus", danger: true })) void run(send(praWamStayApi.room(room.id), "DELETE"));
            }}><Trash2 size={18} aria-hidden /></button>
          </div>
        </li>;
      })}
    </ul>}
    {board.rooms.length > 0 && !shownRooms.length && <p className={styles.muted}>Tidak ada kamar yang cocok dengan pencarian.</p>}

    {placed > 0 && <div>
      <Button type="button" variant="secondary" disabled={busy} onClick={async () => {
        if (await confirm({ title: "Kosongkan semua kamar?", body: `${placed} orang kembali ke daftar menunggu. Daftar kamar tetap ada.`, confirmLabel: "Kosongkan", danger: true })) void run(send(praWamStayApi.clear, "POST"));
      }}><BedDouble size={18} aria-hidden /> Kosongkan semua penghuni</Button>
    </div>}
  </div>;
}

/** Name, kind and capacity of one room, behind a small "Ubah" disclosure. */
function RoomEdit({ room, busy, onSave }: { room: StayRoom; busy: boolean; onSave: (change: { name: string; kind: string; capacity: number }) => Promise<boolean> }) {
  const [name, setName] = useState(room.name);
  const [kind, setKind] = useState(room.kind);
  const [capacity, setCapacity] = useState(String(room.capacity));
  const id = `room-${room.id}`;
  return <details className={styles.edit}>
    <summary>Ubah kamar</summary>
    <div className={styles.editBody}>
      <label htmlFor={`${id}-name`}>Nomor/nama</label>
      <input id={`${id}-name`} className="input" value={name} maxLength={40} onChange={event => setName(event.target.value)} />
      <label htmlFor={`${id}-kind`}>Jenis</label>
      <input id={`${id}-kind`} className="input" value={kind} maxLength={40} onChange={event => setKind(event.target.value)} placeholder="Twin bed" />
      <label htmlFor={`${id}-capacity`}>Kapasitas</label>
      <input id={`${id}-capacity`} className="input" type="number" inputMode="numeric" min={1} max={8} value={capacity} onChange={event => setCapacity(event.target.value)} />
      <Button type="button" variant="secondary" disabled={busy || !name.trim()} onClick={() => void onSave({ name: name.trim(), kind: kind.trim(), capacity: Number(capacity) })}>Simpan</Button>
    </div>
  </details>;
}
