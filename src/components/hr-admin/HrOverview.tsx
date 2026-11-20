import { CalendarCheck, CheckCircle2, FilePen, Inbox, MapPin, ScanFace, UserX } from "lucide-react";
import { Card, CardGrid, ConsoleButtonLink, ListRow, PageHeader, RowList, StatCard, StatRow } from "@/components/console";
import { flagLabels, kindLabels, type HrSummary, type WaitingRecord } from "@/lib/hr/attendance";
import { hrAdminPath, hrPath, superAdminPath } from "@/lib/routes";
import { MethodSetting } from "./MethodSetting";
import css from "./hr-admin.module.css";

const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const day = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const longDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

type Step = { done: boolean; title: string; text: string; action: { label: string; href: string } };

/**
 * Admin HR → Ringkasan (20 Nov 2026): today's numbers, the steps to get absensi going (each ticked
 * once done), how the faces stand, and the first clock-ins that wait. Everything is one tap away.
 */
export function HrOverview({ summary, waiting, superAdmin }: { summary: HrSummary; waiting: WaitingRecord[]; superAdmin: boolean }) {
  const { faces } = summary;
  const steps: Step[] = [
    { done: summary.offices > 0, title: "Atur titik kantor", text: summary.offices ? `${summary.offices} titik kantor aktif.` : "Tanpa titik kantor, semua absen dianggap di luar area.", action: { label: summary.offices ? "Lihat titik" : "Atur sekarang", href: hrAdminPath.offices } },
    { done: faces.impor === 0, title: "Proses foto dari GreatDay", text: faces.impor ? `${faces.impor} foto belum diproses. Setelah diproses, fotonya langsung jadi foto acuan.` : "Semua foto GreatDay sudah diproses.", action: { label: faces.impor ? "Proses foto" : "Lihat wajah", href: hrAdminPath.faces } },
    ...(superAdmin ? [{ done: false, title: "Beri akses Admin HR", text: "Centang \"HR Werkudara\" untuk orang HR di Super admin → Akses admin.", action: { label: "Buka Akses admin", href: superAdminPath.admins } }] : []),
    { done: summary.masuk > 0, title: "Bagikan aplikasi ke karyawan", text: "Karyawan membuka journey.werkudara.group/hr di HP, masuk dengan akun WAM, lalu memasangnya ke layar utama.", action: { label: "Buka aplikasi", href: hrPath.home } },
  ];

  return <>
    <PageHeader title="Ringkasan" subtitle={`Absensi ${longDay(summary.date)} (WIB).`} />
    <StatRow label="Angka hari ini">
      <StatCard label="Sudah absen masuk" value={`${summary.masuk} / ${summary.people}`} icon={<CalendarCheck size={18} />} tone="ok" href={hrAdminPath.day()} />
      <StatCard label="Belum absen" value={summary.belum} icon={<UserX size={18} />} href={hrAdminPath.day()} />
      <StatCard label="Perlu dicek" value={summary.waiting} note="semua hari" icon={<Inbox size={18} />} tone={summary.waiting ? "warn" : undefined} href={hrAdminPath.waiting} />
      <StatCard label="Di luar kantor" value={summary.diLuar} note="hari ini" icon={<MapPin size={18} />} href={hrAdminPath.day()} />
      {summary.requests !== null && <StatCard label="Revisi menunggu" value={summary.requests} icon={<FilePen size={18} />} tone={summary.requests ? "warn" : undefined} href={hrAdminPath.requests} />}
    </StatRow>

    <MethodSetting initial={summary.method} ready={summary.requests !== null} />

    <CardGrid>
      <Card title="Siapkan absensi">
        <ol className={css.steps}>{steps.map((step, index) => <li key={step.title} className={`${css.step} ${step.done ? css.stepDone : ""}`}>
          <span className={css.stepMark} aria-label={step.done ? "Selesai" : `Langkah ${index + 1}`}>{step.done ? <CheckCircle2 size={16} aria-hidden /> : index + 1}</span>
          <span className={css.stepText}><strong>{step.title}</strong><span className={css.muted}>{step.text}</span></span>
          <ConsoleButtonLink className={css.stepAction} href={step.action.href}>{step.action.label}</ConsoleButtonLink>
        </li>)}</ol>
      </Card>

      <Card title="Wajah karyawan" action={{ label: "Kelola wajah", href: hrAdminPath.faces }}>
        <RowList label="Status wajah">
          <ListRow icon={<ScanFace size={18} />} tone="ok" title={`${faces.aktif} aktif`} sub="Bisa absen dengan wajah" />
          <ListRow icon={<ScanFace size={18} />} tone="blue" title={`${faces.siap} menunggu karyawan`} sub="Foto GreatDay siap; aktif saat karyawannya setuju di absen pertama" />
          <ListRow icon={<ScanFace size={18} />} tone="warn" title={`${faces.menunggu} menunggu disetujui`} sub="Daftar sendiri dan tidak cocok dengan foto GreatDay" href={faces.menunggu ? hrAdminPath.faces : undefined} />
          <ListRow icon={<ScanFace size={18} />} tone="neutral" title={`${faces.impor} belum diproses`} sub="Foto GreatDay yang belum dibaca" href={faces.impor ? hrAdminPath.faces : undefined} />
          <ListRow icon={<UserX size={18} />} tone="bad" title={`${faces.tanpa + faces.ditolak} belum punya wajah`} sub="Daftar wajah sendiri di aplikasi saat absen pertama" />
        </RowList>
      </Card>
    </CardGrid>

    <Card title="Menunggu dicek" action={waiting.length ? { label: "Buka semua", href: hrAdminPath.waiting } : undefined}>
      {waiting.length === 0
        ? <div className={css.empty}><CheckCircle2 size={28} aria-hidden /><p>Tidak ada absen yang menunggu.</p></div>
        : <RowList label="Absen yang menunggu">
          {waiting.map(item => <ListRow key={item.id} icon={<Inbox size={18} />} tone="warn" href={hrAdminPath.waiting}
            title={item.name} sub={`${day(item.workDate)} · ${kindLabels[item.kind]} ${time(item.at)} · ${item.flags.map(flag => flagLabels[flag]).join(", ")}`} />)}
        </RowList>}
    </Card>
  </>;
}
