import type { EventRecord, HeroFraming, HeroImage, PhotoFrame } from "./types";

export function defaultFraming(focus: HeroImage["focus"] = "center"): HeroFraming {
  const frame = { x: 50, y: focus === "top" ? 0 : focus === "bottom" ? 100 : 50, zoom: 1 };
  return { mobile: { ...frame }, desktop: { ...frame } };
}
export function getFraming(hero: HeroImage): HeroFraming {
  return hero.framing ?? defaultFraming(hero.focus);
}
export function normalizeEvent(event: EventRecord): EventRecord {
  return { ...event, contact: event.contact ?? { name: "", phone: "", channel: "whatsapp" }, location_embed_url: event.location_embed_url ?? "", location_display: event.location_display ?? (event.location_embed_url ? "embed" : "manual"), hero: { ...event.hero, framing: getFraming(event.hero) } };
}
export function dragFrame(frame: PhotoFrame, dx: number, dy: number, width: number, height: number, naturalWidth: number, naturalHeight: number): PhotoFrame {
  const cover = Math.max(width / naturalWidth, height / naturalHeight) * frame.zoom;
  const overflowX = Math.max(0, naturalWidth * cover - width);
  const overflowY = Math.max(0, naturalHeight * cover - height);
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  return { ...frame, x: overflowX > 0 ? clamp(frame.x - dx / overflowX * 100) : frame.x, y: overflowY > 0 ? clamp(frame.y - dy / overflowY * 100) : frame.y };
}
