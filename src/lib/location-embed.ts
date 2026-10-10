const EMBED_ERROR = "Tempel URL atau kode iframe dari Google Maps → Bagikan → Sematkan peta → Salin HTML.";

export { EMBED_ERROR };

/** Extract only the Google Maps src; never render or persist pasted HTML. */
export function parseLocationEmbed(input: string): string | null {
  const value = input.trim();
  if (!value) return "";
  let source = value;
  if (value.startsWith("<")) {
    const match = /^<iframe\b([^<>]*)>\s*<\/iframe>$/i.exec(value);
    if (!match) return null;
    let attributes = match[1];
    const sources: string[] = [];
    while (attributes.trim()) {
      const attribute = /^\s+([a-z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
      if (!attribute) return null;
      if (!new Set(["src", "width", "height", "style", "allowfullscreen", "loading", "referrerpolicy", "title"]).has(attribute[1].toLowerCase())) return null;
      if (attribute[1].toLowerCase() === "src") sources.push(attribute[2] ?? attribute[3]);
      attributes = attributes.slice(attribute[0].length);
    }
    if (sources.length !== 1) return null;
    source = sources[0].replace(/&amp;/gi, "&");
  }
  try {
    const url = new URL(source);
    if (url.protocol !== "https:" || url.hostname !== "www.google.com" || url.port || url.username || url.password || url.pathname !== "/maps/embed" || url.hash) return null;
    if ([...url.searchParams.keys()].length !== 1 || !url.searchParams.get("pb")?.startsWith("!")) return null;
    if (/[<>\u0000-\u001f\u007f]/.test(source) || source.length > 8000) return null;
    return url.toString();
  } catch {
    return null;
  }
}
