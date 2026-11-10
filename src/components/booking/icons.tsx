import { AirVent, Check, Mic, MonitorPlay, PenLine, Projector, Tv, Video, Wifi } from "lucide-react";
import type { ReactNode } from "react";

/** An icon for what a room has, by the word the admin typed ("TV", "Whiteboard", "Proyektor"); a tick for anything else. */
export function facilityIcon(name: string): ReactNode {
  const word = name.toLowerCase();
  const size = 16;
  if (/tv|televisi/.test(word)) return <Tv size={size} aria-hidden />;
  if (/layar|monitor|led/.test(word)) return <MonitorPlay size={size} aria-hidden />;
  if (/proye|projector/.test(word)) return <Projector size={size} aria-hidden />;
  if (/white|papan/.test(word)) return <PenLine size={size} aria-hidden />;
  if (/zoom|video|kamera|conference/.test(word)) return <Video size={size} aria-hidden />;
  if (/mic|sound|speaker|audio/.test(word)) return <Mic size={size} aria-hidden />;
  if (/wifi|internet/.test(word)) return <Wifi size={size} aria-hidden />;
  if (/ac\b|pendingin/.test(word)) return <AirVent size={size} aria-hidden />;
  return <Check size={size} aria-hidden />;
}
