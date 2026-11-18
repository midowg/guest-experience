import { mainWamPath } from "@/lib/routes";
import type { GuideKind, MwGuide, MwSession } from "../types";

/*
 * Panduan (L04, revisi 16 Nov malam): one list without tabs (Denah, Hotel & fasilitas, Dress code,
 * Tata tertib), written in Admin WAM; a row opens its page (text and the file, through the server).
 * Pure.
 */

/** Lucide icon names per kind (SPEC §0.3, L04). */
export const guideIcon: Record<GuideKind, "map" | "hotel" | "shirt" | "clipboard-list" | "file-text"> = {
  denah: "map", hotel: "hotel", dresscode: "shirt", tata_tertib: "clipboard-list", lain: "file-text",
};

/** The row's line: the first line of the text, as written. */
export function guideLine(guide: Pick<MwGuide, "body">): string {
  return guide.body.split(/\r?\n/).map(line => line.trim()).find(Boolean) ?? "";
}

/** The text as paragraphs (blank lines and line breaks both separate). */
export const paragraphs = (body: string) => body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

/** How a guide's file is shown: an image inline, anything else (PDF) opened as a file. */
export const fileShown = (file: MwGuide["file"]): "gambar" | "berkas" | null =>
  !file ? null : file.mime.startsWith("image/") ? "gambar" : "berkas";

/**
 * The guide the session's "Denah" button opens: its own (mapGuideId), else the first Denah guide;
 * null when there is none (no button).
 */
export function denahFor(session: Pick<MwSession, "mapGuideId">, guides: readonly MwGuide[]): MwGuide | null {
  const shown = guides.filter(guide => guide.published);
  return (session.mapGuideId ? shown.find(guide => guide.id === session.mapGuideId) : null) ?? shown.find(guide => guide.kind === "denah") ?? null;
}

/** The Denah link of a session: its guide page. */
export const denahHrefOf = (denah: { slug: string } | null) => (denah ? mainWamPath.guide(denah.slug) : null);

/** Published guides in order. */
export const shownGuides = (guides: readonly MwGuide[]) => guides.filter(guide => guide.published).sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title, "id"));
