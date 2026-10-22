import { Field, Notice } from "@/components/ui";
import { hiddenSectionReasons } from "@/components/admin/editor/editor-model";
import type { EditorKit } from "@/components/admin/editor/kit";
import type { EventStatus } from "@/lib/types";

export function PublicationBlock({ kit }: { kit: EditorKit }) {
  const { event, update } = kit;
  const hidden = hiddenSectionReasons(event);
  return <div className="stack">
    <Field name="status" label="Status acara" hint="Draft dan arsip tidak tampil di URL undangan publik. Semua perubahan berlaku setelah disimpan."><select className="select" id="status" aria-describedby="status-hint" value={event.status} onChange={e => update("status", e.target.value as EventStatus)}><option value="draft">Draft — belum publik</option><option value="published">Dipublikasikan — dapat dibuka melalui tautan</option><option value="archived">Diarsipkan — tidak publik</option></select></Field>
    {hidden.length > 0 && <div><h3>Bagian yang belum ditampilkan</h3><Notice tone="warning"><ul>{hidden.map(reason => <li key={reason}>{reason}</li>)}</ul></Notice></div>}
    <p>Publikasi memerlukan penyelenggara dan isi undangan. Mode alamat memerlukan nama tempat, alamat, dan tautan Maps; mode sematan memerlukan kode peta Google yang valid.</p>
  </div>;
}
