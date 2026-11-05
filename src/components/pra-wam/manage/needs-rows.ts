import { groupSize, type NeedBlock, type NeedPerson } from "@/lib/pra-wam/needs";

/*
 * Kebutuhan peserta as table rows and key numbers (console "K5"). Only reshapes what needsOf
 * returned, which already left out everything the panitia may not read: a row names people only
 * where the block itself names them, and an HR-only answer is a count, never a name or a text.
 */

export type NeedRow = {
  key: string; blockKey: string; block: string; purpose: string; prompt: string;
  /** The choice, or the written answer. */
  answer: string; written: boolean;
  count: number;
  names: string[];
  /** A line under the names: who is counted but not named, or why a row has no names. */
  note?: string;
  kind: "pilihan" | "tertulis" | "hr" | "kosong";
};

export const personLabel = (person: NeedPerson) => (person.department ? `${person.name} (${person.department})` : person.name);

const about = (block: NeedBlock) => ({ blockKey: block.key, block: block.title, purpose: block.purpose, prompt: block.prompt });

export function needRows(blocks: readonly NeedBlock[]): NeedRow[] {
  return blocks.flatMap(block => {
    const rows: NeedRow[] = [];
    for (const group of block.groups) {
      const size = groupSize(group);
      if (size === 0) continue;
      rows.push({
        key: `${block.key}-g-${group.label}`, ...about(block), answer: group.label, written: false, count: size, kind: "pilihan",
        names: group.people.map(personLabel),
        note: !group.countOnly && group.unnamed > 0 ? `${group.people.length ? `+ ${group.unnamed} orang` : `${group.unnamed} orang`} tanpa nama (jawaban hanya dibaca HR).` : undefined,
      });
    }
    for (const entry of block.entries) rows.push({
      key: `${block.key}-e-${entry.person.id}`, ...about(block), answer: entry.text, written: true, count: 1, kind: "tertulis", names: [personLabel(entry.person)],
    });
    if (block.hrOnly > 0) rows.push({
      key: `${block.key}-hr`, ...about(block), answer: "Hanya dibaca HR", written: false, count: block.hrOnly, kind: "hr", names: [],
      note: block.hrQuestion
        ? `${block.hrOnly} orang mengisi. Isinya hanya dibaca HR; minta ke HR bila panitia perlu menyiapkannya.`
        : `${block.hrOnly} jawaban lain hanya dibaca HR, karena diisi saat pertanyaan ini masih berlabel "Hanya HR dan manajemen".`,
    });
    if (!rows.length) rows.push({ key: `${block.key}-kosong`, ...about(block), answer: "Belum ada jawaban.", written: false, count: 0, kind: "kosong", names: [] });
    return rows;
  });
}

/** How many to prepare for, per block: everyone with a choice other than "Tidak ada", a written answer, or an answer only HR reads. */
export function needCount(block: NeedBlock): number {
  return block.groups.filter(group => !group.countOnly).reduce((sum, group) => sum + groupSize(group), 0) + block.entries.length + block.hrOnly;
}
