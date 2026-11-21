"use client";

import { useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronRight, Hourglass, ListFilter, Medal, Target } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ScreenContent, ShellActions } from "@/components/main-wam/shell";
import { Banner, Button, EmptyState, EyebrowLabel, IconBox, List, ListRow, Pill, Sheet, SrOnly, Text } from "@/components/main-wam/ui";
import { canStart, MISSION_FILTERS, rulesOf, sections, whenOf, type MisiView, type MissionFilter, type MissionItem, type MissionSort } from "@/lib/main-wam/misi/missions";
import { mainWamPath } from "@/lib/routes";
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
                  : item.status === "rejected" ? <Pill tone="error">{t("misi.row.rejected")}</Pill>
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

    <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title={t("misi.sort.title")}>
      <List plain>
        {(["desc", "asc"] as const).map(key => <ListRow key={key} title={t(key === "desc" ? "misi.sort.high" : "misi.sort.low")} aria-pressed={sort === key}
          trailing={sort === key ? <Check aria-hidden /> : undefined} chevron={false} onClick={() => { setSort(key); setSortOpen(false); }} />)}
      </List>
    </Sheet>
    {selected && <MissionSheet item={selected} index={items.indexOf(selected) + 1} total={items.length} onClose={() => setOpenId(null)} lang={lang} />}
  </ScreenContent>;
}

/** The sheet of one mission: only its description, what earns the points, and one button. */
function MissionSheet({ item, index, total, onClose, lang }: { item: MissionItem; index: number; total: number; onClose: () => void; lang: ReturnType<typeof useLang>["lang"] }) {
  const t = useT();
  const rules = rulesOf(item, lang);
  let action;
  if (item.status === "done") action = <Button block disabled icon={<CheckCircle2 />}>{t("misi.sheet.done")}</Button>;
  else if (item.status === "pending") action = <Button block disabled icon={<Hourglass />}>{t("misi.sheet.pending")}</Button>;
  else if (item.availability === "tutup") action = <Button block disabled>{t("misi.sheet.closed")}</Button>;
  else if (item.availability === "belum") action = <Button block disabled>{t("misi.sheet.soon", { when: item.opensAt ? whenOf(item.opensAt, lang) : "" })}</Button>;
  else if (item.kind === "sesi") action = item.sessionId
    ? <Button block icon={<Target />} href={mainWamPath.session(item.sessionId)}>{t("misi.sheet.do")}</Button>
    : <Button block disabled>{t("misi.sheet.noSession")}</Button>;
  else if (canStart(item)) action = <Button block icon={<Target />} href={mainWamPath.missionDo(item.id)}>{t("misi.sheet.do")}</Button>;
  return <Sheet open onClose={onClose} title={item.title} subtitle={t("misi.sheet.kicker", { n: index, total })} footer={action}>
    <div className={css.sheetBody}>
      <p className={css.sheetPoints}><b aria-hidden>+{item.points}</b><span aria-hidden>{t("misi.page.points")}</span><SrOnly>{t("misi.sheet.points", { points: item.points })}</SrOnly></p>
      {item.description && <Text variant="body-long" color="2">{item.description}</Text>}
      {item.status === "rejected" && <Banner tone="warning" title={t("misi.sheet.rejected")}>{item.rejectedNote ? `${t("misi.sheet.rejectedNote", { note: item.rejectedNote })} ` : ""}{t("misi.sheet.rejectedAgain")}</Banner>}
      <EyebrowLabel as="h3">{t("misi.sheet.rules")}</EyebrowLabel>
      <ul className={css.rules}>
        {rules.map(rule => <li key={rule.title} className={css.rule}>
          <IconBox icon={<ReqIcon name={rule.icon} />} className={css.ruleIcon} />
          <span className={css.ruleText}><b>{rule.title}</b>{rule.note && <small>{rule.note}</small>}</span>
        </li>)}
      </ul>
    </div>
  </Sheet>;
}
