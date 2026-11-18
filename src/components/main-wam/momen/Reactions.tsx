"use client";

import { SmilePlus } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Sheet } from "@/components/main-wam/ui";
import { QUICK_REACTIONS, REACTION_GROUPS, type ReactionCount } from "@/lib/main-wam/momen/reactions";
import css from "./reactions.module.css";

/*
 * Reactions in Momen, WhatsApp / Telegram style:
 *  - ReactionPills: inside the photo, bottom left, small pills "❤️ 12" that wrap upward; the person's own
 *    reaction is filled with the primary colour. On another person's photo a pill is a button (a tap
 *    reacts with that emoji, or takes it back); on one's own photo it is only shown.
 *  - QuickReactions: under the photo, a few emoji and "+" that opens the sheet with all of them.
 *  - ReactionSheet: every emoji, in groups; a choice closes the sheet.
 * One reaction per person per photo; no list of who, no message (the counts are all there is).
 */

/** The pills on the photo. Nothing when there is no reaction. */
export function ReactionPills({ reactions, mine, onReact }: { reactions: ReactionCount[]; mine: boolean; onReact?: (emoji: string) => void }) {
  const t = useT();
  if (!reactions.length) return null;
  return <div className={css.pills} role="group" aria-label={t(mine ? "momen.react.listMine" : "momen.react.list")}>
    {reactions.map(entry => {
      const label = t(entry.mine ? "momen.react.pillMine" : "momen.react.pill", { emoji: entry.emoji, n: entry.count });
      const body = <><span className={css.pillEmoji} aria-hidden>{entry.emoji}</span><span className={css.pillCount} aria-hidden>{entry.count}</span></>;
      return onReact && !mine
        ? <button key={entry.emoji} type="button" className={css.pill} data-mine={entry.mine || undefined} aria-pressed={entry.mine} aria-label={label} onClick={() => onReact(entry.emoji)}>{body}</button>
        : <span key={entry.emoji} className={css.pill} data-mine={entry.mine || undefined} data-static role="img" aria-label={label}>{body}</span>;
    })}
  </div>;
}

/** The quick row under another person's photo: the usual emoji, then "+" for the sheet. */
export function QuickReactions({ chosen, onPick, onMore }: { chosen: string | null; onPick: (emoji: string) => void; onMore: () => void }) {
  const t = useT();
  return <div className={css.quick} role="group" aria-label={t("momen.react.quick")}>
    {QUICK_REACTIONS.map(emoji => <button key={emoji} type="button" className={css.quickButton} aria-pressed={chosen === emoji} aria-label={t("momen.react.give", { emoji })} onClick={() => onPick(emoji)}>
      <span aria-hidden>{emoji}</span>
    </button>)}
    <button type="button" className={css.quickButton} data-more aria-label={t("momen.react.more")} onClick={onMore}><SmilePlus aria-hidden /></button>
  </div>;
}

/** Every emoji, grouped (Wajah, Tangan, Hati, Perayaan, Lainnya). Picking the one already chosen takes it back. */
export function ReactionSheet({ open, onClose, chosen, onPick }: { open: boolean; onClose: () => void; chosen: string | null; onPick: (emoji: string) => void }) {
  const t = useT();
  return <Sheet open={open} onClose={onClose} title={t("momen.react.sheetTitle")}>
    <div className={css.groups}>
      {REACTION_GROUPS.map(group => <section key={group.key} className={css.group} aria-labelledby={`mw-react-${group.key}`}>
        <h3 id={`mw-react-${group.key}`} className={css.groupHead}>{t(`momen.react.group.${group.key}`)}</h3>
        <div className={css.grid}>
          {group.emojis.map(emoji => <button key={emoji} type="button" className={css.cell} aria-pressed={chosen === emoji} aria-label={t("momen.react.give", { emoji })} onClick={() => onPick(emoji)}>
            <span aria-hidden>{emoji}</span>
          </button>)}
        </div>
      </section>)}
    </div>
  </Sheet>;
}
