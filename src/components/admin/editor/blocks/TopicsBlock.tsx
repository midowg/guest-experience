import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { OrderButtons } from "@/components/admin/editor/controls";
import { moveItem } from "@/components/admin/editor/editor-model";
import type { EditorKit } from "@/components/admin/editor/kit";
import styles from "@/components/admin/admin.module.css";

export function TopicsBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control } = kit;
  return <div className="stack">
    {!event.topics.length && <p>Belum ada topik. Tambahkan hanya materi yang telah disetujui.</p>}
    {event.topics.map((topic, index) => <div className={styles.item} key={index}>
      <div className={styles.itemHeader}><h3>Topik {index + 1}</h3><OrderButtons label={`topik ${index + 1}`} index={index} length={event.topics.length} onMove={direction => update("topics", moveItem(event.topics, index, direction))} /></div>
      {control(`topics.${index}.title`, "Judul topik", topic.title, value => update("topics", event.topics.map((item, i) => i === index ? { ...item, title: value } : item)), { maxLength: 200 })}
      {control(`topics.${index}.description`, "Penjelasan topik", topic.description, value => update("topics", event.topics.map((item, i) => i === index ? { ...item, description: value } : item)), { multiline: true, maxLength: 1500 })}
      <Button type="button" variant="danger" onClick={() => { if (window.confirm("Hapus topik ini dari draft editor?")) update("topics", event.topics.filter((_, i) => i !== index)); }}><Trash2 size={17} aria-hidden="true" /><span>Hapus topik {index + 1}</span></Button>
    </div>)}
    <Button type="button" variant="secondary" disabled={event.topics.length >= 20} onClick={() => update("topics", [...event.topics, { title: "", description: "" }])}>Tambah topik</Button>
  </div>;
}
