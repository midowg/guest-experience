"use client";

import { useMemo, useState } from "react";
import { Check, CheckCircle2, Hourglass, Medal, Target } from "lucide-react";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ScreenContent, ShellActions } from "@/components/main-wam/shell";
import { Banner, Button, Card, ChipRow, EmptyState, FilterChip, List, ListRow, Pill, Sheet, Text } from "@/components/main-wam/ui";
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

/**
 * Halaman Misi: points, the place in the Peringkat, a ring of missions done, the filter (Semua, Belum,
 * Berhasil) and the order of points, and the missions: still to do on top, done below. A mission opens
 * a sheet with its description and what earns the points, and one button, "Kerjakan misi". The camera
 * is its own page, never inside the sheet. The Peringkat button sits at the end of the top bar.
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

  return <ScreenContent>
    {view.leaderboardOpen && <ShellActions><Button variant="tonal" size="m" icon={<Medal />} href={mainWamPath.missionRank}>{t("misi.page.rankButton")}</Button></ShellActions>}
    <Card as="section" className={css.hero}>
      <div className={css.heroText}>
        <Text variant="label" color="2">{t("misi.page.yourPoints")}</Text>
        <p className={css.bigPoints}><span className={css.bigNumber}>{view.points}</span><span className={css.bigUnit}>{t("misi.page.points")}</span></p>
        {view.leaderboardOpen && <p className={css.place}><Medal aria-hidden />{view.place ? t("misi.page.place", { rank: view.place.rank, total: view.place.of }) : t("misi.page.placeNone")}</p>}
      </div>
      <Ring done={summary.done} total={summary.total} />
    </Card>

    {!items.length
      ? <EmptyState icon={<Target />} title={t("misi.empty.title")}>{t("misi.empty.body")}</EmptyState>
      : <>
        <ChipRow label={t("misi.filter.label")}>
          {MISSION_FILTERS.map(key => <FilterChip key={key} selected={filter === key} onClick={() => setFilter(key)}>{t(`misi.filter.${key}` as const)} {counts[key]}</FilterChip>)}
          <FilterChip menu name={t("misi.sort.title")} active={sort !== "desc"} expanded={sortOpen} onClick={() => setSortOpen(true)}>{sort === "desc" ? t("misi.sort.buttonHigh") : t("misi.sort.buttonLow")}</FilterChip>
        </ChipRow>

        {shown.todo.length > 0 && <section aria-labelledby="misi-todo" className={css.section}>
          <div className={css.sectionHead}>
            <Text as="h2" variant="label" id="misi-todo">{t("misi.section.todo", { n: shown.todo.length })}</Text>
            <Text variant="caption" color="2">{t("misi.section.todoAvailable", { points: shown.todo.filter(item => item.availability !== "tutup").reduce((sum, item) => sum + item.points, 0) })}</Text>
          </div>
          <List>
            {shown.todo.map(item => <ListRow key={item.id} icon={kindIcon(item.kind)} title={item.title}
              sub={item.status === "pending" ? <Pill tone="warning">{t("misi.row.pending")}</Pill>
                : item.status === "rejected" ? <Pill tone="error">{t("misi.row.rejected")}</Pill>
                  : item.availability === "tutup" ? <Pill>{t("misi.row.closed")}</Pill>
                    : item.availability === "belum" ? <Pill>{t("misi.row.soon")}</Pill> : <ReqChips item={item} />}
              value={<span className={css.rowPoints}>+{item.points}</span>} onClick={() => setOpenId(item.id)} />)}
          </List>
        </section>}

        {shown.done.length > 0 && <section aria-labelledby="misi-done" className={css.section}>
          <div className={css.sectionHead}>
            <Text as="h2" variant="label" id="misi-done">{t("misi.section.done", { n: shown.done.length })}</Text>
            <Text variant="caption" color="2">{t("misi.section.doneEarned", { points: shown.done.reduce((sum, item) => sum + item.points, 0) })}</Text>
          </div>
          <List>
            {shown.done.map(item => <ListRow key={item.id} leading={<span className={css.doneMark}><Check aria-hidden /></span>} title={item.title} spoken={t("misi.row.doneSr")}
              value={<span className={css.rowPoints}>+{item.points}</span>} onClick={() => setOpenId(item.id)} />)}
          </List>
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
      <p className={css.sheetPoints}><b>{t("misi.sheet.points", { points: item.points })}</b></p>
      {item.description && <Text variant="body-long" color="2">{item.description}</Text>}
      {item.status === "rejected" && <Banner tone="warning" title={t("misi.sheet.rejected")}>{item.rejectedNote ? `${t("misi.sheet.rejectedNote", { note: item.rejectedNote })} ` : ""}{t("misi.sheet.rejectedAgain")}</Banner>}
      <Text as="h3" variant="label" color="2">{t("misi.sheet.rules")}</Text>
      <ul className={css.rules}>
        {rules.map(rule => <li key={rule.title} className={css.rule}>
          <span className={css.ruleIcon}><ReqIcon name={rule.icon} /></span>
          <span className={css.ruleText}><b>{rule.title}</b>{rule.note && <small>{rule.note}</small>}</span>
        </li>)}
      </ul>
    </div>
  </Sheet>;
}
