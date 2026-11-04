"use client";

import { useId, useState } from "react";
import { Button, Notice } from "@/components/ui";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import { Check } from "@/components/admin/editor/controls";
import { FloorPlan } from "@/components/pra-wam/FloorPlan";
import type { Room } from "@/lib/pra-wam/appraisal";
import { PLAN_SPOTS, placeRooms, planKey, planSpotOptions, type PlanStatus } from "@/lib/pra-wam/floor-plan";
import { praWamRoomsApi, praWamSettingsApi } from "@/lib/routes";
import type { AppSettings } from "@/lib/server/pra-wam/rooms";
import base from "@/components/pra-wam/pra-wam.module.css";
import styles from "@/components/admin/admin.module.css";
import css from "./pra-wam-rooms.module.css";

type Message = { tone: "success" | "error"; text: string } | null;
/** The spot clicked on the plan (null: opened from the list or table) and the room being edited ("" = none). */
type Editing = { spot: string | null; roomId: string };

const MIGRATION = "202611040009_pra_wam_room_plan.sql";
const spotLabel = (key: string | null) => key ? PLAN_SPOTS[key]?.label ?? key : "Tanpa spot";
/** "Maks 8 · min 4", for the plan and the list. */
const peopleText = (room: Room) => room.capacity
  ? `Maks ${room.capacity}${room.minPeople ? ` · min ${room.minPeople}` : ""}`
  : room.minPeople ? `Min ${room.minPeople} · kapasitas kosong` : "Kapasitas kosong";
/** The spot a room takes by its name alone, without a picked one. */
const nameSpot = (room: Room) => planKey({ name: room.name, slug: room.slug });

/**
 * Super admin → WAM: the rooms and the office floor plan. Whether Book shows the plan at all; the
 * plan, where clicking a spot opens its room (which room sits there, capacity, fewest people,
 * bookable); the rooms without a spot; and every room in a table. Before migration 202611040009
 * only capacity and bookable can be saved.
 */
export function PraWamRooms({ initialRooms, initialSettings, roomsReady }: { initialRooms: Room[]; initialSettings: AppSettings; roomsReady: boolean }) {
  const [rooms, setRooms] = useState(initialRooms);
  const [settings, setSettings] = useState(initialSettings);
  const [busy, setBusy] = useState(false);
  const [planMessage, setPlanMessage] = useState<Message>(null);
  const [message, setMessage] = useState<Message>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saves, setSaves] = useState(0);
  const planReady = settings.migrated;
  const { placed, unplaced } = placeRooms(rooms);
  const spotOf = (room: Room) => placed.find(item => item.room.id === room.id)?.key ?? null;
  const roomOn = (key: string) => placed.find(item => item.key === key)?.room ?? null;
  const sorted = [...rooms].sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" }));

  async function toggle(on: boolean) {
    if (busy) return;
    setBusy(true); setPlanMessage(null);
    try {
      const result = await adminRequest<AppSettings>(praWamSettingsApi, { method: "PUT", body: JSON.stringify({ floorPlan: on }) });
      if (result.data) setSettings(result.data);
      setPlanMessage({ tone: "success", text: result.message });
    } catch (error) { setPlanMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  const pickSpot = (key: string) => { setMessage(null); setEditing({ spot: key, roomId: roomOn(key)?.id ?? "" }); };
  const editRoom = (room: Room) => { setMessage(null); setEditing({ spot: spotOf(room), roomId: room.id }); };
  function saved(next: Room[], text: string) {
    setRooms(next); setMessage({ tone: "success", text }); setSaves(count => count + 1);
  }

  if (!roomsReady) return <Notice tone="warning">Ruang menunggu migrasi 202611040001_pra_wam_appraisal.sql.</Notice>;
  const statusOf = (room: Room): PlanStatus => room.bookable ? { tone: "free", text: peopleText(room) } : { tone: "off", text: "Tidak dibooking" };
  const editRoomNow = editing?.roomId ? rooms.find(room => room.id === editing.roomId) ?? null : null;

  return <div className="stack">
    <h2>Ruang dan denah</h2>
    <p>Kapasitas dan minimal orang dipakai form booking untuk menyarankan ruang yang pas. Ruang yang tidak dicentang &ldquo;Bisa dibooking&rdquo; tidak muncul di form. Klik spot di denah untuk mengatur ruangnya.</p>
    {!planReady && <Notice tone="warning">Denah, minimal orang, dan pilihan spot menunggu migrasi {MIGRATION}. Sampai saat itu denah tetap tampil di Book, ruang ditaruh di denah menurut namanya, dan hanya kapasitas serta &ldquo;Bisa dibooking&rdquo; yang bisa disimpan.</Notice>}

    {planReady && <div>
      <Check label="Tampilkan denah di Book" checked={settings.floorPlan} onChange={on => void toggle(on)} />
      <p className={css.note}>{busy ? "Menyimpan…" : settings.floorPlan ? "Peserta bisa memilih Kalender atau Denah di Book, dan memilih ruang dari denah di form booking." : "Book hanya menampilkan kalender. Form booking memakai daftar ruang."}</p>
      {planMessage && <Notice tone={planMessage.tone}>{planMessage.text}</Notice>}
    </div>}

    <div className={css.layout}>
      <div className={`${base.app} ${css.planBox}`}>
        <FloorPlan rooms={rooms} statusOf={statusOf} label="Denah kantor: ruang WAM di setiap spot"
          onPickSpot={pickSpot} selectedSpot={editing?.spot ?? undefined} emptySpot={{ tone: "closed", text: "Spot kosong" }}
          legend={["free", "off", "closed", "selected"]} legendLabels={{ free: "Bisa dibooking", closed: "Spot kosong" }}
          caption="Klik spot untuk mengatur ruangnya." />
      </div>

      <div className={css.side}>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {editing
          ? <RoomEditor key={`${editing.spot}-${editing.roomId}-${saves}`} spot={editing.spot} room={editRoomNow} current={editing.spot ? roomOn(editing.spot) : null}
              rooms={sorted} spotOf={spotOf} roomOn={roomOn} planReady={planReady}
              onChooseRoom={roomId => setEditing({ spot: editing.spot, roomId })} onSaved={saved} onClose={() => setEditing(null)} />
          : <p className={css.note}>Pilih spot di denah, atau klik Ubah pada tabel di bawah.</p>}

        <section className="stack" aria-labelledby="ruang-tanpa-spot">
          <h3 id="ruang-tanpa-spot">Ruang tanpa spot</h3>
          {unplaced.length === 0 ? <p className={css.note}>Semua ruang WAM sudah ada di denah.</p> : <>
            <p className={css.note}>Tidak tampil di denah Book. Atur untuk menaruhnya di spot.</p>
            <ul className={css.list}>
              {unplaced.map(room => <li key={room.id}>
                <span><strong>{room.name}</strong><small>{peopleText(room)}{room.bookable ? "" : " · tidak dibooking"}</small></span>
                <Button type="button" variant="secondary" onClick={() => editRoom(room)}>Atur</Button>
              </li>)}
            </ul>
          </>}
        </section>
      </div>
    </div>

    <h3>Semua ruang</h3>
    <div style={{ overflowX: "auto" }}>
      <table className={styles.table}>
        <thead><tr><th>Ruang</th><th>Kapasitas</th><th>Minimal</th><th>Spot denah</th><th>Bisa dibooking</th><th /></tr></thead>
        <tbody>{sorted.map(room => {
          const spot = spotOf(room);
          return <tr key={room.id} className={editing?.roomId === room.id ? css.on : undefined}>
            <td>{room.name}<br /><small>{room.kind === "utama" ? "Ruang utama" : "Area"}</small></td>
            <td>{room.capacity ?? "—"}</td>
            <td>{room.minPeople ?? "—"}</td>
            <td>{spotLabel(spot)}{spot && room.planKey !== spot ? <><br /><small>dari nama ruang</small></> : null}</td>
            <td>{room.bookable ? "Ya" : "Tidak"}</td>
            <td><Button type="button" variant="quiet" aria-label={`Ubah ${room.name}`} onClick={() => editRoom(room)}>Ubah</Button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}

type EditorProps = {
  spot: string | null; room: Room | null; current: Room | null; rooms: Room[]; planReady: boolean;
  spotOf: (room: Room) => string | null; roomOn: (key: string) => Room | null;
  onChooseRoom: (roomId: string) => void; onSaved: (rooms: Room[], text: string) => void; onClose: () => void;
};

/** One room's settings, opened from a spot (which room sits there) or from the list. */
function RoomEditor({ spot, room, current, rooms, planReady, spotOf, roomOn, onChooseRoom, onSaved, onClose }: EditorProps) {
  const id = useId();
  const [capacity, setCapacity] = useState(room?.capacity?.toString() ?? "");
  const [minPeople, setMinPeople] = useState(room?.minPeople?.toString() ?? "");
  const [bookable, setBookable] = useState(room?.bookable ?? true);
  const [target, setTarget] = useState<string>((room && (spot ?? spotOf(room))) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; fields?: Record<string, string[]> } | null>(null);
  const number = (value: string) => value.trim() ? Number(value) : null;
  const holder = target ? roomOn(target) : null;
  const takesFrom = holder && room && holder.id !== room.id ? holder : null;
  const fieldError = (name: string) => error?.fields?.[name]?.[0];
  const min = number(minPeople), cap = number(capacity);
  const order = min != null && cap != null && min > cap ? `Minimal tidak boleh lebih dari kapasitas (${cap}).` : null;

  async function send(which: Room, body: { capacity: number | null; minPeople: number | null; bookable: boolean; planKey: string | null; replace?: boolean }, text: string) {
    setBusy(true); setError(null);
    try {
      const result = await adminRequest<Room[]>(praWamRoomsApi(which.id), { method: "PATCH", body: JSON.stringify(body) });
      if (result.data) onSaved(result.data, text);
    } catch (problem) { setError({ text: errorMessage(problem), fields: problem instanceof AdminApiError ? problem.fieldErrors : undefined }); }
    finally { setBusy(false); }
  }
  function save() {
    if (!room || order) return;
    void send(room, {
      capacity: cap, minPeople: planReady ? min : null, bookable,
      planKey: planReady ? target || null : null, replace: !!takesFrom?.planKey,
    }, `${room.name} disimpan${planReady ? `, ${target ? `di spot ${spotLabel(target)}` : "tanpa spot"}` : ""}.`);
  }
  /** Takes the room off this spot, keeping its other settings. */
  function release() {
    if (!current || !spot) return;
    void send(current, { capacity: current.capacity, minPeople: current.minPeople, bookable: current.bookable, planKey: null }, `${current.name} dilepas dari spot ${spotLabel(spot)}.`);
  }

  const heading = spot ? `Spot ${spotLabel(spot)}` : room?.name ?? "Ruang";
  const byName = (which: Room) => !!spot && which.planKey !== spot && nameSpot(which) === spot;
  return <section className={css.editor} aria-labelledby={`${id}-judul`}>
    <h3 id={`${id}-judul`}>{heading}</h3>
    {spot && <div className="field">
      <label htmlFor={`${id}-ruang`}>Ruang di spot ini</label>
      <select id={`${id}-ruang`} className="select" value={room?.id ?? ""} disabled={busy || !planReady && !current} onChange={event => onChooseRoom(event.target.value)}>
        <option value="">Tidak ada ruang WAM</option>
        {rooms.filter(item => planReady || item.id === current?.id).map(item => {
          const at = spotOf(item);
          return <option key={item.id} value={item.id}>{item.name}{at === spot ? " (di spot ini)" : at ? ` (di spot ${spotLabel(at)})` : " (tanpa spot)"}</option>;
        })}
      </select>
      {!planReady && <p className="field-hint">Memindah ruang ke spot lain menunggu migrasi {MIGRATION}.</p>}
    </div>}

    {!room ? <>
      {current ? (byName(current)
        ? <p className={css.note}>{current.name} ada di spot ini karena namanya cocok. Untuk melepasnya, taruh ruang lain di spot ini atau pindahkan {current.name} ke spot lain.</p>
        : <div className={css.actions}>
            <Button type="button" variant="secondary" disabled={busy || !planReady} onClick={release}>{busy ? "Melepas…" : `Lepas ${current.name} dari spot ini`}</Button>
          </div>)
        : <p className={css.note}>Spot ini belum dipakai ruang WAM. Pilih ruang di atas untuk menaruhnya di sini.</p>}
      <div className={css.actions}><Button type="button" variant="quiet" disabled={busy} onClick={onClose}>Tutup</Button></div>
    </> : <>
      {spot && <p className={css.note}>{room.name}{room.kind === "utama" ? ", ruang utama" : ", area"}</p>}
      <div className={css.fields}>
        <div className="field">
          <label htmlFor={`${id}-kapasitas`}>Kapasitas (maks orang)</label>
          <input id={`${id}-kapasitas`} className="input" inputMode="numeric" placeholder="Kosong" value={capacity} disabled={busy}
            aria-invalid={!!fieldError("capacity")} aria-describedby={fieldError("capacity") ? `${id}-kapasitas-error` : undefined}
            onChange={event => setCapacity(event.target.value.replace(/\D/g, "").slice(0, 3))} />
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
      <label className={styles.check}><input type="checkbox" checked={bookable} disabled={busy} onChange={event => setBookable(event.target.checked)} /> Bisa dibooking</label>
      <div className="field">
        <label htmlFor={`${id}-spot`}>Spot di denah</label>
        <select id={`${id}-spot`} className="select" value={target} disabled={busy || !planReady} onChange={event => setTarget(event.target.value)}
          aria-describedby={`${id}-spot-hint`}>
          <option value="">Tanpa spot (tidak tampil di denah)</option>
          {planSpotOptions().map(option => {
            const on = roomOn(option.key);
            return <option key={option.key} value={option.key}>{option.label}{on && on.id !== room.id ? ` (dipakai ${on.name})` : on ? " (spot ruang ini)" : ""}</option>;
          })}
        </select>
        <p id={`${id}-spot-hint`} className={fieldError("planKey") ? "field-error" : "field-hint"}>
          {fieldError("planKey")
            ?? (!planReady ? `Menunggu migrasi ${MIGRATION}. Sekarang ruang ditaruh di denah menurut namanya.`
              : takesFrom ? `${takesFrom.name} dilepas dari spot ini dan masuk daftar ruang tanpa spot.`
              : !target && nameSpot(room) ? `Namanya cocok dengan spot ${spotLabel(nameSpot(room))}, jadi tetap tampil di sana selama spot itu tidak dipakai ruang lain.`
              : "Satu spot untuk satu ruang.")}
        </p>
      </div>
      <div className={css.actions}>
        <Button type="button" disabled={busy || !!order} onClick={save}>{busy ? "Menyimpan…" : "Simpan"}</Button>
        <Button type="button" variant="quiet" disabled={busy} onClick={onClose}>Tutup</Button>
      </div>
    </>}
    {error && <div role="alert" className="field-error">{error.text}</div>}
  </section>;
}
