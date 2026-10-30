import { Check, OrderButtons } from "@/components/admin/editor/controls";
import { moveItem, sectionLabels } from "@/components/admin/editor/editor-model";
import type { EditorKit } from "@/components/admin/editor/kit";
import styles from "@/components/admin/admin.module.css";

export function SectionsBlock({ kit }: { kit: EditorKit }) {
  const { event, update, sectionUnavailable } = kit;
  // Hidden rows (a module switched off, a trip part outside a Program) keep their place; the arrows move past them.
  const shown = event.sections.filter(section => !sectionUnavailable(section.key));
  const move = (key: string, direction: -1 | 1) => {
    const order = moveItem(shown, shown.findIndex(section => section.key === key), direction);
    let next = 0;
    update("sections", event.sections.map(section => sectionUnavailable(section.key) ? section : order[next++]));
  };
  return <div className="stack">
    <p>Sambutan dan penutup tetap berada di awal dan akhir undangan. Bagian pendukung dapat disembunyikan atau diurutkan.</p>
    {shown.map((section, index) => <div className={styles.sectionRow} key={section.key}>
      <Check label={sectionLabels[section.key]} checked={section.enabled} onChange={enabled => update("sections", event.sections.map(item => item.key === section.key ? { ...item, enabled } : item))} />
      <OrderButtons label={sectionLabels[section.key]} index={index} length={shown.length} onMove={direction => move(section.key, direction)} />
    </div>)}
  </div>;
}
