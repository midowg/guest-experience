import { describe, expect, it } from "vitest";
import { capacity, fontFor, guessLines, matchFormat, mergeImport, nameMarks, NoLayersError, parseLayer, parseStack, readFigmaSvg, sanitizeSvg } from "@/components/admin/editor/blocks/figma-import";

/** jsdom has no layout: boxes come from each layer's own x/y/width/height (or a data-box). */
function measure(element: Element): { x: number; y: number; w: number; h: number } {
  if (element.tagName === "g" && !element.hasAttribute("data-box") && element.firstElementChild) return measure(element.firstElementChild);
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
    expect(parseLayer("isi_nama_fasilitator")).toEqual({ id: "isi_nama_fasilitator", kind: "text", key: "nama_fasilitator", label: "Nama fasilitator", optional: false });
    expect(parseLayer("foto-utama")).toMatchObject({ kind: "photo", key: "foto_utama", label: "Foto utama" });
    // The same name for a text and a photo makes two boxes.
    expect(parseLayer("foto_fasilitator")?.key).not.toBe(parseLayer("isi_fasilitator")?.key);
    expect(parseLayer("isi_judul_2")?.key).toBe("judul");
    expect(parseLayer("Bersama")).toBeNull();
    expect(parseLayer("isi_")).toBeNull();
  });

  it("reads a layer ending in _opsional or _optional as a box that may be left empty", () => {
    expect(parseLayer("foto_logo_opsional")).toEqual({ id: "foto_logo_opsional", kind: "photo", key: "foto_logo", label: "Foto logo", optional: true });
    expect(parseLayer("isi_biaya_opsional_2")).toMatchObject({ kind: "text", key: "biaya", label: "Biaya", optional: true });
    expect(parseLayer("isi-catatan-optional")).toMatchObject({ key: "catatan", optional: true });
    expect(parseLayer("isi_judul")?.optional).toBe(false);
    // Only the end of the name counts: a word merely containing it is part of the key.
    expect(parseLayer("isi_opsionalitas")).toMatchObject({ key: "opsionalitas", optional: false });
    // Nothing is left once the suffix goes.
    expect(parseLayer("isi_opsional")).toBeNull();
  });

  it("finds the card size of a frame, by size or by shape", () => {
    expect(matchFormat(1080, 1350)).toEqual({ format: "post", scale: 1 });
    expect(matchFormat(540, 960)).toEqual({ format: "story", scale: 2 });
    expect(matchFormat(1000, 300)).toBeNull();
    expect(fontFor("Playfair Display")).toBe("playfair");
    expect(fontFor("Inter")).toBe("inter");
    expect(fontFor("Roboto")).toBe("inter");
    expect(fontFor("Nunito Sans")).toBe("nunito");
    expect(fontFor("Libre Baskerville")).toBe("playfair");
  });
});

describe("Figma SVG import", () => {
  it("turns live text and photo layers into boxes with their type style, and keeps the rest as background", () => {
    const result = readFigmaSvg(liveText, measure);
    expect(result.format).toBe("post");
    const byKey = Object.fromEntries(result.fields.map(field => [field.key, field]));
    expect(Object.keys(byKey)).toEqual(["judul", "nama_fasilitator", "foto_utama", "foto_fasilitator"]);
    expect(byKey.judul).toMatchObject({ kind: "text", editable: true, font: "playfair", sizeMax: 96, color: "#0f4a3a", maxLines: 2, hint: "Meramu Rempah Nusantara", tone: "" });
    expect(byKey.judul.lineHeight).toBe(1);
    expect(byKey.judul.box.post).toMatchObject({ x: 64, y: 40, w: 600 });
    expect(byKey.judul.box.story).toBeNull();
    expect(byKey.nama_fasilitator).toMatchObject({ font: "inter", weight: 700, sizeMax: 40 });
    expect(byKey.foto_utama).toMatchObject({ kind: "photo", radius: 0 });
    expect(byKey.foto_utama.box.post).toEqual({ x: 0, y: 215, w: 1080, h: 660 });
    expect(byKey.foto_fasilitator.radius).toBe(500);
    // Text boxes leave the background, and so do photo boxes (each is a slot, gone under the guest's photo); fixed text stays.
    expect(result.background).not.toContain("isi_judul");
    expect(result.background).not.toContain("foto_utama");
    expect(result.parts.find(part => part.key === "foto_utama")?.slot).toContain('id="foto_utama"');
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
    expect(title.sizeMax).toBe(Math.round(120 / 0.95));
    expect(title.box.story).toMatchObject({ x: 72, w: 800 });
    expect(photo).toMatchObject({ key: "foto_utama", radius: 24 });
    expect(photo.box.story).toEqual({ x: 0, y: 600, w: 1080, h: 600 });
    expect(result.notes.join(" ")).toMatch(/di-outline/);
  });

  it("takes type hints from a prepared layer, since outlined text keeps no type", () => {
    const prepared = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><g id="isi_judul" data-box="61 150 600 150" data-font="playfair" data-size="66" data-lines="3" data-line-height="1.05" data-color="#073E34" data-hint="Judul sesi"><rect width="600" height="150" fill="none"/><path d="M0 0h1v1z" fill="#073E34"/></g></svg>`;
    const [title] = readFigmaSvg(prepared, measure).fields;
    expect(title).toMatchObject({ font: "playfair", sizeMax: 66, maxLines: 3, lineHeight: 1.05, color: "#073e34", hint: "Judul sesi" });
    // A clear area box is the field's box, as drawn.
    expect(title.box.post).toEqual({ x: 61, y: 150, w: 600, h: 150 });
  });

  it("keeps what Figma draws over a photo on top of it, as an overlay", () => {
    const ribbon = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
      <rect id="dasar" width="1080" height="1350" fill="#FCF9F2"/>
      <rect id="foto_utama" x="0" y="289" width="1080" height="564" fill="#EDE6D4"/>
      <rect id="pita" x="60" y="821" width="304" height="32" fill="#063E34"/>
      <g id="isi_kategori" data-box="73 827 284 20"><rect width="284" height="20" fill="none"/><path d="M0 0h1v1z" fill="#fff"/></g>
      <rect id="garis" x="60" y="1017" width="620" height="1" fill="#BD850F"/>
    </svg>`;
    const result = readFigmaSvg(ribbon, measure);
    expect(result.overlay).toContain('id="pita"');
    // In the overlay only the ribbon shows; in the background it is gone, the rest stays.
    expect(result.overlay).toMatch(/id="dasar"[^>]*visibility="hidden"/);
    expect(result.background).not.toContain('id="pita"');
    expect(result.background).toContain('id="garis"');
    expect(result.background).not.toContain("isi_kategori");
    expect(readFigmaSvg(liveText, measure).overlay).toBeNull();
  });

  it("takes the upload marks inside a photo box out of the design, but not a ribbon along its edge", () => {
    const marked = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
      <rect id="dasar" width="1080" height="1350" fill="#FCF9F2"/>
      <rect id="foto_utama" x="0" y="300" width="1080" height="600" fill="#EDE6D4"/>
      <path id="ikon" data-box="500 560 80 60" d="M0 0h1v1z" fill="#8A8F87"/>
      <path id="tulisan" data-box="440 640 200 24" d="M0 0h1v1z" fill="#8A8F87"/>
      <rect id="pita" x="60" y="868" width="304" height="32" fill="#063E34"/>
      <g id="isi_judul" data-box="60 100 600 120"><rect width="600" height="120" fill="none"/><path d="M0 0h1v1z" fill="#063E34"/></g>
    </svg>`;
    const result = readFigmaSvg(marked, measure);
    expect(result.parts).toHaveLength(1);
    const [part] = result.parts;
    expect(part.key).toBe("foto_utama");
    // The box itself is the slot: shown while empty, gone under the guest's photo.
    expect(part.slot).toMatch(/id="foto_utama"(?![^>]*visibility)/);
    // The icon and its label show in the part, the rest of the design is hidden there.
    expect(part.art).toMatch(/id="ikon"(?![^>]*visibility)/);
    expect(part.art).toMatch(/id="tulisan"(?![^>]*visibility)/);
    expect(part.art).toMatch(/id="dasar"[^>]*visibility="hidden"/);
    expect(result.background).not.toContain('id="ikon"');
    expect(result.background).not.toContain('id="tulisan"');
    // The ribbon on the photo's bottom edge is design: it stays on top of the photo, as before.
    expect(part.art).toMatch(/id="pita"[^>]*visibility="hidden"/);
    expect(result.overlay).toMatch(/id="pita"(?![^>]*visibility)/);
    expect(result.overlay).not.toContain('id="ikon"');
    expect(result.background).not.toContain('id="foto_utama"');
    expect(result.notes.join(" ")).toMatch(/unggah foto/);
  });

  it("cuts an optional photo and its frame out of the design, so an empty box leaves no trace", () => {
    const logo = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
      <rect id="dasar" width="1080" height="1350" fill="#FCF9F2"/>
      <rect id="foto_logo_opsional" x="400" y="1000" width="200" height="200" rx="16" fill="#EDE6D4"/>
      <rect id="bingkai" x="400" y="1000" width="200" height="200" rx="16" fill="none" stroke="#063E34" stroke-width="4"/>
      <rect id="foto_utama" x="0" y="300" width="1080" height="600" fill="#EDE6D4"/>
    </svg>`;
    const result = readFigmaSvg(logo, measure);
    const field = result.fields.find(item => item.key === "foto_logo");
    expect(field).toMatchObject({ kind: "photo", optional: true, radius: 16 });
    expect(field?.box.post).toEqual({ x: 400, y: 1000, w: 200, h: 200 });
    expect(result.fields.find(item => item.key === "foto_utama")?.optional).toBeUndefined();
    const slot = result.parts.find(part => part.key === "foto_logo")?.slot ?? "";
    expect(slot).toMatch(/id="foto_logo_opsional"(?![^>]*visibility)/);
    expect(slot).toMatch(/id="bingkai"(?![^>]*visibility)/);
    expect(slot).toMatch(/id="dasar"[^>]*visibility="hidden"/);
    expect(result.background).not.toContain("foto_logo_opsional");
    expect(result.background).not.toContain('id="bingkai"');
    expect(result.overlay).toBeNull();
    // A photo that must be filled is a slot too, so a transparent PNG does not show its box through.
    expect(result.background).not.toContain('id="foto_utama"');
    expect(result.parts.find(part => part.key === "foto_utama")?.slot).toMatch(/id="foto_utama"(?![^>]*visibility)/);
    expect(result.notes.join(" ")).toMatch(/1 kolom opsional/);
  });

  // Known bug: the optional photo leaves the DOM before the overlay is worked out, so
  // compareDocumentPosition reads a card drawn under it as drawn after it, and the card goes to the
  // overlay, over the guest's photo. Turn this into it() once readFigmaSvg is fixed.
  it("keeps what lies under an optional photo in the background, not over the photos", () => {
    const logo = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
      <rect id="kartu" x="380" y="980" width="320" height="260" fill="#FFFFFF"/>
      <rect id="foto_logo_opsional" x="400" y="1000" width="200" height="200" fill="#EDE6D4"/>
    </svg>`;
    const result = readFigmaSvg(logo, measure);
    expect(result.background).toContain('id="kartu"');
    expect(result.overlay).toBeNull();
  });

  it("moves an optional text's plate to its slot, and keeps a required text's plate in the design", () => {
    const plates = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
      <rect id="dasar" width="1080" height="1350" fill="#FCF9F2"/>
      <g id="isi_biaya_opsional_2"><rect x="700" y="1200" width="300" height="60" fill="#9C3D22"/><rect x="700" y="1200" width="300" height="60" fill="none"/><path d="M0 0h1v1z" fill="#FFFFFF"/></g>
      <g id="isi_kategori"><rect x="60" y="1200" width="300" height="60" fill="#063E34"/><rect x="60" y="1200" width="300" height="60" fill="none"/><path d="M0 0h1v1z" fill="#FFFFFF"/></g>
    </svg>`;
    const result = readFigmaSvg(plates, measure);
    expect(result.fields.map(field => [field.key, !!field.optional])).toEqual([["biaya", true], ["kategori", false]]);
    expect(result.parts.map(part => part.key)).toEqual(["biaya"]);
    const slot = result.parts[0].slot ?? "";
    expect(slot).toMatch(/fill="#9C3D22"(?![^>]*visibility)/);
    expect(slot).toMatch(/fill="#063E34"[^>]*visibility="hidden"/);
    expect(result.parts[0].art).toBeNull();
    expect(result.background).not.toContain("#9C3D22");
    expect(result.background).not.toContain("isi_biaya");
    // The required text's plate stays in the background; its name and sample glyphs go.
    expect(result.background).toContain('fill="#063E34"');
    expect(result.background).not.toContain("isi_kategori");
    expect(result.background).not.toContain('fill="#FFFFFF"');
  });

  it("explains a frame of another size and a frame without boxes", () => {
    expect(() => readFigmaSvg(`<svg width="800" height="300" xmlns="http://www.w3.org/2000/svg"><rect id="isi_a" width="10" height="10"/></svg>`, measure)).toThrow(/tidak cocok/);
    expect(() => readFigmaSvg(`<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg"><rect id="hiasan" width="10" height="10"/></svg>`, measure)).toThrow(/isi_/);
    expect(() => readFigmaSvg("bukan svg", measure)).toThrow(/bukan SVG/);
    // An export without "Include id" carries only Figma's own ids.
    expect(() => readFigmaSvg(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_43_3)"><rect width="10" height="10"/></g><defs><clipPath id="clip0_43_3"><rect width="1080" height="1350"/></clipPath></defs></svg>`, measure)).toThrow(/tidak membawa nama layer/);
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
    expect(merged.filter(field => field.key === "foto_utama")).toHaveLength(1);
    expect(merged.some(field => field.key === "lokasi")).toBe(true);
    // Another size keeps the first design's look, and notes how its type compares.
    const storyTitle = story.fields.find(field => field.key === "judul")!;
    expect(title).toMatchObject({ font: post.fields[0].font, sizeMax: post.fields[0].sizeMax, sizes: { story: Math.round(storyTitle.sizeMax / post.fields[0].sizeMax * 100) / 100 } });
    // The same size again takes the look from the newer file: a colour or tone left from before does not stay.
    const dark = edited.map(field => field.key === "judul" ? { ...field, color: "#111111", tone: "primary" as const } : field);
    expect(mergeImport(dark, true, post).find(field => field.key === "judul")).toMatchObject({ color: post.fields[0].color, tone: "", value: "Tetap" });
    // From a gallery design, the import replaces the boxes.
    expect(mergeImport(edited, false, story)).toEqual(story.fields);
  });

  it("lets a new SVG for the same size replace the old one's boxes, not pile on them", () => {
    const post = readFigmaSvg(liveText, measure);
    const old = [...post.fields, { ...post.fields[0], key: "deskripsi_lama", hint: "Ceritakan sesi ini dalam 2–3 kalimat" }];
    const again = mergeImport(old, true, post);
    expect(again.some(field => field.key === "deskripsi_lama")).toBe(false);
    expect(again.map(field => field.key)).toEqual(post.fields.map(field => field.key));
    // A box that also stands in another size keeps that size and leaves only this one.
    const both = [{ ...old[old.length - 1], box: { ...old[old.length - 1].box, story: { x: 1, y: 1, w: 10, h: 10 } } }];
    expect(mergeImport(both, true, post).find(field => field.key === "deskripsi_lama")?.box).toMatchObject({ post: null, story: { x: 1 } });
  });
});

describe("marking a design by hand", () => {
  const plain = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1350" fill="#FCF9F2"/><path d="M0 0h1v1z" data-box="61 59 528 123" fill="#383838"/><rect x="0" y="289" width="1080" height="564" fill="#EDE6D4"/><path d="M0 0h1v1z" data-box="61 900 300 20" fill="#383838"/></svg>`;

  it("says an SVG without named layers needs marking, with its own error type", () => {
    expect(() => readFigmaSvg(plain, measure)).toThrow(NoLayersError);
  });

  it("names the tapped parts so the usual import reads them, with lines and face as hints", () => {
    // In document order: 0 rect, 1 title path, 2 photo rect, 3 small text.
    const named = nameMarks(plain, [
      { index: 1, kind: "text", label: "Judul sesi", lines: 2, font: "serif" },
      { index: 2, kind: "photo", label: "Foto utama", lines: 1, font: "sans" },
      { index: 3, kind: "text", label: "Judul sesi", lines: 1, font: "sans" },
    ]);
    const result = readFigmaSvg(named, measure);
    expect(result.fields.map(field => field.key)).toEqual(["judul_sesi", "foto_utama", "judul_sesi2"]);
    const title = result.fields[0];
    // Two lines in 123 px: about 59 px type, in the chosen serif face.
    expect(title).toMatchObject({ font: "cormorant", maxLines: 2, hint: "Judul sesi", color: "#383838" });
    expect(title.sizeMax).toBe(Math.round(123 / (0.95 + 1.15)));
    expect(result.background).not.toContain("isi_judul_sesi");
  });

  it("keeps numbered labels apart and gives each field the label the admin typed", () => {
    const result = readFigmaSvg(nameMarks(plain, [
      { index: 1, kind: "text", label: "Teks 1", lines: 1, font: "sans" },
      { index: 3, kind: "text", label: "Teks 2", lines: 1, font: "sans" },
      { index: 2, kind: "photo", label: "Foto peserta", lines: 1, font: "sans" },
    ]), measure);
    expect(result.fields.map(field => [field.key, field.label])).toEqual([["teks1", "Teks 1"], ["foto_peserta", "Foto peserta"], ["teks2", "Teks 2"]]);
  });

  it("keeps a box marked as text in the design, as the text's area in a colour that reads on it", () => {
    // A dark ribbon tapped as text: index 2 is the photo-sized rect, here a dark plate.
    const ribbon = plain.replace('fill="#EDE6D4"', 'fill="#063E34"');
    const result = readFigmaSvg(nameMarks(ribbon, [{ index: 2, kind: "text", label: "Kategori", lines: 1, font: "sans" }]), measure);
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]).toMatchObject({ key: "kategori", color: "#ffffff", maxLines: 1 });
    expect(result.fields[0].box.post).toMatchObject({ x: 0, y: 289, w: 1080, h: 564 });
    // Figma names pure white: an outlined label in fill="white" stays white.
    const label = readFigmaSvg(nameMarks(plain.replace('fill="#383838"', 'fill="white"'), [{ index: 1, kind: "text", label: "Kategori", lines: 1, font: "sans" }]), measure);
    expect(label.fields[0].color).toBe("#ffffff");
    // The plate itself is still drawn in the background.
    expect(result.background).toContain('fill="#063E34"');
  });

  it("names a part marked optional so the import reads it as optional, with a tapped plate inside the text's group", () => {
    const ribbon = plain.replace('fill="#EDE6D4"', 'fill="#063E34"');
    const named = nameMarks(ribbon, [
      { index: 1, kind: "text", label: "Judul sesi", lines: 1, font: "sans" },
      { index: 2, kind: "text", label: "Kategori", lines: 1, font: "sans", optional: true },
      { index: 3, kind: "photo", label: "Logo", lines: 1, font: "sans", optional: true },
    ]);
    const doc = new DOMParser().parseFromString(named, "image/svg+xml");
    expect([...doc.querySelectorAll("[id]")].map(element => element.getAttribute("id"))).toEqual(["isi_judul_sesi", "isi_kategori_opsional", "foto_logo_opsional"]);
    // The plate and its clear twin sit in the group, which takes the plate's place in the design.
    const group = doc.getElementById("isi_kategori_opsional")!;
    expect(group.tagName).toBe("g");
    expect([...group.children].map(child => [child.tagName, child.getAttribute("fill")])).toEqual([["rect", "#063E34"], ["rect", "none"]]);
    expect(group.previousElementSibling?.getAttribute("id")).toBe("isi_judul_sesi");

    const result = readFigmaSvg(named, measure);
    expect(result.fields.map(field => [field.key, !!field.optional])).toEqual([["judul_sesi", false], ["kategori", true], ["foto_logo", true]]);
    expect(result.fields[1].box.post).toMatchObject({ x: 0, y: 289, w: 1080, h: 564 });
    // Optional, the plate leaves the background for the text's slot.
    expect(result.parts.find(part => part.key === "kategori")?.slot).toMatch(/fill="#063E34"(?![^>]*visibility)/);
    expect(result.background).not.toContain('fill="#063E34"');
  });

  it("reuses the key of another size's field, so both sizes fill one box", () => {
    const named = nameMarks(plain, [
      { index: 1, kind: "text", label: "Judul acara", lines: 1, font: "sans", key: "judul" },
      { index: 2, kind: "photo", label: "Foto besar", lines: 1, font: "sans", key: "foto_utama" },
      // A key ending in a number (a box added by hand) keeps it, though Figma's _2 is read as a duplicate.
      { index: 3, kind: "text", label: "Catatan", lines: 1, font: "sans", key: "teks_1", optional: true },
    ]);
    const result = readFigmaSvg(named, measure);
    expect(result.fields.map(field => [field.key, field.label])).toEqual([["judul", "Judul acara"], ["foto_utama", "Foto besar"], ["teks_1", "Catatan"]]);
    expect(named).not.toContain("foto_foto");
    expect(result.fields[2].optional).toBe(true);
    // Joined by key, the other size's box gains this one.
    const other = { ...result.fields[0], label: "Judul", box: { ...result.fields[0].box, post: null, a4: { x: 1, y: 1, w: 100, h: 20 } } };
    expect(mergeImport([other], true, result).find(field => field.key === "judul")?.box).toMatchObject({ a4: { x: 1 }, post: { x: 61 } });
  });

  it("sizes a list's type by one line of it, spaced as far apart as the points in the design", () => {
    // Two points 20 units apart, each line of glyphs 8 units tall, in a 596-wide A4 frame.
    const line = (y: number) => `<path d="M312 ${y}h4v8z M318 ${y}h4v8z M324 ${y}h4v8z" data-box="312 ${y} 100 8" fill="#383838"/>`;
    const flyer = `<svg width="596" height="842" viewBox="0 0 596 842" xmlns="http://www.w3.org/2000/svg"><rect width="596" height="842" fill="#FCF9F2"/>${line(300)}${line(320)}</svg>`;
    const named = nameMarks(flyer, [{ index: 1, kind: "text", label: "Poin", lines: 2, font: "sans", list: true, extra: [2], area: { x: 312, y: 300, w: 100, h: 28 } }]);
    const [list] = readFigmaSvg(named, measure).fields;
    const scale = 1240 / 596, size = Math.round(8 * scale / 0.95);
    expect(list).toMatchObject({ list: true, maxLines: 2, sizeMax: size, lineHeight: Math.round(20 * scale / size * 20) / 20 });
    // The box reaches half a leading above the first line, so the glyphs land where Figma had them.
    expect(list.box.a4!.y).toBeLessThan(Math.round(300 * scale));
  });

  it("makes one list field of a list's lines and icons, over the area they cover", () => {
    // An A4 frame in points (596×842, scaled to 1240 wide): an icon and two outlined lines, twice.
    const flyer = `<svg width="596" height="842" viewBox="0 0 596 842" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="596" height="842" fill="#FCF9F2"/><rect x="20" y="300" width="250" height="250" fill="#EDE6D4"/>`
      + `<path d="M300 300l6 4-6 4z" fill="#BD850F"/><path d="M312 300h4v8z M318 300h4v8z M324 300h4v8z" fill="#383838"/>`
      + `<path d="M300 320l6 4-6 4z" fill="#BD850F"/><path d="M312 320h4v8z M318 320h4v8z M324 320h4v8z" fill="#383838"/><path d="M60 700h400v2H60z" fill="#111111"/></svg>`;
    // In document order: 0 rect, 1 photo, 2 icon, 3 line, 4 icon, 5 line, 6 rule.
    const named = nameMarks(flyer, [
      { index: 1, kind: "photo", label: "Foto utama", lines: 1, font: "sans" },
      { index: 2, kind: "text", label: "Fasilitas", lines: 2, font: "sans", list: true, extra: [3, 4, 5], area: { x: 300, y: 300, w: 120, h: 28 } },
    ]);
    const group = new DOMParser().parseFromString(named, "image/svg+xml").getElementById("isi_fasilitas")!;
    expect(group.getAttribute("data-list")).toBe("true");
    expect(group.querySelector("rect")?.getAttribute("fill")).toBe("none");
    const result = readFigmaSvg(named, measure);
    expect(result.format).toBe("a4");
    const scale = 1240 / 596;
    const list = result.fields.find(field => field.key === "fasilitas")!;
    expect(result.fields).toHaveLength(2);
    // The colour is the lines', not the icons' gold.
    expect(list).toMatchObject({ kind: "text", list: true, maxLines: 2, label: "Fasilitas", color: "#383838" });
    expect(list.box.a4).toEqual({ x: Math.round(300 * scale), y: Math.round(300 * scale), w: Math.round(120 * scale), h: Math.round(28 * scale) });
    // The lines and icons leave the design: the list draws them now.
    for (const image of [result.background, result.overlay ?? ""]) {
      expect(image).not.toContain("#BD850F");
      expect(image).not.toContain("#383838");
      expect(image).not.toContain("data-isi-bagian");
    }
    expect(result.background).toContain("#111111");
  });

  it("counts the lines of outlined text from where its letters start", () => {
    const shape = (markup: string) => new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, "image/svg+xml").documentElement.firstElementChild!;
    const moves = (ys: number[]) => ys.map((y, n) => `M${10 + n * 20} ${y}h8v8z`).join(" ");
    // 40 px type at 48 px line height: letters start across the top 28 px of each line.
    const three = [100, 110, 120, 128, 148, 158, 168, 176, 196, 206, 216, 224];
    expect(guessLines(shape(`<path d="${moves(three)}"/>`))).toBe(3);
    // The same lines split over the paths of a group.
    expect(guessLines(shape(`<g><path d="${moves(three.slice(0, 4))}"/><path d="${moves(three.slice(4))}"/></g>`))).toBe(3);
    // One line whose letters start a pixel or two apart.
    expect(guessLines(shape(`<path d="${moves([100, 101, 99, 102, 100, 98, 103])}"/>`))).toBe(1);
    // Too few letters to tell.
    expect(guessLines(shape(`<path d="${moves([100, 160, 220])}"/>`))).toBe(1);
    expect(guessLines(shape('<rect width="10" height="10"/>'))).toBe(1);
  });

  it("lets a text box take as many letters as it holds, or the designer's own limit", () => {
    // A paragraph area as the prepared JCWF flyer has it: 619 px wide, four lines at 15 px.
    const paragraph = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><g id="isi_tentang_sesi" data-font="nunito" data-size="15" data-lines="4"><rect x="61" y="906" width="619" height="100" fill="none"/><path d="M0 0h1v1z" data-box="61 910 600 60" fill="#383838"/></g><g id="isi_jam" data-size="14" data-maxlength="12"><rect x="775" y="924" width="245" height="20" fill="none"/></g></svg>`;
    const [about, time] = readFigmaSvg(paragraph, measure).fields;
    expect(about.maxLength).toBe(capacity(about, { w: 619 }));
    expect(about.maxLength).toBeGreaterThanOrEqual(300);
    expect(time.maxLength).toBe(12);
  });

  it("takes a wide slot's icon set to one side as its upload mark", () => {
    // The flyer's optional logo slot: a wide box with its camera icon near the left and its label beside it.
    const slot = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1350" fill="#FCF9F2"/><rect id="foto_logo_opsional" x="834.4" y="1265.4" width="199.2" height="66.2" fill="#F5EDDE"/><path class="ikon" d="M0 0h1v1z" data-box="849.8 1287.3 24.4 21.6" fill="#BD850F"/><path class="label" d="M0 0h1v1z" data-box="895.3 1286.9 113.7 22.7" fill="#383838"/></svg>`;
    const result = readFigmaSvg(slot, measure);
    expect(result.parts.find(part => part.key === "foto_logo")?.art).toContain('class="ikon"');
    expect(result.background).not.toContain('class="ikon"');
    expect(result.background).not.toContain('class="label"');
  });

  it("takes out anything that could run before the SVG is shown or measured", () => {
    const clean = sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><foreignObject><div/></foreignObject><a href="javascript:alert(3)"><rect width="1" height="1" onclick="x()"/></a></svg>`);
    expect(clean).not.toMatch(/onload|onclick|<script|foreignObject|javascript:/);
    expect(clean).toContain("<rect");
  });
});

describe("stacked items (a side panel of small headings, each over its value)", () => {
  // An A4 frame at the card's own size: a photo on the left, the panel on the right.
  const glyphs = (id: string, box: string, fill = "#BD850F") => `<path id="${id}" data-box="${box}" d="M0 0h1v1z" fill="${fill}"/>`;
  const value = (id: string, y: number) => `<g id="${id}" data-box="760 ${y} 400 40"><path d="M0 0h1v1z" fill="#383838"/></g>`;
  const named = `<svg width="1240" height="1754" viewBox="0 0 1240 1754" xmlns="http://www.w3.org/2000/svg">
    <rect id="dasar" width="1240" height="1754" fill="#FCF9F2"/>
    <rect id="foto_utama" x="0" y="300" width="560" height="900" fill="#EDE6D4"/>
    <g id="susun_info">
      <rect id="panel" x="740" y="280" width="440" height="340" fill="#FFFFFF"/>
      ${glyphs("judul1", "760 300 200 20")}${value("isi_cocok_untuk", 330)}
      <rect id="garis1" x="760" y="390" width="400" height="2" fill="#D9CBB0"/>
      ${glyphs("judul2", "760 410 200 20")}${value("isi_persiapan", 440)}
      ${glyphs("judul3", "760 500 200 20")}${value("isi_bawa_sendiri", 530)}
      <rect id="garis_akhir" x="760" y="590" width="400" height="2" fill="#D9CBB0"/>
    </g>
    ${glyphs("kaki", "60 1600 600 30", "#111111")}
  </svg>`;

  it("reads a susun_ group's texts as optional items of one stack, each with its heading and the divider above it", () => {
    expect(parseStack("susun_info_2")).toBe("info");
    expect(parseStack("susun-Info Kanan")).toBe("info_kanan");
    expect(parseStack("isi_info")).toBeNull();
    const result = readFigmaSvg(named, measure);
    expect(result.format).toBe("a4");
    expect(result.fields.map(field => [field.key, field.stack, !!field.optional])).toEqual([["foto_utama", undefined, false], ["cocok_untuk", "info", true], ["persiapan", "info", true], ["bawa_sendiri", "info", true]]);
    const byKey = Object.fromEntries(result.fields.map(field => [field.key, field]));
    // Each band is the shapes between the text above and this one; what lies below the last text is the last item's.
    expect(byKey.cocok_untuk.labelBox).toEqual({ a4: { x: 760, y: 300, w: 200, h: 20 } });
    expect(byKey.persiapan.labelBox).toEqual({ a4: { x: 760, y: 390, w: 400, h: 40 } });
    expect(byKey.bawa_sendiri.labelBox).toEqual({ a4: { x: 760, y: 500, w: 400, h: 92 } });
    expect(byKey.foto_utama.labelBox).toBeUndefined();
    const label = (key: string) => result.parts.find(part => part.key === key)?.label ?? "";
    expect(label("persiapan")).toMatch(/id="judul2"(?![^>]*visibility)/);
    expect(label("persiapan")).toMatch(/id="garis1"(?![^>]*visibility)/);
    expect(label("persiapan")).toMatch(/id="judul1"[^>]*visibility="hidden"/);
    expect(label("cocok_untuk")).toMatch(/id="judul1"(?![^>]*visibility)/);
    expect(result.parts.find(part => part.key === "persiapan")).toMatchObject({ art: null, slot: null });
    // The headings and dividers leave the design; the panel behind them all, and the rest, stay.
    for (const id of ["judul1", "garis1", "judul2", "judul3", "garis_akhir"]) expect(result.background).not.toContain(`id="${id}"`);
    for (const id of ["dasar", "panel", "kaki"]) expect(result.background).toContain(`id="${id}"`);
    // The photo box is a slot, not background.
    expect(result.background).not.toContain('id="foto_utama"');
    expect(result.overlay).toBeNull();
    expect(result.notes.join(" ")).toMatch(/3 kolom bersusun/);
  });

  it("finds a marked stack's headings in its column, between one item's text and the next", () => {
    // No layer names, as the flyer is exported. A title far above, a note left of the panel, and a footer stay in the design.
    const plain = named.replace(/ id="[^"]*"/g, "").replace(/<g data-box="([^"]+)"><path d="M0 0h1v1z" fill="#383838"\/><\/g>/g, '<path data-box="$1" d="M0 0h1v1z" fill="#383838"/>')
      .replace("</svg>", '<path data-box="760 100 300 40" d="M0 0h1v1z" fill="#063E34"/><path data-box="600 410 100 20" d="M0 0h1v1z" fill="#9C3D22"/></svg>');
    const all = [...new DOMParser().parseFromString(plain, "image/svg+xml").documentElement.querySelectorAll("*")];
    const at = (y: number) => all.findIndex(element => element.getAttribute("fill") === "#383838" && element.getAttribute("data-box")?.split(" ")[1] === String(y));
    const marks = [330, 440, 530].map((y, n) => ({ index: at(y), kind: "text" as const, label: ["Cocok untuk", "Persiapan", "Bawa sendiri"][n], lines: 1, font: "sans" as const, optional: true, stack: "info" }));
    const photo = { index: all.findIndex(element => element.getAttribute("fill") === "#EDE6D4"), kind: "photo" as const, label: "Foto utama", lines: 1, font: "sans" as const };
    const result = readFigmaSvg(nameMarks(plain, [photo, ...marks]), measure);
    expect(result.fields.map(field => [field.key, field.stack, !!field.optional])).toEqual([["foto_utama", undefined, false], ["cocok_untuk", "info", true], ["persiapan", "info", true], ["bawa_sendiri", "info", true]]);
    const byKey = Object.fromEntries(result.fields.map(field => [field.key, field]));
    // Over the first item: up to three of its lines (42 px type at 1.2), so the title 190 px up is not its heading.
    expect(byKey.cocok_untuk.labelBox).toEqual({ a4: { x: 760, y: 300, w: 200, h: 20 } });
    expect(byKey.persiapan.labelBox).toEqual({ a4: { x: 760, y: 390, w: 400, h: 40 } });
    // Below the last item nothing is looked for: no group says where the stack ends.
    expect(byKey.bawa_sendiri.labelBox).toEqual({ a4: { x: 760, y: 500, w: 200, h: 20 } });
    expect(result.parts.filter(part => part.label).map(part => part.key)).toEqual(["cocok_untuk", "persiapan", "bawa_sendiri"]);
    expect(result.background).not.toContain("#BD850F");
    for (const fill of ["#063E34", "#9C3D22", "#111111", "#FFFFFF"]) expect(result.background).toContain(`fill="${fill}"`);
  });

  it("names a stacked mark so the import knows its stack", () => {
    const plain = `<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1350" fill="#FCF9F2"/><path d="M0 0h1v1z" data-box="61 59 528 123"/><path d="M0 0h1v1z" data-box="61 900 300 20"/></svg>`;
    const doc = new DOMParser().parseFromString(nameMarks(plain, [
      { index: 1, kind: "text", label: "Info 1", lines: 1, font: "sans", optional: true, stack: "info" },
      { index: 2, kind: "text", label: "Info 2", lines: 1, font: "sans", stack: "Info 2" },
    ]), "image/svg+xml");
    expect([...doc.querySelectorAll("[id]")].map(element => [element.getAttribute("id"), element.getAttribute("data-susun")])).toEqual([["isi_info1_opsional", "info"], ["isi_info2", "info_2"]]);
  });

  it("keeps an item's stack and its heading box per size when another size is merged in", () => {
    const a4 = readFigmaSvg(named, measure);
    const post = { x: 600, y: 900, w: 300, h: 30 };
    const earlier = a4.fields.map(field => ({ ...field, box: { ...field.box, a4: null, post: { x: 1, y: 1, w: 10, h: 10 } }, ...(field.stack ? { labelBox: { post } } : {}) }));
    const merged = mergeImport(earlier, true, a4);
    expect(merged.find(field => field.key === "persiapan")).toMatchObject({ stack: "info", optional: true, labelBox: { post, a4: { x: 760, y: 390, w: 400, h: 40 } } });
    expect(merged.find(field => field.key === "foto_utama")?.labelBox).toBeUndefined();
    // A newer file for the size without the item: its heading box leaves that size too.
    const without = { ...a4, fields: a4.fields.filter(field => field.key !== "persiapan") };
    expect(mergeImport(merged, true, without).find(field => field.key === "persiapan")?.labelBox).toEqual({ post });
  });
});
