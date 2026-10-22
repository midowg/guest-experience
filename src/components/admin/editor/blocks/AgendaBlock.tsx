import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { OrderButtons } from "@/components/admin/editor/controls";
import { moveItem } from "@/components/admin/editor/editor-model";
import type { EditorKit } from "@/components/admin/editor/kit";
import { fromZoneInput, toZoneInput } from "@/lib/format";
import type { AgendaDetail } from "@/lib/types";
import { emptyAgendaDetail } from "@/lib/validation";
import styles from "@/components/admin/admin.module.css";

export function AgendaBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control, tz } = kit;
  return <div className="stack">
    <p>Urutan tampilan mengikuti susunan di bawah. Acara lebih dari sehari otomatis tampil per hari (Hari 1, Hari 2, …).</p>
    <details className={styles.extraFields}>
      <summary>PDF presentasi (opsional)</summary>
      {control("presentation_pdf_url", "Tautan PDF presentasi untuk tamu", event.presentation_pdf_url, value => update("presentation_pdf_url", value), { type: "url", maxLength: 8000, hint: "Tautan HTTPS ke PDF versi tamu. Setiap sesi bisa menunjuk halamannya di bagian Tambahan." })}
    </details>
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
