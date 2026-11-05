import type { ReactNode } from "react";
import { CircleCheck, ClipboardList, DoorOpen, ExternalLink, KeyRound, MailX, UserPlus, UserRoundX } from "lucide-react";
import { Notice } from "@/components/ui";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { Card, ConsoleButtonLink, DayTimeline, ListRow, PageHeader, Pill, RowList, StatCard, StatRow, type ConsoleTone, type TimelineRow } from "@/components/console";
import { WamAdminFrame, waitingResetRequests } from "@/components/admin/wam/WamAdminFrame";
import { accountSummary } from "@/components/admin/wam/akun/account-view";
import { wamCrumbs, wamSection, wamSections } from "@/components/admin/wam/sections";
import styles from "@/components/admin/wam/wam-admin.module.css";
import { dateRange } from "@/lib/pra-wam/about";
import { wibDate, wibTime } from "@/lib/pra-wam/appraisal";
import { praWamPath, wamAdminPath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { defaultPasswordReady, listAccounts } from "@/lib/server/pra-wam/accounts";
import { dayLine, decimalHours, longDateLabel, questionnaireCounts, scheduleSpan, todaySchedule } from "@/lib/server/pra-wam/admin-overview";
import { listRooms } from "@/lib/server/pra-wam/appraisal";
import { currentPhase, listEvents, moduleLabels, type PraWamEvent } from "@/lib/server/pra-wam/events";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin WAM" };

const statusPills: Record<PraWamEvent["status"], { label: string; tone: ConsoleTone }> = {
  aktif: { label: "Aktif", tone: "ok" }, disiapkan: { label: "Disiapkan", tone: "blue" }, selesai: { label: "Selesai", tone: "neutral" },
};
type Todo = { key: string; icon: ReactNode; tone: ConsoleTone; title: string; sub: string; href: string };

/**
 * Admin WAM → Ringkasan, for any admin (HR checks WAM here): the key numbers, today's rooms as a
 * timeline (bookings and Pra WAM sessions), what needs doing, the Pra WAM and WAM status, and a
 * way into every section. Each part that cannot be read yet (a migration) hides or says so.
 */
export default async function WamAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const now = new Date();
  const today = wibDate(now.toISOString());
  const accounts = await listAccounts();
  const [events, waiting, rooms, phase, schedule, questionnaire] = await Promise.all([
    listEvents(),
    waitingResetRequests(),
    accounts.migrated ? listRooms().catch(() => null) : null,
    currentPhase(today).catch(() => null),
    todaySchedule(today),
    questionnaireCounts(),
  ]);
  const summary = accountSummary(accounts.rows);
  const noCapacity = rooms?.filter(room => room.capacity == null).length ?? 0;
  const passwordReady = defaultPasswordReady();

  const blocks = schedule?.flatMap(row => row.blocks) ?? [];
  const bookings = blocks.filter(block => block.kind === "booking").length;
  const sessions = blocks.length - bookings;
  const rows: TimelineRow[] = (schedule ?? []).map(row => ({
    ...row, blocks: row.blocks.map(block => ({ key: block.key, title: block.title, sub: block.sub, start: block.start, end: block.end, tone: block.kind === "sesi" ? "brass" : "blue" })),
  }));
  const span = scheduleSpan(schedule ?? []);

  const todos: Todo[] = [
    ...(waiting ? [{ key: "reset", icon: <KeyRound size={18} />, tone: "warn" as const, title: `${waiting} permintaan reset password`, sub: "Menunggu jawaban dari halaman Lupa password", href: wamAdminPath.resetRequests }] : []),
    ...(accounts.migrated && summary.neverSignedIn ? [{ key: "login", icon: <UserRoundX size={18} />, tone: "blue" as const, title: `${summary.neverSignedIn} akun belum pernah masuk`, sub: "Ingatkan mereka masuk dengan email kantor dan password awal", href: wamAdminPath.accounts }] : []),
    ...(accounts.migrated && summary.creatable ? [{ key: "akun", icon: <UserPlus size={18} />, tone: "blue" as const, title: `${summary.creatable} karyawan aktif belum punya akun`, sub: "Buat akunnya di Akun dan peran", href: wamAdminPath.accounts }] : []),
    ...(accounts.migrated && summary.missingEmail ? [{ key: "email", icon: <MailX size={18} />, tone: "warn" as const, title: `${summary.missingEmail} orang belum punya email`, sub: "Akunnya belum bisa dibuat sebelum email diisi", href: wamAdminPath.accounts }] : []),
    ...(noCapacity ? [{ key: "ruang", icon: <DoorOpen size={18} />, tone: "warn" as const, title: `${noCapacity} ruang belum punya kapasitas`, sub: "Isi kapasitasnya di Ruang dan denah", href: wamAdminPath.rooms }] : []),
  ];

  return <WamAdminFrame current="ringkasan">
    <PageHeader crumbs={wamCrumbs("ringkasan")} title={wamSection("ringkasan").label} subtitle={dayLine(today, phase)}
      actions={<>
        <ConsoleButtonLink href={praWamPath.home} target="_blank" rel="noopener" icon={<ExternalLink size={18} aria-hidden />}>Buka aplikasi WAM</ConsoleButtonLink>
        <ConsoleButtonLink href={wamAdminPath.accounts} variant="primary" icon={<UserPlus size={18} aria-hidden />}>Buat akun</ConsoleButtonLink>
      </>} />
    {!passwordReady && <Notice tone="warning">Password awal belum disiapkan. Isi WAM_DEFAULT_PASSWORD (minimal 8 karakter) pada server sebelum membuat akun atau mereset password.</Notice>}

    {!accounts.migrated ? <Notice tone="warning">Akun WAM menunggu migrasi 202611040001_pra_wam_appraisal.sql.</Notice>
      : <StatRow label="Angka penting">
        <StatCard label="Akun aktif" value={`${summary.signedIn}/${summary.withAccount}`} note={`${summary.neverSignedIn} belum pernah masuk`} href={wamAdminPath.accounts} />
        {waiting != null && <StatCard label="Reset menunggu" value={waiting} tone={waiting > 0 ? "warn" : undefined} icon={<KeyRound size={18} />} note={waiting ? "Permintaan dari Lupa password" : "Tidak ada yang menunggu"} href={wamAdminPath.resetRequests} />}
        {questionnaire && summary.active > 0 && <StatCard label="Kuesioner terisi" value={`${Math.round((questionnaire.done / summary.active) * 100)}%`} icon={<ClipboardList size={18} />}
          note={`${questionnaire.done} dari ${summary.active} selesai, ${Math.max(0, questionnaire.started - questionnaire.done)} sedang mengisi`} href={wamAdminPath.questionnaire.progress} />}
        {schedule && <StatCard label="Booking hari ini" value={bookings} note={`${sessions} sesi Pra WAM`} />}
      </StatRow>}

    {schedule ? <>
      <DayTimeline title="Jadwal hari ini" date={longDateLabel(today)} rows={rows} from={span.from} to={span.to}
        now={decimalHours(wibTime(now.toISOString()))} empty="Belum ada ruang yang bisa dibooking." />
      {rows.length > 0 && <p className={styles.legend}><Pill tone="blue">Booking ruang</Pill><Pill tone="brass">Sesi Pra WAM</Pill>{blocks.length === 0 && <span>Belum ada booking atau sesi hari ini.</span>}</p>}
    </> : <Notice tone="info">Jadwal ruang hari ini belum dapat dibaca. Ruang dan sesi Pra WAM menunggu migrasinya.</Notice>}

    <div className={styles.pair}>
      <Card title="Perlu tindakan" id="perlu-tindakan">
        {todos.length === 0
          ? <RowList label="Perlu tindakan"><ListRow icon={<CircleCheck size={18} />} tone="ok" title="Tidak ada yang perlu ditindak" sub="Akun, reset password, dan ruang sudah beres." /></RowList>
          : <RowList label="Perlu tindakan">{todos.map(todo => <ListRow key={todo.key} icon={todo.icon} tone={todo.tone} title={todo.title} sub={todo.sub} href={todo.href} />)}</RowList>}
      </Card>
      <Card title="Acara dan modul" id="acara-modul" action={{ label: "Atur", href: wamAdminPath.events }}>
        {!events.migrated ? <p className={styles.allClear}>Jadwal Pra WAM dan WAM menunggu migrasi 202611040003_pra_wam_events_units.sql.</p>
          : <RowList label="Acara">{events.events.map(event => {
            const pill = statusPills[event.status];
            const modules = Object.entries(event.modules).filter(([, on]) => on).map(([key]) => moduleLabels[key] ?? key);
            return <ListRow key={event.id} icon={<CalendarIcon />} tone={event.kind === "wam" ? "brass" : "blue"} title={event.name}
              sub={`${dateRange(event.startDate, event.endDate)}${modules.length ? ` · ${modules.join(", ")}` : ""}`}
              trailing={<Pill tone={pill.tone}>{pill.label}</Pill>} />;
          })}</RowList>}
      </Card>
    </div>

    <Card title="Semua bagian" id="semua-bagian">
      <RowList label="Bagian Admin WAM">{wamSections.filter(section => section.key !== "ringkasan").map(section => {
        const Icon = section.icon;
        return <ListRow key={section.key} icon={<Icon size={18} />} tone="neutral" title={section.label} sub={section.summary} href={section.href} />;
      })}</RowList>
    </Card>
  </WamAdminFrame>;
}

function CalendarIcon() {
  const Icon = wamSection("acara").icon;
  return <Icon size={18} />;
}
