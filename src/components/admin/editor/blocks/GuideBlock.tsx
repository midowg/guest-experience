"use client";

import { useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { OrderButtons } from "@/components/admin/editor/controls";
import { moveItem } from "@/components/admin/editor/editor-model";
import { BlockIntro, ImageInput } from "@/components/admin/editor/JourneyEditor";
import type { EditorKit } from "@/components/admin/editor/kit";
import { guideLayouts, guidePartLabels, type GuideChapter, type GuideItem, type GuideLayout, type GuidePart, type GuideSettings, type GuideStep } from "@/lib/guide";
import type { EventRecord } from "@/lib/types";
import styles from "@/components/admin/admin.module.css";
import g from "./guide-block.module.css";

const MAX_CHAPTERS = 20;
const MAX_ITEMS = 30;
const parts = Object.keys(guidePartLabels) as GuidePart[];
const image = () => ({ url: "", alt: "", srcset: [] });

/** What each layout asks of its items, and a nudge for the chapter's opening line (never a made-up fact). */
const layoutCopy: Record<GuideLayout, { item: string; title: string; text: string; intro: string; add: string }> = {
  story: { item: "Poin", title: "Yang akan Anda dapat", text: "Keterangan (opsional)", intro: "Ceritakan dengan kata-kata Anda kenapa tempat ini layak dikunjungi dan apa yang akan tamu rasakan.", add: "Tambah poin" },
  cards: { item: "Kartu", title: "Nama tempat, adat, atau hidangan", text: "Cerita singkat", intro: "Satu atau dua kalimat pengantar sebelum kartu-kartu di bab ini.", add: "Tambah kartu" },
  phrases: { item: "Frasa", title: "Frasa", text: "Artinya", intro: "Satu kalimat pengantar, misalnya kapan frasa ini dipakai.", add: "Tambah frasa" },
  tips: { item: "Tip", title: "Judul tip", text: "Isi tip", intro: "Satu kalimat pengantar sebelum daftar tips.", add: "Tambah tip" },
};

/** The book's steps as the reader meets them: valid ones in order, then any chapter the order lost. */
export function guideSteps(guide: GuideSettings): GuideStep[] {
  const seen = new Set<string>();
  const steps = guide.order.filter(step => {
    const key = step.kind === "part" ? `part:${step.part}` : step.id;
    const valid = step.kind === "part" ? parts.includes(step.part) : guide.chapters.some(chapter => chapter.id === step.id);
    if (!valid || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...steps, ...guide.chapters.filter(chapter => !seen.has(chapter.id)).map(chapter => ({ kind: "chapter" as const, id: chapter.id }))];
}
const hasPart = (guide: GuideSettings, part: GuidePart) => guide.order.some(step => step.kind === "part" && step.part === part);

/**
 * A part of the event is in the book exactly when its section is shown: putting it in or taking
 * it out changes both, so the block's "Tampil" switch and the book order never disagree.
 */
export function withGuidePart(event: EventRecord, part: GuidePart, on: boolean): Pick<EventRecord, "guide" | "sections"> {
  const steps = guideSteps(event.guide);
  const order = on ? (hasPart(event.guide, part) ? steps : [...steps, { kind: "part" as const, part }]) : steps.filter(step => !(step.kind === "part" && step.part === part));
  return { guide: { ...event.guide, order }, sections: event.sections.map(section => section.key === part ? { ...section, enabled: on } : section) };
}

export function GuideBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control, errors, unavailable } = kit;
  const guide = event.guide;
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(guide.chapters.slice(0, 1).map(chapter => chapter.id)));
  const setGuide = (patch: Partial<GuideSettings>) => update("guide", { ...guide, ...patch });
  const setCover = (patch: Partial<GuideSettings["cover"]>) => setGuide({ cover: { ...guide.cover, ...patch } });
  const setChapter = (index: number, patch: Partial<GuideChapter>) => setGuide({ chapters: guide.chapters.map((chapter, i) => i === index ? { ...chapter, ...patch } : chapter) });
  const setItem = (index: number, at: number, patch: Partial<GuideItem>) => setChapter(index, { items: guide.chapters[index].items.map((item, i) => i === at ? { ...item, ...patch } : item) });
  const toggleOpen = (id: string, open: boolean) => setOpenIds(current => { const next = new Set(current); if (open) next.add(id); else next.delete(id); return next; });

  function addChapter(layout: GuideLayout) {
    const chapter: GuideChapter = { id: crypto.randomUUID(), layout, title: "", intro: "", photo: image(), items: [] };
    setGuide({ chapters: [...guide.chapters, chapter], order: [...guideSteps(guide), { kind: "chapter", id: chapter.id }] });
    toggleOpen(chapter.id, true);
  }
  function removeChapter(index: number) {
    const chapter = guide.chapters[index];
    if (!window.confirm(`Hapus bab “${chapter.title || `Bab ${index + 1}`}” beserta isinya dari draft editor?`)) return;
    setGuide({ chapters: guide.chapters.filter((_, i) => i !== index), order: guideSteps(guide).filter(step => !(step.kind === "chapter" && step.id === chapter.id)) });
  }
  /** Moving a chapter in the list moves it past the neighbouring chapter in the book as well. */
  function moveChapter(index: number, direction: -1 | 1) {
    const other = guide.chapters[index + direction];
    if (!other) return;
    const id = guide.chapters[index].id;
    const steps = guideSteps(guide);
    const a = steps.findIndex(step => step.kind === "chapter" && step.id === id);
    const b = steps.findIndex(step => step.kind === "chapter" && step.id === other.id);
    const order = [...steps];
    [order[a], order[b]] = [order[b], order[a]];
    setGuide({ chapters: moveItem(guide.chapters, index, direction), order });
  }
  function setPart(part: GuidePart, on: boolean) {
    const next = withGuidePart(event, part, on);
    update("guide", next.guide);
    update("sections", next.sections);
  }

  const steps = guideSteps(guide);
  const outside = parts.filter(part => !hasPart(guide, part) && !unavailable(part));
  const chapterName = (id: string) => { const index = guide.chapters.findIndex(chapter => chapter.id === id); return guide.chapters[index]?.title || `Bab ${index + 1} (belum berjudul)`; };
  const chapterError = (index: number) => Object.keys(errors).some(key => key.startsWith(`guide.chapters.${index}.`));

  return <div className="stack">
    <BlockIntro why="Isi buku panduan yang dibaca tamu sebelum dan selama perjalanan: sampul, bab-bab tulisan Anda, dan urutan bacanya bersama jadwal, lokasi, persiapan, dan kontak acara. Tulis hanya hal yang sudah pasti; jangan mengarang fakta." who="hospitality atau tim konten" />
    {(!guide.cover.title || !guide.chapters.length) && <Notice tone="warning">Sebelum dipublikasikan, E-Guide perlu judul sampul dan minimal satu bab.</Notice>}

    <fieldset className={styles.translationGroup}>
      <legend>Sampul</legend>
      {control("guide.cover.eyebrow", "Label kecil di atas judul (opsional)", guide.cover.eyebrow, eyebrow => setCover({ eyebrow }), { maxLength: 120, placeholder: "Contoh: E-Guide perjalanan", hint: "Satu atau dua kata, misalnya nama program atau tahun." })}
      {control("guide.cover.title", "Judul sampul", guide.cover.title, title => setCover({ title }), { maxLength: 200, placeholder: event.title || "Contoh: Mengenal Lombok" })}
      {control("guide.cover.subtitle", "Subjudul (opsional)", guide.cover.subtitle, subtitle => setCover({ subtitle }), { multiline: true, maxLength: 400, placeholder: "Satu kalimat tentang isi panduan ini." })}
      <ImageInput name="guide.cover.photo" label="Foto sampul (opsional)" image={guide.cover.photo} onChange={photo => setCover({ photo })} control={control} errors={errors} />
    </fieldset>

    <h3>Bab</h3>
    {errors["guide.chapters"] && <p className="field-error" id="guide.chapters">{errors["guide.chapters"].join(" ")}</p>}
    {!guide.chapters.length && <p>Belum ada bab. Tambahkan bab pertama dengan tombol di bawah.</p>}
    {guide.chapters.map((chapter, index) => {
      const copy = layoutCopy[chapter.layout];
      const base = `guide.chapters.${index}`;
      const full = chapter.items.length >= MAX_ITEMS;
      return <details key={chapter.id} className={`${styles.item} ${g.chapter}`} open={openIds.has(chapter.id) || chapterError(index)} onToggle={change => toggleOpen(chapter.id, (change.currentTarget as HTMLDetailsElement).open)}>
        <summary className={g.chapterSummary}>
          <BookOpen size={16} aria-hidden="true" />
          <span><strong>Bab {index + 1}</strong> · {chapter.title || "Belum berjudul"}</span>
          <span className={g.layoutTag}>{guideLayouts.find(layout => layout.key === chapter.layout)?.label}</span>
        </summary>
        <div className={g.chapterBody}>
          <div className={styles.itemHeader}><h4>Bab {index + 1}</h4><OrderButtons label={`bab ${index + 1}`} index={index} length={guide.chapters.length} onMove={direction => moveChapter(index, direction)} /></div>
          <Field name={`${base}.layout`} label="Bentuk bab" hint={guideLayouts.find(layout => layout.key === chapter.layout)?.hint}>
            <select id={`${base}.layout`} className="input" value={chapter.layout} aria-describedby={`${base}.layout-hint`} onChange={change => setChapter(index, { layout: change.target.value as GuideLayout })}>
              {guideLayouts.map(layout => <option key={layout.key} value={layout.key}>{layout.label}</option>)}
            </select>
          </Field>
          {control(`${base}.title`, "Judul bab", chapter.title, title => setChapter(index, { title }), { maxLength: 200 })}
          {control(`${base}.intro`, "Pengantar (opsional)", chapter.intro, intro => setChapter(index, { intro }), { multiline: true, maxLength: 2000, placeholder: copy.intro })}
          <ImageInput name={`${base}.photo`} label="Foto bab (opsional)" image={chapter.photo} onChange={photo => setChapter(index, { photo })} control={control} errors={errors} />
          {chapter.items.map((item, at) => {
            const path = `${base}.items.${at}`;
            return <div key={item.id} className={g.entry}>
              <div className={styles.itemHeader}><h5>{copy.item} {at + 1}{item.title ? `: ${item.title}` : ""}</h5><OrderButtons label={`${copy.item.toLowerCase()} ${at + 1}`} index={at} length={chapter.items.length} onMove={direction => setChapter(index, { items: moveItem(chapter.items, at, direction) })} /></div>
              {control(`${path}.title`, copy.title, item.title, title => setItem(index, at, { title }), { maxLength: 200 })}
              {control(`${path}.text`, copy.text, item.text, text => setItem(index, at, { text }), { multiline: chapter.layout !== "phrases", maxLength: 2000 })}
              {chapter.layout === "cards" && <>
                {control(`${path}.fact`, "Tahukah Anda? (opsional)", item.fact, fact => setItem(index, at, { fact }), { multiline: true, maxLength: 600, hint: "Satu fakta yang belum diketahui tamu. Pastikan sumbernya benar." })}
                <ImageInput name={`${path}.photo`} label="Foto (opsional)" image={item.photo} onChange={photo => setItem(index, at, { photo })} control={control} errors={errors} />
                {control(`${path}.link`, "Tautan peta (opsional)", item.link, link => setItem(index, at, { link }), { type: "url", maxLength: 8000, hint: "Tautan Google Maps HTTPS; tampil sebagai tombol peta di kartu." })}
              </>}
              <Button type="button" variant="danger" onClick={() => setChapter(index, { items: chapter.items.filter((_, i) => i !== at) })}><Trash2 size={17} aria-hidden="true" /><span>Hapus {copy.item.toLowerCase()} {at + 1}</span></Button>
            </div>;
          })}
          <Button type="button" variant="secondary" disabled={full} onClick={() => setChapter(index, { items: [...chapter.items, { id: crypto.randomUUID(), title: "", text: "", fact: "", photo: image(), link: "" }] })}><Plus size={16} aria-hidden="true" /> {copy.add}</Button>
          {full && <p className="field-hint">Maksimal {MAX_ITEMS} isi per bab.</p>}
          <Button type="button" variant="danger" onClick={() => removeChapter(index)}><Trash2 size={17} aria-hidden="true" /><span>Hapus bab {index + 1}</span></Button>
        </div>
      </details>;
    })}
    <div className={styles.presetRow} role="group" aria-label="Tambah bab">
      {guideLayouts.map(layout => <Button key={layout.key} type="button" variant="secondary" disabled={guide.chapters.length >= MAX_CHAPTERS} title={layout.hint} onClick={() => addChapter(layout.key)}>+ Bab {layout.label.toLowerCase()}</Button>)}
    </div>
    {guide.chapters.length >= MAX_CHAPTERS && <p className="field-hint">Maksimal {MAX_CHAPTERS} bab.</p>}

    <fieldset className={styles.translationGroup}>
      <legend>Urutan baca</legend>
      <p className="field-hint">Susun bab Anda bersama bagian acara. Isi bagian acara (jadwal, lokasi, persiapan, kontak) diubah di bloknya masing-masing.</p>
      {steps.length ? <ol className={g.steps}>
        {steps.map((step, index) => {
          const label = step.kind === "chapter" ? chapterName(step.id) : guidePartLabels[step.part];
          return <li key={step.kind === "chapter" ? step.id : `part-${step.part}`} className={g.step}>
            <span className={g.stepNumber} aria-hidden="true">{index + 1}</span>
            <span className={g.stepText}><span className={g.stepKind}>{step.kind === "chapter" ? "Bab panduan" : "Bagian acara"}</span>{label}</span>
            <OrderButtons label={label} index={index} length={steps.length} onMove={direction => setGuide({ order: moveItem(steps, index, direction) })} />
            {step.kind === "part" && <Button type="button" variant="quiet" onClick={() => setPart(step.part, false)}>Keluarkan<span className="sr-only"> {label}</span></Button>}
          </li>;
        })}
      </ol> : <p>Belum ada langkah. Tambahkan bab atau masukkan bagian acara.</p>}
      {outside.length > 0 && <div className={g.outside}>
        <p className="field-hint">Bagian acara yang belum masuk buku:</p>
        <div className={styles.presetRow} role="group" aria-label="Masukkan bagian acara">
          {outside.map(part => <Button key={part} type="button" variant="secondary" onClick={() => setPart(part, true)}>+ {guidePartLabels[part]}</Button>)}
        </div>
      </div>}
    </fieldset>
    {event.language !== "id" && <p className="field-hint">Teks English untuk sampul dan bab diisi di blok Bahasa &amp; terjemahan.</p>}
  </div>;
}
