import type { EditorKit } from "@/components/admin/editor/kit";
import { StaffPicker } from "@/components/admin/editor/StaffPicker";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import styles from "@/components/admin/admin.module.css";

export function ContactBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control, choices } = kit;
  const contact = event.contact;
  return <div className="stack">
    <p>Isi nama dan nomor untuk menampilkan bagian kontak tersendiri setelah konfirmasi. Aktifkan juga bagian Kontak pada pengaturan tampilan. Kontak tetap tersedia meskipun RSVP ditutup.</p>
    {control("contact.heading", "Judul pengantar kontak (opsional)", contact.heading, value => update("contact", { ...contact, heading: value }), { maxLength: 200, hint: "Contoh: Any questions before your visit? Kosongkan untuk tampilan lama." })}
    {control("contact.description", "Deskripsi kontak (opsional)", contact.description, value => update("contact", { ...contact, description: value }), { multiline: true, maxLength: 1000, hint: "Misalnya bantuan arah, akses, atau informasi kunjungan." })}
    <StaffPicker staff={kit.staff} contact={contact} onPick={next => update("contact", next)} />
    {/* Typing a field by hand turns the pick into a manual contact, so the team list stays the source only while untouched. */}
    <details className={styles.extraFields} open={!kit.staff.length || (!!contact.name && !contact.staff_id) || undefined}>
      <summary>{kit.staff.length ? "Atau isi manual / ubah detail PIC" : "Data PIC"}</summary>
      <div className="stack">
        {control("contact.name", "Nama PIC", contact.name, value => update("contact", { ...contact, name: value, staff_id: "" }), { maxLength: 150 })}
        {control("contact.role", "Jabatan PIC (opsional)", contact.role, value => update("contact", { ...contact, role: value, staff_id: "" }), { maxLength: 150 })}
        {control("contact.organization", "Organisasi PIC (opsional)", contact.organization, value => update("contact", { ...contact, organization: value }), { maxLength: 200 })}
        {control("contact.phone", "Nomor PIC", contact.phone, value => update("contact", { ...contact, phone: value, staff_id: "" }), { maxLength: 30, hint: "Cukup isi nomor HP 08, misalnya 0812 3456 7890. WhatsApp otomatis memakai kode 62; telepon tetap memakai 0. Kosongkan nama dan nomor untuk menyembunyikan kontak." })}
        <PhotoField name="contact.photo.url" label="Foto PIC (opsional)" value={contact.photo?.url ?? ""} srcset={contact.photo?.srcset ?? []} onChange={value => update("contact", { ...contact, photo: { ...value, alt: value.url ? contact.name : "" } })} />
      </div>
    </details>
    <details className={styles.extraFields}>
      <summary>Kontak darurat (opsional)</summary>
      <div className="stack">
        <p className="field-hint">Tampil sebagai kartu merah di bagian Kontak dan di halaman Hari H. Berguna untuk trip dan program di luar kantor.</p>
        {control("emergency.name", "Nama kontak darurat", event.emergency.name, name => update("emergency", { ...event.emergency, name }), { maxLength: 150 })}
        {control("emergency.phone", "Nomor kontak darurat", event.emergency.phone, phone => update("emergency", { ...event.emergency, phone }), { maxLength: 30 })}
        {control("emergency.hospital", "Rumah sakit terdekat", event.emergency.hospital, hospital => update("emergency", { ...event.emergency, hospital }), { maxLength: 200 })}
        {control("emergency.hospital_address", "Alamat rumah sakit", event.emergency.hospital_address, hospital_address => update("emergency", { ...event.emergency, hospital_address }), { multiline: true, maxLength: 500 })}
        {control("emergency.hospital_maps_url", "Tautan Maps rumah sakit", event.emergency.hospital_maps_url, hospital_maps_url => update("emergency", { ...event.emergency, hospital_maps_url }), { type: "url", maxLength: 8000 })}
      </div>
    </details>
    {choices("contact.channel", "Cara menghubungi PIC", [{ value: "whatsapp", label: "WhatsApp" }, { value: "phone", label: "Telepon" }], contact.channel, value => update("contact", { ...contact, channel: value }), value => value === "whatsapp" ? "Tombol membuka percakapan WhatsApp." : "Tombol membuka aplikasi telepon.")}
  </div>;
}
