"use client";

import { Languages } from "lucide-react";
import type { EnglishContent, EventLanguage, EventRecord, TextPair } from "@/lib/types";
import type { GuideChapter, GuideItem, GuideSettings } from "@/lib/guide";
import { translatableFields, translationGaps } from "@/lib/wording/localize";
import { BlockIntro, ChoiceCards } from "@/components/admin/editor/JourneyEditor";
import styles from "@/components/admin/admin.module.css";
import type { Control, Update } from "@/components/admin/editor/kit";


const languageOptions: { value: EventLanguage; label: string; description: string; recommended?: boolean }[] = [
  { value: "id", label: "Bahasa Indonesia saja", description: "Semua tamu membaca dalam Bahasa Indonesia." },
  { value: "id_en", label: "Dua bahasa (ID + EN)", description: "Tamu bisa beralih ke English lewat tombol ID/EN di atas halaman.", recommended: true },
  { value: "en", label: "English saja", description: "Halaman langsung tampil dalam English, untuk tamu mancanegara." },
];
export const languageLabels: Record<EventLanguage, string> = { id: "Bahasa Indonesia", id_en: "Dua bahasa", en: "English" };

const short = (text: string) => (text.length > 140 ? `${text.slice(0, 140)}…` : text);
const emptyPair: TextPair = { title: "", description: "" };
const emptyCover = { eyebrow: "", title: "", subtitle: "" };
const emptyItem = { title: "", text: "", fact: "" };
const emptyChapter = { title: "", intro: "" };

/** E-Guide: English beside the cover, each chapter and each of its items, only where the Indonesian exists. */
function GuideTranslation({ guide, onChange, control }: { guide: GuideSettings; onChange: (guide: GuideSettings) => void; control: Control }) {
  const cover = guide.cover;
  const setCover = (patch: Partial<typeof emptyCover>) => onChange({ ...guide, cover: { ...cover, en: { ...emptyCover, ...cover.en, ...patch } } });
  const setChapter = (index: number, patch: Partial<GuideChapter>) => onChange({ ...guide, chapters: guide.chapters.map((chapter, i) => i === index ? { ...chapter, ...patch } : chapter) });
  const setItem = (index: number, at: number, item: GuideItem, patch: Partial<typeof emptyItem>) => setChapter(index, { items: guide.chapters[index].items.map((entry, i) => i === at ? { ...entry, en: { ...emptyItem, ...item.en, ...patch } } : entry) });
  const field = (name: string, label: string, source: string, value: string | undefined, onValue: (value: string) => void, max: number, multiline = false) =>
    source.trim() ? <div key={name}>{control(name, `${label} (English)`, value ?? "", onValue, { maxLength: max, multiline, hint: `ID: ${short(source)}` })}</div> : null;
  return <fieldset className={styles.translationGroup}><legend>E-Guide</legend>
    {(cover.eyebrow || cover.title || cover.subtitle) && <div className={styles.item}>
      <h4>Sampul</h4>
      {field("guide.cover.en.eyebrow", "Label kecil", cover.eyebrow, cover.en?.eyebrow, eyebrow => setCover({ eyebrow }), 120)}
      {field("guide.cover.en.title", "Judul sampul", cover.title, cover.en?.title, title => setCover({ title }), 200)}
      {field("guide.cover.en.subtitle", "Subjudul", cover.subtitle, cover.en?.subtitle, subtitle => setCover({ subtitle }), 400, true)}
    </div>}
    {guide.chapters.map((chapter, index) => (chapter.title || chapter.intro || chapter.items.length > 0) && <div className={styles.item} key={chapter.id}>
      <h4>Bab {index + 1}{chapter.title ? `: ${chapter.title}` : ""}</h4>
      {field(`guide.chapters.${index}.en.title`, "Judul bab", chapter.title, chapter.en?.title, title => setChapter(index, { en: { ...emptyChapter, ...chapter.en, title } }), 200)}
      {field(`guide.chapters.${index}.en.intro`, "Pengantar", chapter.intro, chapter.en?.intro, intro => setChapter(index, { en: { ...emptyChapter, ...chapter.en, intro } }), 2000, true)}
      {chapter.items.map((item, at) => <div key={item.id}>
        {field(`guide.chapters.${index}.items.${at}.en.title`, `Isi ${at + 1}: judul`, item.title, item.en?.title, title => setItem(index, at, item, { title }), 200)}
        {field(`guide.chapters.${index}.items.${at}.en.text`, `Isi ${at + 1}: teks`, item.text, item.en?.text, text => setItem(index, at, item, { text }), 2000, chapter.layout !== "phrases")}
        {field(`guide.chapters.${index}.items.${at}.en.fact`, `Isi ${at + 1}: Tahukah Anda?`, item.fact, item.en?.fact, fact => setItem(index, at, item, { fact }), 600, true)}
      </div>)}
    </div>)}
  </fieldset>;
}

/**
 * Language choice plus every English text, listed only where the Indonesian text exists. `only`
 * keeps the texts of some event fields and drops the language choice: Kunjungan Kantor shows each
 * screen's English beside its Indonesian ("Isi dalam: English").
 */
export function TranslationBlock({ event, update, control, only }: { event: EventRecord; update: Update; control: Control; only?: (path: string) => boolean }) {
  const en = event.translations.en;
  const setEn = <K extends keyof EnglishContent>(key: K, value: EnglishContent[K]) => update("translations", { ...event.translations, en: { ...en, [key]: value } });
  const gaps = translationGaps(event);
  const has = only ?? (() => true);
  const fields = translatableFields.filter(field => has(field.path) && field.source(event).trim());
  const groups = [...new Set(fields.map(field => field.group))];
  const pairFields = (name: string, label: string, source: TextPair, english: TextPair | undefined, onChange: (patch: Partial<TextPair>) => void, max: [number, number]) => <div className={styles.item} key={name}>
    <h4>{label}</h4>
    {source.title && control(`${name}.title`, "Judul (English)", english?.title ?? "", title => onChange({ title }), { maxLength: max[0], hint: `ID: ${short(source.title)}` })}
    {source.description && control(`${name}.description`, "Keterangan (English)", english?.description ?? "", description => onChange({ description }), { multiline: true, maxLength: max[1], hint: `ID: ${short(source.description)}` })}
  </div>;
  const texts = <>
      {groups.map(group => <fieldset key={group} className={styles.translationGroup}>
        <legend>{group}</legend>
        {fields.filter(field => field.group === group).map(field => <div key={field.key}>
          {control(`translations.en.${field.key}`, `${field.label} (English)`, en[field.key], value => setEn(field.key, value), { multiline: field.multiline, maxLength: field.max, hint: `ID: ${short(field.source(event))}` })}
        </div>)}
      </fieldset>)}
      {has("topics") && event.topics.length > 0 && <fieldset className={styles.translationGroup}><legend>Topik pembahasan</legend>
        {event.topics.map((topic, index) => pairFields(`topics.${index}.en`, `Topik ${index + 1}`, topic, topic.en, patch =>
          update("topics", event.topics.map((item, i) => i === index ? { ...item, en: { ...emptyPair, ...item.en, ...patch } } : item)), [200, 1500]))}
      </fieldset>}
      {has("agenda") && event.agenda.length > 0 && <fieldset className={styles.translationGroup}><legend>Rundown</legend>
        {event.agenda.map((item, index) => pairFields(`translations.en.agenda.${item.id}`, `Sesi ${index + 1}`, item, en.agenda[item.id], patch =>
          setEn("agenda", { ...en.agenda, [item.id]: { ...emptyPair, ...en.agenda[item.id], ...patch } }), [200, 1500]))}
      </fieldset>}
      {has("experience") && event.experience.moments.length > 0 && <fieldset className={styles.translationGroup}><legend>Momen pengalaman</legend>
        {event.experience.moments.map((moment, index) => pairFields(`experience.moments.${index}.en`, `Momen ${index + 1}`, moment, moment.en, patch =>
          update("experience", { ...event.experience, moments: event.experience.moments.map((item, i) => i === index ? { ...item, en: { ...emptyPair, ...item.en, ...patch } } : item) }), [150, 300]))}
      </fieldset>}
      {has("route") && (event.route.steps.length > 0 || (event.route.points ?? []).length > 0) && <fieldset className={styles.translationGroup}><legend>Cara datang</legend>
        {event.route.steps.map((step, index) => pairFields(`route.steps.${index}.en`, `Langkah ${index + 1}`, step, step.en, patch =>
          update("route", { ...event.route, steps: event.route.steps.map((item, i) => i === index ? { ...item, en: { ...emptyPair, ...item.en, ...patch } } : item) }), [150, 500]))}
        {(event.route.points ?? []).map((point, index) => pairFields(`route.points.${index}.en`, `Info kedatangan ${index + 1}`, point, point.en, patch =>
          update("route", { ...event.route, points: event.route.points.map((item, i) => i === index ? { ...item, en: { ...emptyPair, ...item.en, ...patch } } : item) }), [120, 300]))}
      </fieldset>}
      {has("guide") && event.event_kind === "eguide" && <GuideTranslation guide={event.guide} onChange={guide => update("guide", guide)} control={control} />}
      {has("prepare") && event.prepare.items.length > 0 && <fieldset className={styles.translationGroup}><legend>Kartu persiapan</legend>
        {event.prepare.items.map((item, index) => {
          const setItem = (patch: Partial<TextPair & { list: string[] }>) => update("prepare", { ...event.prepare, items: event.prepare.items.map((card, i) => i === index ? { ...card, en: { ...emptyPair, list: [], ...card.en, ...patch } } : card) });
          return <div key={index}>
            {pairFields(`prepare.items.${index}.en`, item.title || `Kartu ${index + 1}`, item, item.en, setItem, [150, 1000])}
            {item.list.length > 0 && control(`prepare.items.${index}.en.list`, "Daftar (English, satu per baris)", (item.en?.list ?? []).join("\n"), value => setItem({ list: value.split("\n") }), { multiline: true, hint: `ID: ${short(item.list.join(", "))}` })}
          </div>;
        })}
      </fieldset>}
  </>;
  if (only) return <div className="stack">{texts}</div>;
  return <div className="stack">
    <BlockIntro why="Atur bahasa halaman tamu. Teks sistem (tombol, label, pesan) sudah tersedia dalam dua bahasa dari kamus wording; di sini Anda menerjemahkan isi acara. Teks yang belum diterjemahkan tetap tampil dalam Bahasa Indonesia dengan catatan kecil." who="panitia atau penerjemah" />
    <ChoiceCards name="language" legend="Bahasa halaman tamu" current={event.language} onPick={value => update("language", value)} options={languageOptions.map(option => ({ ...option, icon: Languages }))} />
    {event.language !== "id" && <>
      <p className={styles.translationProgress} role="status">{gaps.total === 0 ? "Belum ada teks acara yang perlu diterjemahkan." : `${gaps.total - gaps.missing} dari ${gaps.total} teks sudah diterjemahkan.`}</p>
      {texts}
    </>}
  </div>;
}
