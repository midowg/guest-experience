import { CalendarClock, Flag, Lock, Megaphone, QrCode, ShieldAlert, UserCheck } from "lucide-react";
import { Card, IconBox, type IconProp, List, ListRow, ShortcutGrid, ShortcutTile } from "@/components/main-wam/ui";
import type { AttentionItem, KelolaTile } from "@/lib/main-wam/panitia/attention";
import css from "./panitia.module.css";

/*
 * The panitia's cards, drawn from plain data (the panitia hub reads it on the server; dev-preview passes sample data). Server-safe: no state.
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
