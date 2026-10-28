import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { OrderButtons } from "@/components/admin/editor/controls";
import { moveItem } from "@/components/admin/editor/editor-model";
import type { EditorKit } from "@/components/admin/editor/kit";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import { defaultFraming } from "@/lib/hero-framing";
import type { EventRecord } from "@/lib/types";
import { EventLink } from "./EventLink";
import { PhotoGuide } from "./PhotoGuide";
import styles from "@/components/admin/admin.module.css";

/*
 * Panduan lokasi's own blocks (event_kind "panduan"): one per part of the page "Panduan ke
 * Werkudara", worded for a guide, not an invitation. Getting Here reuses the location blocks.
 */

/** Info halaman: the guide's name, its link, and who hosts it. */
export function PlaceInfoBlock({ kit }: { kit: EditorKit }) {
  const { event, text } = kit;
  return <div className="stack">
    {text("title", "Judul panduan", 180, false, "Tampil besar di sambutan, di tab browser, dan di daftar acara. Contoh: Your Visit to Werkudara.")}
    {event.code && <EventLink event={event} origin={kit.origin} label="Tautan panduan" hint="Bagikan ke siapa saja: tamu, klien, vendor. Tidak perlu konfirmasi atau tiket." />}
    {text("organizer", "Tuan rumah", 250, false, "Biasanya Werkudara Group. Wajib sebelum terbit.")}
  </div>;
}

/** Sambutan: the cover photo, the title lines, and a few warm sentences. */
export function PlaceWelcomeBlock({ kit }: { kit: EditorKit }) {
  const { event, update, text, errors } = kit;
  const updateHero = (patch: Partial<EventRecord["hero"]>) => update("hero", { ...event.hero, ...patch });
  return <div className="stack">
    {text("subtitle", "Subjudul", 250, false, "Tampil miring di bawah judul. Contoh: A Little Guide Before We Meet.")}
    {text("greeting", "Kalimat pembuka", 150, false, "Tampil besar di atas isi sambutan. Contoh: Welcome to Werkudara.")}
    {text("introduction", "Isi sambutan", 5000, true, "Pisahkan paragraf dengan satu baris kosong. Wajib sebelum terbit.")}
    <h3>Foto sampul</h3>
    <p className="field-hint">Tampil selebar layar di atas judul. Pilih foto mendatar; bagian tengahnya yang selalu terlihat.</p>
    <PhotoField name="hero.url" label="Foto sampul (opsional)" value={event.hero.url} srcset={event.hero.srcset} onChange={value => updateHero({ ...value, framing: defaultFraming() })} error={errors["hero.url"]?.join(" ")} />
    {errors["hero.srcset"] && <p id="hero.srcset" tabIndex={-1} className="field-error">{errors["hero.srcset"].join(" ")}</p>}
    {event.hero.url && <label className="field"><span>Keterangan foto <small>untuk pembaca layar</small></span>
      <input className="input" name="hero.alt" value={event.hero.alt} maxLength={300} placeholder="Tampak depan Werkudara Office" onChange={change => updateHero({ alt: change.target.value })} />
    </label>}
  </div>;
}

/** Galeri: photos in justified rows, each as wide as its own shape; a tap opens it full size. */
export function PlaceGalleryBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control, errors } = kit;
  const change = (index: number, patch: Partial<EventRecord["gallery"][number]>) => update("gallery", event.gallery.map((item, i) => i === index ? { ...item, ...patch } : item));
  return <div className="stack">
    <p>Foto tampil berderet dan memenuhi lebar halaman, mendatar maupun tegak. Tamu mengetuk foto untuk melihatnya penuh. Galeri disembunyikan kalau tidak ada foto. Maksimal 12.</p>
    {event.gallery.map((image, index) => <div className={styles.item} key={image.id}>
      <div className={styles.itemHeader}><h3>Foto {index + 1}</h3><OrderButtons label={`foto ${index + 1}`} index={index} length={event.gallery.length} onMove={direction => update("gallery", moveItem(event.gallery, index, direction))} /></div>
      <PhotoField name={`gallery.${index}.url`} label="Foto" value={image.url} srcset={image.srcset} onChange={value => change(index, { url: value.url, srcset: value.srcset })} error={errors[`gallery.${index}.url`]?.join(" ")} />
      {control(`gallery.${index}.alt`, "Keterangan foto", image.alt, alt => change(index, { alt }), { maxLength: 300, hint: "Dibacakan pembaca layar dan dipakai di tombol perbesar. Contoh: Pendopo di area terbuka." })}
      <Button type="button" variant="danger" onClick={() => { if (window.confirm("Hapus foto ini dari draft editor?")) update("gallery", event.gallery.filter((_, i) => i !== index)); }}><Trash2 size={17} aria-hidden="true" /><span>Hapus foto {index + 1}</span></Button>
    </div>)}
    <Button type="button" variant="secondary" disabled={event.gallery.length >= 12} onClick={() => update("gallery", [...event.gallery, { id: crypto.randomUUID(), url: "", alt: "", caption: "", sort_order: event.gallery.length, srcset: [] }])}>Tambah foto</Button>
    <PhotoGuide />
  </div>;
}
