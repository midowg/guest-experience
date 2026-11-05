import { groupSize, type NeedBlock, type NeedGroup } from "@/lib/pra-wam/needs";
import base from "./pra-wam.module.css";
import styles from "./needs.module.css";

const who = (person: { name: string; department: string }) => person.department ? `${person.name} (${person.department})` : person.name;

function Group({ group }: { group: NeedGroup }) {
  const size = groupSize(group);
  return <li className={styles.group}>
    <div className={styles.groupHead}>
      <strong>{group.label}</strong>
      <span className={styles.count}>{size} orang</span>
    </div>
    {group.people.length > 0 && <ul className={styles.names} aria-label={`Yang memilih ${group.label}`}>
      {group.people.map(person => <li key={person.id}>{who(person)}</li>)}
    </ul>}
    {!group.countOnly && group.unnamed > 0 && <p className={base.meta}>{group.people.length ? `+ ${group.unnamed} orang` : `${group.unnamed} orang`} tanpa nama (jawaban hanya dibaca HR).</p>}
  </li>;
}

/**
 * Kebutuhan peserta, one card per question: choices with how many and who, written answers by
 * name, and how many only HR reads. Server-rendered from needsOf, which already left out what the
 * panitia may not see.
 */
export function NeedsList({ blocks }: { blocks: NeedBlock[] }) {
  return <div className={styles.list}>
    {blocks.map(block => {
      const groups = block.groups.filter(group => groupSize(group) > 0);
      const empty = !groups.length && !block.entries.length && !block.hrOnly;
      return <section key={block.key} className={base.card} aria-labelledby={`kebutuhan-${block.key}`}>
        <h2 id={`kebutuhan-${block.key}`}>{block.title}</h2>
        <p className={base.meta}>{block.purpose} Pertanyaan {block.key}: {block.prompt}</p>
        {empty && <p className={styles.empty}>Belum ada jawaban.</p>}
        {groups.length > 0 && <ul className={styles.groups}>{groups.map(group => <Group key={group.label} group={group} />)}</ul>}
        {block.entries.length > 0 && <ul className={styles.entries}>
          {block.entries.map(entry => <li key={entry.person.id}><strong>{who(entry.person)}</strong><p>{entry.text}</p></li>)}
        </ul>}
        {block.hrOnly > 0 && <p className={styles.hrNote}>{block.hrQuestion
          ? `${block.hrOnly} orang mengisi. Isinya hanya dibaca HR; minta ke HR bila panitia perlu menyiapkannya.`
          : `${block.hrOnly} jawaban lain hanya dibaca HR, karena diisi saat pertanyaan ini masih berlabel "Hanya HR dan manajemen".`}</p>}
      </section>;
    })}
  </div>;
}
