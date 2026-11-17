"use client";

import { useState } from "react";
import { Activity, ClipboardCheck, ClipboardCopy, FileSpreadsheet, Plus, Trophy, Users } from "lucide-react";
import { Avatar, Card, ConsoleButton, ListRow, PageHeader, RowList, StatCard, StatRow } from "@/components/console";
import { Skeleton } from "@/components/app-shell/Panel";
import { useResource } from "@/components/app-shell/resource";
import { useToast } from "@/components/app-shell/Toast";
import { dimensionLabels } from "@/lib/wellbeing/rules";
import type { WbOverview } from "@/lib/wellbeing/types";
import { dayLabel, longDate, monthName, points, wb } from "./api";
import { DimensionIcon, Empty, LoadError, Refreshing, WaitingMigration, dimensionLook } from "./parts";
import { useWbActions } from "./WellbeingAdmin";
import css from "./wellbeing-admin.module.css";

/** Hari ini: what needs doing first, then this month in numbers and last month's champions (for the prizes). */
export function TodayView() {
  const overview = useResource(wb.overview.key, wb.overview.fetch);
  const { openPoints, openExport } = useWbActions();
  const data = overview.data;
  return <>
    <PageHeader title="Hari ini" subtitle={data ? longDate(data.today) : " "}
      actions={<>
        <ConsoleButton icon={<FileSpreadsheet size={18} aria-hidden="true" />} onClick={() => openExport({ data: "people" })}>Unduh rekap</ConsoleButton>
        <ConsoleButton variant="primary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => openPoints()}>Tambah poin</ConsoleButton>
      </>} />
    <Refreshing on={overview.refreshing} />
    {overview.error && !data ? <LoadError message={overview.error} onRetry={() => void overview.reload()} />
      : !data ? <TodaySkeleton /> : <TodayBody data={data} />}
  </>;
}

function TodaySkeleton() {
  return <div className={css.stack} aria-busy="true" aria-label="Memuat">
    <div className={css.statSkeleton}>{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height={104} radius={16} />)}</div>
    <Skeleton height={220} radius={16} />
  </div>;
}

function TodayBody({ data }: { data: WbOverview }) {
  const toast = useToast();
  const { pathOf: wellbeingAdminPath } = useWbActions();
  const [copied, setCopied] = useState(false);
  const champions = [
    ...data.lastMonth.overall.map((row, index) => `${index + 1}. ${row.name} (${row.department || "-"}): ${points(row.points)} poin`),
    ...data.lastMonth.byDimension.map(row => `${dimensionLabels[row.dimension]}: ${row.name}, ${points(row.points)} poin`),
  ];
  async function copy() {
    try {
      await navigator.clipboard.writeText(`Juara Wellbeing ${monthName(data.lastMonth.from)}\n${champions.join("\n")}`);
      setCopied(true); toast({ message: "Daftar juara disalin.", tone: "ok" });
      setTimeout(() => setCopied(false), 2000);
    } catch { toast({ message: "Tidak bisa menyalin di browser ini.", tone: "bad" }); }
  }
  return <div className={css.stack}>
    {!data.migrated && <WaitingMigration />}
    <StatRow label="Ringkasan">
      <StatCard label="Belum diperiksa" value={points(data.unchecked)} tone={data.unchecked ? "warn" : "ok"} icon={<ClipboardCheck size={20} />}
        note={data.unchecked ? "Buka Periksa" : "Semua sudah diperiksa"} href={wellbeingAdminPath("periksa")} />
      <StatCard label="Aktivitas hari ini" value={points(data.todayActivities)} icon={<Activity size={20} />} />
      <StatCard label={`Poin ${monthName(data.month.from)}`} value={points(data.month.points)} tone="blue" icon={<Trophy size={20} />} note={`${points(data.month.activities)} aktivitas`} />
      <StatCard label="Ikut bulan ini" value={`${data.month.people} / ${data.participants}`} icon={<Users size={20} />} note="orang dengan poin / karyawan aktif" href={wellbeingAdminPath("karyawan")} />
    </StatRow>

    <Card title="Perlu diperiksa" action={data.unchecked ? { label: "Periksa sekarang", href: wellbeingAdminPath("periksa") } : undefined}>
      {data.uncheckedPreview.length ? <RowList label="Aktivitas terbaru yang belum diperiksa">
        {data.uncheckedPreview.map(item => { const { Icon, tone } = dimensionLook[item.dimension]; return <ListRow key={item.id} href={wellbeingAdminPath("periksa")}
          icon={<Icon size={20} />} tone={tone}
          title={`${item.employeeNickname || item.employeeName} · ${item.typeName}`}
          sub={`${dimensionLabels[item.dimension]} · ${dayLabel(item.date, data.today)}${item.time ? ` ${item.time.replace(":", ".")}` : ""}`}
          trailing={<strong className={css.pts}>+{points(item.points)}</strong>} />; })}
      </RowList> : <Empty title="Tidak ada yang menunggu">Aktivitas baru dari karyawan muncul di sini. Semuanya langsung dihitung; periksa buktinya bila sempat.</Empty>}
    </Card>

    <Card title={`Juara ${monthName(data.lastMonth.from)}`}>
      {data.lastMonth.overall.length ? <>
        <ol className={css.podium} aria-label="Peringkat keseluruhan">
          {data.lastMonth.overall.map((row, index) => <li key={row.employeeId} className={css.podiumItem} data-place={index + 1}>
            <span className={css.podiumPlace}>{index + 1}</span>
            <Avatar name={row.name} size={44} />
            <span className={css.podiumText}><strong>{row.nickname || row.name}</strong><small>{row.department || "-"}</small></span>
            <strong className={css.pts}>{points(row.points)}</strong>
          </li>)}
        </ol>
        <h3 className={css.subhead}>Per dimensi</h3>
        <ul className={css.dimChampions}>
          {data.lastMonth.byDimension.map(row => <li key={row.dimension}>
            <DimensionIcon dimension={row.dimension} size={36} />
            <span><small>{dimensionLabels[row.dimension]}</small><strong>{row.nickname || row.name}</strong></span>
            <span className={css.pts}>{points(row.points)}</span>
          </li>)}
        </ul>
        <div className={css.rowEnd}><ConsoleButton icon={<ClipboardCopy size={18} aria-hidden="true" />} onClick={() => void copy()}>{copied ? "Tersalin" : "Salin daftar juara"}</ConsoleButton></div>
      </> : <Empty icon={<Trophy size={24} aria-hidden="true" />} title="Belum ada juara">Juara muncul setelah ada poin di bulan lalu. Hadiah diberikan ke juara dari peringkat ini.</Empty>}
    </Card>
  </div>;
}
