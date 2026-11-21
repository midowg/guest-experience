"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { CircleCheck, QrCode, Search, UserCheck } from "lucide-react";
import { ScreenContent, ShellActions } from "@/components/main-wam/shell";
import { Avatar, Banner, Button, ConfirmDialog, EmptyState, IconButton, List, ListRow, Segmented, SelectField, Sheet, SrOnly, Text, TextField, useToast } from "@/components/main-wam/ui";
import { attendeeLine, mayUndo, presentLine, searchAttendees, splitAttendance, type AttendeeRow } from "@/lib/main-wam/panitia/attendance";
import { count } from "@/lib/main-wam/panitia/format";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import type { AttendanceData } from "@/lib/server/main-wam/panitia/attendance";
import { errorText, useLiveRefresh, useOnline, usePanitiaApi, useServerState } from "./api";
import { Bar, EmptyBlock } from "./parts";
import css from "./panitia.module.css";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";

type Tab = "belum" | "hadir";

/**
 * K05 Absen sesi: one session that takes attendance (picked in a sheet), "112 dari 120 hadir",
 * Belum hadir / Hadir, Cari nama, "Catat hadir" (with Urungkan), and on the Hadir tab how each one
 * checked in (Scan QR, Dicatat panitia); tapping someone panitia recorded offers "Batalkan hadir"
 * (a QR scan is the person's own and cannot be taken back here: audit L8). Scans show here within
 * 20 seconds; "Tampilkan QR sesi" is area D's printable QR.
 */
export function AbsenManual(props: AttendanceData & { initialTab?: Tab }) {
  const api = usePanitiaApi();
  const toast = useToast();
  const online = useOnline();
  const session = props.session;
  const [rows, setRows] = useServerState(props.rows);
  const [tab, setTab] = useState<Tab>(props.initialTab ?? "belum");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [cancel, setCancel] = useState<AttendeeRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const pending = useRef(0);
  const undoHint = useId();

  const poll = useCallback(() => {
    if (!session || pending.current > 0) return;
    api.attendance(session.id).then(answer => { if (pending.current === 0) setRows(answer.rows); setStale(false); }, () => setStale(true));
  }, [api, session, setRows]);
  useLiveRefresh(poll, 20_000, picking || cancel !== null);

  const { absent, present } = useMemo(() => splitAttendance(rows), [rows]);
  const shown = searchAttendees(tab === "belum" ? absent : present, query);
  const total = rows.length;

  async function record(person: AttendeeRow, value: boolean) {
    if (!session) return;
    const before = rows;
    pending.current += 1;
    setBusy(person.id);
    setRows(current => current.map(row => row.id !== person.id ? row : value ? { ...row, checkedInAt: new Date().toISOString(), method: "manual" } : { ...row, checkedInAt: null, method: null }));
    try {
      const answer = await api.setPresent(session.id, { employeeId: person.id, present: value });
      pending.current -= 1;
      if (pending.current === 0) setRows(answer.rows);
      if (value) toast.show({ text: `${person.name} dicatat hadir`, tone: "success", action: { label: "Urungkan", onAction: () => { void record(person, false); } } });
      else toast.show({ text: `${person.name} kembali ke Belum hadir`, tone: "success" });
    } catch (error) {
      pending.current -= 1;
      setRows(before);
      toast.show({ text: errorText(error), tone: "error" });
    } finally { setBusy(null); setCancel(null); }
  }

  if (!props.migrated && !session) return <ScreenContent><Banner tone="info" title="Menunggu pembaruan sistem">Absen sesi aktif setelah pembaruan sistem dijalankan.</Banner></ScreenContent>;
  if (!session) return <ScreenContent><EmptyState icon={<UserCheck />} title="Belum ada sesi yang memakai absen.">Tandai sesi &ldquo;pakai absen&rdquo; di {WAM_EVENT_ADMIN_LABEL}.</EmptyState></ScreenContent>;

  const percent = total ? Math.round((present.length / total) * 100) : 0;
  return <ScreenContent>
    <ShellActions><IconButton icon={QrCode} label="Tampilkan QR sesi" href={mainWamApi.sessionQr(session.id)} external /></ShellActions>
    {(!online || stale) && <Banner tone="offline" title="Tidak ada koneksi">Daftar hadir mungkin belum yang terbaru.</Banner>}
    {!props.migrated && <Banner tone="info" title="Menunggu pembaruan sistem">Absen sesi aktif setelah pembaruan sistem dijalankan.</Banner>}
    <SelectField label="Sesi" className={css.noLabel} value={session.label} onClick={() => setPicking(true)} expanded={picking} />
    <div className={css.summary}>
      <Text as="h2" variant="title">{count(present.length)} dari {count(total)} hadir</Text>
      <Bar value={percent} label={`${percent}% hadir`} />
      <Text variant="caption" color="2">{session.caption}</Text>
    </div>
    <div className={css.tools}>
      <Segmented<Tab> label="Tampilkan" value={tab} onChange={value => setTab(value)}
        options={[{ value: "belum", label: `Belum hadir (${count(absent.length)})` }, { value: "hadir", label: `Hadir (${count(present.length)})` }]} />
      <TextField label={<SrOnly>Cari nama</SrOnly>} className={css.noLabel} search icon={<Search />} placeholder="Cari nama" value={query} onChange={event => setQuery(event.target.value)} type="search" enterKeyHint="search" autoComplete="off" />
      {!session.canRecord && tab === "belum" && <Text variant="caption" color="2">Catat hadir bisa setelah absen dibuka.</Text>}
      {tab === "hadir" && present.length > 0 && <Text id={undoHint} variant="caption" color="2">Ketuk nama yang dicatat panitia untuk membatalkan. Scan QR tidak bisa dibatalkan.</Text>}
      {shown.length > 0
        ? <List label={tab === "belum" ? "Belum hadir" : "Hadir"}>
          {shown.map(person => tab === "belum"
            ? <ListRow key={person.id} className={css.person} leading={<Avatar name={person.name} photo={person.photo} />} title={person.name} sub={attendeeLine(person)}
              trailing={<Button variant="secondary" size="m" loading={busy === person.id} disabled={!session.canRecord || (busy !== null && busy !== person.id)} onClick={() => record(person, true)}
                aria-label={`Catat hadir ${person.name}`}>Catat hadir</Button>} />
            : <ListRow key={person.id} leading={<Avatar name={person.name} photo={person.photo} />} title={person.name} sub={presentLine(person)} chevron={false}
              trailing={<CircleCheck className={css.ok} role="img" aria-label="Hadir" />}
              {...(mayUndo(person) ? { onClick: () => setCancel(person), "aria-describedby": undoHint } : {})} />)}
        </List>
        : query.trim()
          ? <EmptyBlock icon={<Search />} title="Tidak ada nama yang cocok." level={3} />
          : tab === "belum"
            ? <EmptyBlock icon={<CircleCheck />} tone="success" title="Semua sudah hadir." level={3} />
            : <EmptyBlock icon={<UserCheck />} title="Belum ada yang hadir." level={3} />}
    </div>

    <Sheet open={picking} onClose={() => setPicking(false)} title="Pilih sesi" flush history={false}>
      <List plain inset={16} label="Sesi yang memakai absen">
        {props.sessions.map(option => <ListRow key={option.id} title={option.title} sub={[option.day, option.time, option.required ? "wajib" : null].filter(Boolean).join(" · ")}
          href={mainWamPath.attendanceManual(option.id)} onClick={() => setPicking(false)} chevron={false} aria-current={option.id === session.id ? "true" : undefined}
          trailing={option.id === session.id ? <CircleCheck className={css.ok} aria-hidden /> : undefined} />)}
      </List>
    </Sheet>
    <ConfirmDialog open={cancel !== null} onCancel={() => setCancel(null)} onConfirm={() => cancel && record(cancel, false)} busy={busy !== null} busyLabel="Menyimpan…"
      title={`Batalkan hadir ${cancel?.name ?? ""}?`} body={`${cancel?.name ?? "Orang ini"} kembali ke Belum hadir.`} confirmLabel="Batalkan hadir" cancelLabel="Kembali" tone="danger" icon={UserCheck} />
  </ScreenContent>;
}
