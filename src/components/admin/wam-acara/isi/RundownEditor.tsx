"use client";

import { useCallback, useMemo, useState } from "react";
import { CalendarPlus, ClipboardPaste, Copy, MapPin, MoveVertical, Pencil, Plus, Shirt, Trash2 } from "lucide-react";
import { ConsoleButton, PageHeader, Pill, SegmentedControl, type Crumb } from "@/components/console";
import { adminRequest } from "@/components/admin/shared/api";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { sessionKindLabels, sessionModuleLabels, sessionStatusLabels, shortDate } from "@/lib/main-wam/admin/labels";
import type { AdminPerson } from "@/lib/main-wam/admin/people";
import { keepsData, overlaps, parseRundownPaste, RUNDOWN_COLUMN_ORDER, rundownColumnLabels, usageWords, type AdminSession, type SessionInput } from "@/lib/main-wam/admin/rundown";
import { byStart, timeRange, wibDate, wibTime } from "@/lib/main-wam/rundown";
import type { MwSession, RundownChange } from "@/lib/main-wam/types";
import { mainWamAdminApi } from "@/lib/routes";
import { ContentTabs, dayOptionLabel, MessageLine, useRun, Waiting, type Message } from "./fields";
import { PasteSheet } from "./PasteSheet";
import { CopySheet, SessionSheet, ShiftSheet, type GuideOption } from "./RundownSheets";
import { SheetError } from "./Sheet";
import css from "./isi.module.css";

type SheetState = { type: "edit"; session: AdminSession | null; cancel?: boolean } | { type: "import" } | { type: "shift" } | { type: "copy"; session: AdminSession } | null;
type SessionsAnswer = { sessions: AdminSession[]; recipients?: number; id?: string };

const statusTone = { draf: "neutral", terbit: "ok", batal: "bad" } as const;
const dot = (time: string) => time.replace(":", ".");

/**
 * Admin WAM 2027 → Rundown (agen E): the four days as a timeline, one day at a time; Tambah
 * and Ubah in a sheet (everything Detail sesi shows: tempat + denah, dresscode, yang perlu dibawa,
 * urutan tampil, konsumsi, kontak panitia, absen, wajib, modul, status), Salin to a day, Geser jam
 * for several sessions (each from the version on screen: a session changed in Rundown live since is
 * not moved, audit S7), and Impor from a pasted sheet with every row checked first. A change to a
 * published session is logged ("diubah oleh") and can be told to participants. Hapus is off for a
 * session that already has absen, photos, Silent Meeting or Awarding: it says why and offers
 * Batalkan instead (audit M4).
 */
export function RundownEditor({ initial, migrated, dates, people, guides, log: initialLog, today, crumbs, title }: {
  initial: AdminSession[]; migrated: boolean; dates: readonly string[]; people: readonly AdminPerson[]; guides: readonly GuideOption[];
  log: readonly RundownChange[]; today: string; crumbs: readonly Crumb[]; title: string;
}) {
  const [sessions, setSessions] = useState(() => [...initial].sort(byStart));
  const [log, setLog] = useState(initialLog);
  const [day, setDay] = useState(() => String(Math.max(0, dates.indexOf(today))));
  const [sheet, setSheet] = useState<SheetState>(null);
  const [message, setMessage] = useState<Message>(null);
  const { busy, run } = useRun(setMessage);
  const [confirm, confirmDialog] = useConfirm();
  const names = useMemo(() => new Map(people.map(person => [person.id, person.fullName])), [people]);
  const date = dates[Number(day)] ?? dates[0];
  const ofDay = sessions.filter(session => wibDate(session.startsAt) === date);
  const outside = sessions.filter(session => !dates.includes(wibDate(session.startsAt)));
  const clashing = useMemo(() => overlaps(sessions), [sessions]);
  const counts = (list: AdminSession[]) => ({ terbit: list.filter(item => item.status === "terbit").length, draf: list.filter(item => item.status === "draf").length });

  const apply = useCallback((answer: SessionsAnswer) => setSessions([...answer.sessions].sort(byStart)), []);
  const send = async (url: string, method: string, body?: unknown) => (await adminRequest<SessionsAnswer>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) }));
  const remember = (session: MwSession, changes: RundownChange["changes"], recipients: number) => {
    if (changes.length) setLog(current => [{ id: `lokal-${Date.now()}`, sessionId: session.id, changes, notified: recipients > 0, recipients, changedBy: null, changedAt: new Date().toISOString() }, ...current]);
  };

  async function save(before: AdminSession | null, input: SessionInput, notify: boolean, changes: RundownChange["changes"]): Promise<boolean> {
    return run("simpan", async () => {
      const result = before ? await send(mainWamAdminApi.session(before.id), "PUT", { session: input, notify, version: before.version }) : await send(mainWamAdminApi.sessions, "POST", { action: "tambah", session: input });
      apply(result.data!);
      if (before) remember(before, changes, result.data!.recipients ?? 0);
      const index = dates.indexOf(input.date);
      if (index >= 0) setDay(String(index));
      setSheet(null);
      return result.message;
    });
  }
  async function remove(session: AdminSession) {
    if (keepsData(session.usage)) {
      // Hapus is off: say why, and offer Batalkan (the records stay, participants see it crossed out).
      if (session.status === "batal") { setMessage({ tone: "warning", text: `${session.title} sudah dibatalkan dan tetap di rundown (dicoret), karena sudah punya ${usageWords(session.usage)}.` }); return; }
      const cancel = await confirm({
        title: "Sesi ini tidak bisa dihapus", confirmLabel: "Batalkan sesi", cancelLabel: "Tutup",
        body: `${session.title} sudah punya ${usageWords(session.usage)}. Batalkan sesinya: catatannya tetap ada dan peserta melihatnya dicoret di Agenda.`,
      });
      if (cancel) setSheet({ type: "edit", session, cancel: true });
      return;
    }
    const groups = session.usage?.activityGroups ?? 0;
    const ok = await confirm({
      title: "Hapus sesi?", confirmLabel: "Hapus sesi", danger: true,
      body: `${session.status === "draf" ? `${session.title} dihapus dari rundown.` : `${session.title} sudah terbit. Kalau acaranya batal, lebih baik ubah statusnya menjadi Batal supaya peserta melihatnya dicoret. Hapus tetap?`}${groups ? ` ${groups} kelompok kegiatannya ikut terhapus.` : ""}`,
    });
    if (ok) await run(`hapus-${session.id}`, async () => { const result = await send(mainWamAdminApi.session(session.id), "DELETE"); apply(result.data!); return result.message; });
  }

  const dayOptions = dates.map((value, index) => ({ value: String(index), label: `Hari ${index + 1} · ${shortDate(value)}` }));
  const { terbit, draf } = counts(ofDay);
  const parse = useCallback((text: string) => parseRundownPaste(text, { dates, people, existing: sessions, sortFrom: sessions.length }), [dates, people, sessions]);

  return <SheetError.Provider value={message?.tone === "error" ? message.text : null}><div className={css.page}>
    <PageHeader crumbs={crumbs} title={title} subtitle="Sesi empat hari acara. Yang terbit tampil di Agenda peserta; draf hanya di sini."
      actions={<>
        <ConsoleButton icon={<ClipboardPaste size={18} aria-hidden />} disabled={!migrated} onClick={() => setSheet({ type: "import" })}>Impor</ConsoleButton>
        <ConsoleButton variant="primary" icon={<Plus size={18} aria-hidden />} disabled={!migrated} onClick={() => setSheet({ type: "edit", session: null })}>Tambah sesi</ConsoleButton>
      </>} />
    <ContentTabs current="rundown" />
    {!migrated && <Waiting what="Rundown" />}
    <MessageLine message={message} />

    <div className={css.toolbar}>
      <div className={css.days}><SegmentedControl label="Hari acara" value={day} onChange={setDay} options={dayOptions} /></div>
      <div className={css.toolbarGroup}>
        <ConsoleButton icon={<MoveVertical size={18} aria-hidden />} disabled={!migrated || !ofDay.length} onClick={() => setSheet({ type: "shift" })}>Geser jam</ConsoleButton>
      </div>
    </div>
    <ul className={css.summary} aria-label="Ringkasan hari ini">
      <li><strong>{ofDay.length}</strong> sesi</li>
      <li><strong>{terbit}</strong> terbit</li>
      <li><strong>{draf}</strong> draf</li>
      {ofDay.some(session => clashing.has(session.id)) && <li><Pill tone="bad">Ada sesi bentrok tempat</Pill></li>}
    </ul>

    {ofDay.length ? <ol className={css.timeline} aria-label={`Rundown ${dayOptionLabel(dates, date)}`}>
      {ofDay.map(session => <SessionRow key={session.id} session={session} names={names} clash={clashing.has(session.id)} busy={busy !== null}
        onEdit={() => setSheet({ type: "edit", session })} onCopy={() => setSheet({ type: "copy", session })} onDelete={() => void remove(session)} />)}
    </ol> : <div className={css.empty}>
      <h2>{migrated ? "Belum ada sesi di hari ini" : "Rundown belum bisa diisi"}</h2>
      <p>{migrated ? "Tambah satu per satu, atau tempel rundown dari Excel sekaligus." : "Halaman ini terbuka lagi setelah pembaruan sistem dijalankan."}</p>
      {migrated && <div className={css.emptyActions}>
        <ConsoleButton variant="primary" icon={<CalendarPlus size={18} aria-hidden />} onClick={() => setSheet({ type: "edit", session: null })}>Tambah sesi</ConsoleButton>
        <ConsoleButton icon={<ClipboardPaste size={18} aria-hidden />} onClick={() => setSheet({ type: "import" })}>Impor</ConsoleButton>
      </div>}
    </div>}

    {outside.length > 0 && <section className={css.section} aria-labelledby="mw-rundown-luar">
      <div className={css.sectionHead}><h2 id="mw-rundown-luar">Di luar hari acara</h2></div>
      <p className={css.note}>Tanggal acara berubah, jadi sesi ini tidak lagi masuk hari mana pun. Ubah harinya.</p>
      <ol className={css.timeline}>{outside.map(session => <SessionRow key={session.id} session={session} names={names} clash={false} busy={busy !== null} showDate
        onEdit={() => setSheet({ type: "edit", session })} onCopy={() => setSheet({ type: "copy", session })} onDelete={() => void remove(session)} />)}</ol>
    </section>}

    {sheet?.type === "edit" && <SessionSheet key={`${sheet.session?.id ?? "baru"}-${sheet.cancel ? "batal" : ""}`} session={sheet.session} cancel={sheet.cancel} dates={dates} date={date} people={people} guides={guides} names={names}
      log={sheet.session ? log.filter(entry => entry.sessionId === sheet.session!.id) : []} busy={busy === "simpan"}
      nextSort={ofDay.length ? Math.max(...ofDay.map(item => item.sort)) + 1 : 0}
      onClose={() => setSheet(null)} onSave={(input, notify, changes) => save(sheet.session, input, notify, changes)} />}
    {sheet?.type === "shift" && <ShiftSheet sessions={ofDay} dayLabel={dayOptionLabel(dates, date)} busy={busy === "geser"} onClose={() => setSheet(null)}
      onSave={(ids, minutes, notify) => run("geser", async () => {
        // Each with the version on screen: one changed since (Rundown live) is refused, nothing moves.
        const items = ids.map(id => ({ id, version: sessions.find(session => session.id === id)?.version ?? "" }));
        const result = await send(mainWamAdminApi.sessions, "POST", { action: "geser", items, minutes, notify });
        apply(result.data!);
        setSheet(null);
        return result.message;
      })} />}
    {sheet?.type === "copy" && <CopySheet session={sheet.session} dates={dates} busy={busy === "salin"} onClose={() => setSheet(null)}
      onSave={target => run("salin", async () => {
        const result = await send(mainWamAdminApi.session(sheet.session.id), "POST", { date: target });
        apply(result.data!);
        setDay(String(Math.max(0, dates.indexOf(target))));
        setSheet(null);
        return result.message;
      })} />}
    {sheet?.type === "import" && <PasteSheet<SessionInput> title="Impor rundown" subtitle="Satu sesi per baris. Sesi baru tersimpan sebagai draf kecuali kolom Status berisi Terbit."
      columns={RUNDOWN_COLUMN_ORDER.map(key => rundownColumnLabels[key])} parse={parse} busy={busy === "impor"}
      example={"Hari\tMulai\tSelesai\tJudul\tTempat\n2\t08.00\t12.00\tPemaparan departemen\tAula Utama\n2\t12.00\t13.00\tMakan siang\tResto lantai 1"}
      heads={["Hari", "Jam", "Judul", "Tempat", "Jenis", "Status"]}
      cells={input => [dayOptionLabel(dates, input.date), input.end ? `${dot(input.start)}–${dot(input.end)}` : dot(input.start), input.title, input.place || "—", sessionKindLabels[input.kind], sessionStatusLabels[input.status]]}
      saveLabel={count => `Simpan ${count} sesi`}
      onClose={() => setSheet(null)}
      onSave={result => void run("impor", async () => {
        const answer = await send(mainWamAdminApi.sessions, "POST", { action: "impor", sessions: result.rows.map(row => row.input!) });
        apply(answer.data!);
        setSheet(null);
        return answer.message;
      })} />}
    {confirmDialog}
  </div></SheetError.Provider>;
}

function SessionRow({ session, names, clash, busy, showDate = false, onEdit, onCopy, onDelete }: {
  session: AdminSession; names: Map<string, string>; clash: boolean; busy: boolean; showDate?: boolean; onEdit: () => void; onCopy: () => void; onDelete: () => void;
}) {
  // Kept: Hapus looks off and says why (hover, screen reader); pressing it explains and offers Batalkan.
  const kept = keepsData(session.usage);
  const reasonId = `hapus-${session.id}`;
  const start = dot(wibTime(session.startsAt));
  const end = session.endsAt ? dot(wibTime(session.endsAt)) : null;
  const changedBy = session.changedBy ? names.get(session.changedBy) ?? "admin" : "admin";
  return <li className={css.slot}>
    <div className={css.time}>
      <strong>{start}</strong>{end && <span>{end}</span>}{showDate && <span>{wibDate(session.startsAt)}</span>}
      <span className={`${css.dot} ${session.status === "draf" ? css.dotDraft : session.status === "batal" ? css.dotCancelled : ""}`} aria-hidden />
    </div>
    <article className={`${css.session} ${session.status === "draf" ? css.sessionDraft : ""} ${session.status === "batal" ? css.sessionCancelled : ""}`} aria-label={`${timeRange(session)} ${session.title}`}>
      <div className={css.sessionMain}>
        <button type="button" className={css.sessionTitle} onClick={onEdit}>{session.title}</button>
        {(session.place || session.dresscode) && <div className={css.meta}>
          {session.place && <span><MapPin size={14} aria-hidden />{session.place}</span>}
          {session.dresscode && <span><Shirt size={14} aria-hidden />{session.dresscode}</span>}
        </div>}
        <div className={css.chips}>
          <Pill tone={statusTone[session.status]}>{sessionStatusLabels[session.status]}</Pill>
          {session.kind !== "sesi" && <Pill tone="neutral">{sessionKindLabels[session.kind]}</Pill>}
          {session.usesAttendance && <Pill tone="blue">Absen</Pill>}
          {session.required && <Pill tone="brass">Wajib</Pill>}
          {session.optional && <Pill>Opsional</Pill>}
          {session.module && <Pill tone="purple">{sessionModuleLabels[session.module]}</Pill>}
          {session.changedAt && <Pill tone="warn" title="Perubahan terakhir setelah terbit">diubah {changedBy} · {dot(wibTime(session.changedAt))}</Pill>}
          {clash && <Pill tone="bad">Bentrok tempat</Pill>}
        </div>
      </div>
      <div className={css.actions}>
        <button type="button" className={css.iconButton} onClick={onEdit} disabled={busy} aria-label={`Ubah ${session.title}`} title="Ubah"><Pencil size={18} aria-hidden /></button>
        <button type="button" className={css.iconButton} onClick={onCopy} disabled={busy} aria-label={`Salin ${session.title}`} title="Salin"><Copy size={18} aria-hidden /></button>
        {kept
          ? <button type="button" className={`${css.iconButton} ${css.iconOff}`} onClick={onDelete} disabled={busy} aria-disabled aria-label={`Hapus ${session.title}`} aria-describedby={reasonId}
            title={`Tidak bisa dihapus: sudah punya ${usageWords(session.usage)}. Pakai Batalkan.`}>
            <Trash2 size={18} aria-hidden /><span id={reasonId} className="sr-only">Tidak bisa dihapus: sudah punya {usageWords(session.usage)}. Pakai Batalkan.</span>
          </button>
          : <button type="button" className={`${css.iconButton} ${css.iconDanger}`} onClick={onDelete} disabled={busy} aria-label={`Hapus ${session.title}`} title="Hapus"><Trash2 size={18} aria-hidden /></button>}
      </div>
    </article>
  </li>;
}
