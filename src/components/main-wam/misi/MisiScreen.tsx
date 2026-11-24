"use client";

import { useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronRight, Hourglass, ListFilter, Medal, Tag, Target } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ScreenContent, ShellActions } from "@/components/main-wam/shell";
import { Banner, Button, EmptyState, EyebrowLabel, IconBox, List, ListRow, Pill, Sheet, SrOnly, Text } from "@/components/main-wam/ui";
import { canStart, MISSION_FILTERS, rulesOf, sections, whenOf, type MisiView, type MissionFilter, type MissionItem, type MissionSort } from "@/lib/main-wam/misi/missions";
import { canResend } from "@/lib/main-wam/misi/verify";
import { mainWamApi, mainWamPath } from "@/lib/routes";
import { errorText, misiRequest } from "./request";
import { kindIcon, ReqChips, ReqIcon } from "./MisiParts";
import css from "./misi.module.css";

const RING = 226; // 2π × 36, the ring's circumference

/** The ring of the hero: n of m missions done. */
function Ring({ done, total }: { done: number; total: number }) {
  const t = useT();
  const share = total > 0 ? Math.min(1, done / total) : 0;
  return <div className={css.ring} role="img" aria-label={t("misi.page.ringLabel", { done, total })}>
    <svg width="86" height="86" viewBox="0 0 86 86" aria-hidden>
      <circle className={css.ringTrack} cx="43" cy="43" r="36" />
      <circle className={css.ringFill} cx="43" cy="43" r="36" strokeDasharray={RING} strokeDashoffset={RING - RING * share} />
    </svg>
    <span className={css.ringText} aria-hidden><b>{done}/{total}</b><small>{t("misi.page.ringUnit")}</small></span>
  </div>;
}

/** A section's label: the name in ink, the count after "·" muted (the prototype's .cap with a bold name). */
function SectionTitle({ id, text }: { id: string; text: string }) {
  const at = text.indexOf(" · ");
  return <h2 id={id} className={css.secTitle}>{at < 0 ? <b>{text}</b> : <><b>{text.slice(0, at)}</b>{text.slice(at)}</>}</h2>;
}

/**
 * Halaman Misi (prototipe SC.misi): points as a big figure with the place and a ring of missions done,
 * the filter (Semua, Belum, Berhasil) and the order of points, and the missions: still to do on top as
 * gold-edged cards, done below as quiet rows. A mission opens a sheet with its description and what
 * earns the points, and one button, "Kerjakan misi". The camera is its own page, never inside the
 * sheet. The Peringkat button sits at the end of the top bar.
 */
export function MisiScreen({ view, initialOpen = null }: { view: MisiView; /** Dev preview only: a mission whose sheet is open from the start. */ initialOpen?: string | null }) {
  const t = useT();
  const { lang } = useLang();
  const [filter, setFilter] = useState<MissionFilter>("all");
  const [sort, setSort] = useState<MissionSort>("desc");
  const [sortOpen, setSortOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpen);
  const { items, summary } = view;
  const shown = useMemo(() => sections(items, filter, sort), [items, filter, sort]);
  const todoCount = items.filter(item => item.status !== "done").length;
  const counts: Record<MissionFilter, number> = { all: items.length, todo: todoCount, done: summary.done };
  const selected = items.find(item => item.id === openId) ?? null;

  if (!view.migrated) return <ScreenContent><EmptyState icon={<Hourglass />} title={t("peserta.waiting.title")}>{t("misi.waiting")}</EmptyState></ScreenContent>;

  return <ScreenContent className={css.page}>
    {view.leaderboardOpen && <ShellActions><Button variant="tonal" size="m" icon={<Medal />} href={mainWamPath.missionRank} className={css.rankButton}>{t("misi.page.rankButton")}</Button></ShellActions>}
    <section className={css.hero}>
      <div className={css.heroText}>
        <EyebrowLabel tone="gold">{t("misi.page.yourPoints")}</EyebrowLabel>
        <p className={css.bigPoints}><span className={css.bigNumber}>{view.points}</span><span className={css.bigUnit}>{t("misi.page.points")}</span></p>
        {view.leaderboardOpen && <p className={css.place}><Medal aria-hidden />{view.place ? t("misi.page.place", { rank: view.place.rank, total: view.place.of }) : t("misi.page.placeNone")}</p>}
      </div>
      <Ring done={summary.done} total={summary.total} />
    </section>

    {!items.length
      ? <EmptyState icon={<Target />} title={t("misi.empty.title")}>{t("misi.empty.body")}</EmptyState>
      : <>
        <div role="group" aria-label={t("misi.filter.label")} className={css.chipBar}>
          {MISSION_FILTERS.map(key => <button key={key} type="button" aria-pressed={filter === key} className={css.fchip} onClick={() => setFilter(key)}>{t(`misi.filter.${key}` as const)} <b>{counts[key]}</b></button>)}
          <button type="button" className={css.sortBtn} aria-haspopup="dialog" aria-expanded={sortOpen} data-active={sort !== "desc" ? "" : undefined} onClick={() => setSortOpen(true)}>
            <SrOnly>{t("misi.sort.title")}: {sort === "desc" ? t("misi.sort.buttonHigh") : t("misi.sort.buttonLow")}</SrOnly><ListFilter aria-hidden /><span aria-hidden>{t("misi.page.points").replace(/^./, c => c.toUpperCase())} {sort === "desc" ? "▼" : "▲"}</span>
          </button>
        </div>

        {shown.todo.length > 0 && <section aria-labelledby="misi-todo" className={css.section}>
          <div className={css.sectionHead}>
            <SectionTitle id="misi-todo" text={t("misi.section.todo", { n: shown.todo.length })} />
            <span className={css.avail}>{t("misi.section.todoAvailable", { points: shown.todo.filter(item => item.availability !== "tutup").reduce((sum, item) => sum + item.points, 0) })}</span>
          </div>
          <ul className={css.rows}>
            {shown.todo.map(item => <li key={item.id}><button type="button" className={css.mrow} onClick={() => setOpenId(item.id)}>
              <IconBox icon={kindIcon(item.kind)} className={css.mIcon} />
              <span className={css.mText}>
                <b>{item.title}</b>
                {item.status === "pending" ? <Pill tone="warning">{t("misi.row.pending")}</Pill>
                  : item.status === "review" ? <Pill tone="warning">{t("misi.row.review")}</Pill>
                  : item.status === "rejected" ? <Pill tone="error">{canStart(item) ? t("misi.row.rejected") : t("misi.status.rejected")}</Pill>
                    : item.availability === "tutup" ? <Pill>{t("misi.row.closed")}</Pill>
                      : item.availability === "belum" ? <Pill>{t("misi.row.soon")}</Pill> : <ReqChips item={item} />}
              </span>
              <span className={css.rowPoints}>+{item.points}<ChevronRight aria-hidden /></span>
            </button></li>)}
          </ul>
        </section>}

        {shown.done.length > 0 && <section aria-labelledby="misi-done" className={css.section}>
          <div className={css.sectionHead}>
            <SectionTitle id="misi-done" text={t("misi.section.done", { n: shown.done.length })} />
            <span className={css.earned}>{t("misi.section.doneEarned", { points: shown.done.reduce((sum, item) => sum + item.points, 0) })}</span>
          </div>
          <ul className={css.doneRows}>
            {shown.done.map(item => <li key={item.id}><button type="button" className={css.drow} onClick={() => setOpenId(item.id)}>
              <span className={css.doneMark}><Check aria-hidden /></span>
              <span className={css.dText}>{item.title}<SrOnly> {t("misi.row.doneSr")}</SrOnly></span>
              <span className={css.donePoints}>+{item.points}</span>
            </button></li>)}
          </ul>
        </section>}

        {!shown.todo.length && !shown.done.length && <p className={css.emptyFilter}>{t("misi.emptyFilter")}</p>}
      </>}

    {view.taggedIn.length > 0 && <TaggedList view={view} />}

    <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title={t("misi.sort.title")}>
      <List plain>
        {(["desc", "asc"] as const).map(key => <ListRow key={key} title={t(key === "desc" ? "misi.sort.high" : "misi.sort.low")} aria-pressed={sort === key}
          trailing={sort === key ? <Check aria-hidden /> : undefined} chevron={false} onClick={() => { setSort(key); setSortOpen(false); }} />)}
      </List>
    </Sheet>
    {selected && <MissionSheet item={selected} index={items.indexOf(selected) + 1} total={items.length} onClose={() => setOpenId(null)} lang={lang} />}
  </ScreenContent>;
}

/** The photos I am tagged in, each with "Lepas tag" (only the tagged person lifts a tag). */
function TaggedList({ view }: { view: MisiView }) {
  const t = useT();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function remove(photoId: string) {
    if (view.sample) { setGone(current => new Set(current).add(photoId)); return; }
    setBusy(photoId); setProblem(null);
    try { await misiRequest(mainWamApi.missionUntag(photoId), { method: "DELETE" }); setGone(current => new Set(current).add(photoId)); }
    catch (error) { setProblem(errorText(error) || t("misi.tagged.failed")); }
    finally { setBusy(null); }
  }
  const rows = view.taggedIn.filter(row => !gone.has(row.photoId));
  if (!rows.length && !gone.size) return null;
  return <section aria-labelledby="misi-tagged" className={css.section}>
    <div className={css.sectionHead}><SectionTitle id="misi-tagged" text={t("misi.tagged.title")} /></div>
    {problem && <Banner tone="error">{problem}</Banner>}
    {!rows.length && <p className={css.emptyFilter}>{t("misi.tagged.removed")}</p>}
    <ul className={css.rows}>
      {rows.map(row => <li key={row.photoId} className={css.taggedRow}>
        <IconBox icon={<Tag />} className={css.mIcon} />
        <span className={css.taggedText}>{t("misi.tagged.item", { name: row.byName, mission: row.missionTitle })}</span>
        <Button variant="secondary" size="m" loading={busy === row.photoId} onClick={() => void remove(row.photoId)}>{t("misi.tagged.remove")}</Button>
      </li>)}
    </ul>
  </section>;
}

/** The sheet of one mission: its description, the TNC (what earns the points), the state of my proof, and one button. */
function MissionSheet({ item, index, total, onClose, lang }: { item: MissionItem; index: number; total: number; onClose: () => void; lang: ReturnType<typeof useLang>["lang"] }) {
  const t = useT();
  const rules = rulesOf(item, lang);
  const resendable = item.status === "rejected" && canResend("ditolak", item.attempts, item.maxAttempts);
  let action;
  if (item.status === "done") action = <Button block disabled icon={<CheckCircle2 />}>{t("misi.sheet.done")}</Button>;
  else if (item.status === "pending") action = <Button block disabled icon={<Hourglass />}>{t("misi.sheet.pending")}</Button>;
  else if (item.status === "review") action = <Button block disabled icon={<Hourglass />}>{t("misi.sheet.review")}</Button>;
  else if (item.status === "rejected" && !resendable) action = <Button block disabled>{t("misi.sheet.noResend")}</Button>;
  else if (item.availability === "tutup") action = <Button block disabled>{t("misi.sheet.closed")}</Button>;
  else if (item.availability === "belum") action = <Button block disabled>{t("misi.sheet.soon", { when: item.opensAt ? whenOf(item.opensAt, lang) : "" })}</Button>;
  else if (item.kind === "sesi") action = item.sessionId
    ? <Button block icon={<Target />} href={mainWamPath.session(item.sessionId)}>{t("misi.sheet.do")}</Button>
    : <Button block disabled>{t("misi.sheet.noSession")}</Button>;
  else if (canStart(item)) action = <Button block icon={<Target />} href={mainWamPath.missionDo(item.id)}>{t(item.status === "rejected" ? "misi.sheet.resend" : "misi.sheet.do")}</Button>;
  return <Sheet open onClose={onClose} title={item.title} subtitle={t("misi.sheet.kicker", { n: index, total })} footer={action}>
    <div className={css.sheetBody}>
      <p className={css.sheetPoints}><b aria-hidden>+{item.points}</b><span aria-hidden>{t("misi.page.points")}</span><SrOnly>{t("misi.sheet.points", { points: item.points })}</SrOnly></p>
      {item.description && <Text variant="body-long" color="2">{item.description}</Text>}
      {item.status === "pending" && <Banner tone="info" title={t("misi.status.pending")}>{t("misi.sheet.pendingBody")}</Banner>}
      {item.status === "review" && <Banner tone="info" title={t("misi.status.review")}>{t("misi.sheet.reviewBody")}</Banner>}
      {item.status === "done" && <Banner tone="success" title={t("misi.status.approved", { points: item.points })} />}
      {item.status === "rejected" && <Banner tone="warning" title={t("misi.status.rejected")}>
        {item.rejectedNote ? `${t("misi.status.rejectedWhy", { why: item.rejectedNote })} ` : ""}
        {resendable ? t("misi.sheet.rejectedAgain") : t("misi.status.noResend")}
        {item.maxAttempts ? ` ${t("misi.status.tries", { n: item.attempts, max: item.maxAttempts })}` : ""}
      </Banner>}
      <EyebrowLabel as="h3">{t("misi.sheet.rules")}</EyebrowLabel>
      <ul className={css.rules}>
        {rules.map(rule => <li key={rule.title} className={css.rule}>
          <IconBox icon={<ReqIcon name={rule.icon} />} className={css.ruleIcon} />
          <span className={css.ruleText}><b>{rule.title}</b>{rule.note && <small>{rule.note}</small>}</span>
        </li>)}
      </ul>
      {item.kind === "foto" && <Text variant="caption" color="2">{t("misi.sheet.how")}</Text>}
    </div>
  </Sheet>;
}
