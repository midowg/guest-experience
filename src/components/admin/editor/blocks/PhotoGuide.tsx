import { photoGuidance } from "@/components/admin/editor/editor-model";
import styles from "@/components/admin/admin.module.css";

/** Size advice shown under every photo field. */
export function PhotoGuide() {
  return <div className={styles.photoGuide}><h3>Panduan ukuran foto</h3><ul>{photoGuidance.map(line => <li key={line}>{line}</li>)}</ul></div>;
}
