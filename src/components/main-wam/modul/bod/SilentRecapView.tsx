"use client";

import { useState } from "react";
import { Lock, MessageSquareDashed } from "lucide-react";
import { ScreenContent, ScreenSection, Stack } from "@/components/main-wam/shell";
import { Card, Chip, ChipRow, EmptyState, FilterChip, ProgressBar, SectionHeader } from "@/components/main-wam/ui";
import { NO_TOPIC, SILENT_MIN_PEOPLE, sessionWhenLabel, type SilentRecap } from "@/lib/main-wam/modul/silent";
import css from "../modul.module.css";

/**
 * B05 Rekap Silent Meeting (BOD): how many, the question, per topic, and the feedback itself, in a
 * new random order each time and without any time. Before it is closed, or below 5 feedbacks from 5
 * people, only the count shows (B05__status), so no sender can be guessed.
 */
export function SilentRecapView({ recap }: { recap: SilentRecap | null }) {
  const [topic, setTopic] = useState<string | null>(null);
  if (!recap) {
    return <ScreenContent>
      <EmptyState icon={<MessageSquareDashed />} title="Belum ada Silent Meeting">Rekap tampil di sini setelah Silent Meeting dibuka.</EmptyState>
    </ScreenContent>;
  }
  const { view, count, ready, topics, items } = recap;
  const shown = topic ? items.filter(item => (item.topic || NO_TOPIC) === topic) : items;
  const usedTopics = topics.filter(row => row.count > 0);
  return <ScreenContent>
    <div>
      <p className={css.kicker}>{sessionWhenLabel(view.session)}</p>
      <p className={css.bigCount}>{`${count.toLocaleString("id-ID")} masukan`}</p>
      {ready && <p className={css.lockLine}><Lock aria-hidden />Tanpa nama</p>}
    </div>
    {ready && <Card variant="tonal"><p className={css.questionText}>{view.question.question}</p></Card>}
    {!ready && <Card>
      <EmptyState size="s" icon={<Lock />} title={view.state === "tutup" ? `Rekap tampil setelah ${SILENT_MIN_PEOPLE} masukan` : "Rekap tampil setelah ditutup"}>
        Supaya pengirim tidak bisa ditebak.
      </EmptyState>
    </Card>}
    {ready && <ScreenSection label="Per topik">
      <SectionHeader title="Per topik" />
      <Card><div className={css.bars}>
        {topics.map(row => <ProgressBar key={row.topic} label={row.topic} value={row.count} max={count} valueText={row.count.toLocaleString("id-ID")} />)}
      </div></Card>
    </ScreenSection>}
    {ready && <ScreenSection label="Masukan">
      {usedTopics.length > 1 && <ChipRow scroll label="Saring topik">
        <FilterChip selected={topic === null} onClick={() => setTopic(null)}>Semua</FilterChip>
        {usedTopics.map(row => <FilterChip key={row.topic} selected={topic === row.topic} onClick={() => setTopic(row.topic)}>{row.topic}</FilterChip>)}
      </ChipRow>}
      <Stack>
        {shown.map(item => <Card key={item.id} as="article">
          <p className={css.feedbackBody}>{item.body}</p>
          {item.topic && <div className={css.feedbackTopic}><Chip>{item.topic}</Chip></div>}
        </Card>)}
      </Stack>
    </ScreenSection>}
  </ScreenContent>;
}
