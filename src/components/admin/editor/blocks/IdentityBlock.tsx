import { ButtonLink, Notice } from "@/components/ui";
import type { EditorKit } from "@/components/admin/editor/kit";
import { adminEventPath } from "@/lib/routes";
import { EventLink } from "./EventLink";
import styles from "@/components/admin/admin.module.css";

export function IdentityBlock({ kit }: { kit: EditorKit }) {
  const { event, update, text, choices, unavailable } = kit;
  // An E-Guide is read, not answered: no greeting, invitation text or guest links. Its cover and chapters live in "Bab panduan".
  const guide = event.event_kind === "eguide";
  // A CSR page asks for donations, not attendance: a short story instead of greeting, invitation and guest links.
  const csr = event.event_kind === "csr";
  return <div className="stack">
    {text("title", guide ? "Nama E-Guide" : csr ? "Judul kegiatan" : "Judul acara", 180, false, guide ? "Nama di daftar acara, tab browser, dan pratinjau tautan. Judul di sampul diisi di Bab panduan." : undefined)}{text("subtitle", "Subjudul", 250)}
    {/* With a short code the address is fixed; the slug stays internal. Before migration 202610210004 it is still the address. */}
    {event.code ? <><EventLink event={event} origin={kit.origin} />{text("organizer", "Penyelenggara", 250)}</>
      : <div className={styles.grid}>{text("slug", "Alamat singkat undangan (slug)", 100, false, "Huruf kecil, angka, dan tanda hubung. Mengubah slug membuat tautan lama tidak berlaku.")}{text("organizer", "Penyelenggara", 250)}</div>}
    {csr && text("introduction", "Cerita singkat", 5000, true, "Dua-tiga kalimat di bawah judul: siapa yang dibantu dan untuk apa. Wajib sebelum publikasi.")}
    {!guide && !csr && <>{text("greeting", "Sapaan", 150)}{text("introduction", "Isi undangan", 5000, true)}{text("closing", "Penutup", 2000, true)}
    {choices("invitation_mode", "Cara mengundang", [{ value: "open" as const, label: "Tautan umum" }, ...(unavailable("personal") ? [] : [{ value: "personal" as const, label: "Tautan per tamu" }])], event.invitation_mode, value => update("invitation_mode", value), value => value === "personal" ? "RSVP hanya lewat tautan per tamu; halaman umum tetap dapat dibaca." : "Formulir RSVP tersedia di halaman umum bila diaktifkan.")}
    {event.invitation_mode === "personal" && <Notice tone="warning">Siapa pun yang memegang tautan personal dapat membuka undangan dan mengubah RSVP tamu itu. Tautan personal bukan verifikasi identitas; kirim satu per satu.</Notice>}
    <ButtonLink href={adminEventPath(event, "invitations")} variant="secondary">Kelola undangan tamu</ButtonLink></>}
  </div>;
}
