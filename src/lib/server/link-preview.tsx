import { ImageResponse } from "next/og";
import { formatDate, formatTime } from "@/lib/format";
import { themeDefinition } from "@/lib/themes";
import { tzLabel } from "@/lib/timezones";
import type { EventRecord } from "@/lib/types";

export const previewSize = { width: 1200, height: 630 };

/**
 * The card WhatsApp shows under a shared link: title, date and place in the event's theme colours.
 * Never a guest's name, so a personal link previews the same as the general one. No photo either:
 * a slow or missing image would leave the preview blank.
 */
export function linkPreview(event: EventRecord | null) {
  const tokens = themeDefinition(event?.theme?.key ?? "werkudara").tokens;
  const when = event?.starts_at ? `${formatDate(event.starts_at, event.timezone)} · ${formatTime(event.starts_at, event.timezone)} ${tzLabel(event.timezone)}` : "";
  const title = event?.title || "Setiap pertemuan, dimulai dengan sambutan.";
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: tokens.hero, color: tokens.onHero }}>
      <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, fontWeight: 600, color: tokens.heroAccent }}>{event ? "WERKUDARA · UNDANGAN" : "WERKUDARA · GUEST EXPERIENCE"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", fontSize: title.length > 60 ? 58 : 72, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        {when && <div style={{ display: "flex", fontSize: 32 }}>{when}</div>}
        {event?.venue_name && <div style={{ display: "flex", fontSize: 30, color: tokens.heroAccent }}>{event.venue_name}</div>}
      </div>
      <div style={{ display: "flex", width: 120, height: 8, background: tokens.heroAccent }} />
    </div>,
    previewSize,
  );
}
