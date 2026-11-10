"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, DoorOpen, Pencil, Plus, Users, X } from "lucide-react";
import { errorText, praWamRequest } from "@/components/pra-wam/api";
import type { Room } from "@/lib/pra-wam/appraisal";
import { bookingApi } from "@/lib/routes";
import { facilityIcon } from "./icons";
import css from "./booking.module.css";

type Draft = { name: string; capacity: string; bookable: boolean; facilities: string; departments: string };
const toDraft = (room: Room): Draft => ({ name: room.name, capacity: room.capacity?.toString() ?? "", bookable: room.bookable, facilities: room.facilities.join(", "), departments: (room.departments ?? []).join(", ") });
const list = (text: string) => [...new Set(text.split(",").map(item => item.trim()).filter(Boolean))];

/**
 * Kelola → Ruangan: every room (the same list as Admin WAM → Ruang dan denah), each with its
 * capacity, facilities, departments and whether it can be booked; one opens to change, and a new
 * one is added by name. Floor plan spots stay in Admin WAM.
 */
export function RoomsAdmin({ rooms, departments }: { rooms: Room[]; departments: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState({ name: "", capacity: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const capacity = (text: string) => (text.trim() ? Number(text) : null);

  async function run(work: () => Promise<{ message: string }>, after?: () => void) {
    setBusy(true); setResult(null);
    try { const { message } = await work(); setResult({ ok: true, text: message }); after?.(); router.refresh(); }
    catch (error) { setResult({ ok: false, text: errorText(error) }); }
    finally { setBusy(false); }
  }

  return <>
    {result && <p className={result.ok ? css.noteOk : css.noteBad} role={result.ok ? "status" : "alert"}>{result.ok ? <CheckCircle2 size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}{result.text}</p>}

    <form className={css.addRow} onSubmit={event => { event.preventDefault(); void run(() => praWamRequest(bookingApi.rooms(), { method: "POST", json: { name: adding.name, capacity: capacity(adding.capacity) } }), () => setAdding({ name: "", capacity: "" })); }}>
      <div className={css.field}><label className={css.label} htmlFor="room-new">Ruangan baru</label>
        <input id="room-new" className={css.control} required minLength={2} maxLength={60} placeholder="Contoh: Ruang 4" value={adding.name} onChange={event => setAdding({ ...adding, name: event.target.value })} /></div>
      <div className={css.field}><label className={css.label} htmlFor="room-new-cap">Kapasitas</label>
        <input id="room-new-cap" className={css.control} type="number" min={1} max={500} inputMode="numeric" placeholder="orang" value={adding.capacity} onChange={event => setAdding({ ...adding, capacity: event.target.value })} /></div>
      <button type="submit" className={css.btn} disabled={busy}><Plus size={18} aria-hidden />Tambah</button>
    </form>

    <datalist id="room-departments">{departments.map(name => <option key={name} value={name} />)}</datalist>
    <ul className={css.list}>{rooms.map(room => <li key={room.id} className={room.bookable ? css.adminRoom : css.adminRoomOff}>
      {open === room.id && draft ? <form className={css.roomForm} onSubmit={event => {
        event.preventDefault();
        void run(() => praWamRequest(bookingApi.rooms(room.id), { method: "PATCH", json: { name: draft.name, capacity: capacity(draft.capacity), bookable: draft.bookable, facilities: list(draft.facilities), departments: list(draft.departments) } }), () => setOpen(null));
      }}>
        <div className={css.cols}>
          <div className={css.field}><label className={css.label} htmlFor={`name-${room.id}`}>Nama</label>
            <input id={`name-${room.id}`} className={css.control} required minLength={2} maxLength={60} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></div>
          <div className={css.field}><label className={css.label} htmlFor={`cap-${room.id}`}>Kapasitas (orang)</label>
            <input id={`cap-${room.id}`} className={css.control} type="number" min={1} max={500} inputMode="numeric" value={draft.capacity} onChange={event => setDraft({ ...draft, capacity: event.target.value })} /></div>
        </div>
        <div className={css.field}><label className={css.label} htmlFor={`fac-${room.id}`}>Fasilitas</label>
          <input id={`fac-${room.id}`} className={css.control} placeholder="TV, Whiteboard, Zoom" value={draft.facilities} onChange={event => setDraft({ ...draft, facilities: event.target.value })} />
          <p className={css.hint}>Pisahkan dengan koma.</p></div>
        <div className={css.field}><label className={css.label} htmlFor={`dep-${room.id}`}>Khusus departemen</label>
          <input id={`dep-${room.id}`} className={css.control} list="room-departments" placeholder="Kosongkan bila untuk semua" value={draft.departments} onChange={event => setDraft({ ...draft, departments: event.target.value })} />
          <p className={css.hint}>Nama departemen seperti di Data karyawan, pisahkan dengan koma.</p></div>
        <label className={css.person}><input type="checkbox" checked={draft.bookable} onChange={event => setDraft({ ...draft, bookable: event.target.checked })} />Bisa dibooking</label>
        <div className={css.itemActs}>
          <button type="button" className={css.btnQuiet} disabled={busy} onClick={() => setOpen(null)}><X size={16} aria-hidden />Batal</button>
          <button type="submit" className={css.btn} disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </form> : <>
        <span className={css.roomIcon}><DoorOpen size={22} aria-hidden /></span>
        <div className={css.itemMain}>
          <h3>{room.name}</h3>
          <ul className={css.facts}>
            <li><Users size={16} aria-hidden />{room.capacity != null ? `Muat ${room.capacity} orang` : "Kapasitas belum diisi"}</li>
            {room.facilities.map(name => <li key={name}>{facilityIcon(name)}{name}</li>)}
          </ul>
          <div className={css.itemTags}>
            {room.bookable ? <span className={css.chipFree}>Bisa dibooking</span> : <span className={css.chipTaken}>Tidak bisa dibooking</span>}
            {(room.departments ?? []).length > 0 && <span className={css.chipWarn}>Khusus {(room.departments ?? []).join(", ")}</span>}
          </div>
        </div>
        <button type="button" className={css.btnQuiet} onClick={() => { setOpen(room.id); setDraft(toDraft(room)); setResult(null); }}><Pencil size={16} aria-hidden />Ubah</button>
      </>}
    </li>)}</ul>
  </>;
}
