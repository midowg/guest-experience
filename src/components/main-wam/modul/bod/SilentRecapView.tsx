"use client";

import { useState } from "react";
import { Lock, MessageSquareDashed } from "lucide-react";
import { ScreenContent, ScreenSection, Stack } from "@/components/main-wam/shell";
import { Button, Card, Chip, ChipRow, EmptyState, FilterChip, ProgressBar, SectionHeader } from "@/components/main-wam/ui";
import { NO_TOPIC, SILENT_MIN_PEOPLE, sessionWhenLabel, type SilentRecap } from "@/lib/main-wam/modul/silent";
import css from "../modul.module.css";

/** Feedback cards shown at first, then this many more per "Tampilkan lagi" (UX T-K02). */
export const RECAP_PAGE = 20;

/**
 * B05 Rekap Silent Meeting (BOD): how many, the question, per topic, and the feedback itself, in a
 * new random order each time and without any time; 20 at a time, the topic filter stays on top.
 * While it is open, or once closed below 5 feedbacks of 5 people, no number at all (audit H2): only
 * that the recap comes later, so no sender can be guessed.
 */
export function SilentRecapView({ recap }: { recap: SilentRecap | null }) {
  const [topic, setTopic] = useState<string | null>(null);
  const [shown, setShown] = useState(RECAP_PAGE);
  if (!recap) {
    return <ScreenContent>
      <EmptyState icon={<MessageSquareDashed />} title="Belum ada Silent Meeting">Rekap tampil di sini setelah Silent Meeting dibuka.</EmptyState>
    </ScreenContent>;
  }
  const { view, count, ready, topics, items } = recap;
  const filtered = topic ? items.filter(item => (item.topic || NO_TOPIC) === topic) : items;
  const usedTopics = topics.filter(row => row.count > 0);
  const pick = (next: string | null) => { setTopic(next); setShown(RECAP_PAGE); };
  return <ScreenContent>
    <div>
      <p className={css.kicker}>{sessionWhenLabel(view.session)}</p>
      {ready && count !== null && <p className={css.bigCount}>{`${count.toLocaleString("id-ID")} masukan`}</p>}
      {ready && <p className={css.lockLine}><Lock aria-hidden />Tanpa nama</p>}
    </div>
    {ready && <Card variant="tonal"><p className={css.questionText}>{view.question.question}</p></Card>}
    {!ready && <Card>
      {view.state === "tutup"
        ? <EmptyState size="s" icon={<Lock />} title="Masukan belum cukup untuk rekap">
          {`Rekap tampil dari ${SILENT_MIN_PEOPLE} masukan dan ${SILENT_MIN_PEOPLE} orang, supaya pengirim tidak bisa ditebak.`}
        </EmptyState>
        : <EmptyState size="s" icon={<Lock />} title="Rekap tampil setelah ditutup">Supaya pengirim tidak bisa ditebak.</EmptyState>}
    </Card>}
    {ready && count !== null && <ScreenSection label="Per topik">
      <SectionHeader title="Per topik" />
      <Card><div className={css.bars}>
        {topics.map(row => <ProgressBar key={row.topic} label={row.topic} value={row.count} max={count} valueText={row.count.toLocaleString("id-ID")} />)}
      </div></Card>
    </ScreenSection>}
    {ready && <ScreenSection label="Masukan">
      {usedTopics.length > 1 && <div className={css.stickyFilter}>
        <ChipRow scroll label="Saring topik">
          <FilterChip selected={topic === null} onClick={() => pick(null)}>Semua</FilterChip>
          {usedTopics.map(row => <FilterChip key={row.topic} selected={topic === row.topic} onClick={() => pick(row.topic)}>{row.topic}</FilterChip>)}
        </ChipRow>
      </div>}
      <Stack>
        {filtered.slice(0, shown).map(item => <Card key={item.id} as="article">
          <p className={css.feedbackBody}>{item.body}</p>
          {item.topic && <div className={css.feedbackTopic}><Chip>{item.topic}</Chip></div>}
        </Card>)}
      </Stack>
      {filtered.length > shown && <Button block variant="secondary" onClick={() => setShown(current => current + RECAP_PAGE)}>
        {`Tampilkan lagi (${(filtered.length - shown).toLocaleString("id-ID")})`}
      </Button>}
    </ScreenSection>}
  </ScreenContent>;
}
