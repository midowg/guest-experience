"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Armchair, ChevronRight, MapPin, Minus, Pencil, Plus, X } from "lucide-react";
import { Notice } from "@/components/ui";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { Card, CardGrid, ConsoleButton, Pill, SectionToolbar, SegmentedControl, type ConsoleTone } from "@/components/console";
import { FloorPlan } from "@/components/pra-wam/FloorPlan";
import type { Room } from "@/lib/pra-wam/appraisal";
import { FACILITY_LIMITS, facilitiesProblem, parseFacilities, placeRooms, planKey, planSpotOptions, spotTitle, type PlanStatus } from "@/lib/pra-wam/floor-plan";
import { praWamRoomsApi, praWamRoomsCreateApi, praWamSettingsApi } from "@/lib/routes";
import type { AppSettings } from "@/lib/server/pra-wam/rooms";
import { roomGroup, roomGroupLabels, type RoomGroup } from "@/lib/pra-wam/room-group";
import base from "@/components/pra-wam/pra-wam.module.css";
import css from "./pra-wam-rooms.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
/** The spot clicked on the plan (null: opened from a card or the list) and the room being edited ("" = none). */
type Editing = { spot: string | null; roomId: string };
/** What a save sends for one room; the server checks it again. */
type RoomBody = { name?: string; capacity: number | null; minPeople: number | null; bookable: boolean; planKey: string | null; facilities: string[]; departments?: string[]; replace?: boolean };

/** The page's two tabs (?tab=denah). */
export type RoomsView = "daftar" | "denah";

const MIGRATION = "202611040009_pra_wam_room_plan.sql";
/** A spot's name: the room it is for ("Vasuki"), else "Ruang N" from the plan. */
const spotLabel = (key: string | null) => key ? spotTitle(key) : "Tanpa spot";
/** The spot a room takes by its name alone, without a picked one. */
const nameSpot = (room: Room) => planKey({ name: room.name, slug: room.slug });

export { roomGroup, roomGroupLabels, SMALL_ROOM_MAX, type RoomGroup } from "@/lib/pra-wam/room-group";
const groupPill: Record<RoomGroup, { tone: ConsoleTone; label: string }> = {
  utama: { tone: "blue", label: "Utama" }, kecil: { tone: "purple", label: "Kecil" }, area: { tone: "neutral", label: "Area" },
};

/** "Maks 8 orang", "Maks 4 · min 1", or (empty) "Kapasitas belum diisi". */
export function capacityLine(room: Pick<Room, "capacity" | "minPeople">): { text: string; empty: boolean } {
  const { capacity, minPeople } = room;
  if (capacity) return { text: minPeople ? `Maks ${capacity} · min ${minPeople}` : `Maks ${capacity} orang`, empty: false };
  return { text: minPeople ? `Kapasitas belum diisi · min ${minPeople}` : "Kapasitas belum diisi", empty: true };
}

/** "Maks 8 · TV, Whiteboard": a room's line in the plan's side list. */
function listLine(room: Room, placed: boolean): string {
  const people = room.capacity ? `Maks ${room.capacity}` : "Kapasitas belum diisi";
  const facilities = room.facilities ?? [];
  const shown = facilities.length ? ` · ${facilities.slice(0, 2).join(", ")}${facilities.length > 2 ? ` +${facilities.length - 2}` : ""}` : "";
  return `${people}${shown}${placed ? "" : " · tanpa spot"}`;
}

/**
 * Admin WAM → Ruang dan denah. Daftar ruang: every room as a card (capacity, kind, facilities,
 * its spot, and a switch for "Bisa dibooking"); Ubah opens the full editor in a dialog. Denah:
 * the office plan, where clicking a spot opens its room, beside a panel with the rooms per kind,
 * the selected room's editor (capacity stepper, fewest people, facilities, spot, bookable) and
 * whether Book shows the plan at all. Before migration 202611040009 only capacity, facilities and
 * bookable can be saved.
 */
export function PraWamRooms({ initialRooms, initialSettings, roomsReady, view = "daftar", departments = [] }: { initialRooms: Room[]; initialSettings: AppSettings; roomsReady: boolean; view?: RoomsView; departments?: string[] }) {
  const [rooms, setRooms] = useState(initialRooms);
  const [settings, setSettings] = useState(initialSettings);
  const [planBusy, setPlanBusy] = useState(false);
  const [planMessage, setPlanMessage] = useState<Message>(null);
  const [message, setMessage] = useState<Message>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saves, setSaves] = useState(0);
  const [switching, setSwitching] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<RoomGroup>("utama");
  // Tambah ruang (10 Nov 2026): admins add rooms themselves; the new room's editor opens next.
  const [adding, setAdding] = useState(false);
  function added(next: Room[], id: string, text: string) {
    setAdding(false); saved(next, text); setEditing({ spot: null, roomId: id });
  }
  const planReady = settings.migrated;
  const { placed } = placeRooms(rooms);
  const spotOf = (room: Room) => placed.find(item => item.room.id === room.id)?.key ?? null;
  const roomOn = (key: string) => placed.find(item => item.key === key)?.room ?? null;
  const sorted = [...rooms].sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" }));

  async function togglePlan(on: boolean) {
    if (planBusy) return;
    setPlanBusy(true); setPlanMessage(null);
    try {
      const result = await adminRequest<AppSettings>(praWamSettingsApi, { method: "PUT", body: JSON.stringify({ floorPlan: on }) });
      if (result.data) setSettings(result.data);
      setPlanMessage({ tone: "success", text: result.message });
    } catch (error) { setPlanMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setPlanBusy(false); }
  }

  /** The card's switch: only "Bisa dibooking" changes; the rest is sent as it is. */
  async function setBookable(room: Room, on: boolean) {
    if (switching) return;
    setSwitching(room.id); setMessage(null);
    try {
      const body: RoomBody = { capacity: room.capacity, minPeople: planReady ? room.minPeople : null, bookable: on, planKey: planReady ? room.planKey : null, facilities: room.facilities ?? [] };
      const result = await adminRequest<Room[]>(praWamRoomsApi(room.id), { method: "PATCH", body: JSON.stringify(body) });
      if (result.data) saved(result.data, `${room.name} ${on ? "bisa dibooking" : "tidak dibooking lagi"}.`);
    } catch (error) { setMessage({ tone: "error", text: `${room.name}: ${errorMessage(error)}` }); }
    finally { setSwitching(null); }
  }

  const pickSpot = (key: string) => {
    setMessage(null);
    const room = roomOn(key);
    if (room) setGroup(roomGroup(room));
    setEditing({ spot: key, roomId: room?.id ?? "" });
  };
  const editRoom = (room: Room) => { setMessage(null); setEditing({ spot: spotOf(room), roomId: room.id }); };
  function saved(next: Room[], text: string) {
    setRooms(next); setMessage({ tone: "success", text }); setSaves(count => count + 1);
  }

  if (!roomsReady) return <Notice tone="warning">Ruang menunggu migrasi 202611040001_pra_wam_appraisal.sql.</Notice>;
  // The plan's subtitle is each room's specification; the status is its colour and read-out.
  const statusOf = (room: Room): PlanStatus => room.bookable ? { tone: "free", text: "Bisa dibooking" } : { tone: "off", text: "Tidak dibooking" };
  const editRoomNow = editing?.roomId ? rooms.find(room => room.id === editing.roomId) ?? null : null;
  const waiting = !planReady && <Notice tone="warning">Denah, minimal orang, dan pilihan spot menunggu migrasi {MIGRATION}. Sampai saat itu denah tetap tampil di Book, ruang ditaruh di denah menurut namanya, dan hanya kapasitas, fasilitas, serta &ldquo;Bisa dibooking&rdquo; yang bisa disimpan.</Notice>;
  const notice = <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>;
  const editor = editing && <RoomEditor key={`${editing.spot}-${editing.roomId}-${saves}`} spot={editing.spot} room={editRoomNow} current={editing.spot ? roomOn(editing.spot) : null}
    rooms={sorted} spotOf={spotOf} roomOn={roomOn} planReady={planReady} departments={departments}
    onChooseRoom={roomId => setEditing({ spot: editing.spot, roomId })} onSaved={saved} onClose={() => setEditing(null)} />;

  if (view === "daftar") {
    const search = query.trim().toLowerCase();
    const shown = sorted.filter(room => !search || room.name.toLowerCase().includes(search) || (room.facilities ?? []).some(tag => tag.toLowerCase().includes(search)));
    return <div className="stack">
      {waiting}
      <SectionToolbar title={`${rooms.length} ruang`} count={`${rooms.filter(room => room.bookable).length} bisa dibooking`}
        search={{ label: "Cari ruang atau fasilitas", placeholder: "Cari ruang", value: query, onChange: setQuery }} />
      <div className={css.actions}><ConsoleButton variant="primary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => { setMessage(null); setAdding(true); }}>Tambah ruang</ConsoleButton></div>
      {notice}
      {shown.length
        ? <CardGrid label="Ruang">{shown.map(room => {
          const spot = spotOf(room);
          return <RoomCard key={room.id} room={room} spot={spot} byName={!!spot && room.planKey !== spot} busy={switching === room.id}
            disabled={!!switching} onBookable={on => void setBookable(room, on)} onEdit={() => editRoom(room)} />;
        })}</CardGrid>
        : <p className={css.note}>{rooms.length ? "Tidak ada ruang yang cocok dengan pencarian." : "Belum ada ruang."}</p>}
      <RoomDialog open={!!editing} title={editRoomNow?.name ?? "Ruang"} onClose={() => setEditing(null)}>{editor}</RoomDialog>
      <RoomDialog open={adding} title="Tambah ruang" onClose={() => setAdding(false)}><AddRoom onAdded={added} onClose={() => setAdding(false)} /></RoomDialog>
    </div>;
  }

  const inGroup = sorted.filter(room => roomGroup(room) === group);
  return <div className="stack">
    {waiting}
    <div className={css.layout}>
      <div className={`${base.app} ${css.planBox}`}>
        <FloorPlan rooms={rooms} statusOf={statusOf} label="Denah kantor: ruang WAM di setiap spot"
          onPickSpot={pickSpot} selectedSpot={editing?.spot ?? undefined} emptySpot={{ tone: "closed", text: "Spot kosong" }}
          legend={["free", "off", "closed", "selected"]} legendLabels={{ free: "Bisa dibooking", closed: "Spot kosong" }}
          showUnplaced={false} caption="Klik spot untuk mengatur ruangnya. Perbesar dengan tombol di pojok, ctrl + scroll, atau klik dua kali." />
      </div>

      <div className={css.side}>
        <div className={css.actions}><ConsoleButton icon={<Plus size={18} aria-hidden="true" />} onClick={() => { setMessage(null); setAdding(true); }}>Tambah ruang</ConsoleButton></div>
        <SegmentedControl label="Jenis ruang" value={group} onChange={setGroup}
          options={(Object.keys(roomGroupLabels) as RoomGroup[]).map(key => ({ value: key, label: roomGroupLabels[key] }))} />
        {inGroup.length
          ? <ul className={css.roomList} aria-label={roomGroupLabels[group]}>{inGroup.map(room => {
            const selected = editing?.roomId === room.id;
            return <li key={room.id}>
              <button type="button" className={css.roomRow} aria-pressed={selected} onClick={() => editRoom(room)}>
                <span className={css.roomRowIcon} aria-hidden="true"><Armchair size={18} /></span>
                <span className={css.roomRowText}><span>{room.name}</span><span>{listLine(room, !!spotOf(room))}</span></span>
                <ChevronRight size={18} aria-hidden="true" className={css.roomRowChevron} />
              </button>
            </li>;
          })}</ul>
          : <p className={css.note}>Belum ada {roomGroupLabels[group].toLowerCase()}.</p>}
        {notice}
        {editor
          ? <Card title={editing?.spot ? `Spot ${spotLabel(editing.spot)}` : editRoomNow?.name ?? "Ruang"} headingLevel={3}>{editor}</Card>
          : <p className={css.note}>Pilih spot di denah atau ruang di daftar untuk mengaturnya.</p>}
        <RoomDialog open={adding} title="Tambah ruang" onClose={() => setAdding(false)}><AddRoom onAdded={added} onClose={() => setAdding(false)} /></RoomDialog>
        {planReady && <Card title="Denah di Book" headingLevel={3}>
          <Switch label="Tampilkan denah di Book" checked={settings.floorPlan} disabled={planBusy} onChange={on => void togglePlan(on)} />
          <p className={css.note}>{planBusy ? "Menyimpan…" : settings.floorPlan ? "Peserta bisa memilih Kalender atau Denah di Book, dan memilih ruang dari denah di form booking." : "Book hanya menampilkan kalender. Form booking memakai daftar ruang."}</p>
          {planMessage && <Notice tone={planMessage.tone}>{planMessage.text}</Notice>}
        </Card>}
      </div>
    </div>
  </div>;
}

/** One room as a card: pin, name, capacity, kind, facilities, then its spot and the bookable switch. */
function RoomCard({ room, spot, byName, busy, disabled, onBookable, onEdit }: {
  room: Room; spot: string | null; byName: boolean; busy: boolean; disabled: boolean; onBookable: (on: boolean) => void; onEdit: () => void;
}) {
  const capacity = capacityLine(room);
  const kind = groupPill[roomGroup(room)];
  return <article className={css.roomCard} aria-label={room.name}>
    <div className={css.roomTop}>
      <span className={css.pin} aria-hidden="true"><MapPin size={20} /></span>
      <ConsoleButton className={css.editButton} onClick={onEdit} aria-label={`Ubah ${room.name}`} icon={<Pencil size={16} aria-hidden="true" />}>Ubah</ConsoleButton>
    </div>
    <div className={css.roomHead}>
      <h3 className={css.roomName}>{room.name}</h3>
      <p className={capacity.empty ? css.capacityEmpty : css.capacity}>{capacity.text}</p>
    </div>
    <ul className={css.pills} aria-label={`Jenis dan fasilitas ${room.name}`}>
      <li><Pill tone={kind.tone}>{kind.label}</Pill></li>
      {(room.facilities ?? []).map(tag => <li key={tag}><Pill>{tag}</Pill></li>)}
    </ul>
    <div className={css.roomFoot}>
      <span className={css.spotLine}>Spot denah: <strong>{spotLabel(spot)}</strong>{byName && <small> (dari nama ruang)</small>}</span>
      <Switch label="Bisa dibooking" name={`${room.name} bisa dibooking`} checked={room.bookable} disabled={disabled} busy={busy} onChange={onBookable} />
    </div>
  </article>;
}

/** A checkbox drawn as a switch; `name` is its name for screen readers when the visible label is shared. */
function Switch({ label, name, checked, disabled, busy, onChange }: { label: string; name?: string; checked: boolean; disabled?: boolean; busy?: boolean; onChange: (on: boolean) => void }) {
  return <label className={css.switch}>
    <input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-label={name} aria-busy={busy || undefined} onChange={event => onChange(event.target.checked)} />
    <span className={css.switchTrack} aria-hidden="true" />
    <span>{busy ? "Menyimpan…" : label}</span>
  </label>;
}

/** The editor over the cards, as a modal dialog; Esc or Tutup closes it. */
function RoomDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={css.dialog} aria-labelledby={id} onClose={onClose}>
    <div className={css.dialogHead}>
      <h2 id={id} className={css.dialogTitle}>{title}</h2>
      <button type="button" className={css.dialogClose} aria-label="Tutup" onClick={onClose}><X size={20} aria-hidden="true" /></button>
    </div>
    {open && children}
  </dialog>;
}

type EditorProps = {
  spot: string | null; room: Room | null; current: Room | null; rooms: Room[]; planReady: boolean;
  /** The departments of Data karyawan, for "Khusus departemen". */
  departments: string[];
  spotOf: (room: Room) => string | null; roomOn: (key: string) => Room | null;
  onChooseRoom: (roomId: string) => void; onSaved: (rooms: Room[], text: string) => void; onClose: () => void;
};

/** One room's settings, opened from a spot (which room sits there), a card or the list. */
function RoomEditor({ spot, room, current, rooms, planReady, departments, spotOf, roomOn, onChooseRoom, onSaved, onClose }: EditorProps) {
  const id = useId();
  const [name, setName] = useState(room?.name ?? "");
  const [capacity, setCapacity] = useState(room?.capacity?.toString() ?? "");
  const [minPeople, setMinPeople] = useState(room?.minPeople?.toString() ?? "");
  const [bookable, setBookable] = useState(room?.bookable ?? true);
  const [facilities, setFacilities] = useState((room?.facilities ?? []).join(", "));
  const [target, setTarget] = useState<string>((room && (spot ?? spotOf(room))) ?? "");
  const [kept, setKept] = useState<string[]>(room?.departments ?? []);
  const keptOptions = [...new Set([...departments, ...kept])].sort((a, b) => a.localeCompare(b, "id"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; fields?: Record<string, string[]> } | null>(null);
  const number = (value: string) => value.trim() ? Number(value) : null;
  const holder = target ? roomOn(target) : null;
  const takesFrom = holder && room && holder.id !== room.id ? holder : null;
  const fieldError = (name: string) => error?.fields?.[name]?.[0];
  const min = number(minPeople), cap = number(capacity);
  const order = min != null && cap != null && min > cap ? `Minimal tidak boleh lebih dari kapasitas (${cap}).` : null;
  const tags = parseFacilities(facilities);
  const tagsProblem = facilitiesProblem(tags);
  // The server names a bad tag by its place ("facilities.2").
  const tagsError = tagsProblem ?? fieldError("facilities") ?? Object.entries(error?.fields ?? {}).find(([name]) => name.startsWith("facilities."))?.[1][0];
  const step = (by: number) => setCapacity(String(Math.min(999, Math.max(1, (cap ?? 0) + by))));

  async function send(which: Room, body: RoomBody, text: string) {
    setBusy(true); setError(null);
    try {
      const result = await adminRequest<Room[]>(praWamRoomsApi(which.id), { method: "PATCH", body: JSON.stringify(body) });
      if (result.data) onSaved(result.data, text);
    } catch (problem) { setError({ text: errorMessage(problem), fields: problem instanceof AdminApiError ? problem.fieldErrors : undefined }); }
    finally { setBusy(false); }
  }
  const cleanName = name.replace(/\s+/g, " ").trim();
  const nameProblem = cleanName.length < 2 ? "Isi nama ruang, minimal 2 karakter." : null;
  function save() {
    if (!room || order || tagsProblem || nameProblem) return;
    void send(room, {
      name: cleanName, capacity: cap, minPeople: planReady ? min : null, bookable, facilities: tags, departments: kept,
      planKey: planReady ? target || null : null, replace: !!takesFrom?.planKey,
    }, `${cleanName} disimpan${planReady ? `, ${target ? `di spot ${spotLabel(target)}` : "tanpa spot"}` : ""}${kept.length ? `, khusus ${kept.join(", ")}` : ""}.`);
  }
  /** Takes the room off this spot, keeping its other settings. */
  function release() {
    if (!current || !spot) return;
    void send(current, { capacity: current.capacity, minPeople: current.minPeople, bookable: current.bookable, planKey: null, facilities: current.facilities ?? [] }, `${current.name} dilepas dari spot ${spotLabel(spot)}.`);
  }

  const byName = (which: Room) => !!spot && which.planKey !== spot && nameSpot(which) === spot;
  // Where the chosen room is now, said under the select rather than in its options.
  const at = room ? spotOf(room) : null;
  const roomHint = !room ? "Pilih ruang untuk spot ini."
    : at === spot ? `${room.name} ada di spot ini.`
    : at ? `${room.name} sekarang di spot ${spotLabel(at)}. Simpan untuk memindahkannya ke sini.`
    : `${room.name} belum punya spot. Simpan untuk menaruhnya di sini.`;
  const targetOn = target ? roomOn(target) : null;
  return <div className={css.editor}>
    {/* A spot that holds a room edits that room (its name below); only an empty spot asks which room goes there. */}
    {spot && !current && <div className="field">
      <label htmlFor={`${id}-ruang`}>Taruh ruang di spot ini</label>
      <select id={`${id}-ruang`} className="select" value={room?.id ?? ""} disabled={busy || !planReady} onChange={event => onChooseRoom(event.target.value)}
        aria-describedby={`${id}-ruang-hint`}>
        <option value="">Tidak ada ruang WAM</option>
        {planReady && rooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <p id={`${id}-ruang-hint`} className="field-hint">{planReady ? roomHint : `Memindah ruang ke spot lain menunggu migrasi ${MIGRATION}.`}</p>
    </div>}

    {!room ? <>
      {current ? (byName(current)
        ? <p className={css.note}>{current.name} ada di spot ini karena namanya cocok. Untuk melepasnya, taruh ruang lain di spot ini atau pindahkan {current.name} ke spot lain.</p>
        : <div className={css.actions}>
            <ConsoleButton disabled={busy || !planReady} onClick={release}>{busy ? "Melepas…" : `Lepas ${current.name} dari spot ini`}</ConsoleButton>
          </div>)
        : <p className={css.note}>Spot ini belum dipakai ruang WAM. Pilih ruang di atas untuk menaruhnya di sini.</p>}
      <div className={css.actions}><ConsoleButton disabled={busy} onClick={onClose}>Tutup</ConsoleButton></div>
    </> : <>
      <div className="field">
        <label htmlFor={`${id}-nama`}>Nama ruang</label>
        <input id={`${id}-nama`} className="input" value={name} maxLength={60} disabled={busy}
          aria-invalid={!!(nameProblem || fieldError("name"))} aria-describedby={`${id}-nama-hint`} onChange={event => setName(event.target.value)} />
        <p id={`${id}-nama-hint`} className={nameProblem || fieldError("name") ? "field-error" : "field-hint"}>
          {nameProblem ?? fieldError("name") ?? `${roomGroupLabels[roomGroup(room)]}. Booking yang sudah ada ikut memakai nama baru.`}
        </p>
      </div>
      <div className={css.fields}>
        <div className="field">
          <label htmlFor={`${id}-kapasitas`}>Kapasitas (maks orang)</label>
          <div className={css.stepper}>
            <button type="button" className={css.stepButton} aria-label="Kurangi kapasitas" disabled={busy || cap == null || cap <= 1} onClick={() => step(-1)}><Minus size={18} aria-hidden="true" /></button>
            <input id={`${id}-kapasitas`} className={`input ${css.stepInput}`} inputMode="numeric" placeholder="Kosong" value={capacity} disabled={busy}
              aria-invalid={!!fieldError("capacity")} aria-describedby={fieldError("capacity") ? `${id}-kapasitas-error` : undefined}
              onChange={event => setCapacity(event.target.value.replace(/\D/g, "").slice(0, 3))} />
            <button type="button" className={css.stepButton} aria-label="Tambah kapasitas" disabled={busy || (cap ?? 0) >= 999} onClick={() => step(1)}><Plus size={18} aria-hidden="true" /></button>
          </div>
          {fieldError("capacity") && <p id={`${id}-kapasitas-error`} className="field-error">{fieldError("capacity")}</p>}
        </div>
        <div className="field">
          <label htmlFor={`${id}-minimal`}>Minimal orang</label>
          <input id={`${id}-minimal`} className="input" inputMode="numeric" placeholder="Kosong" value={minPeople} disabled={busy || !planReady}
            aria-invalid={!!(order || fieldError("minPeople"))} aria-describedby={`${id}-minimal-hint`}
            onChange={event => setMinPeople(event.target.value.replace(/\D/g, "").slice(0, 3))} />
          <p id={`${id}-minimal-hint`} className={order || fieldError("minPeople") ? "field-error" : "field-hint"}>
            {order ?? fieldError("minPeople") ?? (planReady ? "Isi 4 supaya ruang ini tidak dipakai one-on-one. Kosongkan bila tanpa batas." : `Menunggu migrasi ${MIGRATION}.`)}
          </p>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-fasilitas`}>Fasilitas</label>
        <input id={`${id}-fasilitas`} className="input" placeholder="TV, Whiteboard, AC" value={facilities} disabled={busy} maxLength={300}
          aria-invalid={!!tagsError} aria-describedby={`${id}-fasilitas-hint`} onChange={event => setFacilities(event.target.value)} />
        {tags.length > 0 && <ul className={css.pills} aria-label="Fasilitas">{tags.map(tag => <li key={tag}><Pill>{tag}</Pill></li>)}</ul>}
        <p id={`${id}-fasilitas-hint`} className={tagsError ? "field-error" : "field-hint"}>
          {tagsError ?? `Pisahkan dengan koma, paling banyak ${FACILITY_LIMITS.count}. Tampil di bawah nama ruang pada denah.`}
        </p>
      </div>
      <Switch label="Bisa dibooking" checked={bookable} disabled={busy} onChange={setBookable} />
      <fieldset className={`field ${css.kept}`} disabled={busy} aria-describedby={`${id}-khusus-hint`}>
        <legend>Khusus departemen</legend>
        <div className={css.keptList}>{keptOptions.map(name => <label key={name} className={css.keptItem}>
          <input type="checkbox" checked={kept.includes(name)} onChange={event => setKept(event.target.checked ? [...kept, name] : kept.filter(item => item !== name))} />
          <span>{name}</span>
        </label>)}</div>
        <p id={`${id}-khusus-hint`} className={fieldError("departments") ? "field-error" : "field-hint"}>
          {fieldError("departments") ?? (kept.length ? `Hanya ${kept.join(", ")} yang bisa booking ruang ini; orang lain melihatnya tidak bisa dipilih.` : "Tanpa centang: semua departemen bisa booking ruang ini.")}
        </p>
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-spot`}>Spot di denah</label>
        <select id={`${id}-spot`} className="select" value={target} disabled={busy || !planReady} onChange={event => setTarget(event.target.value)}
          aria-describedby={`${id}-spot-hint`}>
          <option value="">Tanpa spot (tidak tampil di denah)</option>
          {planSpotOptions().map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
        <p id={`${id}-spot-hint`} className={fieldError("planKey") ? "field-error" : "field-hint"}>
          {fieldError("planKey")
            ?? (!planReady ? `Menunggu migrasi ${MIGRATION}. Sekarang ruang ditaruh di denah menurut namanya.`
              : takesFrom ? `Spot ini dipakai ${takesFrom.name}. Kalau disimpan, ${takesFrom.name} dilepas dari spot ini dan jadi ruang tanpa spot.`
              : target && targetOn?.id === room.id ? "Spot ruang ini sekarang. Satu spot untuk satu ruang."
              : target ? "Spot ini kosong. Satu spot untuk satu ruang."
              : !target && nameSpot(room) ? `Namanya cocok dengan spot ${spotLabel(nameSpot(room))}, jadi tetap tampil di sana selama spot itu tidak dipakai ruang lain.`
              : "Satu spot untuk satu ruang.")}
        </p>
      </div>
      <div className={css.actions}>
        <ConsoleButton variant="primary" disabled={busy || !!order || !!tagsProblem || !!nameProblem} onClick={save}>{busy ? "Menyimpan…" : "Simpan"}</ConsoleButton>
        <ConsoleButton disabled={busy} onClick={onClose}>Tutup</ConsoleButton>
      </div>
    </>}
    {error && <div role="alert" className="field-error">{error.text}</div>}
  </div>;
}

/**
 * Tambah ruang (10 Nov 2026): a name and a kind; the room starts not bookable and its editor opens
 * right after for capacity, spot, departments and the rest.
 */
function AddRoom({ onAdded, onClose }: { onAdded: (rooms: Room[], id: string, text: string) => void; onClose: () => void }) {
  const id = useId();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"utama" | "area">("utama");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function add() {
    if (name.trim().length < 2) { setError("Isi nama ruang, minimal 2 karakter."); return; }
    setBusy(true); setError(null);
    try {
      const result = await adminRequest<{ id: string; rooms: Room[] }>(praWamRoomsCreateApi, { method: "POST", body: JSON.stringify({ name: name.trim(), kind }) });
      if (result.data) onAdded(result.data.rooms, result.data.id, result.message);
    } catch (problem) { setError(errorMessage(problem)); }
    finally { setBusy(false); }
  }
  return <form className={css.editor} noValidate onSubmit={event => { event.preventDefault(); void add(); }}>
    <div className="field">
      <label htmlFor={`${id}-nama`}>Nama ruang</label>
      <input id={`${id}-nama`} className="input" value={name} maxLength={60} placeholder="Mis. Ruang 4" disabled={busy} autoFocus
        aria-invalid={!!error} aria-describedby={`${id}-nama-hint`} onChange={event => setName(event.target.value)} />
      <p id={`${id}-nama-hint`} className={error ? "field-error" : "field-hint"}>{error ?? "Nama yang dilihat orang saat booking dan di denah."}</p>
    </div>
    <div className="field">
      <label htmlFor={`${id}-jenis`}>Jenis</label>
      <select id={`${id}-jenis`} className="select" value={kind} disabled={busy} onChange={event => setKind(event.target.value as "utama" | "area")}>
        <option value="utama">Ruang meeting</option>
        <option value="area">Area terbuka</option>
      </select>
    </div>
    <p className={css.note}>Setelah ditambahkan, atur kapasitas, spot di denah, dan departemen yang boleh memakainya, lalu nyalakan Bisa dibooking.</p>
    <div className={css.actions}>
      <ConsoleButton variant="primary" type="submit" disabled={busy}>{busy ? "Menambahkan…" : "Tambah ruang"}</ConsoleButton>
      <ConsoleButton disabled={busy} onClick={onClose}>Batal</ConsoleButton>
    </div>
  </form>;
}
