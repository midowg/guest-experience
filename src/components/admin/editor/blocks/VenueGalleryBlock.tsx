import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { OrderButtons } from "@/components/admin/editor/controls";
import { moveItem } from "@/components/admin/editor/editor-model";
import type { EditorKit } from "@/components/admin/editor/kit";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import { PhotoGuide } from "./PhotoGuide";
import styles from "@/components/admin/admin.module.css";

export function VenueGalleryBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control, errors } = kit;
  return <div className="stack">
    <p>Foto-foto di sini tampil di bagian Lokasi, di bawah informasi alamat atau peta sematan. Satu foto ditampilkan diam; dua foto atau lebih bergantian otomatis dan dapat dihentikan tamu. Baris foto yang benar-benar kosong dilewati saat menyimpan; jika sudah diisi keterangannya, tambahkan foto dengan tautan HTTPS atau hapus baris tersebut.</p>
    {event.gallery.map((image, index) => <div className={styles.item} key={image.id}>
      <div className={styles.itemHeader}><h3>Foto lokasi {index + 1}</h3><OrderButtons label={`foto lokasi ${index + 1}`} index={index} length={event.gallery.length} onMove={direction => update("gallery", moveItem(event.gallery, index, direction))} /></div>
      <PhotoField name={`gallery.${index}.url`} label="Foto lokasi" value={image.url} srcset={image.srcset} onChange={value => update("gallery", event.gallery.map((item, i) => i === index ? { ...item, url: value.url, srcset: value.srcset } : item))} error={errors[`gallery.${index}.url`]?.join(" ")} />
      {control(`gallery.${index}.caption`, "Keterangan foto (opsional)", image.caption, value => update("gallery", event.gallery.map((item, i) => i === index ? { ...item, caption: value } : item)), { maxLength: 300, hint: "Tampil sebagai teks di bawah foto. Boleh dikosongkan." })}
      <Button type="button" variant="danger" onClick={() => { if (window.confirm("Hapus foto ini dari draft editor?")) update("gallery", event.gallery.filter((_, i) => i !== index)); }}><Trash2 size={17} aria-hidden="true" /><span>Hapus foto lokasi {index + 1}</span></Button>
    </div>)}
    {!event.gallery.length && <p>Belum ada foto lokasi. Undangan tetap tampil tanpa gambar.</p>}
    <Button type="button" variant="secondary" disabled={event.gallery.length >= 12} onClick={() => update("gallery", [...event.gallery, { id: crypto.randomUUID(), url: "", alt: "", caption: "", sort_order: event.gallery.length, srcset: [] }])}>Tambah foto lokasi</Button>
    <PhotoGuide />
  </div>;
}
