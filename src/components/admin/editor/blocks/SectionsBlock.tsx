import { Check, OrderButtons } from "@/components/admin/editor/controls";
import { moveItem, sectionLabels } from "@/components/admin/editor/editor-model";
import type { EditorKit } from "@/components/admin/editor/kit";
import styles from "@/components/admin/admin.module.css";

export function SectionsBlock({ kit }: { kit: EditorKit }) {
  const { event, update, sectionUnavailable } = kit;
  return <div className="stack">
    <p>Sambutan dan penutup tetap berada di awal dan akhir undangan. Bagian pendukung dapat disembunyikan atau diurutkan.</p>
    {event.sections.map((section, index) => sectionUnavailable(section.key) ? null : <div className={styles.sectionRow} key={section.key}>
      <Check label={sectionLabels[section.key]} checked={section.enabled} onChange={enabled => update("sections", event.sections.map(item => item.key === section.key ? { ...item, enabled } : item))} />
      <OrderButtons label={sectionLabels[section.key]} index={index} length={event.sections.length} onMove={direction => update("sections", moveItem(event.sections, index, direction))} />
    </div>)}
  </div>;
}
