"use client";

import { useEffect, useMemo, useState } from "react";
import { SmilePlus } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Avatar, Banner, Button, Sheet, Skeleton } from "@/components/main-wam/ui";
import { praWamRequest } from "@/components/pra-wam/api";
import { QUICK_REACTIONS, REACTION_GROUPS, reactionTotal, type ReactionCount } from "@/lib/main-wam/momen/reactions";
import type { Reactor } from "@/lib/main-wam/momen/types";
import { mainWamApi } from "@/lib/routes";
import css from "./reactions.module.css";

/*
 * Reactions in Momen, WhatsApp / Telegram style:
 *  - ReactionPills: inside the photo, bottom left, the reactions as small pills "❤️ 12" that overlap sideways like a
 *    group of avatars (each covers a little of the one before it, but its emoji and count stay readable; the most
 *    given first and in front), a few of them, then "+N". The whole group is ONE button: a tap opens ReactorsSheet.
 *    The person's own reaction is filled with the primary colour.
 *  - QuickReactions: under the photo, a few emoji and "+" that opens the sheet with all of them. A tap reacts.
 *  - ReactionSheet: every emoji, in groups; a choice closes the sheet.
 *  - ReactorsSheet: who reacted with what (tabs: Semua and each emoji; a row = avatar, nama panggilan, emoji). The
 *    person's own row says "Kamu" and a tap on it takes the reaction back.
 * One reaction per person per photo; no message.
 */

/** How many pills show before "+N" (the rest are counted in it). */
export const PILLS_SHOWN = 4;

/** The pills on the photo, as one button that opens the list. Nothing when there is no reaction. */
export function ReactionPills({ reactions, mine, onOpen }: { reactions: ReactionCount[]; mine: boolean; onOpen?: () => void }) {
  const t = useT();
  if (!reactions.length) return null;
  // Most given first (a tie keeps its place); the person's own always shows, in the last place when it is not among the first ones.
  const sorted = reactions.map((entry, index) => ({ entry, index })).sort((a, b) => b.entry.count - a.entry.count || a.index - b.index).map(({ entry }) => entry);
  const shown = sorted.slice(0, PILLS_SHOWN);
  const own = sorted.findIndex(entry => entry.mine);
  if (own >= PILLS_SHOWN) shown[PILLS_SHOWN - 1] = sorted[own];
  const rest = reactionTotal(sorted) - reactionTotal(shown);
  const label = t(mine ? "momen.react.openMine" : "momen.react.open", { n: reactionTotal(sorted) });
  const body = <>
    {shown.map(entry => <span key={entry.emoji} className={css.pill} data-mine={entry.mine || undefined} aria-hidden>
      <span className={css.pillEmoji}>{entry.emoji}</span><span className={css.pillCount}>{entry.count}</span>
    </span>)}
    {rest > 0 && <span className={`${css.pill} ${css.pillRest}`} aria-hidden><span className={css.pillCount}>{t("momen.react.overflow", { n: rest })}</span></span>}
  </>;
  return onOpen
    ? <button type="button" className={css.pills} aria-haspopup="dialog" aria-label={label} onClick={onOpen}>{body}</button>
    : <div className={css.pills} data-static role="img" aria-label={label}>{body}</div>;
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

type Loaded = { photo: string; state: "memuat" | "siap" | "gagal"; reactors: Reactor[] };

/**
 * Who reacted with what, on one photo: fetched when the sheet opens (never kept; `demo` shows a fixed list with
 * no network). The tabs are "Semua" and one per emoji that is in the list, most given first; a row is the
 * person's avatar, nama panggilan and emoji. The person's own row is marked "Kamu" and a tap on it takes the
 * reaction back (`onRemove`), then the row goes.
 */
export function ReactorsSheet({ open, onClose, photoId, onRemove, demo }: {
  open: boolean;
  onClose: () => void;
  photoId: string | null;
  /** Take the person's own reaction back (the screen sends it); resolves when it is done. */
  onRemove: (emoji: string) => void | Promise<void>;
  /** Dev preview: a fixed list, or the loading or failed state; no network. */
  demo?: Reactor[] | "memuat" | "gagal";
}) {
  const t = useT();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tab, setTab] = useState("semua");
  const [attempt, setAttempt] = useState(0);
  const wanted = open && photoId ? photoId : null;

  /* eslint-disable react-hooks/set-state-in-effect -- a request started when the sheet opens, with its own loading flag */
  useEffect(() => {
    if (!wanted) return;
    setTab("semua");
    if (demo) { setLoaded({ photo: wanted, state: demo === "memuat" ? "memuat" : demo === "gagal" ? "gagal" : "siap", reactors: typeof demo === "string" ? [] : demo }); return; }
    let cancelled = false;
    setLoaded({ photo: wanted, state: "memuat", reactors: [] });
    praWamRequest<{ reactors: Reactor[] }>(mainWamApi.photoReaction(wanted))
      .then(({ data }) => { if (!cancelled) setLoaded({ photo: wanted, state: "siap", reactors: data.reactors }); })
      .catch(() => { if (!cancelled) setLoaded({ photo: wanted, state: "gagal", reactors: [] }); });
    return () => { cancelled = true; };
  }, [wanted, demo, attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const current = loaded && loaded.photo === wanted ? loaded : null;
  const reactors = useMemo(() => current?.reactors ?? [], [current]);
  const perEmoji = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of reactors) counts.set(row.emoji, (counts.get(row.emoji) ?? 0) + 1);
    return [...counts].map(([emoji, count], order) => ({ emoji, count, order })).sort((a, b) => b.count - a.count || a.order - b.order);
  }, [reactors]);
  const active = tab === "semua" || perEmoji.some(entry => entry.emoji === tab) ? tab : "semua";
  const rows = active === "semua" ? reactors : reactors.filter(row => row.emoji === active);
  const title = current?.state === "siap" && reactors.length ? t("momen.react.who.titleN", { n: reactors.length }) : t("momen.react.who.title");

  async function remove(row: Reactor) {
    setLoaded(state => state && { ...state, reactors: state.reactors.filter(other => !other.mine) });
    await onRemove(row.emoji);
  }

  return <Sheet open={open} onClose={onClose} title={title}>
    {current?.state === "memuat" && <div className={css.whoSkeleton} role="status" aria-label={t("momen.react.who.loading")}>
      {[0, 1, 2, 3].map(index => <div key={index} className={css.whoRow}><Skeleton shape="circle" width={40} height={40} /><Skeleton shape="line" width={`${52 + index * 9}%`} /></div>)}
    </div>}
    {current?.state === "gagal" && <div className={css.whoMessage}>
      <Banner tone="error">{t("momen.react.who.failed")}</Banner>
      <Button variant="tonal" size="m" onClick={() => setAttempt(value => value + 1)}>{t("shell.retry")}</Button>
    </div>}
    {current?.state === "siap" && (reactors.length === 0
      ? <p className={css.whoEmpty}>{t("momen.react.who.empty")}</p>
      : <>
        <div className={css.whoTabs} role="group" aria-label={t("momen.react.who.filter")}>
          <button type="button" className={css.whoTab} aria-pressed={active === "semua"} onClick={() => setTab("semua")}>{t("momen.react.who.all")} <span className={css.whoTabCount}>{reactors.length}</span></button>
          {perEmoji.map(entry => <button key={entry.emoji} type="button" className={css.whoTab} aria-pressed={active === entry.emoji} aria-label={t("momen.react.pill", { emoji: entry.emoji, n: entry.count })} onClick={() => setTab(entry.emoji)}>
            <span aria-hidden>{entry.emoji}</span> <span className={css.whoTabCount} aria-hidden>{entry.count}</span>
          </button>)}
        </div>
        <ul className={css.whoList}>
          {rows.map(row => {
            const inner = <>
              <Avatar name={row.person.name} photo={row.person.photo} size={40} />
              <span className={css.whoText}>
                <span className={css.whoName}>{row.mine ? `${row.person.name} · ${t("momen.react.who.you")}` : row.person.name}</span>
                {row.mine && <span className={css.whoHint}>{t("momen.react.who.removeHint")}</span>}
              </span>
              <span className={css.whoEmoji} aria-hidden>{row.emoji}</span>
            </>;
            return <li key={row.person.id} className={css.whoItem}>
              {row.mine
                ? <button type="button" className={css.whoRow} data-mine aria-label={t("momen.react.who.remove", { emoji: row.emoji })} onClick={() => void remove(row)}>{inner}</button>
                : <div className={css.whoRow} role="group" aria-label={t("momen.react.who.row", { name: row.person.name, emoji: row.emoji })}>{inner}</div>}
            </li>;
          })}
        </ul>
      </>)}
  </Sheet>;
}
