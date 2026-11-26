import type { ChecklistInput, ChecklistPhotoRef, SessionChecklist } from "./ceklis";

/*
 * The checklist as Admin WAM's session form holds it while it is being edited (agen S1): items with a
 * local key (a new item has no id yet), a photo that may be new (uploaded, not saved) or already saved,
 * and what to send. Pure: tested without a page.
 */

export type ChecklistDraftItem = {
  /** Local, stable while editing (a React key); not sent. */
  key: string;
  /** The saved item's id; a new item has none. */
  id?: string;
  text: string;
  note: string;
  /** The photo to keep: its storage key (saved or just uploaded), mime and size. */
  photo: ChecklistPhotoRef | null;
  /** Where to show it: a saved photo's address, or the browser's own copy of one just chosen. */
  photoUrl: string | null;
};
export type ChecklistDraft = { items: ChecklistDraftItem[] };

let counter = 0;
/** A key for a new item. */
export const newItemKey = () => `n${Date.now().toString(36)}${(counter++).toString(36)}`;

export const emptyDraft = (): ChecklistDraft => ({ items: [] });
export const blankItem = (): ChecklistDraftItem => ({ key: newItemKey(), text: "", note: "", photo: null, photoUrl: null });

/** The draft of a saved checklist; `photoAddress` says where the admin opens a saved item's photo. */
export function draftFromChecklist(list: SessionChecklist | null | undefined, photoAddress: (itemId: string, version: string) => string): ChecklistDraft {
  if (!list) return emptyDraft();
  return {
    items: list.items.map(item => ({
      key: item.id, id: item.id, text: item.text, note: item.note,
      photo: item.photo ? { key: item.photo.key, mime: item.photo.mime as ChecklistPhotoRef["mime"], size: item.photo.size } : null,
      photoUrl: item.photo ? photoAddress(item.id, item.photo.version) : null,
    })),
  };
}

/** What the server is sent (an item with no text is left out: an empty row is not an item). */
export function draftToInput(draft: ChecklistDraft): ChecklistInput {
  return {
    items: draft.items.filter(item => item.text.trim()).map(item => ({ ...(item.id ? { id: item.id } : {}), text: item.text.trim(), note: item.note.trim(), photo: item.photo })),
  };
}

/** Whether the draft differs from what is saved (then Simpan saves the checklist too). */
export function draftChanged(saved: SessionChecklist | null | undefined, draft: ChecklistDraft): boolean {
  const input = draftToInput(draft);
  const items = saved?.items ?? [];
  if (input.items.length !== items.length) return true;
  return input.items.some((item, index) => {
    const before = items[index];
    return item.id !== before.id || item.text !== before.text || item.note !== before.note || (item.photo?.key ?? null) !== (before.photo?.key ?? null);
  });
}

/** An item moved one place up (-1) or down (+1); the same list when it cannot move. */
export function moveItem<T>(items: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= items.length) return [...items];
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
