import { MapPin } from "lucide-react";
import { RouteFields } from "@/components/admin/editor/JourneyEditor";
import type { EditorKit } from "@/components/admin/editor/kit";
import { WERKUDARA_OFFICE } from "@/components/admin/editor/suggestions";
import styles from "@/components/admin/admin.module.css";

/**
 * `embedDraft` keeps the pasted iframe code as typed; only its map address is saved. `place`
 * false leaves the name and address out: Kunjungan Kantor fills them in Info kunjungan.
 */
export function VenueBlock({ kit, embedDraft, onEmbedDraft, place = true }: { kit: EditorKit; embedDraft: string; onEmbedDraft: (value: string) => void; place?: boolean }) {
  const { event, update, control, text, choices, errors, unavailable } = kit;
  return <div className="stack">
    {choices("location_display", "Tampilan lokasi", [{ value: "manual", label: "Alamat & tombol" }, { value: "embed", label: "Peta sematan Google" }], event.location_display, value => update("location_display", value), value => value === "embed" ? "Peta Google tampil tanpa kartu alamat dan tombol dari undangan. Google dapat tetap menampilkan informasi lokasinya sendiri." : "Nama tempat, alamat, petunjuk, dan tombol Maps tampil seperti semula.")}
    {event.location_display === "manual" ? <>
      {place && (event.venue_name !== WERKUDARA_OFFICE.venue_name || event.address !== WERKUDARA_OFFICE.address) && <div className={styles.chips}>
        <button type="button" className={styles.chip} onClick={() => { update("venue_name", WERKUDARA_OFFICE.venue_name); update("address", WERKUDARA_OFFICE.address); update("location_url", WERKUDARA_OFFICE.location_url); }}>
          <MapPin size={14} aria-hidden="true" /> Pakai alamat kantor Werkudara
        </button>
      </div>}
      {place && <>{text("venue_name", "Nama tempat", 200)}{text("address", "Alamat", 1000, true)}</>}{text("location_url", "Tautan lokasi Maps", 8000)}{text("arrival_notes", "Petunjuk kedatangan (opsional)", 2000, true)}
    </> : <div className="stack">
      <p>Buka Google Maps, pilih lokasinya, klik Bagikan (Share), pilih Sematkan peta (Embed a map), lalu Salin HTML dan tempel di sini.</p>
      {control("location_embed_url", "Kode sematan Google Maps", embedDraft, value => { onEmbedDraft(value); update("location_embed_url", value); }, { multiline: true, maxLength: 10000, hint: "Tempel kode iframe lengkap dari Google Maps atau URL sematannya. Yang disimpan hanya URL peta, bukan kode HTML." })}
    </div>}
    {!unavailable("route") && <RouteFields event={event} update={update} control={control} errors={errors} />}
  </div>;
}
