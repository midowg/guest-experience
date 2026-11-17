import { ImageResponse } from "next/og";

/*
 * WLM's pictures (18 Nov 2026): the link card shown under a shared /wlm link, and the tab and
 * home-screen icon. As on the sign-in: the name WLM in the colours of the five dimensions (fisik,
 * emosional, sosial, finansial, spiritual), here on the app's dark background.
 */

const INK = "#0A0E15", ON_INK = "#F4F6FA", ON_INK_2 = "#AFB8C8", ON_INK_3 = "#8691A5";
const DIMENSIONS = [
  { name: "Fisik", color: "#5EEAD4" }, { name: "Emosional", color: "#C4B5FD" }, { name: "Sosial", color: "#FDBA74" },
  { name: "Finansial", color: "#8AB4F8" }, { name: "Spiritual", color: "#F9A8D4" },
];
const BAND = "linear-gradient(100deg, #5EEAD4, #8AB4F8 22%, #C4B5FD 44%, #F9A8D4 66%, #FDBA74 86%)";

/* The card's words, also the letters asked of Google Fonts (only these glyphs are fetched). */
const TEXT = {
  full: "WERKUDARA LIFE MODE",
  lead: "Catat aktivitas, kumpulkan poin, dan kejar peringkat bulanan.",
  cta: "Masuk dengan akun WAM",
  foot: "Program wellbeing Werkudara",
};
/** The five dimensions in big letters behind the name (the sign-in's moving rows, still). */
const ROWS = ["FISIK · EMOSIONAL · SOSIAL · FINANSIAL · SPIRITUAL · FISIK", "SPIRITUAL · FINANSIAL · SOSIAL · EMOSIONAL · FISIK · SPIRITUAL"];

/**
 * The sign-in's faces, fetched once from Google Fonts with only the letters drawn: Barlow Condensed 700
 * for the name, Plus Jakarta Sans 400 and 700 for the rest (each text says which; satori would otherwise
 * borrow the name's face for every W, L and M). Without them (offline, a failed fetch) the pictures still
 * draw, in the default face.
 */
type Face = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };
async function face(family: string, weight: 400 | 700, text: string): Promise<Face | null> {
  try {
    const query = `family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent([...new Set(text)].join(""))}`;
    const css = await (await fetch(`https://fonts.googleapis.com/css2?${query}`, { signal: AbortSignal.timeout(5000) })).text();
    const url = /src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const font = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return font.ok ? { name: family, data: await font.arrayBuffer(), weight, style: "normal" } : null;
  } catch { return null; }
}
let faces: Promise<Face[]> | null = null;
function loadFaces(): Promise<Face[]> {
  const words = Object.values(TEXT).join("");
  faces ??= Promise.all([face("Barlow Condensed", 700, `WLM${ROWS.join("")}`), face("Plus Jakarta Sans", 400, words), face("Plus Jakarta Sans", 700, words)])
    .then(list => list.filter((item): item is Face => item !== null));
  return faces;
}
async function withFaces(size: { width: number; height: number }) {
  const fonts = await loadFaces();
  return { ...size, ...(fonts.length ? { fonts } : {}) };
}
const SANS = "Plus Jakarta Sans";

/** WLM in the colour band. */
function Word({ size, center = false }: { size: number; center?: boolean }) {
  // As wide as the letters (alignSelf), so the whole band falls on them.
  return <div style={{ display: "flex", alignSelf: center ? "center" : "flex-start", fontFamily: "Barlow Condensed", fontSize: size, fontWeight: 700, lineHeight: 1, letterSpacing: size * 0.02, backgroundImage: BAND, backgroundClip: "text", color: "transparent" }}>WLM</div>;
}

/** Five short bars in the dimension colours. */
function Line({ width, height, gap }: { width: number; height: number; gap: number }) {
  return <div style={{ display: "flex", gap }}>
    {DIMENSIONS.map(dot => <div key={dot.name} style={{ display: "flex", width, height, borderRadius: height, background: dot.color }} />)}
  </div>;
}

/**
 * The link card, square (1080 × 1080, 18 Nov 2026): WhatsApp and others show a square crop in the small
 * preview, so the whole card is a square and nothing is cut. As on the sign-in: the five dimensions in
 * big outline-like letters behind, WLM in the colour band in front, then what WLM is and how to get in.
 */
export const wlmPreviewSize = { width: 1080, height: 1080 };
export async function wlmPreview() {
  return new ImageResponse(
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", backgroundImage: `linear-gradient(160deg, #142027 0%, ${INK} 45%, #120F1E 100%)`, color: ON_INK, fontFamily: SANS }}>
      {/* The five dimensions behind, faint, like the sign-in's moving rows. */}
      <div style={{ position: "absolute", left: -40, right: -40, top: 150, display: "flex", flexDirection: "column", gap: 4 }}>
        {[ROWS[0], ROWS[1], ROWS[0]].map((row, index) => <div key={index} style={{ display: "flex", whiteSpace: "nowrap", fontFamily: "Barlow Condensed", fontWeight: 700, fontSize: 120, lineHeight: 1, letterSpacing: 2, color: "rgba(255, 255, 255, .045)", marginLeft: index === 1 ? -220 : 0 }}>{row}</div>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "96px 80px 80px", textAlign: "center" }}>
        <div style={{ display: "flex", fontFamily: SANS, fontSize: 28, fontWeight: 700, letterSpacing: 12, color: ON_INK_2 }}>{TEXT.full}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
          <Word size={330} center />
          <Line width={56} height={9} gap={10} />
        </div>
        <div style={{ display: "flex", fontFamily: SANS, fontSize: 50, fontWeight: 700, lineHeight: 1.25, maxWidth: 860, textAlign: "center", justifyContent: "center" }}>{TEXT.lead}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {/* Said quietly, as on the sign-in (not a highlight). */}
          <div style={{ display: "flex", fontFamily: SANS, fontSize: 30, fontWeight: 700, color: ON_INK_2 }}>{TEXT.cta}</div>
          <div style={{ display: "flex", fontFamily: SANS, fontSize: 28, fontWeight: 400, color: ON_INK_3 }}>{TEXT.foot}</div>
        </div>
      </div>
    </div>,
    await withFaces(wlmPreviewSize),
  );
}

/** The tab and home-screen icon: WLM in the colour band over the five bars, on the dark background (the phone rounds the home-screen one). */
export async function wlmIcon(size: number, rounded: boolean) {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: size * 0.06, background: INK, borderRadius: rounded ? size * 0.22 : 0 }}>
      <Word size={Math.round(size * 0.5)} />
      <Line width={Math.max(3, Math.round(size * 0.1))} height={Math.max(2, Math.round(size * 0.045))} gap={Math.max(1, Math.round(size * 0.025))} />
    </div>,
    await withFaces({ width: size, height: size }),
  );
}
