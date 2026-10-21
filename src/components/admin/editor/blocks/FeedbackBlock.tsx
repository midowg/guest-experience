import { Trash2 } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { Check, OrderButtons } from "@/components/admin/editor/controls";
import { moveItem } from "@/components/admin/editor/editor-model";
import type { EditorKit } from "@/components/admin/editor/kit";
import type { FeedbackQuestion } from "@/lib/types";
import styles from "@/components/admin/admin.module.css";

export function FeedbackBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control, text, time, toggle, tz } = kit;
  return <div className="stack">
    {toggle("feedback_enabled", "Aktifkan survei feedback")}{time("feedback_opens_at", `Mulai menerima feedback (${tz})`, "Kosongkan agar tersedia setelah diaktifkan dan dipublikasikan.")}
    {text("feedback_description", "Pengantar survei (opsional)", 1000, true, "Kosongkan untuk memakai pengantar yang sekarang. Survei aplikasi bukan pesan WhatsApp.")}
    <Notice>Gunakan pertanyaan yang telah disetujui GA. Jangan mengganti makna atau jenis pertanyaan yang telah menerima jawaban; buat acara duplikat untuk survei baru. Server dapat menolak perubahan pertanyaan yang sudah digunakan.</Notice>
    {event.feedback_questions.map((question, index) => {
      function change<K extends keyof FeedbackQuestion>(key: K, value: FeedbackQuestion[K]) { update("feedback_questions", event.feedback_questions.map(item => item.id === question.id ? { ...item, [key]: value } : item)); }
      return <div className={styles.item} key={question.id}>
        <div className={styles.itemHeader}><h3>Pertanyaan {index + 1}</h3><OrderButtons label={`pertanyaan ${index + 1}`} index={index} length={event.feedback_questions.length} onMove={direction => update("feedback_questions", moveItem(event.feedback_questions, index, direction))} /></div>
        {control(`feedback_questions.${index}.label`, "Teks pertanyaan", question.label, value => change("label", value), { maxLength: 500 })}
        <Field name={`feedback_questions.${index}.kind`} label="Jenis jawaban"><select className="select" id={`feedback_questions.${index}.kind`} value={question.kind} onChange={e => change("kind", e.target.value as FeedbackQuestion["kind"])}><option value="text">Teks bebas</option><option value="rating">Rating 1–5</option><option value="choice">Pilihan tunggal</option></select></Field>
        <Check label="Wajib dijawab" checked={question.required} onChange={value => change("required", value)} />
        {question.kind === "choice" && control(`feedback_questions.${index}.options`, "Pilihan jawaban", question.options.join("\n"), value => change("options", value.split("\n")), { multiline: true, hint: "Satu pilihan per baris, minimal 2 pilihan berbeda; maksimal 20 pilihan (200 karakter per pilihan)." })}
        <Button type="button" variant="danger" onClick={() => { if (window.confirm("Hapus pertanyaan ini dari draft editor? Pertanyaan yang telah menerima jawaban dapat dilindungi server.")) update("feedback_questions", event.feedback_questions.filter(item => item.id !== question.id)); }}><Trash2 size={17} aria-hidden="true" /><span>Hapus pertanyaan {index + 1}</span></Button>
      </div>;
    })}
    {!event.feedback_questions.length && <p>Belum ada pertanyaan. Survei harus dinonaktifkan sebelum publikasi sampai pertanyaan tersedia.</p>}
    <Button type="button" variant="secondary" disabled={event.feedback_questions.length >= 30} onClick={() => update("feedback_questions", [...event.feedback_questions, { id: crypto.randomUUID(), label: "", kind: "text", required: false, options: [], sort_order: event.feedback_questions.length }])}>Tambah pertanyaan</Button>
  </div>;
}
