"use client";

import { useMemo, useState } from "react";
import { BedDouble, Check } from "lucide-react";
import { ConsoleButton, ConsoleButtonLink, FilterChips, PageHeader, Pill, SearchField, type Crumb } from "@/components/console";
import { Notice } from "@/components/ui";
import { adminRequest } from "@/components/admin/shared/api";
import { fold } from "@/lib/main-wam/admin/tsv";
import type { AdminRoom, AdminRoomBoard } from "@/lib/server/main-wam/admin/rooms";
import { mainWamAdminApi } from "@/lib/routes";
import { ContentTabs, MessageLine, useRun, Waiting, type Message } from "./fields";
import css from "./isi.module.css";

type Filter = "semua" | "tanpa-lantai" | "kosong";
const day = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/**
 * Admin WAM → Main WAM → Kamar (agen E): the rooms and who shares each, read from HR's pairing
 * (Kuesioner → Kamar; any number of people up to the room's capacity), and what Main WAM adds:
 * the floor and a note, saved per room. Hotel, check-in and check-out are on Info acara.
 */
export function RoomsEditor({ board, eventEnd, stay, hrRoomsHref, infoHref, crumbs, title }: {
  board: AdminRoomBoard; eventEnd: string; stay: { hotel: string; checkIn: string; checkOut: string };
  hrRoomsHref: string; infoHref: string; crumbs: readonly Crumb[]; title: string;
}) {
  const [rooms, setRooms] = useState(board.rooms);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("semua");
  const [message, setMessage] = useState<Message>(null);
  const { busy, run } = useRun(setMessage);
  const people = rooms.reduce((sum, room) => sum + room.people.length, 0);
  const withFloor = rooms.filter(room => room.floor.trim()).length;
  const shown = useMemo(() => {
    const words = fold(query).split(" ").filter(Boolean);
    return rooms.filter(room => (filter === "semua" || (filter === "tanpa-lantai" ? !room.floor.trim() : !room.people.length))
      && words.every(word => fold(`${room.name} ${room.kind} ${room.floor} ${room.people.map(person => person.fullName).join(" ")}`).includes(word)));
  }, [rooms, query, filter]);
  const purgeSoon = board.form?.stayDeleteOn && board.form.stayDeleteOn <= eventEnd;
  const locked = !board.migrated || !board.form;

  return <div className={css.page}>
    <PageHeader crumbs={crumbs} title={title} subtitle="Pembagian kamar dari HR, ditambah lantai dan catatan untuk peserta."
      actions={<ConsoleButtonLink href={hrRoomsHref} icon={<BedDouble size={18} aria-hidden />}>Atur pembagian</ConsoleButtonLink>} />
    <ContentTabs current="kamar" />
    {!board.migrated && <Waiting what="Lantai dan catatan kamar" />}
    {!board.stayReady && <Notice tone="warning">Pembagian kamar HR menunggu pembaruan sistem. Hubungi tim CoE.</Notice>}
    {purgeSoon && <Notice tone="warning">Pembagian kamar dihapus otomatis pada {day(board.form!.stayDeleteOn!)} (Kuesioner → Pengaturan), sebelum acara selesai. Ubah tanggalnya ke sesudah {day(eventEnd)} supaya peserta tetap melihat kamarnya.</Notice>}
    <MessageLine message={message} />

    <ul className={css.summary} aria-label="Ringkasan kamar">
      <li><strong>{rooms.length}</strong> kamar</li>
      <li><strong>{people}</strong> orang</li>
      <li><strong>{withFloor}</strong> berlantai</li>
      {board.form && <li>{board.form.published ? <Pill tone="ok">Terbit dari HR</Pill> : <Pill tone="neutral">Belum diterbitkan HR</Pill>}</li>}
    </ul>
    <p className={css.small}>{stay.hotel ? `${stay.hotel} · ` : ""}Check-in {stay.checkIn || "belum diisi"} · check-out {stay.checkOut || "belum diisi"}. <a href={infoHref}>Ubah di Info acara</a></p>

    {rooms.length ? <>
      <div className={css.toolbar}>
        <SearchField label="Cari kamar atau nama" placeholder="Cari kamar atau nama" value={query} onChange={setQuery} />
        <FilterChips<Filter> label="Saring kamar" value={filter} onChange={setFilter} chips={[
          { value: "semua", label: "Semua", count: rooms.length },
          { value: "tanpa-lantai", label: "Tanpa lantai", count: rooms.length - withFloor },
          { value: "kosong", label: "Kosong", count: rooms.filter(room => !room.people.length).length },
        ]} />
      </div>
      <ul className={css.rooms} aria-label="Daftar kamar">
        <li className={`${css.room} ${css.roomHead}`} aria-hidden><span>Kamar</span><span>Penghuni</span><span>Lantai</span><span>Catatan</span><span /></li>
        {shown.map(room => <RoomRow key={room.id} room={room} locked={locked} busy={busy === room.id}
          onSave={(floor, note) => run(room.id, async () => {
            const result = await adminRequest<{ id: string; floor: string; note: string }>(mainWamAdminApi.roomDetail(room.id), { method: "PUT", body: JSON.stringify({ floor, note }) });
            setRooms(current => current.map(item => (item.id === room.id ? { ...item, floor: result.data!.floor, note: result.data!.note } : item)));
            return `Kamar ${room.name} tersimpan.`;
          })} />)}
        {!shown.length && <li className={css.room}><span className={css.small}>Tidak ada kamar yang cocok.</span></li>}
      </ul>
    </> : <div className={css.empty}>
      <BedDouble size={24} aria-hidden />
      <h2>Belum ada pembagian kamar</h2>
      <p>HR mengisi kamar dan penghuninya di Kuesioner → Kamar. Lantai dan catatan diisi di sini sesudahnya.</p>
      <div className={css.emptyActions}><ConsoleButtonLink href={hrRoomsHref}>Buka Kuesioner → Kamar</ConsoleButtonLink></div>
    </div>}
  </div>;
}

function RoomRow({ room, locked, busy, onSave }: { room: AdminRoom; locked: boolean; busy: boolean; onSave: (floor: string, note: string) => Promise<boolean> }) {
  const [floor, setFloor] = useState(room.floor);
  const [note, setNote] = useState(room.note);
  const [saved, setSaved] = useState(false);
  const changed = floor.trim() !== room.floor || note.trim() !== room.note;
  const label = `kamar ${room.name}`;
  return <li className={css.room}>
    <div className={css.roomName}><strong>{room.name}</strong><span>{[room.kind, `${room.people.length} dari ${room.capacity}`].filter(Boolean).join(" · ")}</span></div>
    <p className={css.roomPeople}>
      <span className={css.roomRowLabel}>Penghuni</span>
      {room.people.length ? room.people.map(person => person.fullName).join(", ") : <span className={css.small}>Belum ada penghuni.</span>}
    </p>
    <label><span className={css.roomRowLabel}>Lantai</span>
      <input className="input" value={floor} maxLength={40} placeholder="Belum diisi" disabled={locked} aria-label={`Lantai ${label}`} onChange={event => { setFloor(event.target.value); setSaved(false); }} />
    </label>
    <label><span className={css.roomRowLabel}>Catatan</span>
      <input className="input" value={note} maxLength={200} placeholder="Boleh kosong" disabled={locked} aria-label={`Catatan ${label}`} onChange={event => { setNote(event.target.value); setSaved(false); }} />
    </label>
    <ConsoleButton variant={changed ? "primary" : "secondary"} disabled={locked || !changed || busy} aria-label={`Simpan ${label}`}
      icon={saved && !changed ? <Check size={16} aria-hidden /> : undefined}
      onClick={() => void onSave(floor.trim(), note.trim()).then(ok => setSaved(ok))}>{busy ? "Menyimpan…" : saved && !changed ? "Tersimpan" : "Simpan"}</ConsoleButton>
  </li>;
}
