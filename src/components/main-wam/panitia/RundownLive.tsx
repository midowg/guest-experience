"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarClock, CalendarX, Ellipsis, History, Lock, MapPin, RotateCcw } from "lucide-react";
import { ScreenContent, ShellActions } from "@/components/main-wam/shell";
import { Banner, Button, ConfirmDialog, DayTabs, EmptyState, IconButton, List, ListRow, Pill, Sheet, StatusPill, SwitchRow, TextField, useToast } from "@/components/main-wam/ui";
import { count, dayClock, editedLabel } from "@/lib/main-wam/panitia/format";
import { rowState, silentAction, silentLabel, type LiveSession, type ShiftPlan } from "@/lib/main-wam/panitia/rundown";
import { timeRange } from "@/lib/main-wam/rundown";
import type { RundownDay, RundownHistory } from "@/lib/server/main-wam/panitia/rundown";
import { errorText, useLiveRefresh, useOnline, usePanitiaApi, useServerState, type RundownChangeAnswer } from "./api";
import { UbahJamSheet } from "./UbahJamSheet";
import css from "./panitia.module.css";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";

export type RundownLiveProps = {
  migrated: boolean;
  day: number;
  days: RundownDay[];
  sessions: LiveSession[];
  history: RundownHistory[];
  recipients: number;
  now: string;
  /** The panitia's own nama panggilan, for "diubah <nama>" right after a save. */
  me: string;
};

type Open =
  | { kind: "jam"; id: string }
  | { kind: "menu"; id: string }
  | { kind: "tempat"; id: string }
  | { kind: "batal"; id: string }
  | { kind: "kembali"; id: string }
  | { kind: "tutup"; id: string }
  | { kind: "riwayat" }
  | null;

/**
 * K02 Rundown live: the day's sessions (tabs for the four days), "diubah Dimas · 08.05" on what was
 * changed, Ubah jam (K03 sheet) and a menu per session (Pindah tempat, Batalkan sesi), Buka/Tutup on
 * a Silent Meeting row (area D's control). Other panitia's changes show within a minute; the
 * screen pauses that while a sheet is open.
 */
export function RundownLive(props: RundownLiveProps) {
  const api = usePanitiaApi();
  const toast = useToast();
  const online = useOnline();
  const [sessions, setSessions] = useServerState(props.sessions);
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState(false);
  const [place, setPlace] = useState("");
  const [notify, setNotify] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  // The session Ubah jam was last opened for: its sheet stays mounted after closing, so focus goes
  // back to that row's "Ubah jam" (audit T-K01).
  const [timeFor, setTimeFor] = useState<string | null>(null);
  const now = useMemo(() => new Date(props.now), [props.now]);
  const refresh = useCallback(() => api.refresh(), [api]);
  useLiveRefresh(refresh, 60_000, open !== null || busy);

  const selected = open && "id" in open ? sessions.find(session => session.id === open.id) ?? null : null;
  const timeSession = timeFor ? sessions.find(session => session.id === timeFor) ?? null : null;
  const close = () => { setOpen(null); setFailure(null); };
  // From the menu sheet straight to the next sheet or dialog: the kit hands over history and focus.
  const next = (target: Open) => setOpen(target);
  const stamp = (session: LiveSession, patch: Partial<LiveSession>, versions: Record<string, string>): LiveSession =>
    ({ ...session, ...patch, version: versions[session.id] ?? session.version, changedAt: new Date().toISOString(), changedByName: props.me });

  function savedTimes(plan: ShiftPlan, answer: RundownChangeAnswer, told: boolean) {
    const moved = new Map(plan.moved.map(move => [move.id, move]));
    setSessions(current => current.map(session => {
      if (selected && session.id === selected.id) return stamp(session, { startsAt: plan.startsAt!, endsAt: plan.endsAt }, answer.versions);
      const move = moved.get(session.id);
      return move ? stamp(session, { startsAt: move.startsAt, endsAt: move.endsAt }, answer.versions) : session;
    }));
    close();
    announce(answer, told);
  }
  function announce(answer: RundownChangeAnswer, told: boolean) {
    if (told && answer.recipients > 0) toast.show({ text: `Kabar terkirim ke ${count(answer.recipients)} orang`, tone: "success" });
    else if (told) toast.show({ text: "Jadwal tersimpan", sub: "Kabar belum terkirim. Kirim lewat Pengumuman bila perlu.", tone: "success" });
    else toast.show({ text: "Jadwal tersimpan", tone: "success" });
    api.refresh();
  }

  async function change(action: "tempat" | "batal" | "kembali") {
    if (!selected || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const input = action === "tempat" ? { action, version: selected.version, place: place.trim(), notify } : { action, version: selected.version, notify };
      const answer = await api.changeSession(selected.id, input);
      setSessions(current => current.map(session => session.id !== selected.id ? session
        : stamp(session, action === "tempat" ? { place: place.trim() } : { status: action === "batal" ? "batal" : "terbit" }, answer.versions)));
      close();
      announce(answer, notify);
    } catch (error) {
      setFailure(errorText(error));
    } finally { setBusy(false); }
  }

  async function silent(session: LiveSession, action: "buka" | "tutup") {
    if (!session.silent || busy) return;
    setBusy(true);
    try {
      await api.silent(session.silent.questionId, action);
      // No count here: it shows only after the next read, once closed for good (audit H2).
      setSessions(current => current.map(item => item.id === session.id && item.silent ? { ...item, silent: { ...item.silent, state: action === "buka" ? "buka" : "tutup", count: null } } : item));
      close();
      toast.show({ text: action === "buka" ? "Silent Meeting dibuka" : "Silent Meeting ditutup", tone: "success" });
      api.refresh();
    } catch (error) {
      close();
      toast.show({ text: errorText(error), tone: "error" });
    } finally { setBusy(false); }
  }

  return <ScreenContent>
    <ShellActions><IconButton icon={History} label="Riwayat perubahan" onClick={() => setOpen({ kind: "riwayat" })} /></ShellActions>
    {!online && <Banner tone="offline" title="Tidak ada koneksi">Jadwal yang tampil mungkin belum yang terbaru.</Banner>}
    {!props.migrated && <Banner tone="info" title="Menunggu pembaruan sistem">Rundown live aktif setelah pembaruan sistem dijalankan.</Banner>}
    {props.days.length > 0 && <DayTabs label="Hari" days={props.days} current={String(props.day)} />}
    {sessions.length === 0
      ? <EmptyState icon={<CalendarClock />} title="Belum ada sesi di hari ini." size="s">Rundown diisi lewat {WAM_EVENT_ADMIN_LABEL}.</EmptyState>
      : <List inset={16} label="Sesi">
        {sessions.map(session => <RundownRow key={session.id} session={session} now={now} busy={busy}
          onTime={() => { setTimeFor(session.id); setOpen({ kind: "jam", id: session.id }); }}
          onMenu={() => { setPlace(session.place); setNotify(true); setOpen({ kind: "menu", id: session.id }); }}
          onSilent={action => (action === "tutup" ? setOpen({ kind: "tutup", id: session.id }) : silent(session, "buka"))} />)}
      </List>}

    {timeSession && <UbahJamSheet open={open?.kind === "jam"} session={timeSession} sameDay={sessions} recipients={props.recipients} api={api} onClose={close} onSaved={savedTimes} />}

    <Sheet open={open?.kind === "menu" && !!selected} onClose={close} title={selected?.title ?? "Sesi"} subtitle={selected ? timeRange(selected) : undefined} flush>
      <List plain inset={68} label="Pilihan sesi">
        {selected?.status === "batal"
          ? <ListRow icon={RotateCcw} title="Kembalikan sesi" onClick={() => { setNotify(true); next({ kind: "kembali", id: selected.id }); }} />
          : <>
            <ListRow icon={MapPin} title="Pindah tempat" onClick={() => selected && next({ kind: "tempat", id: selected.id })} />
            <ListRow icon={CalendarX} title="Batalkan sesi" onClick={() => selected && next({ kind: "batal", id: selected.id })} />
          </>}
      </List>
    </Sheet>

    <Sheet open={open?.kind === "tempat" && !!selected} onClose={close} locked={busy} title={`Pindah tempat · ${selected?.title ?? ""}`}
      footer={<>
        <Button block loading={busy} loadingLabel="Menyimpan…" disabled={place.trim().length < 2 || place.trim() === selected?.place} onClick={() => change("tempat")}>Simpan</Button>
        <Button block variant="text" onClick={close} disabled={busy}>Batal</Button>
      </>}>
      <div className={css.sheetBody}>
        {failure && <Banner tone="error" title={failure} />}
        <TextField label="Tempat" icon={<MapPin />} value={place} maxLength={200} onChange={event => setPlace(event.target.value)} />
        <List inset={16}><SwitchRow inList title="Kabari peserta" sub={`Notifikasi ke ${count(props.recipients)} orang`} checked={notify} onChange={setNotify} /></List>
      </div>
    </Sheet>

    <ConfirmDialog open={open?.kind === "batal" && !!selected} onCancel={close} onConfirm={() => change("batal")} busy={busy} busyLabel="Membatalkan…" tone="danger" icon={CalendarX}
      title="Batalkan sesi ini?" body={failure ?? "Sesi tampil dicoret di Agenda. Peserta diberi kabar."} confirmLabel="Batalkan sesi" cancelLabel="Kembali" />
    <ConfirmDialog open={open?.kind === "kembali" && !!selected} onCancel={close} onConfirm={() => change("kembali")} busy={busy} busyLabel="Menyimpan…"
      title="Kembalikan sesi ini?" body={failure ?? "Sesi tampil lagi di Agenda. Peserta diberi kabar."} confirmLabel="Kembalikan" />
    <ConfirmDialog open={open?.kind === "tutup" && !!selected} onCancel={close} onConfirm={() => selected && silent(selected, "tutup")} busy={busy} busyLabel="Menutup…" tone="danger" icon={Lock}
      title="Tutup sekarang?" body="Peserta tidak bisa mengirim masukan lagi. Silent Meeting tidak bisa dibuka lagi." confirmLabel="Tutup" />

    <Sheet open={open?.kind === "riwayat"} onClose={close} title="Riwayat perubahan" flush>
      {props.history.length === 0
        ? <EmptyState icon={<History />} title="Belum ada perubahan." size="s" headingLevel={3} />
        : <List plain inset={16} label="Perubahan">
          {props.history.map(entry => <div key={entry.id} className={css.history}>
            <span className={css.historyTitle}>{entry.title}</span>
            <span className={css.historyText}>{entry.text}</span>
            <span className={css.historyMeta}>{[entry.by, dayClock(entry.at, now), entry.notified ? `dikabari ${count(entry.recipients)} orang` : null].filter(Boolean).join(" · ")}</span>
          </div>)}
        </List>}
    </Sheet>
  </ScreenContent>;
}

/** One session of Rundown live (.wam-rundownrow). */
export function RundownRow({ session, now, busy, onTime, onMenu, onSilent }: {
  session: LiveSession; now: Date; busy?: boolean;
  onTime: () => void; onMenu: () => void; onSilent: (action: "buka" | "tutup") => void;
}) {
  const state = rowState(session, now);
  const silentState = session.silent ? silentAction(session.silent, session) : null;
  const live = state === "live" || session.silent?.state === "buka";
  const place = session.optional ? `Opsional · ${session.place}` : session.place;
  return <div id={`sesi-${session.id}`} className={[css.rrow, live && state !== "cancelled" ? css.rrowLive : "", state === "done" ? css.rrowDone : "", state === "cancelled" ? css.rrowCancelled : ""].filter(Boolean).join(" ")}>
    <div className={css.rrowText}>
      <span className={css.rrowTime}>{timeRange(session)}</span>
      <span className={css.rrowTitle}>{session.title}</span>
      <span className={css.rrowMeta}>
        {place && <span className={css.rrowPlace}>{place}</span>}
        {state === "cancelled" ? <StatusPill status="cancelled" />
          : session.silent ? (session.silent.state === "buka" ? <Pill tone="success" dot>{silentLabel(session.silent)}</Pill> : <Pill icon={<Lock />}>{silentLabel(session.silent)}</Pill>)
            : state === "done" ? <StatusPill status="done" /> : state === "live" ? <StatusPill status="live" /> : null}
        {session.changedAt && session.changedByName && <span className={css.edited}><History aria-hidden />{editedLabel(session.changedByName, session.changedAt, now)}</span>}
      </span>
    </div>
    {state !== "done" && <div className={css.rrowActions}>
      {silentState && <Button variant="tonal" size="m" className={css.rrowModule} disabled={busy} onClick={() => onSilent(silentState)}
        aria-label={`${silentState === "buka" ? "Buka" : "Tutup"} ${session.title}`}>{silentState === "buka" ? "Buka" : "Tutup"}</Button>}
      {state !== "cancelled" && <Button variant="text" size="m" onClick={onTime} aria-label={`Ubah jam ${session.title}`}>Ubah jam</Button>}
      {/* While its Silent Meeting is open the row keeps Tutup and Ubah jam only (prototype K02__status). */}
      {session.silent?.state !== "buka" && <IconButton icon={Ellipsis} label={`Pilihan sesi ${session.title}`} onClick={onMenu} />}
    </div>}
  </div>;
}
