import { ButtonLink, Notice } from "@/components/ui";
import type { EditorKit } from "@/components/admin/editor/kit";
import { adminEventPath } from "@/lib/routes";
import styles from "@/components/admin/admin.module.css";

export function IdentityBlock({ kit }: { kit: EditorKit }) {
  const { event, update, text, choices, unavailable } = kit;
  return <div className="stack">
    {text("title", "Judul acara", 180)}{text("subtitle", "Subjudul", 250)}
    <div className={styles.grid}>{text("slug", "Alamat singkat undangan (slug)", 100, false, "Huruf kecil, angka, dan tanda hubung. Mengubah slug membuat tautan lama tidak berlaku.")}{text("organizer", "Penyelenggara", 250)}</div>
    {text("greeting", "Sapaan", 150)}{text("introduction", "Isi undangan", 5000, true)}{text("closing", "Penutup", 2000, true)}
    {choices("invitation_mode", "Cara mengundang", [{ value: "open" as const, label: "Tautan umum" }, ...(unavailable("personal") ? [] : [{ value: "personal" as const, label: "Tautan per tamu" }])], event.invitation_mode, value => update("invitation_mode", value), value => value === "personal" ? "RSVP hanya lewat tautan per tamu; halaman umum tetap dapat dibaca." : "Formulir RSVP tersedia di halaman umum bila diaktifkan.")}
    {event.invitation_mode === "personal" && <Notice tone="warning">Siapa pun yang memegang tautan personal dapat membuka undangan dan mengubah RSVP tamu itu. Tautan personal bukan verifikasi identitas; kirim satu per satu.</Notice>}
    <ButtonLink href={adminEventPath(event, "invitations")} variant="secondary">Kelola undangan tamu</ButtonLink>
  </div>;
}
