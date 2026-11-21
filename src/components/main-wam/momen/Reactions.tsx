"use client";

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/components/main-wam/i18n";
import { Avatar, Banner, Button, Sheet, Skeleton } from "@/components/main-wam/ui";
import { praWamRequest } from "@/components/pra-wam/api";
import { departmentAbbr, QUICK_REACTIONS, reactionTotal, type ReactionCount } from "@/lib/main-wam/momen/reactions";
import type { FeedPhoto, Reactor } from "@/lib/main-wam/momen/types";
import { mainWamApi } from "@/lib/routes";
import css from "./reactions.module.css";

/*
 * Reactions in Momen (final prototype):
 *  - ReactionSummary: inside the photo, bottom left, a small pill: up to three avatars of the people who reacted, tightly
 *    overlapped, then the number of reactions. The whole pill is ONE button: a tap opens ReactorsSheet.
 *  - QuickReactions: under the photo, eight plain emoji (no card, no frame) laid out 4 × 2 in the middle with even gaps; they
 *    wrap by the row's own width (3 × 3 when very narrow, room kept for three rows). One reaction per person: a tap
 *    chooses, the same one again takes it back, another replaces it.
 *  - ReactorsSheet: who reacted with what (chips: Semua and each emoji; a row = avatar, nama panggilan, the department's
 *    short form, emoji). The person's own row says "Kamu" and a tap on it takes the reaction back.
 * No message.
 */

/** The most avatars on the pill. */
export const AVATARS_SHOWN = 3;

/** The pill on the photo, as one button that opens the list. Nothing when there is no reaction. */
export function ReactionSummary({ reactions, preview, me, mine, own, onOpen }: {
  reactions: ReactionCount[];
  /** The last few people who reacted (the photo's `reactors`); the viewer is added from `me`. */
  preview?: FeedPhoto["reactors"];
  /** The viewer, whose avatar goes first while their reaction is on the photo. */
  me?: { name: string; photo: string | null } | null;
  /** The viewer's own reaction is among them. */
  mine: boolean;
  /** The photo is the viewer's (the label says "pada fotomu"). */
  own: boolean;
  onOpen?: () => void;
}) {
  const t = useT();
  const total = reactionTotal(reactions);
  if (!total) return null;
  const people = [...(mine && me ? [{ id: "me", name: me.name, photo: me.photo }] : []), ...(preview ?? []).slice(0, AVATARS_SHOWN)].slice(0, AVATARS_SHOWN);
  // Fewer people known than avatars wanted (before the server sends them, or in a preview): a round emoji of the most given reactions stands in.
  const fillers = reactions.map(entry => entry.emoji).slice(0, Math.max(0, Math.min(AVATARS_SHOWN, total) - people.length));
  const label = t(own ? "momen.react.openMine" : "momen.react.open", { n: total });
  const body = <>
    <span className={css.avs} aria-hidden>
      {people.map(person => <Avatar key={person.id} name={person.name} photo={person.photo} size={24} />)}
      {fillers.map((emoji, index) => <span key={`${emoji}${index}`} className={css.avEmoji}>{emoji}</span>)}
    </span>
    <span className={css.sumCount} aria-hidden>{total}</span>
  </>;
  return onOpen
    ? <button type="button" className={css.sum} aria-haspopup="dialog" aria-label={label} onClick={onOpen}>{body}</button>
    : <div className={css.sum} data-static role="img" aria-label={label}>{body}</div>;
}

/** The row under another person's photo: eight plain emoji, 4 × 2. A tap chooses it; the same one again takes it back. */
export function QuickReactions({ chosen, onPick }: { chosen: string | null; onPick: (emoji: string) => void }) {
  const t = useT();
  return <div className={css.quick} role="group" aria-label={t("momen.react.quick")}>
    {QUICK_REACTIONS.map(emoji => <button key={emoji} type="button" className={css.quickButton} aria-pressed={chosen === emoji} data-dim={(chosen !== null && chosen !== emoji) || undefined}
      aria-label={t("momen.react.give", { emoji })} onClick={() => onPick(emoji)}>
      <span aria-hidden>{emoji}</span>
    </button>)}
  </div>;
}

type Loaded = { photo: string; state: "memuat" | "siap" | "gagal"; reactors: Reactor[] };

/**
 * Who reacted with what, on one photo: fetched when the sheet opens (never kept; `demo` shows a fixed list with
 * no network). The chips are "Semua" and one per emoji that is in the list, most given first; a row is the
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
                {row.mine ? <span className={css.whoHint}>{t("momen.react.who.removeHint")}</span> : departmentAbbr(row.person.department) && <span className={css.whoHint}>{departmentAbbr(row.person.department)}</span>}
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
