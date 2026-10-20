"use client";

import type { ReactNode } from "react";
import { Languages } from "lucide-react";
import type { EnglishContent, EventLanguage, EventRecord, TextPair } from "@/lib/types";
import { translatableFields, translationGaps } from "@/lib/wording/localize";
import { BlockIntro, ChoiceCards } from "./JourneyEditor";
import styles from "./admin.module.css";

type Update = <K extends keyof EventRecord>(key: K, value: EventRecord[K]) => void;
type Control = (name: string, label: string, value: string, onChange: (value: string) => void, options?: { multiline?: boolean; hint?: string; maxLength?: number }) => ReactNode;

const languageOptions: { value: EventLanguage; label: string; description: string; recommended?: boolean }[] = [
  { value: "id", label: "Bahasa Indonesia saja", description: "Semua tamu membaca dalam Bahasa Indonesia." },
  { value: "id_en", label: "Dua bahasa (ID + EN)", description: "Tamu bisa beralih ke English lewat tombol ID/EN di atas halaman.", recommended: true },
  { value: "en", label: "English saja", description: "Halaman langsung tampil dalam English, untuk tamu mancanegara." },
];
export const languageLabels: Record<EventLanguage, string> = { id: "Bahasa Indonesia", id_en: "Dua bahasa", en: "English" };

const short = (text: string) => (text.length > 140 ? `${text.slice(0, 140)}…` : text);
const emptyPair: TextPair = { title: "", description: "" };

/** Language choice plus every English text, listed only where the Indonesian text exists. */
export function TranslationBlock({ event, update, control }: { event: EventRecord; update: Update; control: Control }) {
  const en = event.translations.en;
  const setEn = <K extends keyof EnglishContent>(key: K, value: EnglishContent[K]) => update("translations", { ...event.translations, en: { ...en, [key]: value } });
  const gaps = translationGaps(event);
  const fields = translatableFields.filter(field => field.source(event).trim());
  const groups = [...new Set(fields.map(field => field.group))];
  const pairFields = (name: string, label: string, source: TextPair, english: TextPair | undefined, onChange: (patch: Partial<TextPair>) => void, max: [number, number]) => <div className={styles.item} key={name}>
    <h4>{label}</h4>
    {source.title && control(`${name}.title`, "Judul (English)", english?.title ?? "", title => onChange({ title }), { maxLength: max[0], hint: `ID: ${short(source.title)}` })}
    {source.description && control(`${name}.description`, "Keterangan (English)", english?.description ?? "", description => onChange({ description }), { multiline: true, maxLength: max[1], hint: `ID: ${short(source.description)}` })}
  </div>;
  return <div className="stack">
    <BlockIntro why="Atur bahasa halaman tamu. Teks sistem (tombol, label, pesan) sudah tersedia dalam dua bahasa dari kamus wording; di sini Anda menerjemahkan isi acara. Teks yang belum diterjemahkan tetap tampil dalam Bahasa Indonesia dengan catatan kecil." who="panitia atau penerjemah" />
    <ChoiceCards name="language" legend="Bahasa halaman tamu" current={event.language} onPick={value => update("language", value)} options={languageOptions.map(option => ({ ...option, icon: Languages }))} />
    {event.language !== "id" && <>
      <p className={styles.translationProgress} role="status">{gaps.total === 0 ? "Belum ada teks acara yang perlu diterjemahkan." : `${gaps.total - gaps.missing} dari ${gaps.total} teks sudah diterjemahkan.`}</p>
      {groups.map(group => <fieldset key={group} className={styles.translationGroup}>
        <legend>{group}</legend>
        {fields.filter(field => field.group === group).map(field => <div key={field.key}>
          {control(`translations.en.${field.key}`, `${field.label} (English)`, en[field.key], value => setEn(field.key, value), { multiline: field.multiline, maxLength: field.max, hint: `ID: ${short(field.source(event))}` })}
        </div>)}
      </fieldset>)}
      {event.topics.length > 0 && <fieldset className={styles.translationGroup}><legend>Topik pembahasan</legend>
        {event.topics.map((topic, index) => pairFields(`topics.${index}.en`, `Topik ${index + 1}`, topic, topic.en, patch =>
          update("topics", event.topics.map((item, i) => i === index ? { ...item, en: { ...emptyPair, ...item.en, ...patch } } : item)), [200, 1500]))}
      </fieldset>}
      {event.agenda.length > 0 && <fieldset className={styles.translationGroup}><legend>Rundown</legend>
        {event.agenda.map((item, index) => pairFields(`translations.en.agenda.${item.id}`, `Sesi ${index + 1}`, item, en.agenda[item.id], patch =>
          setEn("agenda", { ...en.agenda, [item.id]: { ...emptyPair, ...en.agenda[item.id], ...patch } }), [200, 1500]))}
      </fieldset>}
      {event.experience.moments.length > 0 && <fieldset className={styles.translationGroup}><legend>Momen pengalaman</legend>
        {event.experience.moments.map((moment, index) => pairFields(`experience.moments.${index}.en`, `Momen ${index + 1}`, moment, moment.en, patch =>
          update("experience", { ...event.experience, moments: event.experience.moments.map((item, i) => i === index ? { ...item, en: { ...emptyPair, ...item.en, ...patch } } : item) }), [150, 300]))}
      </fieldset>}
      {event.prepare.items.length > 0 && <fieldset className={styles.translationGroup}><legend>Kartu persiapan</legend>
        {event.prepare.items.map((item, index) => {
          const setItem = (patch: Partial<TextPair & { list: string[] }>) => update("prepare", { ...event.prepare, items: event.prepare.items.map((card, i) => i === index ? { ...card, en: { ...emptyPair, list: [], ...card.en, ...patch } } : card) });
          return <div key={index}>
            {pairFields(`prepare.items.${index}.en`, item.title || `Kartu ${index + 1}`, item, item.en, setItem, [150, 1000])}
            {item.list.length > 0 && control(`prepare.items.${index}.en.list`, "Daftar (English, satu per baris)", (item.en?.list ?? []).join("\n"), value => setItem({ list: value.split("\n") }), { multiline: true, hint: `ID: ${short(item.list.join(", "))}` })}
          </div>;
        })}
      </fieldset>}
    </>}
  </div>;
}
