import type { EventPhase, EventRecord, SectionKey } from "./types";

/*
 * Messages between the editor and its phone preview (an iframe on /admin/pratinjau-langsung).
 * Both sides check origin and source; nothing here is trusted beyond the signed-in admin's tab.
 */
export type PreviewArea = SectionKey | "hero" | "day" | "after";
export type PreviewMessage =
  | { type: "preview:ready" }
  | { type: "preview:update"; event: EventRecord; phase: EventPhase }
  | { type: "preview:scroll"; area: PreviewArea }
  | { type: "preview:focus"; area: PreviewArea };

/** Which editor block edits each part of the guest page. */
export const blockOfArea: Record<PreviewArea, string> = {
  hero: "hero", about: "identity", experience: "experience", agenda: "agenda", location: "venue", prepare: "prepare",
  team: "team", rsvp: "rsvp", contact: "contact", feedback: "feedback_questions", day: "day", after: "after",
};

/** The part of the guest page a block changes, for scrolling the preview to it. */
export function areaOfBlock(block: string): PreviewArea | null {
  if (block === "schedule" || block === "appearance") return "hero";
  if (block === "gallery") return "location";
  if (block === "review") return "after";
  const found = (Object.entries(blockOfArea) as [PreviewArea, string][]).find(([, id]) => id === block);
  return found ? found[0] : null;
}

/** The journey phase worth showing while a block is open: the day panel for Hari H, the thank-you for after. */
export function phaseOfBlock(block: string): EventPhase {
  return block === "day" ? "day" : block === "after" || block === "review" ? "after" : "before";
}

export function isPreviewMessage(data: unknown): data is PreviewMessage {
  return !!data && typeof data === "object" && typeof (data as { type?: unknown }).type === "string" && String((data as { type: string }).type).startsWith("preview:");
}
