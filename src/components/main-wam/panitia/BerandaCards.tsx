import { CalendarClock, Check, Flag, Footprints, Lock, Megaphone, QrCode, ShieldAlert, Trophy, UserCheck } from "lucide-react";
import { Card, IconBox, type IconProp, List, ListRow, Pill, ShortcutGrid, ShortcutTile, Skeleton, SkeletonGroup, Spinner, StatRow } from "@/components/main-wam/ui";
import type { AttentionItem, KelolaTile } from "@/lib/main-wam/panitia/attention";
import type { SummaryKey, SummaryRow } from "@/lib/main-wam/panitia/summary";
import css from "./panitia.module.css";

/*
 * The panitia's and BOD's cards on Beranda, drawn from plain data (the slots BerandaPanitia and
 * BerandaBod read it on the server; dev-preview passes sample data). Server-safe: no state.
 */

const TILE_ICON: Record<KelolaTile["key"], IconProp> = {
  rundown: <CalendarClock />, absen: <QrCode />, pengumuman: <Megaphone />, moderasi: <ShieldAlert />,
};
const ATTENTION_ICON: Record<AttentionItem["icon"], IconProp> = { flag: <Flag />, "user-check": <UserCheck />, lock: <Lock /> };

/** K01: Kelola (2 × 2) and, only when there is something, Perlu perhatian under it. */
export function KelolaCards({ tiles, attention }: { tiles: KelolaTile[]; attention: AttentionItem[] }) {
  return <>
    <Card as="section" aria-labelledby="mw-kelola">
      <div className={css.cardHead}><h2 id="mw-kelola" className={css.cardTitle}>Kelola</h2></div>
      <ShortcutGrid label="Kelola">
        {tiles.map(tile => <ShortcutTile key={tile.key} icon={TILE_ICON[tile.key]} label={tile.label} href={tile.href} badge={tile.badge}
          badgeLabel={tile.key === "moderasi" ? "laporan" : undefined} />)}
      </ShortcutGrid>
    </Card>
    {attention.length > 0 && <Card as="section" aria-labelledby="mw-perhatian">
      <div className={css.cardHead}><h2 id="mw-perhatian" className={css.cardTitle}>Perlu perhatian</h2></div>
      <List plain bleed>
        {attention.map(item => <ListRow key={item.key} leading={<IconBox icon={ATTENTION_ICON[item.icon]} tone="warning" />} title={item.title} sub={item.sub} href={item.href} />)}
      </List>
    </Card>}
  </>;
}

const SUMMARY_ICON: Record<SummaryKey, IconProp> = { kehadiran: <UserCheck />, awarding: <Trophy />, silent: <Lock />, karbon: <Footprints /> };

function SummaryValue({ row }: { row: SummaryRow }) {
  const value = row.value;
  if (value.kind === "pill") return <Pill tone={value.tone} icon={value.tone === "success" ? <Check /> : undefined}>{value.text}</Pill>;
  if (value.kind === "kosong") return <span className={css.none}>Belum ada</span>;
  return <>{value.value}</>;
}

/** B01: Ringkasan, at most four rows (a module that is off has no row; Jejak karbon opens its page). */
export function RingkasanCard({ rows, children }: { rows: SummaryRow[]; children?: React.ReactNode }) {
  if (!rows.length && !children) return null;
  return <Card as="section" aria-labelledby="mw-ringkasan">
    <div className={css.cardHead}><h2 id="mw-ringkasan" className={css.cardTitle}>Ringkasan</h2></div>
    {children}
    {rows.length > 0 && <List plain bleed>
      {rows.map(row => <StatRow key={row.key} icon={SUMMARY_ICON[row.key]} title={row.title} href={row.href ?? undefined}
        value={<SummaryValue row={row} />} unit={row.value.kind === "angka" ? row.value.unit : undefined} />)}
    </List>}
  </Card>;
}

/** B01 while the numbers load: the same card, the same number of rows (no jump when they arrive). */
export function RingkasanSkeleton({ rows }: { rows: number }) {
  if (rows <= 0) return null;
  const widths = ["62%", "70%", "80%", "48%"];
  return <Card as="section" aria-labelledby="mw-ringkasan-memuat">
    <div className={css.cardHead}><h2 id="mw-ringkasan-memuat" className={css.cardTitle}>Ringkasan</h2><Spinner size={20} /></div>
    <SkeletonGroup label="Ringkasan sedang dimuat">
      <List plain bleed>
        {Array.from({ length: rows }, (_, index) => <div key={index} className={css.skelRow}>
          <Skeleton shape="box" width={40} height={40} />
          <span className={css.skelText}><Skeleton shape="line" width={widths[index % widths.length]} /></span>
          <Skeleton shape="title" width={48} />
        </div>)}
      </List>
    </SkeletonGroup>
  </Card>;
}
