"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  BookOpen, Check, ChevronDown, ChevronLeft, CircleAlert, Coffee, CupSoda, Flame, Info, Lock, MapPin, Minus,
  Plus, Search, Send, Snowflake, Users, X, Zap,
} from "lucide-react";
import { DRINKS, ICE_LEVELS, SUGAR_LEVELS, optionsLabel, type Drink, type DrinkGroup, type Ice, type Sugar, type Temperature } from "@/lib/coffee/menu";
import { MACHINE_SPOT, OTHER_ROOM, ROOMS } from "@/lib/coffee/rooms";
import { BUILDING, PLAN_SPOTS, type Rect } from "@/lib/pra-wam/floor-plan";
import { clockOf, nowIso, shortName, useCoffeeStore, type Meeting, type MeetingItem, type Status } from "./store";
import styles from "./ga-prototype.module.css";

/*
 * Werkudara Coffee, GA tablet, as a clickable prototype (25 Nov 2026). GA signs in with the same
 * Journey employee account as everyone else; the tablet replaces the paper menu and the sticky note.
 * A meeting order goes to the pengelola (HR and admins holding the Werkudara Coffee access), who buys
 * it in JumpStart. Guests never have accounts: "Serahkan ke tamu" turns the tablet into a menu book.
 * Orders are written to the prototypes' shared store (localStorage), so /dev-preview/coffee/hr sees
 * them; the pengelola can also be simulated from the scenario panel. Names are made up.
 */

const GA = { name: "Contoh Bagas Saputra", role: "GA" };
const SENT_BY = `${GA.name} (${GA.role})`;
const PROCESSOR = "Contoh Dewi Lestari (HR)";
const REJECT_NOTE = "Susu segar sedang habis. Mohon pilih minuman tanpa susu, mis. Americano atau Kopi Hitam.";
const PEOPLE = [
  { name: "Contoh Dimas Pratama", position: "Account Manager", bu: "TEE" },
  { name: "Contoh Sari Wulandari", position: "Business Development", bu: "WNS" },
  { name: "Contoh Andi Wijaya", position: "Head of Sales", bu: "TEE" },
  { name: "Contoh Rina Putri", position: "Communications Specialist", bu: "WNS" },
  { name: "Contoh Maya Lestari", position: "Account Executive", bu: "TEE" },
  { name: "Contoh Arief Hidayat", position: "Finance Staff", bu: "WNS" },
  { name: "Contoh Yoga Permana", position: "Project Manager", bu: "CoE" },
  { name: "Contoh Laras Anindya", position: "Creative Lead", bu: "CoE" },
];

type Screen = "home" | "new" | "quick" | "sent";
type Draft = { room: string; spot?: string; pic: string; guest?: string; guestCount?: number; round: number; after?: string };
type Line = MeetingItem;

const DRINK = Object.fromEntries(DRINKS.map(drink => [drink.slug, drink])) as Record<string, Drink>;
const photo = (slug: string) => `/dev/coffee/${slug}.jpg`;
const dayOf = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date(iso));
const plain = (name: string) => name.replace(/^Contoh /, "");
let lineSeq = 0;
const newLineId = () => `l${Date.now().toString(36)}${(lineSeq++).toString(36)}`;

const STATUS: Record<Status, { label: string; tone: string }> = {
  diproses: { label: "Diproses", tone: "wait" },
  selesai: { label: "Selesai", tone: "ok" },
  ditolak: { label: "Ditolak", tone: "no" },
  batal: { label: "Dibatalkan", tone: "off" },
};

function counts(items: Line[]) {
  const tamu = items.filter(item => item.for === "tamu").reduce((sum, item) => sum + item.qty, 0);
  const tim = items.filter(item => item.for === "tim").reduce((sum, item) => sum + item.qty, 0);
  return { total: tamu + tim, tamu, tim };
}
/** "6 minuman · Tamu 5 · Tim · rapat 1". */
function countLabel(items: Line[]) {
  const { total, tamu, tim } = counts(items);
  return [`${total} minuman`, tamu ? `Tamu ${tamu}` : "", tim ? `Tim · rapat ${tim}` : ""].filter(Boolean).join(" · ");
}
function doneLine(meeting: Meeting) {
  if (meeting.status === "selesai" && meeting.doneBy) return `Selesai diproses oleh ${shortName(meeting.doneBy)}${meeting.doneAt ? ` · ${clockOf(meeting.doneAt)}` : ""}`;
  if (meeting.status === "ditolak" && meeting.doneBy) return `Ditolak oleh ${shortName(meeting.doneBy)}${meeting.doneAt ? ` · ${clockOf(meeting.doneAt)}` : ""}`;
  if (meeting.status === "diproses") return "Menunggu pengelola";
  return "";
}
const defaultLine = (slug: string, who: Line["for"], person?: string): Line => ({
  id: newLineId(), slug, for: who, person, qty: 1, temperature: DRINK[slug].temperatures[0], sugar: "Normal", ice: "Normal",
});

export function GaPrototype() {
  const { state, update, reset } = useCoffeeStore();
  const [screen, setScreen] = useState<Screen>("home");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [sentId, setSentId] = useState<string | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [panel, setPanel] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Tell GA when the pengelola settles an order (from the panel here or the HR page in another tab).
  // Only changes after this tab opened count, not the switch from the seed to saved data on load.
  const [openedAt] = useState(() => new Date().toISOString());
  const [known, setKnown] = useState(state.meetings);
  if (known !== state.meetings) {
    const changed = state.meetings.find(meeting => {
      const before = known.find(item => item.id === meeting.id);
      return before?.status === "diproses" && meeting.status !== "diproses" && meeting.doneAt && meeting.doneAt > openedAt;
    });
    setKnown(state.meetings);
    if (changed) setToast(`#${changed.id} ${changed.room}: ${doneLine(changed)}`);
  }
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const today = dayOf(nowIso());
  const meetings = useMemo(() => state.meetings.filter(meeting => dayOf(meeting.at) === today).sort((a, b) => b.at.localeCompare(a.at)), [state.meetings, today]);
  const latestWaiting = meetings.find(meeting => meeting.status === "diproses");

  const startRound = (meeting: Meeting) => {
    const rounds = meetings.filter(item => item.room === meeting.room && item.pic === meeting.pic).map(item => item.round);
    setDraft({ room: meeting.room, spot: meeting.spot, pic: meeting.pic, guest: meeting.guest, guestCount: meeting.guestCount, round: Math.max(...rounds) + 1, after: meeting.id });
    setLines([]);
    setScreen("quick");
  };
  const send = () => {
    if (!draft || lines.length === 0) return;
    const id = `T-0${state.seq.meeting}`;
    const meeting: Meeting = {
      id, kind: "rapat", room: draft.room, spot: draft.spot, pic: draft.pic, guest: draft.guest, guestCount: draft.guestCount,
      items: lines, at: nowIso(), status: "diproses", sentBy: SENT_BY, round: draft.round,
    };
    update(current => ({ ...current, meetings: [meeting, ...current.meetings], seq: { ...current.seq, meeting: current.seq.meeting + 1 } }));
    setSentId(id);
    setLines([]);
    setScreen("sent");
  };
  const settle = (status: "selesai" | "ditolak") => {
    if (!latestWaiting) return;
    update(current => ({
      ...current,
      meetings: current.meetings.map(meeting => meeting.id === latestWaiting.id
        ? { ...meeting, status, doneBy: PROCESSOR, doneAt: nowIso(), reason: status === "ditolak" ? REJECT_NOTE : undefined }
        : meeting),
    }));
  };
  const backFromGuest = (picks: Line[]) => {
    setLines(list => [...list, ...picks]);
    setGuestMode(false);
    setScreen("quick");
  };
  const restart = () => {
    reset(); setScreen("home"); setDraft(null); setLines([]); setSentId(null); setGuestMode(false); setToast(null);
  };
  const sent = sentId ? state.meetings.find(meeting => meeting.id === sentId) : undefined;

  return (
    <div className={styles.stage}>
      <header className={styles.topbar}>
        <span className={styles.brand}><Coffee aria-hidden size={22} />Werkudara Coffee<span className={styles.brandSub}>Tablet GA</span></span>
        <span className={styles.user}>
          <span className={styles.userText}><strong>{GA.name}</strong><span>{GA.role} · akun karyawan Journey</span></span>
          <span className={styles.avatar} aria-hidden>{plain(GA.name).slice(0, 1)}</span>
        </span>
      </header>

      <main className={styles.main}>
        {screen === "home" && (
          <Home meetings={meetings} onNew={() => { setDraft(null); setLines([]); setScreen("new"); }} onMore={startRound}
            onOpen={meeting => { setSentId(meeting.id); setScreen("sent"); }} />
        )}
        {screen === "new" && (
          <NewOrder initial={draft} onBack={() => setScreen("home")}
            onQuick={next => { setDraft(next); setScreen("quick"); }}
            onGuest={next => { setDraft(next); setScreen("quick"); setGuestMode(true); }} />
        )}
        {screen === "quick" && draft && (
          <QuickInput draft={draft} lines={lines} setLines={setLines} onSend={send} onGuest={() => setGuestMode(true)}
            onBack={() => setScreen(draft.after ? "home" : "new")} />
        )}
        {screen === "sent" && sent && (
          <Sent meeting={sent} onMore={() => startRound(sent)} onHome={() => setScreen("home")} />
        )}
      </main>

      {guestMode && draft && <GuestBook draft={draft} onDone={backFromGuest} />}

      {toast && (
        <div className={styles.toast} role="status">
          <span className={styles.toastIcon}><Coffee aria-hidden size={18} /></span>
          <span>{toast}</span>
          <button type="button" className={styles.iconButton} aria-label="Tutup pemberitahuan" onClick={() => setToast(null)}><X aria-hidden size={18} /></button>
        </div>
      )}

      <button type="button" className={styles.panelToggle} onClick={() => setPanel(open => !open)} aria-expanded={panel} aria-controls="ga-skenario">
        Prototype · skenario
      </button>
      {panel && (
        <aside id="ga-skenario" className={styles.panel} aria-label="Skenario prototype">
          <div className={styles.panelHead}>
            <h2>Skenario</h2>
            <button type="button" className={styles.iconButton} aria-label="Tutup skenario" onClick={() => setPanel(false)}><X aria-hidden size={18} /></button>
          </div>
          <p>Data contoh tersimpan di browser ini saja. Tombol di bawah menggantikan pengelola (HR atau admin yang punya akses Werkudara Coffee).</p>
          <div className={styles.panelGroup}>
            <span>Pengelola {latestWaiting ? `· #${latestWaiting.id} ${latestWaiting.room}` : "· tidak ada yang diproses"}</span>
            <button type="button" disabled={!latestWaiting} onClick={() => settle("selesai")}>Proses pesanan terbaru</button>
            <button type="button" disabled={!latestWaiting} onClick={() => settle("ditolak")}>Tolak dengan catatan</button>
          </div>
          <div className={styles.panelGroup}>
            <span>Data</span>
            <button type="button" onClick={restart}>Reset data contoh</button>
          </div>
          <p>Buka <code>/dev-preview/coffee/hr</code> di tab lain untuk memproses lewat halaman pengelola; layar ini ikut berubah.</p>
        </aside>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ beranda */

function Home({ meetings, onNew, onMore, onOpen }: {
  meetings: Meeting[]; onNew: () => void; onMore: (meeting: Meeting) => void; onOpen: (meeting: Meeting) => void;
}) {
  const date = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(new Date());
  const statuses = roomStatuses(meetings);
  const waiting = meetings.filter(meeting => meeting.status === "diproses").length;
  return (
    <div className={styles.home}>
      <section className={styles.homeMain}>
        <div className={styles.pageHead}>
          <div>
            <p className={styles.muted}>{date}</p>
            <h1>Pesanan rapat hari ini</h1>
            <p className={styles.muted}>{meetings.length} pesanan · {waiting} sedang diproses</p>
          </div>
          <button type="button" className={`${styles.primary} ${styles.big}`} onClick={onNew}><Plus aria-hidden size={24} />Pesanan baru</button>
        </div>
        {meetings.length === 0 ? (
          <div className={styles.emptyState}>
            <Coffee aria-hidden size={32} />
            <h2>Belum ada pesanan rapat hari ini</h2>
            <p>Ketuk Pesanan baru saat masuk ke ruang rapat.</p>
          </div>
        ) : (
          <ul className={styles.cards}>
            {meetings.map(meeting => <MeetingCard key={meeting.id} meeting={meeting} onMore={() => onMore(meeting)} onOpen={() => onOpen(meeting)} />)}
          </ul>
        )}
      </section>
      <aside className={styles.homeSide} aria-labelledby="denah-judul">
        <h2 id="denah-judul">Ruangan dengan pesanan</h2>
        <FloorMap statuses={statuses} label="Denah kantor: ruangan dengan pesanan hari ini" />
        <ul className={styles.legend} aria-label="Keterangan warna">
          <li><span className={styles.swatch} data-tone="wait" aria-hidden />Diproses</li>
          <li><span className={styles.swatch} data-tone="ok" aria-hidden />Selesai</li>
          <li><span className={styles.swatch} data-tone="no" aria-hidden />Ditolak</li>
          <li><span className={styles.swatch} data-tone="machine" aria-hidden />Mesin kopi</li>
        </ul>
        <ul className={styles.roomList}>
          {[...ROOMS.map(room => room.name), ...new Set(meetings.filter(meeting => !meeting.spot).map(meeting => meeting.room))].map(name => {
            const spot = ROOMS.find(room => room.name === name)?.spot;
            const status = spot ? statuses[spot] : meetingsStatus(meetings.filter(meeting => meeting.room === name));
            return (
              <li key={name}>
                <span>{name}</span>
                {status ? <span className={styles.pill} data-tone={STATUS[status].tone}>{STATUS[status].label}</span> : <span className={styles.mutedSmall}>Tidak ada</span>}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}

/** One status per room: anything still waiting wins, then a rejection, then done. */
function meetingsStatus(list: Meeting[]): Status | undefined {
  const order: Status[] = ["diproses", "ditolak", "selesai"];
  return order.find(status => list.some(meeting => meeting.status === status));
}
function roomStatuses(meetings: Meeting[]) {
  const result: Record<string, Status> = {};
  for (const room of ROOMS) {
    const status = meetingsStatus(meetings.filter(meeting => meeting.spot === room.spot));
    if (status) result[room.spot] = status;
  }
  return result;
}

function MeetingCard({ meeting, onMore, onOpen }: { meeting: Meeting; onMore: () => void; onOpen: () => void }) {
  const status = STATUS[meeting.status];
  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardRoom}><MapPin aria-hidden size={18} /><strong>{meeting.room}</strong></span>
        <span className={styles.pill} data-tone={status.tone}>{status.label}</span>
      </div>
      <dl className={styles.facts}>
        <div><dt>PIC</dt><dd>{meeting.pic}</dd></div>
        {(meeting.guest || meeting.guestCount) && <div><dt>Tamu</dt><dd>{[meeting.guest, meeting.guestCount ? `${meeting.guestCount} orang` : ""].filter(Boolean).join(" · ")}</dd></div>}
        <div><dt>Minuman</dt><dd>{countLabel(meeting.items)}</dd></div>
      </dl>
      <ul className={styles.mini} aria-label="Rincian minuman">
        {meeting.items.map(item => <li key={item.id}>{item.qty}× {DRINK[item.slug]?.name ?? item.slug}{item.temperature === "es" ? " (Es)" : ""}</li>)}
      </ul>
      <p className={styles.cardStatus} data-tone={status.tone}>
        {meeting.status === "selesai" ? <Check aria-hidden size={16} /> : meeting.status === "ditolak" ? <CircleAlert aria-hidden size={16} /> : <span className={styles.dot} aria-hidden />}
        {doneLine(meeting)}
      </p>
      {meeting.status === "ditolak" && meeting.reason && <p className={styles.cardReason}>{meeting.reason}</p>}
      <div className={styles.cardFoot}>
        <span className={styles.mutedSmall}>#{meeting.id} · {clockOf(meeting.at)}{meeting.round > 1 ? ` · tambahan ke-${meeting.round - 1}` : ""}</span>
        <span className={styles.row}>
          <button type="button" className={styles.ghost} onClick={onOpen}>Status</button>
          <button type="button" className={styles.secondary} onClick={onMore}><Plus aria-hidden size={18} />Tambah lagi</button>
        </span>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ floor plan */

const VIEW = { x: BUILDING.x, y: BUILDING.y, w: BUILDING.w, h: 1175 };
const SHORT: Record<string, string> = { ananta: "Ananta", limasan: "Limasan", vasuki: "Vasuki", communal: "Komunal", pantry: "Pantry" };
/** Tall, narrow rooms read their name upright along the room instead of spilling into neighbours. */
const UPRIGHT = new Set(["communal", "vasuki"]);
const centre = (rect: Rect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });

/**
 * The office floor plan of Pra WAM (src/lib/pra-wam/floor-plan.ts), top part of the building, with the
 * four meeting rooms Werkudara Coffee serves. With `onPick`, the rooms are buttons.
 */
function FloorMap({ statuses = {}, selected, onPick, label }: {
  statuses?: Record<string, Status>; selected?: string; onPick?: (spot: string) => void; label: string;
}) {
  const coffee = new Set<string>(ROOMS.map(room => room.spot));
  return (
    <svg className={styles.map} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role={onPick ? "group" : "img"} aria-label={label}>
      <rect x={BUILDING.x} y={BUILDING.y} width={BUILDING.w} height={BUILDING.h} className={styles.mapBuilding} />
      {Object.entries(PLAN_SPOTS).filter(([key]) => !coffee.has(key) && key !== MACHINE_SPOT).map(([key, spot]) => spot.shape
        ? <polygon key={key} points={spot.shape.map(point => point.join(",")).join(" ")} className={styles.mapOther} />
        : <rect key={key} x={spot.rect.x} y={spot.rect.y} width={spot.rect.w} height={spot.rect.h} className={styles.mapOther} />)}
      <MapSpot spot={MACHINE_SPOT} tone="machine" sub="Mesin" />
      {ROOMS.map(room => {
        const status = statuses[room.spot];
        const on = selected === room.spot;
        return (
          <MapSpot key={room.spot} spot={room.spot} tone={on ? "selected" : status ? STATUS[status].tone : "room"}
            sub={on ? "Dipilih" : status ? STATUS[status].label : undefined}
            pick={onPick ? { name: room.name, on, onPick: () => onPick(room.spot) } : undefined} />
        );
      })}
    </svg>
  );
}

function MapSpot({ spot, tone, sub, pick }: { spot: string; tone: string; sub?: string; pick?: { name: string; on: boolean; onPick: () => void } }) {
  const rect = PLAN_SPOTS[spot].rect;
  const at = centre(rect);
  const pad = 22;
  const body = (
    <>
      {pick && <rect x={rect.x - pad} y={rect.y - pad} width={rect.w + pad * 2} height={rect.h + pad * 2} className={styles.mapHit} />}
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} className={styles.mapSpot} data-tone={tone} />
      <g transform={UPRIGHT.has(spot) ? `rotate(-90 ${at.x} ${at.y})` : undefined}>
        <text x={at.x} y={sub ? at.y - 4 : at.y + 15} className={styles.mapLabel} data-tone={tone}>{SHORT[spot]}</text>
        {sub && <text x={at.x} y={at.y + 34} className={styles.mapSub} data-tone={tone}>{sub}</text>}
      </g>
    </>
  );
  if (!pick) return <g>{body}</g>;
  return (
    <g role="button" tabIndex={0} aria-pressed={pick.on} aria-label={`Pilih ${pick.name}`} className={styles.mapButton}
      onClick={pick.onPick} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick.onPick(); } }}>
      {body}
    </g>
  );
}

/* ------------------------------------------------------------------ pesanan baru */

function NewOrder({ initial, onBack, onQuick, onGuest }: {
  initial: Draft | null; onBack: () => void; onQuick: (draft: Draft) => void; onGuest: (draft: Draft) => void;
}) {
  const known = initial ? ROOMS.find(room => room.name === initial.room) : undefined;
  const [spot, setSpot] = useState<string | null>(known?.spot ?? (initial ? OTHER_ROOM : null));
  const [otherRoom, setOtherRoom] = useState(initial && !known ? initial.room : "");
  const [pic, setPic] = useState(initial?.pic ?? "");
  const [query, setQuery] = useState("");
  const [more, setMore] = useState(Boolean(initial?.guest || initial?.guestCount));
  const [guest, setGuest] = useState(initial?.guest ?? "");
  const [guestCount, setGuestCount] = useState(initial?.guestCount ?? 0);

  const room = spot === OTHER_ROOM ? otherRoom.trim() : ROOMS.find(item => item.spot === spot)?.name ?? "";
  const ready = Boolean(room && pic);
  const found = PEOPLE.filter(person => !query.trim() || `${person.name} ${person.position} ${person.bu}`.toLowerCase().includes(query.trim().toLowerCase()));
  const draft = (): Draft => ({
    room, spot: spot === OTHER_ROOM ? undefined : spot ?? undefined, pic,
    guest: guest.trim() || undefined, guestCount: guestCount || undefined, round: 1,
  });

  return (
    <div className={styles.screen}>
      <ScreenHead title="Pesanan baru" sub="Cukup ruangan dan PIC. Tamu dan jumlah orang boleh dilewati." onBack={onBack} backLabel="Beranda" />
      <div className={styles.newGrid}>
        <section className={styles.mapCard} aria-labelledby="ruangan-judul">
          <h2 id="ruangan-judul">Ruangan</h2>
          <p className={styles.mutedSmall}>Ketuk ruangan di denah, atau pilih di samping.</p>
          <FloorMap selected={spot ?? undefined} onPick={setSpot} label="Denah kantor: pilih ruangan rapat" />
        </section>

        <section className={styles.formCol}>
          <fieldset className={styles.field}>
            <legend>Ruangan</legend>
            <div className={styles.chips}>
              {ROOMS.map(item => (
                <button key={item.spot} type="button" className={styles.chip} aria-pressed={spot === item.spot} onClick={() => setSpot(item.spot)}>{item.name}</button>
              ))}
              <button type="button" className={styles.chip} aria-pressed={spot === OTHER_ROOM} onClick={() => setSpot(OTHER_ROOM)}>{OTHER_ROOM}</button>
            </div>
            {spot === OTHER_ROOM && (
              <>
                <label className={styles.label} htmlFor="ga-ruang-lain">Nama tempat</label>
                <input id="ga-ruang-lain" className={styles.input} value={otherRoom} onChange={event => setOtherRoom(event.target.value)} placeholder="Mis. Lobi depan" autoFocus />
              </>
            )}
          </fieldset>

          <div className={styles.field}>
            <span className={styles.legendLike} id="ga-pic-judul">PIC</span>
            {pic ? (
              <div className={styles.picked}>
                <span className={styles.initial} aria-hidden>{plain(pic).slice(0, 1)}</span>
                <span className={styles.grow}><strong>{pic}</strong><span>{PEOPLE.find(person => person.name === pic)?.position}</span></span>
                <button type="button" className={styles.ghost} onClick={() => setPic("")}>Ganti</button>
              </div>
            ) : (
              <>
                <label className={styles.search}>
                  <Search aria-hidden size={20} />
                  <span className={styles.srOnly}>Cari karyawan PIC</span>
                  <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama, jabatan, atau BU" aria-describedby="ga-pic-judul" />
                </label>
                <ul className={styles.people} aria-label="Karyawan">
                  {found.slice(0, 3).map(person => (
                    <li key={person.name}>
                      <button type="button" onClick={() => { setPic(person.name); setQuery(""); }}>
                        <span className={styles.initial} aria-hidden>{plain(person.name).slice(0, 1)}</span>
                        <span><strong>{person.name}</strong><span>{person.position} · {person.bu}</span></span>
                      </button>
                    </li>
                  ))}
                  {found.length === 0 && <li className={styles.mutedSmall}>Tidak ada nama yang cocok.</li>}
                </ul>
              </>
            )}
          </div>

          <div className={styles.field}>
            <button type="button" className={styles.disclosure} aria-expanded={more} aria-controls="ga-tamu" onClick={() => setMore(!more)}>
              <Users aria-hidden size={20} /><span className={styles.grow}>Tamu dan jumlah orang <span className={styles.mutedSmall}>(opsional)</span></span>
              <ChevronDown aria-hidden size={20} className={styles.chev} data-open={more || undefined} />
            </button>
            {more && (
              <div id="ga-tamu" className={styles.guestFields}>
                <span className={styles.grow}>
                  <label className={styles.label} htmlFor="ga-tamu-nama">Tamu atau instansi</label>
                  <input id="ga-tamu-nama" className={styles.input} value={guest} onChange={event => setGuest(event.target.value)} placeholder="Mis. PT Sinar Jaya" />
                </span>
                <span>
                  <span className={styles.label} id="ga-jumlah">Jumlah orang</span>
                  <Stepper value={guestCount} min={0} onChange={setGuestCount} labelledBy="ga-jumlah" />
                </span>
              </div>
            )}
          </div>

          <div className={styles.formFoot}>
            {!ready && <p className={styles.mutedSmall} role="status">Pilih ruangan dan PIC dulu.</p>}
            <button type="button" className={`${styles.primary} ${styles.big}`} disabled={!ready} onClick={() => onQuick(draft())}><Zap aria-hidden size={22} />Input cepat</button>
            <button type="button" className={styles.secondary} disabled={!ready} onClick={() => onGuest(draft())}><BookOpen aria-hidden size={20} />Serahkan ke tamu</button>
          </div>
        </section>
      </div>
    </div>
  );
}

function ScreenHead({ title, sub, onBack, backLabel, children }: { title: string; sub?: ReactNode; onBack: () => void; backLabel: string; children?: ReactNode }) {
  return (
    <div className={styles.screenHead}>
      <button type="button" className={styles.back} onClick={onBack}><ChevronLeft aria-hidden size={22} />{backLabel}</button>
      <div className={styles.grow}>
        <h1>{title}</h1>
        {sub && <p className={styles.muted}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function Stepper({ value, min = 0, onChange, labelledBy, name }: { value: number; min?: number; onChange: (value: number) => void; labelledBy?: string; name?: string }) {
  return (
    <span className={styles.stepper} role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : `Jumlah ${name ?? ""}`.trim()}>
      <button type="button" aria-label="Kurangi" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min && min > 0}><Minus aria-hidden size={18} /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="Tambah" onClick={() => onChange(value + 1)}><Plus aria-hidden size={18} /></button>
    </span>
  );
}

/* ------------------------------------------------------------------ input cepat */

function QuickInput({ draft, lines, setLines, onSend, onGuest, onBack }: {
  draft: Draft; lines: Line[]; setLines: (change: (lines: Line[]) => Line[]) => void; onSend: () => void; onGuest: () => void; onBack: () => void;
}) {
  const [group, setGroup] = useState<DrinkGroup>("kopi");
  const [tapFor, setTapFor] = useState<Line["for"]>("tamu");
  const [editing, setEditing] = useState<{ line: Line; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const drinks = DRINKS.filter(drink => drink.group === group);
  const qtyOf = (slug: string) => lines.filter(line => line.slug === slug).reduce((sum, line) => sum + line.qty, 0);
  const { total } = counts(lines);

  const add = (slug: string) => {
    if (tapFor === "tim") { setEditing({ line: defaultLine(slug, "tim"), isNew: true }); return; }
    setLines(list => {
      const base = defaultLine(slug, "tamu");
      const same = list.find(line => line.for === "tamu" && !line.person && line.slug === slug && line.temperature === base.temperature && line.sugar === "Normal");
      return same ? list.map(line => line === same ? { ...line, qty: line.qty + 1 } : line) : [...list, base];
    });
  };
  const setQty = (id: string, qty: number) => setLines(list => qty <= 0 ? list.filter(line => line.id !== id) : list.map(line => line.id === id ? { ...line, qty } : line));
  const save = (line: Line) => {
    setLines(list => editing?.isNew ? [...list, line] : list.map(item => item.id === line.id ? line : item));
    setEditing(null);
  };
  const submit = () => { setBusy(true); window.setTimeout(() => { setBusy(false); onSend(); }, 450); };

  const sub = [draft.room, `PIC ${draft.pic}`, draft.guest, draft.guestCount ? `${draft.guestCount} orang` : ""].filter(Boolean).join(" · ");
  return (
    <div className={styles.screen}>
      <ScreenHead title={draft.after ? `Tambah lagi untuk #${draft.after}` : "Input cepat"} sub={sub} onBack={onBack} backLabel={draft.after ? "Beranda" : "Ubah data"}>
        <button type="button" className={styles.secondary} onClick={onGuest}><BookOpen aria-hidden size={20} />Serahkan ke tamu</button>
      </ScreenHead>
      <div className={styles.quickGrid}>
        <section className={styles.menuPane} aria-label="Menu minuman">
          <div className={styles.menuBar}>
            <div className={styles.segmented} role="tablist" aria-label="Jenis minuman">
              <button type="button" role="tab" aria-selected={group === "kopi"} onClick={() => setGroup("kopi")}><Coffee aria-hidden size={18} />Kopi</button>
              <button type="button" role="tab" aria-selected={group === "non-kopi"} onClick={() => setGroup("non-kopi")}><CupSoda aria-hidden size={18} />Non-kopi</button>
            </div>
            <div className={styles.tapFor} role="radiogroup" aria-label="Minuman yang diketuk untuk">
              <span className={styles.mutedSmall} aria-hidden>Ketuk untuk</span>
              <button type="button" role="radio" aria-checked={tapFor === "tamu"} onClick={() => setTapFor("tamu")}>Tamu</button>
              <button type="button" role="radio" aria-checked={tapFor === "tim"} onClick={() => setTapFor("tim")}>Tim · rapat</button>
            </div>
          </div>
          <ul className={styles.drinkGrid}>
            {drinks.map(drink => {
              const qty = qtyOf(drink.slug);
              return (
                <li key={drink.slug}>
                  <button type="button" className={styles.tile} onClick={() => add(drink.slug)} aria-label={`Tambah ${drink.name}${qty ? `, sudah ${qty}` : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- prototype stand-in photos */}
                    <img src={photo(drink.slug)} alt="" width={200} height={150} />
                    <span className={styles.tileName}>{drink.name}</span>
                    <span className={styles.tilePlus} aria-hidden><Plus size={20} /></span>
                    {qty > 0 && <span className={styles.tileCount} aria-hidden>{qty}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={styles.orderPane} aria-labelledby="pesanan-judul">
          <h2 id="pesanan-judul">Pesanan</h2>
          {lines.length === 0 ? (
            <div className={styles.orderEmpty}>
              <Coffee aria-hidden size={28} />
              <p>Ketuk minuman di kiri. Bawaannya Panas · gula Normal, untuk Tamu.</p>
            </div>
          ) : (
            <ul className={styles.lines}>
              {lines.map(line => {
                const drink = DRINK[line.slug];
                return (
                  <li key={line.id}>
                    <button type="button" className={styles.lineBody} onClick={() => setEditing({ line, isNew: false })} aria-label={`Ubah ${drink.name}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- prototype stand-in photos */}
                      <img src={photo(line.slug)} alt="" width={44} height={44} />
                      <span className={styles.grow}>
                        <strong>{drink.name}</strong>
                        <span>{optionsLabel(line.temperature, line.sugar, line.ice)}</span>
                        <span className={styles.tag} data-for={line.for}>{line.for === "tamu" ? `Tamu${line.person ? ` · ${line.person}` : ""}` : `Tim · rapat · ${plain(line.person ?? "")}`}</span>
                      </span>
                    </button>
                    <Stepper value={line.qty} onChange={qty => setQty(line.id, qty)} name={drink.name} />
                  </li>
                );
              })}
            </ul>
          )}
          <div className={styles.orderFoot}>
            <p className={styles.total} aria-live="polite">{total ? countLabel(lines) : "Belum ada minuman"}</p>
            <p className={styles.sendTo}><Info aria-hidden size={16} />Dikirim ke pengelola Werkudara Coffee (HR dan admin yang punya akses).</p>
            <button type="button" className={`${styles.primary} ${styles.big}`} disabled={!total || busy} onClick={submit}>
              <Send aria-hidden size={20} />{busy ? "Mengirim…" : total ? `Kirim ${total} minuman` : "Kirim"}
            </button>
          </div>
        </section>
      </div>
      {editing && <LineDialog line={editing.line} isNew={editing.isNew} pic={draft.pic} onClose={() => setEditing(null)} onSave={save}
        onRemove={() => { setLines(list => list.filter(item => item.id !== editing.line.id)); setEditing(null); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ dialogs */

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** Focus moves into the dialog and back on close; Tab stays inside; Escape closes. */
function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const node = ref.current;
    (node?.querySelector<HTMLElement>("[data-autofocus]") ?? node?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    return () => before?.focus?.();
  }, [ref]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const node = ref.current;
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref, onClose]);
}

function LineDialog({ line, isNew, pic, onClose, onSave, onRemove }: {
  line: Line; isNew: boolean; pic: string; onClose: () => void; onSave: (line: Line) => void; onRemove: () => void;
}) {
  const drink = DRINK[line.slug];
  const [next, setNext] = useState<Line>(line);
  const [tried, setTried] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, onClose);
  const patch = (change: Partial<Line>) => setNext(current => ({ ...current, ...change }));
  const name = next.person?.trim() ?? "";
  const needsName = next.for === "tim" && !name;
  const suggestions = [pic, ...PEOPLE.map(person => person.name).filter(person => person !== pic)]
    .filter(person => !name || person.toLowerCase().includes(name.toLowerCase()) && person !== name).slice(0, 4);
  const done = () => { if (needsName) { setTried(true); return; } onSave({ ...next, person: next.for === "tim" ? name : next.person?.trim() || undefined }); };

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div ref={ref} className={styles.dialog} role="dialog" aria-modal aria-labelledby="ubah-judul" onClick={event => event.stopPropagation()}>
        <div className={styles.dialogHead}>
          {/* eslint-disable-next-line @next/next/no-img-element -- prototype stand-in photos */}
          <img src={photo(line.slug)} alt="" width={64} height={64} />
          <div className={styles.grow}><h2 id="ubah-judul">{drink.name}</h2><p className={styles.mutedSmall}>{drink.description}</p></div>
          <button type="button" className={styles.iconButton} aria-label="Tutup" onClick={onClose}><X aria-hidden size={22} /></button>
        </div>
        <div className={styles.dialogBody}>
          <div className={styles.dialogCols}>
            {drink.temperatures.length > 1 && (
              <fieldset className={styles.field}>
                <legend>Suhu</legend>
                <div className={styles.options} data-cols="2">
                  <Option on={next.temperature === "panas"} onClick={() => patch({ temperature: "panas" })}><Flame aria-hidden size={18} />Panas</Option>
                  <Option on={next.temperature === "es"} onClick={() => patch({ temperature: "es" })}><Snowflake aria-hidden size={18} />Es</Option>
                </div>
              </fieldset>
            )}
            <div className={styles.field}>
              <span className={styles.legendLike} id="ubah-jumlah">Jumlah</span>
              <Stepper value={next.qty} min={1} onChange={qty => patch({ qty })} labelledBy="ubah-jumlah" />
            </div>
          </div>
          <fieldset className={styles.field}>
            <legend>Gula</legend>
            <div className={styles.options} data-cols="6">
              {SUGAR_LEVELS.map(level => <Option key={level} on={next.sugar === level} onClick={() => patch({ sugar: level as Sugar })}>{level}</Option>)}
            </div>
          </fieldset>
          {next.temperature === "es" && (
            <fieldset className={styles.field}>
              <legend>Takaran es</legend>
              <div className={styles.options} data-cols="3">
                {ICE_LEVELS.map(level => <Option key={level} on={next.ice === level} onClick={() => patch({ ice: level as Ice })}>{level}</Option>)}
              </div>
            </fieldset>
          )}
          <fieldset className={styles.field}>
            <legend>Untuk</legend>
            <div className={styles.options} data-cols="2">
              <Option on={next.for === "tamu"} onClick={() => patch({ for: "tamu", person: next.for === "tim" ? undefined : next.person })}>Tamu</Option>
              <Option on={next.for === "tim"} onClick={() => patch({ for: "tim", person: next.for === "tamu" ? "" : next.person })}>Tim · rapat</Option>
            </div>
            {next.for === "tim" && (
              <>
                <label className={styles.label} htmlFor="ubah-nama">Nama anggota tim</label>
                <input id="ubah-nama" className={styles.input} value={next.person ?? ""} onChange={event => patch({ person: event.target.value })}
                  placeholder="Ketik atau pilih nama" aria-invalid={tried && needsName} aria-describedby="ubah-nama-info" data-autofocus={isNew || undefined} />
                {suggestions.length > 0 && (
                  <div className={styles.chips}>
                    {suggestions.map(person => <button key={person} type="button" className={styles.chip} onClick={() => patch({ person })}>{person}{person === pic ? " (PIC)" : ""}</button>)}
                  </div>
                )}
                <p id="ubah-nama-info" className={tried && needsName ? styles.error : styles.mutedSmall}>
                  {tried && needsName ? "Isi nama dulu: minuman tim dicatat atas nama orangnya." : "Tidak memotong jatah, tetapi dicatat atas nama orang ini."}
                </p>
              </>
            )}
          </fieldset>
        </div>
        <div className={styles.dialogFoot}>
          {!isNew && <button type="button" className={styles.dangerText} onClick={onRemove}>Hapus</button>}
          <span className={styles.grow} />
          <button type="button" className={styles.secondary} onClick={onClose}>Batal</button>
          <button type="button" className={styles.primary} onClick={done}>{isNew ? "Tambahkan" : "Simpan"}</button>
        </div>
      </div>
    </div>
  );
}

function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={styles.option} aria-pressed={on} onClick={onClick}>{children}</button>;
}

/* ------------------------------------------------------------------ terkirim */

function Sent({ meeting, onMore, onHome }: { meeting: Meeting; onMore: () => void; onHome: () => void }) {
  const status = STATUS[meeting.status];
  const ice = meeting.items.filter(item => item.temperature === "es").reduce((sum, item) => sum + item.qty, 0);
  const done = meeting.status === "selesai";
  const steps = [
    { label: "Dikirim", note: `${clockOf(meeting.at)} · oleh ${shortName(meeting.sentBy)}`, done: true },
    { label: meeting.status === "ditolak" ? "Ditolak" : "Diproses", note: meeting.status === "diproses" ? "Menunggu pengelola (HR atau admin)" : doneLine(meeting), done, failed: meeting.status === "ditolak" },
    { label: "Ambil di mesin pantry", note: done ? `Sekarang${ice ? ` · tambahkan es untuk ${ice} minuman Es` : ""}` : "", done: false },
  ];
  const title = { diproses: "Pesanan terkirim", selesai: "Siap diambil di mesin pantry", ditolak: "Pesanan ditolak", batal: "Pesanan dibatalkan" }[meeting.status];
  return (
    <div className={styles.screen}>
      <ScreenHead title={title} sub={`#${meeting.id} · ${meeting.room}`} onBack={onHome} backLabel="Beranda" />
      <div className={styles.sentGrid}>
        <section className={styles.panelCard} aria-labelledby="ringkasan-judul">
          <div className={styles.cardHead}>
            <h2 id="ringkasan-judul">Ringkasan</h2>
            <span className={styles.pill} data-tone={status.tone}>{status.label}</span>
          </div>
          <dl className={styles.facts}>
            <div><dt>Ruangan</dt><dd>{meeting.room}</dd></div>
            <div><dt>PIC</dt><dd>{meeting.pic}</dd></div>
            {(meeting.guest || meeting.guestCount) && <div><dt>Tamu</dt><dd>{[meeting.guest, meeting.guestCount ? `${meeting.guestCount} orang` : ""].filter(Boolean).join(" · ")}</dd></div>}
            {meeting.round > 1 && <div><dt>Putaran</dt><dd>Tambahan ke-{meeting.round - 1}</dd></div>}
          </dl>
          <ul className={styles.summary}>
            {meeting.items.map(item => (
              <li key={item.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- prototype stand-in photos */}
                <img src={photo(item.slug)} alt="" width={44} height={44} />
                <span className={styles.grow}>
                  <strong>{item.qty}× {DRINK[item.slug]?.name}</strong>
                  <span>{optionsLabel(item.temperature, item.sugar, item.ice)}</span>
                </span>
                <span className={styles.tag} data-for={item.for}>{item.for === "tamu" ? `Tamu${item.person ? ` · ${item.person}` : ""}` : `Tim · rapat · ${plain(item.person ?? "")}`}</span>
              </li>
            ))}
          </ul>
          <p className={styles.total}>{countLabel(meeting.items)}</p>
        </section>

        <section className={styles.panelCard} aria-labelledby="progres-judul">
          <h2 id="progres-judul">Perkembangan</h2>
          <ol className={styles.timeline} aria-live="polite">
            {steps.map((step, index) => {
              const now = meeting.status === "diproses" ? index === 1 : done ? index === 2 : false;
              return (
                <li key={step.label} data-done={step.done || undefined} data-now={now || undefined} data-failed={step.failed || undefined} data-ready={done || undefined}>
                  <span className={styles.node} aria-hidden>{step.done ? <Check size={14} /> : step.failed ? <X size={14} /> : null}</span>
                  <span><strong>{step.label}</strong>{step.note && <span>{step.note}</span>}</span>
                </li>
              );
            })}
          </ol>
          {meeting.status === "ditolak" && (
            <div className={styles.reason}>
              <strong>Catatan dari {meeting.doneBy ? shortName(meeting.doneBy) : "pengelola"}</strong>
              <p>{meeting.reason}</p>
              <span>Kabari PIC, lalu buat pesanan pengganti lewat Tambah lagi.</span>
            </div>
          )}
          {done && (
            <div className={styles.location}>
              <PantryMap />
              <span><span className={styles.mutedSmall}>Lokasi mesin</span><strong>Pantry, lantai ini</strong>
                <span>{ice ? `${ice} minuman Es: tambahkan es di pantry sebelum diantar.` : "Semua panas, langsung antar ke ruangan."}</span></span>
            </div>
          )}
          {meeting.status === "diproses" && (
            <p className={styles.infoBox}><Info aria-hidden size={20} /><span>Pesanan masuk ke semua pengelola Werkudara Coffee. Siapa pun yang lebih dulu membuka akan memprosesnya, lalu layar ini berubah.</span></p>
          )}
          <div className={styles.sentActions}>
            <button type="button" className={`${styles.primary} ${styles.big}`} onClick={onMore}><Plus aria-hidden size={22} />Tambah lagi untuk rapat ini</button>
            <button type="button" className={styles.secondary} onClick={onHome}>Ke beranda</button>
          </div>
        </section>
      </div>
    </div>
  );
}

function PantryMap() {
  const pantry = PLAN_SPOTS[MACHINE_SPOT].rect;
  const { x: cx, y: cy } = centre(pantry);
  return (
    <svg className={styles.pantryMap} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role="img" aria-label="Denah kantor, pantry ditandai">
      <rect x={BUILDING.x} y={BUILDING.y} width={BUILDING.w} height={BUILDING.h} className={styles.mapBuilding} />
      {Object.entries(PLAN_SPOTS).map(([key, spot]) => spot.shape
        ? <polygon key={key} points={spot.shape.map(point => point.join(",")).join(" ")} className={styles.mapOther} />
        : <rect key={key} x={spot.rect.x} y={spot.rect.y} width={spot.rect.w} height={spot.rect.h} className={key === MACHINE_SPOT ? styles.mapPantry : styles.mapOther} />)}
      <g transform={`translate(${cx} ${cy})`} className={styles.mapPin}>
        <circle r="150" opacity=".2" />
        <MapPin x={-130} y={-250} width={260} height={260} strokeWidth={2.4} />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ serahkan ke tamu: buku menu */

type Pick = { slug: string; temperature: Temperature; sugar: Sugar; ice: Ice; name: string };

/**
 * The guest's menu book: a black cover with the gold Pegasus, then paper pages. Guests read "Anda",
 * never see quota words or employee data (only the PIC GA chose). Leaving needs GA's confirmation;
 * the final design asks for the GA PIN there.
 */
function GuestBook({ draft, onDone }: { draft: Draft; onDone: (lines: Line[]) => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<DrinkGroup>("kopi");
  const [drink, setDrink] = useState<Drink | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [thanks, setThanks] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => { pageRef.current?.focus(); }, [open, drink, thanks, group]);

  const finish = () => onDone(picks.map(pick => ({
    id: newLineId(), for: "tamu", slug: pick.slug, temperature: pick.temperature, sugar: pick.sugar, ice: pick.ice, qty: 1, person: pick.name.trim() || undefined,
  })));
  const drinks = DRINKS.filter(item => item.group === group);
  const split = Math.ceil(drinks.length * 0.4);
  const greeting = draft.guest ? <>Disajikan khusus untuk <em>{draft.guest}</em></> : <>Selamat datang di Werkudara</>;

  return (
    <div className={styles.book} role="dialog" aria-modal aria-label="Buku menu tamu">
      <div className={styles.bookBar}>
        <button type="button" className={styles.bookExit} onClick={() => setConfirm(true)}><Lock aria-hidden size={16} />Mode GA</button>
      </div>

      {!open ? (
        <button type="button" className={styles.cover} onClick={() => setOpen(true)} aria-label="Buka buku menu">
          <span className={styles.coverFrame} aria-hidden />
          <span className={styles.goldMark} aria-hidden />
          <span className={styles.coverHint}>Ketuk untuk membuka</span>
        </button>
      ) : (
        <div className={styles.spread} ref={pageRef} tabIndex={-1}>
          {thanks ? (
            <>
              <div className={styles.page}>
                <div className={styles.pageCentre}>
                  <span className={styles.goldMarkSmall} aria-hidden />
                  <h2 className={styles.bookTitle}>Pilihan Anda sudah kami terima</h2>
                  <Ornament />
                  <p className={styles.bookLead}>Terima kasih. Minuman Anda segera kami siapkan dan antar ke {draft.room}.</p>
                </div>
              </div>
              <div className={styles.page}>
                <h3 className={styles.bookHeading}>Pilihan di meja ini</h3>
                <ul className={styles.pickList}>
                  {picks.map((pick, index) => (
                    <li key={index}>
                      <span className={styles.grow}><strong>{DRINK[pick.slug].name}</strong><span>{optionsLabel(pick.temperature, pick.sugar, pick.ice)}</span></span>
                      {pick.name.trim() && <span className={styles.pickName}>{pick.name.trim()}</span>}
                    </li>
                  ))}
                </ul>
                <div className={styles.bookActions}>
                  <button type="button" className={styles.inkButton} onClick={() => { setThanks(false); setDrink(null); }}>Tamu berikutnya memilih</button>
                  <button type="button" className={styles.lineButton} onClick={() => setConfirm(true)}>Serahkan kembali ke GA</button>
                </div>
              </div>
            </>
          ) : drink ? (
            <GuestOptions drink={drink} onBack={() => setDrink(null)} onPick={pick => { setPicks(list => [...list, pick]); setThanks(true); }} />
          ) : (
            <>
              <div className={styles.page}>
                <span className={styles.goldMarkSmall} aria-hidden />
                <p className={styles.greeting}>{greeting}</p>
                <p className={styles.bookMeta}>Bersama {draft.pic} · {draft.room}</p>
                <h2 className={styles.bookTitle}>{group === "kopi" ? "Kopi" : "Non-kopi"}</h2>
                <Ornament />
                <p className={styles.bookLead}>Silakan pilih minuman Anda. Ketuk untuk mengatur suhu dan gula.</p>
                <BookItems drinks={drinks.slice(0, split)} onPick={setDrink} />
              </div>
              <div className={styles.page}>
                <div className={styles.ribbons} role="tablist" aria-label="Bagian menu">
                  <button type="button" role="tab" aria-selected={group === "kopi"} onClick={() => setGroup("kopi")}>Kopi</button>
                  <button type="button" role="tab" aria-selected={group === "non-kopi"} onClick={() => setGroup("non-kopi")}>Non-kopi</button>
                </div>
                <BookItems drinks={drinks.slice(split)} onPick={setDrink} />
                {picks.length > 0 && (
                  <div className={styles.picksBar}>
                    <span>{picks.length} pilihan sudah tercatat</span>
                    <button type="button" className={styles.lineButton} onClick={() => setThanks(true)}>Lihat pilihan</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {confirm && <ExitDialog count={picks.length} onStay={() => setConfirm(false)} onLeave={finish} />}
    </div>
  );
}

function Ornament() {
  return (
    <svg className={styles.ornament} viewBox="0 0 160 12" aria-hidden>
      <line x1="0" y1="6" x2="66" y2="6" /><path d="M80 1 L85 6 L80 11 L75 6 Z" /><line x1="94" y1="6" x2="160" y2="6" />
    </svg>
  );
}

function BookItems({ drinks, onPick }: { drinks: Drink[]; onPick: (drink: Drink) => void }) {
  return (
    <ul className={styles.bookItems}>
      {drinks.map(drink => (
        <li key={drink.slug}>
          <button type="button" onClick={() => onPick(drink)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- prototype stand-in photos */}
            <img src={photo(drink.slug)} alt="" width={72} height={72} />
            <span><strong>{drink.name}</strong><span>{drink.description}</span></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function GuestOptions({ drink, onBack, onPick }: { drink: Drink; onBack: () => void; onPick: (pick: Pick) => void }) {
  const [temperature, setTemperature] = useState<Temperature>(drink.temperatures[0]);
  const [sugar, setSugar] = useState<Sugar>("Normal");
  const [ice, setIce] = useState<Ice>("Normal");
  const [name, setName] = useState("");
  return (
    <>
      <div className={styles.page}>
        <button type="button" className={styles.bookBack} onClick={onBack}><ChevronLeft aria-hidden size={20} />Kembali ke menu</button>
        {/* eslint-disable-next-line @next/next/no-img-element -- prototype stand-in photos */}
        <img className={styles.bookPhoto} src={photo(drink.slug)} alt={drink.name} width={360} height={360} />
        <h2 className={styles.bookTitle}>{drink.name}</h2>
        <Ornament />
        <p className={styles.bookLead}>{drink.description}</p>
      </div>
      <div className={styles.page}>
        <h3 className={styles.bookHeading}>Atur sesuai selera Anda</h3>
        {drink.temperatures.length > 1 ? (
          <fieldset className={styles.bookField}>
            <legend>Suhu</legend>
            <div className={styles.bookOptions} data-cols="2">
              <BookOption on={temperature === "panas"} onClick={() => setTemperature("panas")}>Panas</BookOption>
              <BookOption on={temperature === "es"} onClick={() => setTemperature("es")}>Es</BookOption>
            </div>
          </fieldset>
        ) : <p className={`${styles.bookMeta} ${styles.bookNote}`}>Disajikan {drink.temperatures[0] === "es" ? "dingin dengan es" : "panas"}.</p>}
        <fieldset className={styles.bookField}>
          <legend>Gula</legend>
          <div className={styles.bookOptions} data-cols="3">
            {SUGAR_LEVELS.map(level => <BookOption key={level} on={sugar === level} onClick={() => setSugar(level)}>{level}</BookOption>)}
          </div>
        </fieldset>
        {temperature === "es" && (
          <fieldset className={styles.bookField}>
            <legend>Takaran es</legend>
            <div className={styles.bookOptions} data-cols="3">
              {ICE_LEVELS.map(level => <BookOption key={level} on={ice === level} onClick={() => setIce(level)}>{level}</BookOption>)}
            </div>
          </fieldset>
        )}
        <label className={styles.bookLabel} htmlFor="tamu-nama">Nama Anda <span>(opsional, agar minuman tidak tertukar)</span></label>
        <input id="tamu-nama" className={styles.bookInput} value={name} onChange={event => setName(event.target.value)} autoComplete="off" />
        <div className={styles.bookActions}>
          <button type="button" className={styles.inkButton} onClick={() => onPick({ slug: drink.slug, temperature, sugar, ice, name })}>Pilih minuman ini</button>
        </div>
      </div>
    </>
  );
}

function BookOption({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={styles.bookOption} aria-pressed={on} onClick={onClick}>{children}</button>;
}

function ExitDialog({ count, onStay, onLeave }: { count: number; onStay: () => void; onLeave: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, onStay);
  return (
    <div className={styles.scrim} data-dark onClick={onStay}>
      <div ref={ref} className={styles.dialog} data-small role="alertdialog" aria-modal aria-labelledby="keluar-judul" aria-describedby="keluar-isi" onClick={event => event.stopPropagation()}>
        <h2 id="keluar-judul">Kembali ke mode GA?</h2>
        <p id="keluar-isi">{count ? `${count} pilihan tamu dimasukkan ke pesanan. Periksa lalu kirim dari layar GA.` : "Belum ada pilihan tamu."} Khusus petugas GA.</p>
        <p className={styles.mutedSmall}>Prototype: di versi akhir, keluar dari buku menu memakai PIN GA.</p>
        <div className={styles.dialogFoot}>
          <span className={styles.grow} />
          <button type="button" className={styles.secondary} data-autofocus onClick={onStay}>Tetap di buku menu</button>
          <button type="button" className={styles.primary} onClick={onLeave}>Ya, mode GA</button>
        </div>
      </div>
    </div>
  );
}
