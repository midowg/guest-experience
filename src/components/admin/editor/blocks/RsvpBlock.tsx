import type { EditorKit } from "@/components/admin/editor/kit";

export function RsvpBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control, toggle, time, tz } = kit;
  return <div className="stack">
    <p>RSVP adalah konfirmasi kehadiran tamu (dari bahasa Prancis, <i lang="fr">répondez s&apos;il vous plaît</i>). Formulir ini memungkinkan tamu mengabari panitia apakah mereka dapat hadir.</p>
    {toggle("rsvp_enabled", "Aktifkan penerimaan konfirmasi kehadiran")}
    {time("rsvp_closes_at", `Batas RSVP (${tz})`, "Kosongkan jika tidak ada batas waktu. Bagian RSVP juga harus ditampilkan agar formulir terlihat.")}
    {control("guest_estimate", "Perkiraan jumlah tamu (opsional)", event.guest_estimate === null ? "" : String(event.guest_estimate), value => { const digits = value.replace(/\D/g, "").slice(0, 4); update("guest_estimate", digits ? Number(digits) : null); }, { hint: "Angka awal untuk konsumsi dan BEO, sebelum RSVP masuk." })}
  </div>;
}
