"use client";

import type { ReactNode } from "react";
import { BookOpen, Building2, Luggage, CalendarRange, CircleHelp, DoorOpen, Frame, Globe, HandHeart, Lightbulb, MapPinned, PartyPopper, ThumbsUp, Trash2, UserRound, type LucideIcon } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { momentIconComponents, prepareIconComponents } from "@/components/guest/JourneyPanels";
import { phaseLabels } from "@/lib/event-phase";
import { themes } from "@/lib/themes";
import { momentIcons, prepareIcons } from "@/lib/validation";
import type { EventRecord, MomentIcon, PlainImage, PrepareIcon, PrepareItem } from "@/lib/types";
import { Check, OrderButtons } from "@/components/admin/editor/controls";
import { moveItem } from "@/components/admin/editor/editor-model";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import { EventLink } from "@/components/admin/editor/blocks/EventLink";
import { thanksPath } from "@/lib/routes";
import styles from "@/components/admin/admin.module.css";
import type { Control, Update } from "@/components/admin/editor/kit";

type Props = { event: EventRecord; update: Update; control: Control; errors: Record<string, string[]> };

/** What a block is for and who fills it in, in plain words, before any field. */
export function BlockIntro({ why, who }: { why: string; who: string }) {
  return <div className={styles.blockIntro}>
    <p className={styles.blockWhy}><span>Untuk apa</span>{why}</p>
    <p className={styles.blockWho}><UserRound size={14} aria-hidden="true" /> Diisi oleh: {who}</p>
  </div>;
}

function HelpBox({ children }: { children: ReactNode }) {
  return <p className={styles.helpBox}><Lightbulb size={16} aria-hidden="true" /><span>{children}</span></p>;
}

type CardOption<T extends string> = { value: T; label: string; description: string; icon?: LucideIcon; recommended?: boolean; swatch?: [string, string] };

/** More than two choices: every option carries an icon, one sentence, and at most one "Disarankan". */
export function ChoiceCards<T extends string>({ name, legend, options, current, onPick }: { name: string; legend: string; options: CardOption<T>[]; current: T; onPick: (value: T) => void }) {
  return <fieldset className={styles.cardSet}>
    <legend>{legend}</legend>
    <div className={styles.cardRow}>{options.map((option, index) => {
      const Icon = option.icon;
      const on = current === option.value;
      return <label key={option.value} className={`${styles.choiceCard} ${on ? styles.choiceCardOn : ""}`.trimEnd()}>
        <input id={index === 0 ? name : undefined} type="radio" name={name} value={option.value} checked={on} onChange={() => onPick(option.value)} className="sr-only" />
        {option.swatch ? <span className={styles.themeSwatch} style={{ background: option.swatch[0] }} aria-hidden="true"><span style={{ background: option.swatch[1] }} /></span>
          : Icon && <span className={styles.choiceIcon} aria-hidden="true"><Icon size={20} /></span>}
        <span className={styles.choiceText}>
          <span className={styles.choiceTitle}>{option.label}{option.recommended && <span className={styles.recommended}><ThumbsUp size={11} aria-hidden="true" /> Disarankan</span>}</span>
          <span className={styles.choiceDescription}>{option.description}</span>
        </span>
      </label>;
    })}</div>
  </fieldset>;
}

export function ImageInput({ name, label, image, onChange, control, errors }: { name: string; label: string; image: PlainImage; onChange: (image: PlainImage) => void } & Pick<Props, "control" | "errors">) {
  return <div className="stack">
    <PhotoField name={`${name}.url`} label={label} value={image.url} srcset={image.srcset} onChange={value => onChange({ ...image, ...value, alt: value.url ? image.alt : "" })} error={errors[`${name}.url`]?.join(" ")} />
    {image.url && control(`${name}.alt`, "Deskripsi foto", image.alt, alt => onChange({ ...image, alt }), { maxLength: 300, hint: "Wajib bila foto diisi. Jelaskan isi foto untuk pembaca layar." })}
  </div>;
}

export function AppearanceBlock({ event, update }: Pick<Props, "event" | "update">) {
  return <div className="stack">
    <BlockIntro why="Menentukan bentuk acara, untuk siapa, dan gaya undangan. Isi dan urutan halaman tidak berubah; yang berganti hanya warna, huruf judul, dan bagian yang ditawarkan." who="hospitality" />
    <ChoiceCards name="event_kind" legend="Jenis acara" current={event.event_kind} onPick={value => update("event_kind", value)} options={[
      { value: "kunjungan", label: "Kunjungan", description: "Tamu datang ke kantor atau lokasi kita.", icon: DoorOpen },
      { value: "acara", label: "Acara", description: "Satu hari, tamu banyak. Gala, nyadran, seminar.", icon: PartyPopper, recommended: true },
      { value: "program", label: "Program", description: "Beberapa hari, jadwal per hari. Bootcamp, trip.", icon: CalendarRange },
      { value: "handbook", label: "Handbook", description: "Panduan peserta trip: transportasi, hotel, jadwal per hari dengan cerita tiap tempat, persiapan, dan kontak bantuan.", icon: Luggage },
      { value: "kartu", label: "Kartu", description: "Bukan undangan: kartu yang diisi peserta (poster, ucapan, ID card, sertifikat). Editor hanya berisi pengaturan kartu.", icon: Frame },
      { value: "eguide", label: "E-Guide", description: "Bukan undangan: buku panduan untuk dibaca tamu (bab, jadwal, lokasi, persiapan, kontak). Tanpa RSVP dan tiket.", icon: BookOpen },
      { value: "panduan", label: "Panduan lokasi", description: "Bukan undangan: halaman umum untuk menemukan tempat (sambutan, rute bergambar, info kedatangan, PIC, galeri). Tanpa RSVP dan tiket.", icon: MapPinned },
      { value: "csr", label: "Friday Sharing (CSR)", description: "Bukan undangan: halaman donasi dana dan barang, daftar donatur, dan kabar penyerahan. Tanpa RSVP dan tiket.", icon: HandHeart },
    ]} />
    <ChoiceCards name="audience" legend="Untuk siapa" current={event.audience} onPick={value => update("audience", value)} options={[
      { value: "external", label: "Eksternal", description: "Tamu dan klien. Ulasan Google dan ajakan kolaborasi dapat tampil.", icon: Globe, recommended: true },
      { value: "internal", label: "Internal", description: "Karyawan Werkudara. Ulasan Google dan ajakan kolaborasi selalu disembunyikan.", icon: Building2 },
    ]} />
    <HelpBox>Ragu memilih tema? Kunjungan cocok dengan Werkudara atau Rumah Nenek, gala dengan Malam Apresiasi, nyadran dengan Khidmat, CSR dengan Segar.</HelpBox>
    <ChoiceCards name="theme.key" legend="Tema undangan" current={event.theme.key} onPick={key => update("theme", { ...event.theme, key })}
      options={themes.map(theme => ({ value: theme.key, label: theme.name, description: theme.description, recommended: theme.key === "werkudara", swatch: [theme.tokens.hero, theme.tokens.primary] }))} />
    <ChoiceCards name="theme.corners" legend="Sudut" current={event.theme.corners} onPick={corners => update("theme", { ...event.theme, corners })} options={[
      { value: "square", label: "Persegi", description: "Tegas, sesuai gaya brand Werkudara.", recommended: true },
      { value: "soft", label: "Lembut", description: "Sudut membulat, terasa lebih santai.", },
    ]} />
    <ChoiceCards name="phase_override" legend="Tampilan untuk tamu" current={event.phase_override} onPick={value => update("phase_override", value)} options={[
      { value: "auto", label: "Otomatis", description: "Berganti sendiri: sebelum acara, hari H, lalu sesudah acara (keesokan harinya).", icon: CircleHelp, recommended: true },
      { value: "before", label: phaseLabels.before, description: "Selalu tampil sebagai undangan." },
      { value: "day", label: phaseLabels.day, description: "Selalu tampil sebagai panduan hari ini." },
      { value: "after", label: phaseLabels.after, description: "Selalu tampil sebagai halaman terima kasih." },
    ]} />
    <HelpBox>Lihat ketiga tampilan lewat Preview undangan setelah menyimpan.</HelpBox>
  </div>;
}

export function ExperienceBlock({ event, update, control, errors }: Props) {
  const experience = event.experience;
  const set = (patch: Partial<EventRecord["experience"]>) => update("experience", { ...experience, ...patch });
  const setMoment = (index: number, patch: Partial<EventRecord["experience"]["moments"][number]>) => set({ moments: experience.moments.map((item, i) => i === index ? { ...item, ...patch } : item) });
  return <div className="stack">
    <BlockIntro why="Cerita singkat yang membuat tamu penasaran tentang tema acara. Ini informasi untuk dibaca tamu, bukan formulir. Jangan menjanjikan hal yang belum pasti." who="hospitality" />
    {control("experience.title", "Judul (opsional)", experience.title, title => set({ title }), { maxLength: 200, hint: "Kosongkan untuk memakai: Ada yang sedang kami siapkan untuk Anda." })}
    {control("experience.story", "Cerita singkat", experience.story, story => set({ story }), { multiline: true, maxLength: 2000, hint: "Contoh: Kunjungan ini kami rancang seperti menyambut kerabat: santai, hangat, dan penuh percakapan." })}
    <ImageInput name="experience.image" label="Foto pendukung (opsional)" image={experience.image} onChange={image => set({ image })} control={control} errors={errors} />
    <h3>Momen yang menanti</h3>
    {experience.moments.map((moment, index) => <div className={styles.item} key={index}>
      <div className={styles.itemHeader}><h4>Momen {index + 1}</h4><OrderButtons label={`momen ${index + 1}`} index={index} length={experience.moments.length} onMove={direction => set({ moments: moveItem(experience.moments, index, direction) })} /></div>
      <fieldset className={styles.iconSet}><legend>Ikon</legend><div className={styles.iconRow}>{momentIcons.map(icon => {
        const Icon = momentIconComponents[icon];
        return <label key={icon} className={`${styles.iconChoice} ${moment.icon === icon ? styles.iconChoiceOn : ""}`.trimEnd()}>
          <input type="radio" name={`experience.moments.${index}.icon`} value={icon} checked={moment.icon === icon} onChange={() => setMoment(index, { icon: icon as MomentIcon })} className="sr-only" />
          <Icon size={20} aria-hidden="true" /><span className="sr-only">{icon}</span>
        </label>;
      })}</div></fieldset>
      {control(`experience.moments.${index}.title`, "Judul momen", moment.title, title => setMoment(index, { title }), { maxLength: 150 })}
      {control(`experience.moments.${index}.description`, "Keterangan (opsional)", moment.description, description => setMoment(index, { description }), { maxLength: 300 })}
      <Button type="button" variant="danger" onClick={() => set({ moments: experience.moments.filter((_, i) => i !== index) })}><Trash2 size={17} aria-hidden="true" /><span>Hapus momen {index + 1}</span></Button>
    </div>)}
    <Button type="button" variant="secondary" disabled={experience.moments.length >= 6} onClick={() => set({ moments: [...experience.moments, { icon: "sparkles", title: "", description: "" }] })}>Tambah momen</Button>
    <p className="field-hint">Aktifkan bagian &quot;Pengalaman kunjungan&quot; di Urutan &amp; tampilan bagian agar tampil.</p>
  </div>;
}

const prepareIconLabels: Record<PrepareIcon, string> = {
  shirt: "Pakaian", backpack: "Bawaan", gift: "Disiapkan panitia", "id-card": "Identitas", umbrella: "Cuaca hujan", sun: "Cuaca panas",
  footprints: "Alas kaki", utensils: "Makanan", camera: "Foto", pill: "Obat pribadi", package: "Barang", info: "Info lain",
};
/** Starting points only: every card stays fully editable, and "Kartu kustom" starts empty. */
const preparePresets: { label: string; item: PrepareItem }[] = [
  { label: "Dress code", item: { icon: "shirt", title: "Dress code", description: "", list: [] } },
  { label: "Yang perlu dibawa", item: { icon: "backpack", title: "Yang perlu dibawa", description: "", list: [] } },
  { label: "Yang kami siapkan", item: { icon: "gift", title: "Yang kami siapkan untuk Anda", description: "", list: [] } },
  { label: "Kartu kustom", item: { icon: "info", title: "", description: "", list: [] } },
];

export function PrepareBlock({ event, update, control, errors }: Pick<Props, "event" | "update" | "control" | "errors">) {
  const prepare = event.prepare;
  const set = (patch: Partial<EventRecord["prepare"]>) => update("prepare", { ...prepare, ...patch });
  const setItem = (index: number, patch: Partial<PrepareItem>) => set({ items: prepare.items.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const full = prepare.items.length >= 8;
  return <div className="stack">
    <BlockIntro why="Kartu bebas untuk hal yang perlu tamu siapkan atau ketahui: dress code, barang yang dibawa, perlengkapan yang panitia siapkan (kaos, topi, goodie bag), cuaca, alas kaki, atau hal lain." who="panitia atau hospitality" />
    {control("prepare.title", "Judul bagian (opsional)", prepare.title, title => set({ title }), { maxLength: 200, hint: "Kosongkan untuk memakai: Yang perlu Anda ketahui sebelum datang." })}
    {control("prepare.intro", "Pengantar (opsional)", prepare.intro, intro => set({ intro }), { multiline: true, maxLength: 1000 })}
    {prepare.items.map((item, index) => <div className={styles.item} key={index}>
      <div className={styles.itemHeader}><h4>{item.title || `Kartu ${index + 1}`}</h4><OrderButtons label={`kartu ${index + 1}`} index={index} length={prepare.items.length} onMove={direction => set({ items: moveItem(prepare.items, index, direction) })} /></div>
      <fieldset className={styles.iconSet}><legend>Ikon</legend><div className={styles.iconRow}>{prepareIcons.map(icon => {
        const Icon = prepareIconComponents[icon];
        return <label key={icon} className={`${styles.iconChoice} ${item.icon === icon ? styles.iconChoiceOn : ""}`.trimEnd()} title={prepareIconLabels[icon]}>
          <input type="radio" name={`prepare.items.${index}.icon`} value={icon} checked={item.icon === icon} onChange={() => setItem(index, { icon })} className="sr-only" />
          <Icon size={20} aria-hidden="true" /><span className="sr-only">{prepareIconLabels[icon]}</span>
        </label>;
      })}</div></fieldset>
      {control(`prepare.items.${index}.title`, "Judul kartu", item.title, title => setItem(index, { title }), { maxLength: 150, hint: "Contoh: Dress code, Yang perlu dibawa, Perlengkapan dari panitia." })}
      {control(`prepare.items.${index}.description`, "Keterangan (opsional)", item.description, description => setItem(index, { description }), { multiline: true, maxLength: 1000, hint: "Contoh: Batik atau kemeja berkerah. Hindari sandal karena ada sesi jalan kaki." })}
      {control(`prepare.items.${index}.list`, "Daftar (opsional, satu per baris)", item.list.join("\n"), value => setItem(index, { list: value.split("\n") }), { multiline: true, hint: "Tampil sebagai daftar centang, maksimal 15 baris. Contoh: KTP, Payung, Botol minum." })}
      {(item.images ?? []).map((image, at) => <div key={at} className="stack">
        <ImageInput name={`prepare.items.${index}.images.${at}`} label={`Gambar ${at + 1}`} image={image} onChange={next => setItem(index, { images: (item.images ?? []).map((old, i) => i === at ? next : old) })} control={control} errors={errors} />
        <Button type="button" variant="danger" onClick={() => setItem(index, { images: (item.images ?? []).filter((_, i) => i !== at) })}><Trash2 size={17} aria-hidden="true" /><span>Hapus gambar {at + 1}</span></Button>
      </div>)}
      <Button type="button" variant="secondary" disabled={(item.images?.length ?? 0) >= 4} onClick={() => setItem(index, { images: [...(item.images ?? []), { url: "", alt: "", srcset: [] }] })}>Tambah gambar (opsional)</Button>
      <Button type="button" variant="danger" onClick={() => set({ items: prepare.items.filter((_, i) => i !== index) })}><Trash2 size={17} aria-hidden="true" /><span>Hapus kartu {index + 1}</span></Button>
    </div>)}
    <div className={styles.presetRow} role="group" aria-label="Tambah kartu persiapan">
      {preparePresets.map(preset => <Button key={preset.label} type="button" variant="secondary" disabled={full} onClick={() => set({ items: [...prepare.items, { ...preset.item, list: [] }] })}>+ {preset.label}</Button>)}
    </div>
    {full && <p className="field-hint">Maksimal 8 kartu.</p>}
    <p className="field-hint">Aktifkan bagian &quot;Persiapan tamu&quot; di Urutan &amp; tampilan bagian agar tampil. Bagian ini tidak tampil selama belum ada kartu.</p>
  </div>;
}

export function RouteFields({ event, update, control, errors }: Props) {
  const route = event.route;
  const set = (patch: Partial<EventRecord["route"]>) => update("route", { ...route, ...patch });
  const setStep = (index: number, patch: Partial<EventRecord["route"]["steps"][number]>) => set({ steps: route.steps.map((item, i) => i === index ? { ...item, ...patch } : item) });
  return <div className="stack">
    <h3>Panduan rute (opsional)</h3>
    <BlockIntro why="Peta bergambar dan langkah menuju lokasi, supaya tamu tidak tersesat. Kartu PIC tampil di bawahnya bila kontak diisi." who="hospitality" />
    <ImageInput name="route.map_image" label="Peta rute bergambar" image={route.map_image} onChange={map_image => set({ map_image })} control={control} errors={errors} />
    {route.steps.map((step, index) => <div className={styles.item} key={index}>
      <div className={styles.itemHeader}><h4>Langkah {index + 1}</h4><OrderButtons label={`langkah ${index + 1}`} index={index} length={route.steps.length} onMove={direction => set({ steps: moveItem(route.steps, index, direction) })} /></div>
      {control(`route.steps.${index}.title`, "Judul langkah", step.title, title => setStep(index, { title }), { maxLength: 150, hint: "Contoh: Belok di Jl. Bhinneka." })}
      {control(`route.steps.${index}.description`, "Keterangan (opsional)", step.description, description => setStep(index, { description }), { multiline: true, maxLength: 500 })}
      <ImageInput name={`route.steps.${index}.image`} label="Foto titik ini (opsional)" image={step.image} onChange={image => setStep(index, { image })} control={control} errors={errors} />
      <Button type="button" variant="danger" onClick={() => set({ steps: route.steps.filter((_, i) => i !== index) })}><Trash2 size={17} aria-hidden="true" /><span>Hapus langkah {index + 1}</span></Button>
    </div>)}
    <Button type="button" variant="secondary" disabled={route.steps.length >= 6} onClick={() => set({ steps: [...route.steps, { title: "", description: "", image: { url: "", alt: "", srcset: [] } }] })}>Tambah langkah</Button>
  </div>;
}

export function DayBlock({ event, update, control }: Pick<Props, "event" | "update" | "control">) {
  return <div className="stack">
    <BlockIntro why="Tampil pada hari acara bersama jadwal hari ini dan penanda sesi yang sedang berlangsung. Jadwal diambil dari Rundown." who="panitia" />
    {control("day_note", "Catatan hari H (opsional)", event.day_note, value => update("day_note", value), { multiline: true, maxLength: 1000, hint: "Contoh: Lapor ke resepsionis di pendopo. Wi-Fi tamu tersedia, tanyakan ke resepsionis." })}
  </div>;
}

export function AfterBlock({ event, update, control, errors, collaboration: allowCollaboration = true, origin = "" }: Props & { collaboration?: boolean; origin?: string }) {
  const after = event.after;
  const set = (patch: Partial<EventRecord["after"]>) => update("after", { ...after, ...patch });
  const collaboration = after.collaboration;
  const internal = event.audience === "internal";
  return <div className="stack">
    <BlockIntro why={event.event_kind === "kunjungan" ? "Halaman terima kasih yang dikirim setelah kunjungan, bersama foto dan survei. Survei dan ulasan Google diatur di bawah." : "Halaman terima kasih yang tampil setelah acara. Ulasan Google memakai pengaturan di blok Ulasan dan bersifat sukarela."} who="hospitality" />
    {origin && event.code && <EventLink event={event} origin={origin} path={thanksPath(event)} label="Tautan terima kasih" hint="Kirim ke tamu setelah kunjungan, bersama foto dan survei. Halaman ini langsung menampilkan terima kasih, tanpa menunggu tanggal acara lewat." />}
    {control("after.title", "Judul terima kasih (opsional)", after.title, title => set({ title }), { maxLength: 200, hint: "Kosongkan untuk memakai: Terima kasih atas kehadiran Anda." })}
    {control("after.message", "Pesan (opsional)", after.message, message => set({ message }), { multiline: true, maxLength: 2000, hint: "Kosongkan untuk memakai teks Penutup." })}
    <ImageInput name="after.image" label="Foto (opsional)" image={after.image} onChange={image => set({ image })} control={control} errors={errors} />
    <h3>Ajakan kolaborasi</h3>
    {internal ? <Notice>Acara internal: ajakan kolaborasi dan ulasan Google tidak ditampilkan.</Notice> : <>
      {allowCollaboration && <Check label="Tampilkan ajakan kolaborasi" checked={collaboration.enabled} onChange={enabled => set({ collaboration: { ...collaboration, enabled } })} />}
      {collaboration.enabled && <>
        {control("after.collaboration.title", "Judul (opsional)", collaboration.title, title => set({ collaboration: { ...collaboration, title } }), { maxLength: 200, hint: "Kosongkan untuk memakai: Mari lanjutkan percakapannya." })}
        {control("after.collaboration.description", "Deskripsi (opsional)", collaboration.description, description => set({ collaboration: { ...collaboration, description } }), { multiline: true, maxLength: 1000 })}
        {control("after.collaboration.button_label", "Teks tombol (opsional)", collaboration.button_label, button_label => set({ collaboration: { ...collaboration, button_label } }), { maxLength: 100, hint: "Tombol membuka kontak PIC. Kosongkan untuk memakai: Hubungi tim Werkudara." })}
        {!(event.contact.name && event.contact.phone) && <Notice tone="warning">Isi kontak PIC agar tombol kolaborasi dapat tampil.</Notice>}
      </>}
    </>}
    <p className="field-hint">Galeri foto acara menyusul setelah penyimpanan foto Cloudflare R2 siap.</p>
  </div>;
}
