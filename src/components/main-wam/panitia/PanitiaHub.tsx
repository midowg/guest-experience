import { Radio } from "lucide-react";
import { BracketCard, IconBox, List, ListRow, PulseDot } from "@/components/main-wam/ui";
import { ScreenContent } from "@/components/main-wam/shell";
import type { AttentionItem, KelolaTile, RunningSession } from "@/lib/main-wam/panitia/attention";
import { KelolaCards } from "./BerandaCards";
import css from "./panitia.module.css";

/**
 * K01 Panitia, the hub behind the fifth tab (its title is the frame's h1): the sessions running now
 * (only when there are any), Kelola (4 shortcuts) and Perlu perhatian (only when there is something).
 * Drawn from plain data, server-safe; the page reads the data (panitiaHome), dev-preview passes samples.
 */
export function PanitiaHub({ tiles, attention, running = [] }: { tiles: KelolaTile[]; attention: AttentionItem[]; running?: RunningSession[] }) {
  return <ScreenContent>
    {running.length > 0 && <BracketCard as="section" motif="konstelasi" aria-labelledby="mw-berjalan">
      <div className={css.cardHead}><h2 id="mw-berjalan" className={css.cardTitle}>Sedang berjalan</h2><PulseDot /></div>
      <List plain bleed>
        {running.map(item => <ListRow key={item.id} leading={<IconBox icon={<Radio />} tone="neutral" />} title={item.title} sub={item.place ? `${item.time} · ${item.place}` : item.time} href={item.href} />)}
      </List>
    </BracketCard>}
    <KelolaCards tiles={tiles} attention={attention} />
  </ScreenContent>;
}
