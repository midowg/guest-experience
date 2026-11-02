import { isProgramLike } from "@/lib/program";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { OrderButtons } from "@/components/admin/editor/controls";
import { moveItem } from "@/components/admin/editor/editor-model";
import type { EditorKit } from "@/components/admin/editor/kit";
import { fromZoneInput, toZoneInput } from "@/lib/format";
import type { AgendaDetail, AgendaPoint, PlainImage } from "@/lib/types";
import { AGENDA_PHOTOS, AGENDA_POINTS, emptyAgendaDetail } from "@/lib/validation";
import { ImageInput } from "@/components/admin/editor/JourneyEditor";
import { agendaByDay } from "@/lib/program";
import { emptyTrip, TRIP_LIMITS, type TripDayCover } from "@/lib/trip";
import styles from "@/components/admin/admin.module.css";

const noImage: PlainImage = { url: "", alt: "", srcset: [] };

/** "Judul: keterangan" per line, for points and tips; a line without a colon is all text. */
function toPairs(value: string): AgendaPoint[] {
  return value.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const at = line.indexOf(": ");
    return at > 0 && at <= 80 ? { title: line.slice(0, at).trim(), text: line.slice(at + 2).trim() } : { title: "", text: line };
  });
}
const fromPairs = (pairs: AgendaPoint[] | undefined) => (pairs ?? []).map(pair => pair.title ? `${pair.title}: ${pair.text}` : pair.text).join("\n");

export function AgendaBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control, tz, errors } = kit;
  // Program: a picture above each day of the schedule (the handbook's DAY 1, DAY 2 covers).
  const days = isProgramLike(event.event_kind) ? agendaByDay(event.agenda.filter(item => item.starts_at), event.timezone).filter(day => day.day) : [];
  const trip = event.trip ?? emptyTrip();
  const covers = trip.day_covers ?? [];
  // An entry stays while any of its parts is filled: the picture, the name, the summary or a tip.
  const setDay = (day: string, patch: Partial<TripDayCover>) => {
    const next: TripDayCover = { day, image: noImage, ...covers.find(cover => cover.day === day), ...patch };
    const filled = !!(next.image.url || next.title?.trim() || next.summary?.trim() || next.tips?.length);
    update("trip", { ...trip, day_covers: [...covers.filter(cover => cover.day !== day), ...(filled ? [next] : [])].sort((a, b) => a.day.localeCompare(b.day)) });
  };
  return <div className="stack">
    <p>Urutan tampilan mengikuti susunan di bawah. Acara lebih dari sehari otomatis tampil per hari (Hari 1, Hari 2, …).</p>
    <details className={styles.extraFields}>
      <summary>PDF presentasi (opsional)</summary>
      {control("presentation_pdf_url", "Tautan PDF presentasi untuk tamu", event.presentation_pdf_url, value => update("presentation_pdf_url", value), { type: "url", maxLength: 8000, hint: "Tautan HTTPS ke PDF versi tamu. Setiap sesi bisa menunjuk halamannya di bagian Tambahan." })}
    </details>
    {days.length > 1 && <details className={styles.extraFields}>
      <summary>Pembuka per hari (opsional): gambar, nama hari, ringkasan, tips</summary>
      <div className="stack">
        <p className="field-hint">Tampil di atas jadwal hari itu. Gambar menjadi banner lebar seperti foto sampul Facebook atau LinkedIn: dipotong 12:5 dari tengah, jadi pakai gambar mendatar, misalnya 2400 × 1000 px, dengan tulisan di bagian tengah.</p>
        {days.map((day, index) => {
          const at = covers.findIndex(cover => cover.day === day.day);
          const cover = covers[at];
          const path = `trip.day_covers.${at < 0 ? covers.length : at}`;
          return <fieldset key={day.day} className="stack">
            <legend>Hari {index + 1} ({day.day})</legend>
            <ImageInput name={`${path}.image`} label="Gambar banner" image={cover?.image ?? noImage} onChange={image => setDay(day.day, { image })} control={control} errors={errors} />
            {control(`${path}.title`, "Nama hari", cover?.title ?? "", title => setDay(day.day, { title }), { maxLength: 150, hint: "Contoh: Sugeng Rawuh dan Jelajah Kotagede." })}
            {control(`${path}.summary`, "Ringkasan hari", cover?.summary ?? "", summary => setDay(day.day, { summary }), { multiline: true, maxLength: 400, hint: "Satu kalimat tentang hari itu." })}
            {control(`${path}.tips`, "Tips hari ini (satu per baris)", fromPairs(cover?.tips), value => setDay(day.day, { tips: toPairs(value).slice(0, TRIP_LIMITS.tips) }), { multiline: true, hint: `Tulis "Judul: keterangan", misalnya "Pakaian hari ini: kaos dan sepatu nyaman". Maksimal ${TRIP_LIMITS.tips} baris.` })}
          </fieldset>;
        })}
      </div>
    </details>}
    {event.agenda.map((item, index) => {
      function change(key: "title" | "description" | "starts_at" | "ends_at", value: string) { update("agenda", event.agenda.map((entry, i) => i === index ? { ...entry, [key]: value } : entry)); }
      const detail = { ...emptyAgendaDetail, ...event.agenda_details[item.id] };
      const setDetail = (patch: Partial<AgendaDetail>) => update("agenda_details", { ...event.agenda_details, [item.id]: { ...detail, ...patch } });
      return <div className={styles.item} key={item.id}>
        <div className={styles.itemHeader}><h3>Sesi {index + 1}</h3><OrderButtons label={`sesi ${index + 1}`} index={index} length={event.agenda.length} onMove={direction => update("agenda", moveItem(event.agenda, index, direction))} /></div>
        {control(`agenda.${index}.title`, "Judul sesi", item.title, value => change("title", value), { maxLength: 200 })}
        <div className={styles.grid}>{control(`agenda.${index}.starts_at`, `Mulai sesi (${tz})`, toZoneInput(item.starts_at, event.timezone), value => change("starts_at", fromZoneInput(value, event.timezone) || ""), { type: "datetime-local" })}{control(`agenda.${index}.ends_at`, `Selesai sesi (${tz})`, toZoneInput(item.ends_at, event.timezone), value => change("ends_at", fromZoneInput(value, event.timezone) || ""), { type: "datetime-local" })}</div>
        {control(`agenda.${index}.description`, "Keterangan sesi", item.description, value => change("description", value), { multiline: true, maxLength: 1500 })}
        <details className={styles.extraFields}>
          <summary>Tambahan (opsional): lokasi, Tahukah Anda?, cerita</summary>
          <div className="stack">
            {control(`agenda_details.${item.id}.place`, "Lokasi kegiatan", detail.place, place => setDetail({ place }), { maxLength: 200, hint: "Contoh: Pantai Kuta Mandalika. Tampil kecil di bawah judul sesi." })}
            {control(`agenda_details.${item.id}.teaser`, "Cuplikan “Kenali lebih dekat”", detail.teaser, teaser => setDetail({ teaser }), { maxLength: 200, hint: "Satu kalimat pemancing rasa penasaran. Contoh: kenapa pasirnya seperti merica?" })}
            {control(`agenda_details.${item.id}.did_you_know`, "Isi kotak “Tahukah Anda?”", detail.did_you_know, did_you_know => setDetail({ did_you_know }), { multiline: true, maxLength: 600, hint: "Hanya hal yang belum diketahui tamu. Terbuka saat tamu mengetuk cuplikan." })}
            {control(`agenda_details.${item.id}.more_story`, "Cerita lengkap (opsional)", detail.more_story, more_story => setDetail({ more_story }), { multiline: true, maxLength: 4000 })}
            <ImageInput name={`agenda_details.${item.id}.photo`} label="Foto tempat (opsional)" image={detail.photo ?? noImage} onChange={photo => setDetail({ photo })} control={control} errors={errors} />
            <p className="field-hint">Sorotan tempat: bila ada foto, poin, atau catatan, tamu membukanya lewat tombol “Lihat tempat” di baris ini. Foto tampil berderet dan bisa digeser.</p>
            {(detail.photos ?? []).map((photo, at) => <div key={at} className="stack">
              <ImageInput name={`agenda_details.${item.id}.photos.${at}`} label={`Foto tambahan ${at + 1}`} image={photo} onChange={next => setDetail({ photos: (detail.photos ?? []).map((old, i) => i === at ? next : old) })} control={control} errors={errors} />
              <Button type="button" variant="danger" onClick={() => setDetail({ photos: (detail.photos ?? []).filter((_, i) => i !== at) })}><Trash2 size={17} aria-hidden="true" /><span>Hapus foto tambahan {at + 1}</span></Button>
            </div>)}
            <Button type="button" variant="secondary" disabled={(detail.photos?.length ?? 0) >= AGENDA_PHOTOS} onClick={() => setDetail({ photos: [...(detail.photos ?? []), noImage] })}>Tambah foto</Button>
            {control(`agenda_details.${item.id}.points_title`, "Judul daftar poin", detail.points_title ?? "", points_title => setDetail({ points_title }), { maxLength: 80, hint: "Contoh: Yang akan dilihat." })}
            {control(`agenda_details.${item.id}.points`, "Poin (satu per baris)", fromPairs(detail.points), value => setDetail({ points: toPairs(value).slice(0, AGENDA_POINTS) }), { multiline: true, hint: `Tulis "Judul: keterangan", misalnya "Pasar sore: suasana pasar menjelang petang". Maksimal ${AGENDA_POINTS} baris.` })}
            {control(`agenda_details.${item.id}.note_title`, "Judul catatan", detail.note_title ?? "", note_title => setDetail({ note_title }), { maxLength: 80, hint: "Contoh: Untuk rombongan." })}
            {control(`agenda_details.${item.id}.note`, "Catatan", detail.note ?? "", note => setDetail({ note }), { multiline: true, maxLength: 600, hint: "Satu hal penting yang perlu diingat di tempat ini." })}
            {control(`agenda_details.${item.id}.maps_url`, "Tautan Google Maps", detail.maps_url ?? "", maps_url => setDetail({ maps_url }), { type: "url", maxLength: 2000 })}
            {event.presentation_pdf_url && control(`agenda_details.${item.id}.pdf_page`, "Halaman di PDF presentasi", detail.pdf_page ? String(detail.pdf_page) : "", value => { const digits = value.replace(/\D/g, "").slice(0, 3); setDetail({ pdf_page: digits ? Number(digits) : null }); }, { hint: "Nomor halaman yang membahas sesi ini." })}
          </div>
        </details>
        <Button type="button" variant="danger" onClick={() => { if (window.confirm("Hapus sesi ini dari draft editor?")) update("agenda", event.agenda.filter(entry => entry.id !== item.id)); }}><Trash2 size={17} aria-hidden="true" /><span>Hapus sesi {index + 1}</span></Button>
      </div>;
    })}
    {!event.agenda.length && <p>Rundown belum tersedia.</p>}
    <Button type="button" variant="secondary" disabled={event.agenda.length >= 100} onClick={() => update("agenda", [...event.agenda, { id: crypto.randomUUID(), starts_at: "", ends_at: "", title: "", description: "", sort_order: event.agenda.length }])}>Tambah sesi</Button>
  </div>;
}
