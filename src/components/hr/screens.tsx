"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, FileText, MapPin, Plus, ScanFace, ShieldCheck } from "lucide-react";
import {
  clockMethodLabels, consentPoints, faceStatusLabels, flagLabels, kindLabels, nextKind, reasonLabels, REQUEST_DAYS, requestStatusLabels, requestSummary, requestTypeLabels, statusLabels,
  type AttendanceRequest, type ClockInState, type DailyKind, type DailyRecord, type FaceStatus,
} from "@/lib/hr/attendance";
import { distanceLabel } from "@/lib/hr/geo";
import { matchPercent } from "@/lib/hr/face-match";
import { byWeek, durationLabel, historySummary, minuteOfDay, minutesByDate, shiftDate, weekOf, workedMinutes } from "@/lib/hr/history";
import { instantLabel, zoneDate, zoneSuffix, zoneTime, type ViewerZone } from "@/lib/pra-wam/zone";
import { DayLine, Detail, Empty, Group, initials, LargeHead, RowButton, RowInfo, Segmented, SrOnly, StatusWord, Ticket } from "./ui";
import { WgMark } from "./WgMark";
import styles from "./app.module.css";

/*
 * WG People's screens (21 Nov 2026): the four tab roots and the detail screens they open. They only
 * show and ask; what happens (the camera, the server, the history) is in ClockInFlow. Rows that open
 * a detail carry a `mark`, so focus finds them again on the way back. Second look (same day): today
 * on Beranda is the time card (Ticket) with the day line; Riwayat draws each day on the line too.
 */

const say = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const longDay = (date: string) => say(date, { weekday: "long", day: "numeric", month: "long" });
const shortDay = (date: string) => say(date, { weekday: "long", day: "numeric", month: "short" });
const usable = (status: FaceStatus | undefined) => status === "aktif" || status === "menunggu" || status === "siap";
const recordsOf = (state: ClockInState, date: string) => ({
  masuk: state.recent.find(record => record.workDate === date && record.kind === "masuk") ?? null,
  pulang: state.recent.find(record => record.workDate === date && record.kind === "pulang") ?? null,
});
/** Where a record was made, in words (also the receipt after an absen). */
export const placeOf = (record: DailyRecord) => record.method === "manual" && !record.officeName && !record.reasonKind ? "Dicatat Admin HR"
  : record.reasonKind ? reasonLabels[record.reasonKind] : record.officeName ?? "Di luar kantor";
/** "Pagi" by the hour where the person is: Beranda says "Pagi, Rina", the way people greet at the door. */
export function greetingAt(iso: string, zone: ViewerZone): string {
  const hour = Number(zoneTime(iso, zone).slice(0, 2));
  return hour < 4 ? "Malam" : hour < 11 ? "Pagi" : hour < 15 ? "Siang" : hour < 18 ? "Sore" : "Malam";
}
/** Where a record sits on the day line, in the viewer's zone. */
const minuteOf = (record: DailyRecord | null, zone: ViewerZone) => (record ? minuteOfDay(record.at, zone) : null);
/** A day on the day line: masuk to pulang; masuk to now while still at work (today only); a pin when only one is there. */
function spanOf(masuk: DailyRecord | null, pulang: DailyRecord | null, zone: ViewerZone, nowMinute: number | null) {
  const start = minuteOf(masuk, zone) ?? minuteOf(pulang, zone);
  const end = masuk ? minuteOf(pulang, zone) ?? nowMinute : null;
  return { start, end };
}
/** The first record of a day that is not simply Sah, for its status word. */
const notSah = (...records: (DailyRecord | null)[]) => records.find(record => record && record.status !== "sah") ?? null;
const waitingOn = (state: ClockInState, date: string) => state.requests.filter(request => request.status === "menunggu" && request.workDate === date);
/** Within the days a revision may be asked for (the server's rule: today and the 31 days before). */
export const revisable = (state: ClockInState, date: string) => state.ready && date <= state.today.workDate && date >= shiftDate(state.today.workDate, -REQUEST_DAYS);
const clockOf = (record: DailyRecord | null, zone: ViewerZone) => (record ? instantLabel(record.at, zone) : null);

/* ── Beranda ─────────────────────────────────────────────────────────── */

export function HomeScreen({ state, now, zone, name, onClock, onDay, onRevise }: {
  state: ClockInState; now: string; zone: ViewerZone; name: string;
  onClock(kind: DailyKind): void; onDay(date: string): void; onRevise(date: string): void;
}) {
  const { masuk, pulang } = state.today;
  const next = nextKind(state.today);
  const today = state.today.workDate;
  const nowMinute = minuteOfDay(now, zone);
  const worked = masuk ? workedMinutes(masuk.at, pulang?.at ?? now) : 0;
  const line = !masuk && !pulang ? "Belum absen masuk hari ini."
    : masuk && !pulang ? (worked >= 8 * 60
      ? <>Sudah <span className={styles.live}>{durationLabel(worked)}</span>. Waktunya pulang?</>
      : <>Sudah bekerja <span className={styles.live}>{durationLabel(worked)}</span>.</>)
      : masuk && pulang ? <>Selesai, total <span className={styles.live}>{durationLabel(worked)}</span>. Sampai besok!</>
        : "Absen pulang sudah tercatat.";
  const span = spanOf(masuk, pulang, zone, pulang ? null : nowMinute);

  // What needs the person: a recent day with masuk but no pulang (and nothing asked yet), or a refused record.
  const earlier = [...new Set(state.recent.map(record => record.workDate))].filter(date => date < today && date >= shiftDate(today, -7)).sort().reverse();
  const forgot = earlier.find(date => { const day = recordsOf(state, date); return day.masuk && !day.pulang && !waitingOn(state, date).length; });
  const refused = state.recent.find(record => record.status === "ditolak" && record.workDate >= shiftDate(today, -7));

  const week = weekOf(today);
  const hours = minutesByDate(state.recent, week);
  const running = masuk && !pulang ? worked : 0;

  return <div className={styles.screen}>
    <LargeHead eyebrow={longDay(today)} title={<>{greetingAt(now, zone)}{name ? `, ${name}` : ""}</>} />

    {!state.ready
      ? <Empty icon={<Clock3 size={32} aria-hidden />} title="Absen harian belum dibuka">{state.waiting ?? "Admin HR sedang menyiapkannya."}</Empty>
      : <Ticket label="Absen hari ini" stub={<>
        <p className={styles.stubLabel}>Hari ini</p>
        <p className={styles.clockLine}><time className={styles.clock} dateTime={now}>{instantLabel(now, zone)}</time><span className={styles.zone}>{zone}</span></p>
        <p className={styles.state}>{line}</p>
        <DayLine tone="brand" start={span.start} end={span.end} now={pulang ? null : nowMinute} labels />
        {next
          ? <button type="button" className={styles.action} onClick={() => onClock(next)}><ScanFace size={22} aria-hidden /> Absen {kindLabels[next].toLowerCase()}</button>
          : <p className={styles.done}><CheckCircle2 size={20} aria-hidden /> Absen hari ini lengkap</p>}
        {next && !usable(state.face?.status) && <p className={styles.hint}>Pertama kali: daftar wajah dulu, sekali saja.</p>}
      </>}>
        <ul className={styles.slots}>
          {([["masuk", masuk], ["pulang", pulang]] as const).map(([kind, record]) => <li key={kind} className={styles.slot} data-empty={!record || undefined}>
            <span className={styles.slotLabel}>{kindLabels[kind]}</span>
            {record ? <span className={styles.slotTime}>{instantLabel(record.at, zone)}{zoneSuffix(zone)}</span> : <span className={styles.slotEmpty}>Belum</span>}
            {record && <span className={styles.slotWhere}>{placeOf(record)}</span>}
            {record && record.status !== "sah" && <StatusWord tone={record.status}>{statusLabels[record.status]}</StatusWord>}
          </li>)}
        </ul>
        {next === "masuk" && <button type="button" className={`${styles.quiet} ${styles.quietMuted}`} onClick={() => onClock("pulang")}>Lupa absen masuk? Langsung absen pulang</button>}
      </Ticket>}

    {(forgot || refused) && <Group label="Perlu perhatian">
      {forgot && <RowButton title={`${shortDay(forgot)} belum ada absen pulang`} sub="Ajukan revisi supaya jam pulangmu tercatat." onClick={() => onRevise(forgot)} />}
      {refused && <RowButton mark={`hari-${refused.workDate}`} title={`Absen ${kindLabels[refused.kind].toLowerCase()} ${shortDay(refused.workDate)} ditolak`} sub={refused.reviewNote ?? "Lihat alasannya, lalu ajukan revisi bila perlu."} onClick={() => onDay(refused.workDate)} />}
    </Group>}

    <section className={styles.group} aria-labelledby="minggu-ini">
      <div className={styles.groupHead}>
        <h2 id="minggu-ini" className={styles.groupLabel}>Minggu ini</h2>
        {hours.total + running > 0 && <span className={styles.groupValue}>{durationLabel(hours.total + running)}</span>}
      </div>
      <div className={styles.week}>
        {week.map(date => {
          const day = recordsOf(state, date);
          const check = notSah(day.masuk, day.pulang);
          const mark = check ? "cek" : day.masuk && day.pulang ? "lengkap" : day.masuk || day.pulang ? "sebagian" : "kosong";
          const minutes = hours.byDate[date] ?? (date === today ? running : 0);
          const word = date > today ? "belum" : check ? statusLabels[check.status].toLowerCase() : { lengkap: "lengkap", sebagian: "belum lengkap", kosong: "tidak ada absen", cek: "" }[mark];
          return <button key={date} type="button" className={styles.day} disabled={date > today} aria-current={date === today ? "date" : undefined} data-mark={`hari-${date}`} onClick={() => onDay(date)}>
            <span className={styles.dayBar} aria-hidden><span className={styles.dayFill} style={{ height: `${Math.min(100, (minutes / 600) * 100)}%` }} /></span>
            <span className={styles.dayName} aria-hidden>{say(date, { weekday: "short" })}</span>
            <span className={styles.dayNumber} aria-hidden>{Number(date.slice(8))}</span>
            <span className={`${styles.mark} ${styles[`mark_${mark}`]}`} aria-hidden />
            <SrOnly>{longDay(date)}, {word}{minutes ? `, ${durationLabel(minutes)}` : ""}</SrOnly>
          </button>;
        })}
      </div>
      <p className={styles.groupNote} aria-hidden>
        <span className={styles.legend}><span className={`${styles.mark} ${styles.mark_lengkap}`} /> lengkap</span>
        <span className={styles.legend}><span className={`${styles.mark} ${styles.mark_sebagian}`} /> belum lengkap</span>
        <span className={styles.legend}><span className={`${styles.mark} ${styles.mark_cek}`} /> perlu dicek</span>
      </p>
    </section>
  </div>;
}

/* ── Riwayat ─────────────────────────────────────────────────────────── */

type Filter = "semua" | "cek" | "luar";
export function HistoryScreen({ state, zone, onDay }: { state: ClockInState; zone: ViewerZone; onDay(date: string): void }) {
  const [filter, setFilter] = useState<Filter>("semua");
  const dates = [...new Set(state.recent.map(record => record.workDate))];
  const isCheck = (date: string) => state.recent.some(record => record.workDate === date && record.status !== "sah");
  const isOut = (date: string) => state.recent.some(record => record.workDate === date && record.reasonKind);
  const shown = dates.filter(date => filter === "semua" || (filter === "cek" ? isCheck(date) : isOut(date)));
  const summary = historySummary(state.recent, zone);

  return <div className={styles.screen}>
    <LargeHead title="Riwayat" lead={`31 hari terakhir${summary.usualIn ? ` · biasanya masuk ${summary.usualIn}` : ""}`} />
    {dates.length > 0 && <Segmented<Filter> label="Saring riwayat" value={filter} onChange={setFilter} options={[
      { value: "semua", label: "Semua", count: dates.length, unit: "hari" },
      { value: "cek", label: "Perlu dicek", count: dates.filter(isCheck).length, unit: "hari" },
      { value: "luar", label: "Di luar", count: dates.filter(isOut).length, unit: "hari" },
    ]} />}
    {!dates.length && <Empty icon={<CalendarDays size={32} aria-hidden />} title="Belum ada absen">Absen pertamamu akan muncul di sini.</Empty>}
    {dates.length > 0 && !shown.length && <Empty title="Tidak ada">Tidak ada hari yang cocok dengan saringan ini.</Empty>}
    {byWeek(shown, state.today.workDate).map(week => <Group key={week.label} label={week.label}>
      {week.dates.map(date => {
        const { masuk, pulang } = recordsOf(state, date);
        const check = notSah(masuk, pulang);
        const waiting = waitingOn(state, date).length > 0;
        const first = masuk ?? pulang;
        const inAt = clockOf(masuk, zone), outAt = clockOf(pulang, zone);
        return <RowButton key={date} mark={`hari-${date}`} onClick={() => onDay(date)}
          lead={<span className={styles.date} aria-hidden><span className={styles.dateName}>{say(date, { weekday: "short" })}</span><span className={styles.dateNumber}>{Number(date.slice(8))}</span></span>}
          title={<span className={styles.times}>
            <SrOnly>{date === state.today.workDate ? "Hari ini, " : `${longDay(date)}, `}masuk </SrOnly>{inAt ?? <span className={styles.timesEmpty}>belum</span>}
            <span aria-hidden> → </span><SrOnly>, pulang </SrOnly>{outAt ?? <span className={styles.timesEmpty}>belum</span>}
          </span>}
          sub={<>
            <DayLine thin {...spanOf(masuk, pulang, zone, null)} />
            {date === state.today.workDate ? "Hari ini · " : ""}{first ? placeOf(first) : ""}{waiting ? " · revisi menunggu" : ""}
          </>}
          trailing={check ? <StatusWord tone={check.status}>{statusLabels[check.status]}</StatusWord> : masuk && !pulang && date < state.today.workDate ? <StatusWord tone="kosong">Belum pulang</StatusWord> : null} />;
      })}
    </Group>)}
  </div>;
}

/* ── Pengajuan ───────────────────────────────────────────────────────── */

export function RequestsScreen({ state, onNew, onOpen }: { state: ClockInState; onNew(): void; onOpen(id: string): void }) {
  const [part, setPart] = useState<"menunggu" | "selesai">("menunggu");
  const waiting = state.requests.filter(request => request.status === "menunggu");
  const finished = state.requests.filter(request => request.status !== "menunggu");
  const shown = part === "menunggu" ? waiting : finished;
  return <div className={styles.screen}>
    <LargeHead title="Pengajuan" action={state.ready ? <button type="button" className={styles.headAction} onClick={onNew}><Plus size={18} aria-hidden /> Ajukan</button> : null} />
    <Segmented<"menunggu" | "selesai"> label="Status pengajuan" value={part} onChange={setPart} options={[
      { value: "menunggu", label: "Menunggu", count: waiting.length },
      { value: "selesai", label: "Selesai", count: finished.length },
    ]} />
    {shown.length
      ? <Group>{shown.slice(0, 30).map(request => <RowButton key={request.id} mark={`pengajuan-${request.id}`} onClick={() => onOpen(request.id)}
        title={requestSummary(request)} sub={`${requestTypeLabels[request.type]} · ${shortDay(request.workDate)}`}
        trailing={<StatusWord tone={request.status}>{requestStatusLabels[request.status]}</StatusWord>} />)}</Group>
      : part === "menunggu"
        ? <Empty icon={<FileText size={32} aria-hidden />} title="Tidak ada yang menunggu">Ada yang salah di absenmu? Buka harinya di Riwayat, atau tekan Ajukan.</Empty>
        : <Empty icon={<FileText size={32} aria-hidden />} title="Belum ada yang selesai">Pengajuan yang sudah diputuskan Admin HR muncul di sini.</Empty>}
  </div>;
}

/* ── Profil ──────────────────────────────────────────────────────────── */

export function ProfileScreen({ state, fullName, zone, onFace, onOffices, onSignOut }: {
  state: ClockInState; fullName: string; zone: ViewerZone; onFace(): void; onOffices(): void; onSignOut(): void;
}) {
  return <div className={styles.screen}>
    <header className={styles.idCard}>
      <p className={styles.idBrand}><WgMark size={22} head="var(--hr-on-brand)" aria-hidden /> WG People</p>
      <span className={styles.avatar} aria-hidden>{initials(fullName)}</span>
      <div className={styles.headText}>
        <h1 className={styles.personName}>{fullName}</h1>
        <p className={styles.idSub}>Akun WAM · wajah {state.face ? faceStatusLabels[state.face.status].toLowerCase() : "belum terdaftar"}</p>
      </div>
    </header>
    <Group label="Absen" icons>
      <RowButton mark="wajah" icon={<ShieldCheck size={20} />} title="Data wajah" value={state.face ? faceStatusLabels[state.face.status] : "Belum terdaftar"} onClick={onFace} />
      <RowButton mark="kantor" icon={<MapPin size={20} />} title="Titik kantor" value={`${state.offices.length} kantor`} onClick={onOffices} />
      <RowInfo icon={<ScanFace size={20} />} title="Cara absen" value={clockMethodLabels[state.method]} />
      <RowInfo icon={<Clock3 size={20} />} title="Zona waktu" value={zone} />
    </Group>
    <Group><RowButton title="Keluar" danger chevron={false} onClick={onSignOut} /></Group>
  </div>;
}

/* ── Detail: one day ─────────────────────────────────────────────────── */

export function DayDetail({ state, date, zone, onBack, onRevise, onRequest }: {
  state: ClockInState; date: string; zone: ViewerZone; onBack(): void; onRevise(date: string): void; onRequest(id: string): void;
}) {
  const day = recordsOf(state, date);
  const requests = state.requests.filter(request => request.workDate === date);
  const span = spanOf(day.masuk, day.pulang, zone, null);
  return <Detail title={shortDay(date)} onBack={onBack}
    action={revisable(state, date) ? <button type="button" className={styles.barText} onClick={() => onRevise(date)}>Revisi</button> : undefined}>
    <div className={styles.daySummary}>
      <p className={styles.daySummaryTimes}>
        {clockOf(day.masuk, zone) ?? <span className={styles.timesEmpty}>belum</span>}<span aria-hidden> → </span><SrOnly> sampai </SrOnly>{clockOf(day.pulang, zone) ?? <span className={styles.timesEmpty}>belum</span>}
      </p>
      <p className={styles.lead}>{day.masuk && day.pulang ? `${durationLabel(workedMinutes(day.masuk.at, day.pulang.at))} bekerja` : longDay(date)}</p>
      <DayLine {...span} labels />
    </div>
    {(["masuk", "pulang"] as const).map(kind => {
      const record = day[kind];
      return <Group key={kind} label={kindLabels[kind]}>
        {record ? <>
          <RowInfo title="Jam" value={`${instantLabel(record.at, zone)} ${zone}`} />
          <RowInfo title="Lokasi" value={placeOf(record)} sub={record.reasonText ?? (record.distanceM != null ? `${distanceLabel(record.distanceM)} dari titik kantor` : undefined)} />
          <RowInfo title="Cara" value={record.method === "manual" ? "Dicatat Admin HR" : record.faceMethod ? clockMethodLabels[record.faceMethod] : "Wajah"} />
          {record.faceScore != null && <RowInfo title="Kecocokan wajah" value={`${matchPercent(record.faceScore)}%`} />}
          <RowInfo title="Status" sub={record.flags.length ? record.flags.map(flag => flagLabels[flag]).join(", ") : undefined} trailing={<StatusWord tone={record.status}>{statusLabels[record.status]}</StatusWord>} />
          {record.reviewNote && <RowInfo title="Catatan Admin HR" sub={record.reviewNote} />}
        </> : <RowInfo title={`Tidak ada absen ${kindLabels[kind].toLowerCase()}`} sub={revisable(state, date) ? "Lupa? Tekan Revisi di atas." : undefined} />}
      </Group>;
    })}
    {requests.length > 0 && <Group label="Revisi">
      {requests.map(request => <RowButton key={request.id} mark={`pengajuan-${request.id}`} title={requestSummary(request)} trailing={<StatusWord tone={request.status}>{requestStatusLabels[request.status]}</StatusWord>} onClick={() => onRequest(request.id)} />)}
    </Group>}
  </Detail>;
}

/* ── Detail: one request ─────────────────────────────────────────────── */

const sentAt = (iso: string, zone: ViewerZone) => `${say(zoneDate(iso, zone), { day: "numeric", month: "short" })}, ${instantLabel(iso, zone)}${zoneSuffix(zone)}`;
export function RequestDetail({ request, zone, onBack, onCancel }: { request: AttendanceRequest; zone: ViewerZone; onBack(): void; onCancel(): void }) {
  const decided = request.status === "disetujui" ? { state: "ok", title: "Disetujui", sub: request.decidedLabel ? `Oleh ${request.decidedLabel}. Perubahan sudah diterapkan ke absenmu.` : "Perubahan sudah diterapkan ke absenmu." }
    : request.status === "ditolak" ? { state: "no", title: "Ditolak", sub: request.decidedLabel ? `Oleh ${request.decidedLabel}.` : "" }
      : request.status === "dibatalkan" ? { state: "off", title: "Dibatalkan", sub: "Kamu membatalkannya." }
        : { state: "now", title: "Menunggu Admin HR", sub: "Hasilnya muncul di sini." };
  return <Detail title="Revisi" onBack={onBack}>
    <div className={styles.summary}>
      <h2 className={styles.summaryTitle}>{requestSummary(request)}</h2>
      <p className={styles.lead}>{requestTypeLabels[request.type]} · {longDay(request.workDate)}</p>
    </div>
    <ol className={styles.steps} aria-label="Perjalanan pengajuan">
      <li className={styles.stepItem}><span className={styles.stepTitle}>Dikirim</span><span className={styles.stepSub}>{sentAt(request.createdAt, zone)}</span></li>
      <li className={styles.stepItem} data-state={decided.state}><span className={styles.stepTitle}>{decided.title}</span>{decided.sub && <span className={styles.stepSub}>{decided.sub}</span>}</li>
    </ol>
    <Group label="Alasanmu"><RowInfo title={<span className={styles.plainText}>{request.note}</span>} /></Group>
    {request.decisionNote && <Group label="Catatan Admin HR"><RowInfo title={<span className={styles.plainText}>{request.decisionNote}</span>} /></Group>}
    {request.status === "menunggu" && <Group><RowButton title="Batalkan pengajuan" danger chevron={false} onClick={onCancel} /></Group>}
  </Detail>;
}

/* ── Detail: face data ───────────────────────────────────────────────── */

const faceStory: Record<FaceStatus | "kosong", string> = {
  aktif: "Wajahmu dipakai untuk mencocokkan setiap absen.",
  menunggu: "Wajahmu sudah terdaftar dan menunggu disetujui Admin HR. Absenmu tetap tercatat, dengan status Perlu dicek.",
  siap: "Foto acuanmu dari GreatDay sudah siap. Aktif setelah kamu setuju di absen pertama.",
  impor: "Foto acuanmu dari GreatDay sedang disiapkan Admin HR.",
  ditolak: "Foto acuanmu belum bisa dipakai. Daftarkan wajahmu sekali lagi.",
  kosong: "Daftarkan wajahmu sekali, lalu setiap absen cukup dengan kamera depan.",
};
export function FaceDetail({ state, onBack, onEnroll, onWithdraw }: { state: ClockInState; onBack(): void; onEnroll(): void; onWithdraw(): void }) {
  const status = state.face?.status;
  return <Detail title="Data wajah" onBack={onBack}>
    <div className={styles.summary}>
      <h2 className={styles.summaryTitle}>{status ? faceStatusLabels[status] : "Belum terdaftar"}</h2>
      <p className={styles.lead}>{faceStory[status ?? "kosong"]}{state.face?.source === "greatday" ? " Sumber: foto GreatDay." : ""}</p>
    </div>
    {state.ready && !usable(status) && <button type="button" className={styles.wide} onClick={onEnroll}><ScanFace size={20} aria-hidden /> Daftar wajah</button>}
    <section className={styles.group} aria-labelledby="tentang-wajah">
      <h3 id="tentang-wajah" className={styles.groupLabel}>Yang perlu kamu tahu</h3>
      <ul className={styles.notes}>{consentPoints.map(point => <li key={point}>{point}</li>)}</ul>
    </section>
    {state.face?.consented && <Group><RowButton title="Hapus data wajah" danger chevron={false} onClick={onWithdraw} /></Group>}
  </Detail>;
}

/* ── Detail: office points ───────────────────────────────────────────── */

export function OfficesDetail({ state, onBack }: { state: ClockInState; onBack(): void }) {
  return <Detail title="Titik kantor" onBack={onBack}>
    {state.offices.length
      ? <Group note="Absen di dalam lingkaran ini tercatat Sah. Di luar, kamu memilih alasan dan Admin HR memeriksanya." icons>
        {state.offices.map(office => <li key={office.id}><a className={styles.row} href={`https://www.google.com/maps/search/?api=1&query=${office.lat},${office.lng}`} target="_blank" rel="noopener noreferrer">
          <span className={styles.rowIcon} aria-hidden><MapPin size={20} /></span>
          <span className={styles.rowText}><span className={styles.rowTitle}>{office.name}</span><span className={styles.rowSub}>Radius {office.radiusM} m · {office.zone}</span></span>
          <span className={styles.rowValue}>Peta<SrOnly> (buka di tab baru)</SrOnly></span>
        </a></li>)}
      </Group>
      : <Empty icon={<MapPin size={32} aria-hidden />} title="Belum ada titik kantor">Admin HR akan menambahkannya.</Empty>}
  </Detail>;
}
