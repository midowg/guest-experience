import { ImageResponse } from "next/og";
import { formatDate, formatTime } from "@/lib/format";
import { shareWording } from "@/lib/share-wording";
import { themeDefinition } from "@/lib/themes";
import { tzLabel } from "@/lib/timezones";
import type { EventRecord } from "@/lib/types";

export const previewSize = { width: 1200, height: 630 };

/**
 * The card WhatsApp shows under a shared link, in the event's theme colours and worded for its
 * kind: an invitation shows date, time and place; a card, an E-Guide or a Friday Sharing page shows
 * what it is for. Never a guest's name, so a personal link previews the same as the general one. No
 * photo either: a slow or missing image would leave the preview blank.
 */
export function linkPreview(event: EventRecord | null) {
  if (event?.event_kind === "csr") return sharingPreview(event);
  const tokens = themeDefinition(event?.theme?.key ?? "werkudara").tokens;
  const wording = event ? shareWording(event) : null;
  const invitation = event && !["kartu", "eguide", "panduan"].includes(event.event_kind);
  const when = invitation && event.starts_at ? `${formatDate(event.starts_at, event.timezone)} · ${formatTime(event.starts_at, event.timezone)} ${tzLabel(event.timezone)}` : "";
  const below = invitation ? event.venue_name : wording?.details[0];
  const title = event?.title || "Setiap pertemuan, dimulai dengan sambutan.";
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: tokens.hero, color: tokens.onHero }}>
      <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, fontWeight: 600, color: tokens.heroAccent }}>{wording ? `WERKUDARA · ${wording.label.toUpperCase()}` : "WERKUDARA · JOURNEY"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", fontSize: title.length > 60 ? 58 : 72, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        {when && <div style={{ display: "flex", fontSize: 32 }}>{when}</div>}
        {below && <div style={{ display: "flex", fontSize: 30, color: tokens.heroAccent }}>{below}</div>}
      </div>
      <div style={{ display: "flex", width: 120, height: 8, background: tokens.heroAccent }} />
    </div>,
    previewSize,
  );
}

/** Confetti dots on the Friday Sharing card: [left, top, size, colour]. */
const confetti: [number, number, number, string][] = [
  [70, 60, 22, "#f6a04d"], [1080, 90, 26, "#7cc6a8"], [1010, 470, 18, "#f28da0"], [140, 500, 16, "#8db8ee"], [600, 40, 14, "#f7c948"], [860, 560, 14, "#b9a3ee"],
];

/** Friday Sharing's link card: cheerful like the page, an invitation to give rather than a date. */
function sharingPreview(event: EventRecord) {
  const tokens = themeDefinition(event.theme?.key ?? "berbagi").tokens;
  const subtitle = event.subtitle?.trim();
  return new ImageResponse(
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 30, padding: "72px 90px", background: "#fffaf4", color: tokens.heading }}>
      {confetti.map(([left, top, size, colour]) => <div key={`${left}-${top}`} style={{ position: "absolute", left, top, width: size, height: size, borderRadius: size, background: colour }} />)}
      <div style={{ display: "flex", alignSelf: "flex-start", padding: "10px 26px", borderRadius: 999, background: tokens.heroAccent, color: "#2b2420", fontSize: 28, fontWeight: 800 }}>Friday Sharing · {event.organizer || "Werkudara"}</div>
      <div style={{ display: "flex", fontSize: event.title.length > 60 ? 58 : 70, fontWeight: 800, lineHeight: 1.12 }}>{event.title}</div>
      {subtitle && <div style={{ display: "flex", fontSize: 32, color: "#6a5a4e", lineHeight: 1.35 }}>{subtitle}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 6 }}>
        <div style={{ display: "flex", padding: "14px 34px", borderRadius: 999, background: tokens.primary, color: tokens.onPrimary, fontSize: 30, fontWeight: 800 }}>Yuk, ikut berbagi</div>
        <div style={{ display: "flex", fontSize: 28, color: "#6a5a4e" }}>Dana atau barang, semua berarti.</div>
      </div>
    </div>,
    previewSize,
  );
}
