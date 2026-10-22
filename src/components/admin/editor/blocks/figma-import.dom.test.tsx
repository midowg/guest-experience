import { describe, expect, it } from "vitest";
import { fontFor, matchFormat, mergeImport, parseLayer, readFigmaSvg } from "@/components/admin/editor/blocks/figma-import";

/** jsdom has no layout: boxes come from each layer's own x/y/width/height (or a data-box). */
function measure(element: Element) {
  const own = element.getAttribute("data-box");
  if (own) { const [x, y, w, h] = own.split(" ").map(Number); return { x, y, w, h }; }
  const n = (name: string) => Number.parseFloat(element.getAttribute(name) ?? "");
  if (element.tagName === "circle") return { x: n("cx") - n("r"), y: n("cy") - n("r"), w: n("r") * 2, h: n("r") * 2 };
  return { x: n("x"), y: n("y"), w: n("width"), h: n("height") };
}

/** As Figma writes it: live text (outline off), a photo rect, a round photo, a fixed label. */
const liveText = `<svg width="1080" height="1350" viewBox="0 0 1080 1350" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1080" height="1350" fill="#FBF7EF"/>
  <text id="isi_judul" data-box="64 40 600 180" fill="#0F4A3A" xml:space="preserve" style="white-space: pre" font-family="Playfair Display" font-size="96" letter-spacing="0em"><tspan x="64" y="125">Meramu Rempah</tspan><tspan x="64" y="221">Nusantara</tspan></text>
  <text id="isi_nama_fasilitator" data-box="64 930 400 50" fill="#0F4A3A" font-family="Inter" font-size="40" font-weight="700"><tspan x="64" y="970">Jamu Njenonkz</tspan></text>
  <rect id="foto_utama" x="0" y="215" width="1080" height="660" rx="0" fill="#E9DFCB"/>
  <circle id="foto_fasilitator" cx="140" cy="1100" r="70" fill="#F3EAD8"/>
  <text id="Bersama" fill="#5D6157" font-family="Nunito" font-size="16"><tspan x="64" y="920">BERSAMA</tspan></text>
</svg>`;

/** "Outline text" on: every text is a path group; the layer name stays as the group id. */
const outlined = `<svg width="540" height="960" viewBox="0 0 540 960" xmlns="http://www.w3.org/2000/svg">
  <g id="isi_lokasi" data-box="36 700 468 80"><rect width="468" height="80" fill="none"/><text font-size="20"><tspan x="40" y="720">Loman Park</tspan></text></g>
  <g id="isi_judul" data-box="36 100 400 60"><path d="M0 0h10v10z" fill="#9C3D22"/></g>
  <g id="isi_judul_2" data-box="36 200 400 60"><path d="M0 0h10v10z" fill="#9C3D22"/></g>
  <rect id="foto-utama" x="0" y="300" width="540" height="300" rx="12" fill="#ECD8C6"/>
</svg>`;

describe("Figma layer names", () => {
  it("reads isi_ and foto_ layers into keys and labels, and ignores the rest", () => {
    expect(parseLayer("isi_nama_fasilitator")).toEqual({ id: "isi_nama_fasilitator", kind: "text", key: "nama_fasilitator", label: "Nama fasilitator" });
    expect(parseLayer("foto-utama")).toMatchObject({ kind: "photo", key: "utama" });
    expect(parseLayer("isi_judul_2")?.key).toBe("judul");
    expect(parseLayer("Bersama")).toBeNull();
    expect(parseLayer("isi_")).toBeNull();
  });

  it("finds the card size of a frame, by size or by shape", () => {
    expect(matchFormat(1080, 1350)).toEqual({ format: "post", scale: 1 });
    expect(matchFormat(540, 960)).toEqual({ format: "story", scale: 2 });
    expect(matchFormat(1000, 300)).toBeNull();
    expect(fontFor("Playfair Display")).toBe("playfair");
    expect(fontFor("Inter")).toBe("nunito");
    expect(fontFor("Libre Baskerville")).toBe("playfair");
  });
});

describe("Figma SVG import", () => {
  it("turns live text and photo layers into boxes with their type style, and keeps the rest as background", () => {
    const result = readFigmaSvg(liveText, measure);
    expect(result.format).toBe("post");
    const byKey = Object.fromEntries(result.fields.map(field => [field.key, field]));
    expect(Object.keys(byKey)).toEqual(["judul", "nama_fasilitator", "utama", "fasilitator"]);
    expect(byKey.judul).toMatchObject({ kind: "text", editable: true, font: "playfair", sizeMax: 96, color: "#0f4a3a", maxLines: 2, hint: "Meramu Rempah Nusantara", tone: "" });
    expect(byKey.judul.lineHeight).toBe(1);
    expect(byKey.judul.box.post).toMatchObject({ x: 64, y: 40, w: 600 });
    expect(byKey.judul.box.story).toBeNull();
    expect(byKey.nama_fasilitator).toMatchObject({ font: "nunito", weight: 700, sizeMax: 40 });
    expect(byKey.utama).toMatchObject({ kind: "photo", radius: 0 });
    expect(byKey.utama.box.post).toEqual({ x: 0, y: 215, w: 1080, h: 660 });
    expect(byKey.fasilitator.radius).toBe(500);
    // Text boxes leave the background; photo shapes and fixed text stay in it.
    expect(result.background).not.toContain("isi_judul");
    expect(result.background).toContain("foto_utama");
    expect(result.background).toContain("BERSAMA");
    expect(result.notes.join(" ")).toMatch(/belum di-outline/);
  });

  it("estimates outlined text from its shape and colour, and scales a frame of the same shape", () => {
    const result = readFigmaSvg(outlined, measure);
    expect(result.format).toBe("story");
    const [, title, photo] = result.fields;
    expect(result.fields).toHaveLength(3);
    // A group with a clear box gives the whole area, not just the sample text.
    expect(result.fields.find(field => field.key === "lokasi")?.box.story).toMatchObject({ x: 72, w: 936 });
    expect(result.notes.join(" ")).toMatch(/1 kolom teks selebar teks contohnya/);
    expect(title).toMatchObject({ key: "judul", color: "#9c3d22", maxLines: 1 });
    expect(title.sizeMax).toBe(Math.round(120 * 0.95));
    expect(title.box.story).toMatchObject({ x: 72, w: 800 });
    expect(photo).toMatchObject({ key: "utama", radius: 24 });
    expect(photo.box.story).toEqual({ x: 0, y: 600, w: 1080, h: 600 });
    expect(result.notes.join(" ")).toMatch(/di-outline/);
  });

  it("explains a frame of another size and a frame without boxes", () => {
    expect(() => readFigmaSvg(`<svg width="800" height="300" xmlns="http://www.w3.org/2000/svg"><rect id="isi_a" width="10" height="10"/></svg>`, measure)).toThrow(/tidak cocok/);
    expect(() => readFigmaSvg(`<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg"><rect id="hiasan" width="10" height="10"/></svg>`, measure)).toThrow(/isi_/);
    expect(() => readFigmaSvg("bukan svg", measure)).toThrow(/bukan SVG/);
  });

  it("adds a second size to the same boxes, keeping what the admin set, after a first Figma import", () => {
    const post = readFigmaSvg(liveText, measure);
    const edited = post.fields.map(field => field.key === "judul" ? { ...field, label: "Judul sesi", editable: false, value: "Tetap" } : field);
    const story = readFigmaSvg(outlined, measure);
    const merged = mergeImport(edited, true, story);
    const title = merged.find(field => field.key === "judul")!;
    expect(title).toMatchObject({ label: "Judul sesi", editable: false, value: "Tetap" });
    expect(title.box.post).toBeTruthy();
    expect(title.box.story).toMatchObject({ x: 72 });
    expect(merged.filter(field => field.key === "utama")).toHaveLength(1);
    expect(merged.some(field => field.key === "lokasi")).toBe(true);
    // From a gallery design, the import replaces the boxes.
    expect(mergeImport(edited, false, story)).toEqual(story.fields);
  });
});
