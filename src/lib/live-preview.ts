import type { EventPhase, EventRecord, SectionKey } from "./types";

/*
 * Messages between the editor and its phone preview (an iframe on /admin/pratinjau-langsung).
 * Both sides check origin and source; nothing here is trusted beyond the signed-in admin's tab.
 */
export type PreviewArea = SectionKey | "hero" | "day" | "after";
export type PreviewMessage =
  | { type: "preview:ready" }
  // `guest` previews a personal link: the page greets that name.
  | { type: "preview:update"; event: EventRecord; phase: EventPhase; guest?: string }
  | { type: "preview:scroll"; area: PreviewArea }
  // The part being typed in gets a blue frame with the field's name; null removes it.
  // `field` frames that one text where the page marks it (data-preview-field), else the whole part.
  | { type: "preview:highlight"; area: PreviewArea | null; label?: string; field?: string }
  | { type: "preview:focus"; area: PreviewArea };

/** Which editor block edits each part of the guest page. */
export const blockOfArea: Record<PreviewArea, string> = {
  hero: "hero", about: "identity", experience: "experience", agenda: "agenda", location: "venue", prepare: "prepare",
  team: "team", rsvp: "rsvp", contact: "contact", feedback: "feedback_questions", day: "day", after: "after",
  transport: "transport", stay: "stay", guidelines: "guidelines", contacts: "contacts",
};

/** Kunjungan Kantor's menu (editor-model visitMenu): a tap on a screen opens the block named after it. */
const visitBlockOfArea: Partial<Record<PreviewArea, string>> = { hero: "hero", about: "topics", feedback: "after" };
/** Which editor block edits a part of the guest page, for this kind of event. */
export function blockForArea(area: PreviewArea, kind?: EventRecord["event_kind"]): string {
  return (kind === "kunjungan" && visitBlockOfArea[area]) || blockOfArea[area];
}

/** The part of the guest page a block changes, for scrolling the preview to it. */
export function areaOfBlock(block: string, kind?: EventRecord["event_kind"]): PreviewArea | null {
  if (kind === "kunjungan") {
    // Each block of the visit menu is one guest screen; Info kunjungan fills the welcome card.
    const visit: Record<string, PreviewArea> = { identity: "hero", hero: "hero", topics: "about", photos: "after" };
    if (visit[block]) return visit[block];
  }
  if (block === "schedule" || block === "appearance") return "hero";
  if (block === "gallery") return "location";
  if (block === "review") return "after";
  const found = (Object.entries(blockOfArea) as [PreviewArea, string][]).find(([, id]) => id === block);
  return found ? found[0] : null;
}

/** The journey phase worth showing while a block is open: the day panel for Hari H, the thank-you for after. */
export function phaseOfBlock(block: string): EventPhase {
  return block === "day" ? "day" : block === "after" || block === "review" || block === "photos" ? "after" : "before";
}

export function isPreviewMessage(data: unknown): data is PreviewMessage {
  return !!data && typeof data === "object" && typeof (data as { type?: unknown }).type === "string" && String((data as { type: string }).type).startsWith("preview:");
}
