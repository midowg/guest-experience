import type { EditorKit } from "@/components/admin/editor/kit";

export function RsvpBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control, time, tz } = kit;
  const visit = event.event_kind === "kunjungan";
  return <div className="stack">
    {visit ? <p>Tamu mengisi nama, instansi, dan kebutuhan khusus di satu layar. Lewat tautan umum, satu orang bisa mengonfirmasi untuk rombongannya. Jawaban masuk ke Tamu &amp; konfirmasi dan BEO.</p> : <p>RSVP adalah konfirmasi kehadiran tamu (dari bahasa Prancis, <i lang="fr">répondez s&apos;il vous plaît</i>). Formulir ini memungkinkan tamu mengabari panitia apakah mereka dapat hadir.</p>}
    {time("rsvp_closes_at", visit ? `Batas konfirmasi (${tz})` : `Batas RSVP (${tz})`, "Kosongkan jika tidak ada batas waktu.")}
    {control("guest_estimate", "Perkiraan jumlah tamu (opsional)", event.guest_estimate === null ? "" : String(event.guest_estimate), value => { const digits = value.replace(/\D/g, "").slice(0, 4); update("guest_estimate", digits ? Number(digits) : null); }, { hint: "Angka awal untuk konsumsi dan BEO, sebelum RSVP masuk." })}
  </div>;
}
