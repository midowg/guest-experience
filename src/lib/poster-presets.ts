import { tzLabel } from "./timezones";
import { boxes, emptyPoster, posterDate, posterDuration, posterFormatSetups, posterTime, posterSizes, type CardType, type PosterBox, type PosterField, type PosterFormat, type PosterPalette, type PosterSettings } from "./poster";
import { posterIcons, type PosterIcon } from "./poster-icons";
import type { EventRecord } from "./types";

/**
 * Ready-made cards, one or more per card type. A preset draws its own background per format from
 * the palette (shapes, lines, icons; never text) until the admin uploads one from Figma, and lays
 * its boxes out per format. To add a preset: add an entry to `posterPresets` (poster.test.ts checks
 * every box stays inside its format and passes validation).
 */
type Decor = (c: PosterPalette["colors"]) => string[];
type Layout = { decor: Decor; boxes: Record<string, PosterBox> };
export type PosterPreset = {
  key: string; type: CardType; name: string; description: string;
  /** The palette it starts in, and the formats switched on from the start. */
  palette: string; formats: PosterFormat[];
  layouts: Partial<Record<PosterFormat, Layout>>;
  fields: (event: EventRecord) => Omit<PosterField, "box">[];
};

/* Background shapes, in design pixels. */
const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const frame = (x: number, y: number, w: number, h: number, stroke: string, width = 2, rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, width = 2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"/>`;
const circle = (cx: number, cy: number, r: number, fill: string, stroke = "none", width = 0) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const icon = (name: PosterIcon, x: number, y: number, size: number, color: string) =>
  `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${posterIcons[name]}</g>`;

/** The SVG a preset draws for a format in a palette, or "" when it has no layout for it. */
export function presetBackground(preset: PosterPreset | undefined, format: PosterFormat, palette: PosterPalette): string {
  const layout = preset?.layouts[format];
  if (!layout) return "";
  const { width, height } = posterSizes[format];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rect(0, 0, width, height, palette.colors.background)}${layout.decor(palette.colors).join("")}</svg>`;
}

type Style = Partial<Omit<PosterField, "key" | "label" | "hint" | "box">>;
const base: Omit<PosterField, "key" | "label" | "hint" | "box"> = {
  kind: "text", editable: true, value: "", maxLength: 120, font: "nunito", weight: 600, tone: "text", color: "#1f2a24",
  align: "left", uppercase: false, letterSpacing: 0, sizeMax: 24, sizeMin: 14, lineHeight: 1.25, maxLines: 1, radius: 0, fill: "#e9dfcb",
};
const field = (key: string, label: string, hint: string, style: Style = {}) => ({ ...base, ...style, key, label, hint });
const at = (x: number, y: number, w: number, h: number): PosterBox => ({ x, y, w, h });
/** The same layout on a larger or smaller page. */
const scaled = (layout: Record<string, PosterBox>, sx: number, sy: number) =>
  Object.fromEntries(Object.entries(layout).map(([key, box]) => [key, at(Math.round(box.x * sx), Math.round(box.y * sy), Math.round(box.w * sx), Math.round(box.h * sy))]));
const when = (event: EventRecord) => ({ date: posterDate(event.starts_at, event.timezone), time: posterTime(event.starts_at, event.timezone, tzLabel(event.timezone)) });
/** Corners this round make a circle of any box (CSS and canvas both shrink it to fit). */
const ROUND = 500;

/* 1. Poster sesi: after the JCWF example "Meramu Rempah Nusantara". */
const rempah: PosterPreset = {
  key: "rempah-nusantara", type: "poster", name: "Rempah Nusantara",
  description: "Judul berkait di atas, foto lebar, rincian sesi di bawah dalam tiga kolom.",
  palette: "rempah", formats: ["post", "story", "square"],
  layouts: {
    post: {
      decor: c => [line(730, 128, 1020, 128, c.accent), rect(0, 215, 1080, 660, c.photo), line(478, 910, 478, 1300, c.line), line(782, 910, 782, 1300, c.line),
        frame(64, 1015, 150, 180, c.line, 2, 10), icon("calendar", 520, 930, 40, c.accent), icon("clock", 520, 1034, 40, c.accent), icon("hourglass", 520, 1134, 40, c.accent), icon("map-pin", 520, 1230, 40, c.accent),
        rect(805, 920, 225, 92, c.primary), icon("users", 820, 946, 36, c.onPrimary), line(805, 1045, 1030, 1045, c.line), icon("message-circle", 812, 1084, 38, c.accent), icon("instagram", 812, 1226, 38, c.accent)],
      boxes: {
        title: at(64, 40, 620, 172), category: at(730, 142, 290, 40), photo: at(0, 215, 1080, 660), with_label: at(64, 905, 300, 26), host: at(64, 932, 395, 66),
        host_photo: at(64, 1015, 150, 180), description: at(232, 1015, 228, 300), date: at(580, 922, 185, 78), time: at(580, 1030, 185, 48), duration: at(580, 1130, 185, 48),
        venue: at(580, 1222, 185, 84), price: at(864, 930, 160, 72), reservation: at(862, 1078, 168, 96), socials: at(862, 1222, 168, 48),
      },
    },
    story: {
      decor: c => [line(72, 500, 380, 500, c.accent), rect(0, 590, 1080, 620, c.photo), frame(72, 1345, 140, 160, c.line, 2, 10),
        icon("calendar", 72, 1530, 42, c.accent), icon("clock", 552, 1530, 42, c.accent), icon("hourglass", 72, 1605, 42, c.accent), icon("map-pin", 552, 1605, 42, c.accent),
        line(72, 1690, 1008, 1690, c.line), rect(72, 1715, 420, 80, c.primary), icon("users", 90, 1737, 36, c.onPrimary), icon("message-circle", 532, 1716, 38, c.accent), icon("instagram", 532, 1764, 36, c.accent)],
      boxes: {
        title: at(72, 210, 936, 270), category: at(72, 515, 936, 44), photo: at(0, 590, 1080, 620), with_label: at(72, 1240, 400, 28), host: at(72, 1268, 936, 70),
        host_photo: at(72, 1345, 140, 160), description: at(236, 1345, 772, 160), date: at(130, 1525, 400, 60), time: at(610, 1525, 398, 60), duration: at(130, 1600, 400, 60),
        venue: at(610, 1600, 398, 72), price: at(140, 1722, 345, 66), reservation: at(590, 1712, 418, 48), socials: at(590, 1764, 418, 40),
      },
    },
    square: {
      decor: c => [line(728, 120, 1015, 120, c.accent), rect(0, 192, 1080, 628, c.photo), line(480, 850, 480, 1062, c.line), line(760, 850, 760, 1062, c.line),
        frame(56, 922, 140, 140, c.line, 2, 10), icon("calendar", 500, 860, 34, c.accent), icon("clock", 500, 925, 34, c.accent), icon("hourglass", 500, 972, 34, c.accent), icon("map-pin", 500, 1020, 34, c.accent),
        rect(778, 852, 252, 80, c.primary), icon("users", 792, 874, 32, c.onPrimary), line(778, 952, 1030, 952, c.line), icon("message-circle", 786, 968, 32, c.accent), icon("instagram", 786, 1036, 30, c.accent)],
      boxes: {
        title: at(62, 24, 620, 160), category: at(728, 134, 290, 36), photo: at(0, 192, 1080, 628), with_label: at(62, 838, 300, 22), host: at(62, 862, 400, 56),
        host_photo: at(56, 922, 140, 140), description: at(214, 922, 250, 140), date: at(548, 852, 200, 62), time: at(548, 925, 200, 36), duration: at(548, 972, 200, 36),
        venue: at(548, 1016, 200, 58), price: at(834, 858, 190, 68), reservation: at(830, 962, 200, 66), socials: at(830, 1034, 200, 36),
      },
    },
  },
  fields: event => [
    field("title", "Judul sesi", "Judul sesi", { font: "playfair", weight: 400, tone: "primary", sizeMax: 96, sizeMin: 44, lineHeight: 1.02, maxLines: 3, maxLength: 60 }),
    field("category", "Kategori", "Kategori sesi", { uppercase: true, letterSpacing: 0.16, tone: "primary", sizeMax: 24, sizeMin: 14, maxLength: 40 }),
    field("photo", "Foto utama", "Unggah foto utama", { kind: "photo", tone: "" }),
    field("with_label", "Label \"Bersama\"", "Bersama", { editable: false, value: "Bersama", uppercase: true, letterSpacing: 0.2, weight: 700, tone: "muted", sizeMax: 16, sizeMin: 11 }),
    field("host", "Fasilitator / komunitas", "Nama fasilitator", { font: "playfair", weight: 400, tone: "primary", sizeMax: 46, sizeMin: 24, lineHeight: 1.1, maxLength: 50 }),
    field("host_photo", "Foto fasilitator", "Foto fasilitator", { kind: "photo", tone: "", radius: 10, fill: "#f3ead8" }),
    field("description", "Deskripsi", "Ceritakan sesi ini dalam 2–3 kalimat", { weight: 400, sizeMax: 22, sizeMin: 12, lineHeight: 1.4, maxLines: 12, maxLength: 320 }),
    field("date", "Hari & tanggal", "Hari, tanggal", { value: when(event).date, sizeMax: 25, sizeMin: 14, maxLines: 2, maxLength: 40 }),
    field("time", "Jam", "Jam", { value: when(event).time, sizeMax: 25, sizeMin: 14, maxLength: 20 }),
    field("duration", "Durasi", "Durasi", { value: posterDuration(event.starts_at, event.ends_at), sizeMax: 25, sizeMin: 14, maxLength: 30 }),
    field("venue", "Tempat", "Tempat, kota", { value: event.venue_name, sizeMax: 25, sizeMin: 13, maxLines: 2, maxLength: 80 }),
    field("price", "Biaya & kuota", "Berbayar · Kuota maks. 15 peserta", { tone: "onPrimary", sizeMax: 21, sizeMin: 12, maxLines: 2, maxLength: 60 }),
    field("reservation", "Reservasi & informasi", "Reservasi & informasi", { editable: false, value: "Reservasi & informasi", weight: 400, sizeMax: 20, sizeMin: 11, maxLines: 3, maxLength: 120 }),
    field("socials", "Instagram & website", "@instagram | website", { editable: false, sizeMax: 21, sizeMin: 11, maxLength: 60 }),
  ],
};

/* 2. Kartu ucapan: centred, framed, an optional round photo. */
const greetingLayout = (W: number, H: number, y: { eyebrow: number; greeting: [number, number]; photo: [number, number]; message: [number, number]; sender: number; role: number }) => ({
  decor: ((c: PosterPalette["colors"]) => [frame(40, 40, W - 80, H - 80, c.line, 3, 24), frame(56, 56, W - 112, H - 112, c.accent, 1, 18), icon("sparkles", W / 2 - 24, y.eyebrow - 68, 48, c.accent),
    circle(W / 2, y.photo[0] + y.photo[1] / 2, y.photo[1] / 2 + 10, "none", c.accent, 2), rect(W / 2 - 60, H - 110, 120, 6, c.accent, 3)]) as Decor,
  boxes: {
    eyebrow: at(120, y.eyebrow, W - 240, 44), greeting: at(110, y.greeting[0], W - 220, y.greeting[1]), photo: at(W / 2 - y.photo[1] / 2, y.photo[0], y.photo[1], y.photo[1]),
    message: at(130, y.message[0], W - 260, y.message[1]), sender: at(120, y.sender, W - 240, 56), sender_role: at(120, y.role + 4, W - 240, 40),
  },
});
const ucapan: PosterPreset = {
  key: "ucapan-hangat", type: "ucapan", name: "Ucapan Hangat",
  description: "Bingkai lembut, ucapan besar di tengah, foto bundar opsional, pesan, dan nama pengirim.",
  palette: "senja", formats: ["square", "story", "post"],
  layouts: {
    square: greetingLayout(1080, 1080, { eyebrow: 140, greeting: [196, 250], photo: [462, 220], message: [706, 168], sender: 884, role: 940 }),
    story: greetingLayout(1080, 1920, { eyebrow: 300, greeting: [366, 380], photo: [786, 360], message: [1190, 300], sender: 1530, role: 1592 }),
    post: greetingLayout(1080, 1350, { eyebrow: 160, greeting: [218, 290], photo: [526, 260], message: [818, 232], sender: 1078, role: 1136 }),
  },
  fields: event => [
    field("eyebrow", "Label atas", "Nama acara atau keluarga", { editable: false, value: event.title, uppercase: true, letterSpacing: 0.2, weight: 800, tone: "accent", align: "center", sizeMax: 26, sizeMin: 14, maxLength: 80 }),
    field("greeting", "Ucapan utama", "Selamat & Sukses", { font: "playfair", weight: 600, tone: "primary", align: "center", sizeMax: 110, sizeMin: 44, lineHeight: 1.05, maxLines: 3, maxLength: 60 }),
    field("photo", "Foto (opsional)", "Foto", { kind: "photo", tone: "", radius: ROUND, fill: "#ecd8c6" }),
    field("message", "Pesan", "Tulis pesan singkat Anda", { weight: 400, align: "center", sizeMax: 34, sizeMin: 18, lineHeight: 1.4, maxLines: 7, maxLength: 260 }),
    field("sender", "Nama pengirim", "Nama Anda", { weight: 800, tone: "primary", align: "center", sizeMax: 38, sizeMin: 22, maxLength: 60 }),
    field("sender_role", "Jabatan / instansi", "Jabatan atau instansi", { weight: 600, tone: "muted", align: "center", sizeMax: 26, sizeMin: 15, maxLength: 80 }),
  ],
};

/* 3. ID card / name tag: event band on top, round photo, name, and a category band. */
const idcardBoxes = { event_name: at(40, 50, 558, 120), event_sub: at(40, 176, 558, 40), photo: at(179, 236, 280, 280), name: at(40, 560, 558, 140), role: at(40, 712, 558, 90), category: at(40, 925, 558, 60) };
const idcardDecor = (W: number, H: number, sx: number, sy: number): Decor => c => [rect(0, 0, W, 330 * sy, c.primary), circle(319 * sx, 376 * sy, 152 * sx, c.background), circle(319 * sx, 376 * sy, 144 * sx, c.photo, c.accent, 4),
  rect(0, H - 111 * sy, W, 111 * sy, c.primary), rect(0, H - 117 * sy, W, 6 * sy, c.accent), circle(W / 2, 22 * sy, 9 * sx, c.background)];
const idcard: PosterPreset = {
  key: "name-tag", type: "idcard", name: "Name Tag",
  description: "Pita acara di atas, foto bundar, nama besar, instansi, dan pita kategori (Peserta, Panitia, Pembicara).",
  palette: "werkudara", formats: ["idcard", "a5"],
  layouts: {
    idcard: { decor: idcardDecor(638, 1011, 1, 1), boxes: idcardBoxes },
    a5: { decor: idcardDecor(874, 1240, 874 / 638, 1240 / 1011), boxes: scaled(idcardBoxes, 874 / 638, 1240 / 1011) },
  },
  fields: event => [
    field("event_name", "Nama acara", "Nama acara", { editable: false, value: event.title, weight: 800, tone: "onPrimary", align: "center", sizeMax: 44, sizeMin: 20, lineHeight: 1.15, maxLines: 2, maxLength: 80 }),
    field("event_sub", "Keterangan acara", "Tanggal · tempat", { editable: false, value: [when(event).date, event.venue_name.split("\n")[0]].filter(Boolean).join(" · "), weight: 600, tone: "onPrimary", align: "center", sizeMax: 22, sizeMin: 12, maxLength: 80 }),
    field("photo", "Foto", "Foto wajah", { kind: "photo", tone: "", radius: ROUND, fill: "#dbe9f6" }),
    field("name", "Nama", "Nama lengkap", { font: "playfair", weight: 600, tone: "primary", align: "center", sizeMax: 66, sizeMin: 30, lineHeight: 1.1, maxLines: 2, maxLength: 60 }),
    field("role", "Jabatan / instansi", "Instansi atau jabatan", { weight: 600, align: "center", sizeMax: 32, sizeMin: 16, lineHeight: 1.25, maxLines: 2, maxLength: 80 }),
    field("category", "Kategori", "Peserta", { value: "Peserta", weight: 800, tone: "onPrimary", align: "center", uppercase: true, letterSpacing: 0.18, sizeMax: 40, sizeMin: 20, maxLength: 30 }),
  ],
};

/* 4. Sertifikat: a double frame, the name on a line, two signatures. Ready for print. */
const certificate = (W: number, H: number, y: { award: number; title: number; sub: number; name: number; rule: number; text: number; date: number; sign: number }, wide: number): Layout => {
  const left = W / 2 - wide / 2, signW = Math.min(400, (W - 340) / 2 - 40);
  const sign1 = W / 2 - 60 - signW, sign2 = W / 2 + 60;
  return {
    decor: c => [frame(48, 48, W - 96, H - 96, c.primary, 8), frame(72, 72, W - 144, H - 144, c.accent, 2), icon("award", W / 2 - 55, y.award, 110, c.accent),
      line(W / 2 - 400, y.rule, W / 2 + 400, y.rule, c.accent, 2), line(sign1, y.sign, sign1 + signW, y.sign, c.text, 2), line(sign2, y.sign, sign2 + signW, y.sign, c.text, 2)],
    boxes: {
      cert_title: at(left, y.title, wide, 130), cert_sub: at(left, y.sub, wide, 50), name: at(left, y.name, wide, 150), description: at(left + 100, y.text, wide - 200, 130), date: at(left, y.date, wide, 46),
      signer1_name: at(sign1, y.sign + 15, signW, 50), signer1_role: at(sign1, y.sign + 68, signW, 40), signer2_name: at(sign2, y.sign + 15, signW, 50), signer2_role: at(sign2, y.sign + 68, signW, 40),
    },
  };
};
const sertifikat: PosterPreset = {
  key: "sertifikat-klasik", type: "sertifikat", name: "Sertifikat Klasik",
  description: "Bingkai ganda, nama penerima besar di atas garis, keterangan, dan dua tanda tangan. Siap cetak A4.",
  palette: "werkudara", formats: ["a4_landscape", "a4"],
  layouts: {
    a4_landscape: certificate(1754, 1240, { award: 120, title: 250, sub: 400, name: 470, rule: 640, text: 670, date: 820, sign: 1010 }, 1400),
    a4: certificate(1240, 1754, { award: 170, title: 330, sub: 490, name: 560, rule: 740, text: 780, date: 960, sign: 1400 }, 1000),
  },
  fields: event => [
    field("cert_title", "Judul", "Sertifikat", { editable: false, value: "Sertifikat", font: "playfair", weight: 600, tone: "primary", align: "center", uppercase: true, letterSpacing: 0.12, sizeMax: 110, sizeMin: 56, maxLength: 40 }),
    field("cert_sub", "Pengantar", "Diberikan kepada", { editable: false, value: "Diberikan kepada", tone: "muted", align: "center", sizeMax: 36, sizeMin: 20, maxLength: 60 }),
    field("name", "Nama penerima", "Nama penerima", { font: "playfair", weight: 400, align: "center", sizeMax: 110, sizeMin: 50, lineHeight: 1.1, maxLength: 60 }),
    field("description", "Keterangan", "Atas partisipasinya sebagai …", { editable: false, value: `Atas partisipasinya sebagai peserta ${event.title}`, weight: 400, align: "center", sizeMax: 34, sizeMin: 18, lineHeight: 1.35, maxLines: 3, maxLength: 200 }),
    field("date", "Tempat & tanggal", "Tempat, tanggal", { editable: false, value: [event.venue_name.split("\n").pop(), when(event).date].filter(Boolean).join(", "), tone: "muted", align: "center", sizeMax: 30, sizeMin: 16, maxLength: 80 }),
    field("signer1_name", "Penanda tangan 1", "Nama penanda tangan", { editable: false, weight: 800, align: "center", sizeMax: 30, sizeMin: 16, maxLength: 60 }),
    field("signer1_role", "Jabatan penanda tangan 1", "Jabatan", { editable: false, tone: "muted", align: "center", sizeMax: 24, sizeMin: 14, maxLength: 60 }),
    field("signer2_name", "Penanda tangan 2", "Nama penanda tangan", { editable: false, weight: 800, align: "center", sizeMax: 30, sizeMin: 16, maxLength: 60 }),
    field("signer2_role", "Jabatan penanda tangan 2", "Jabatan", { editable: false, tone: "muted", align: "center", sizeMax: 24, sizeMin: 14, maxLength: 60 }),
  ],
};

/* 5. Kartu undangan: photo on top, event name, to whom, when and where. */
const invitation = (W: number, H: number, y: { photo: number; eyebrow: number; title: [number, number]; guest: number; rows: number[]; rowH: number; venueH: number; note: [number, number] }, size: number, margin: number): Layout => ({
  decor: c => [rect(0, 0, W, y.photo, c.photo), rect(0, y.photo, W, 10, c.accent), icon("calendar", margin, y.rows[0] + 6, size, c.accent), icon("clock", margin, y.rows[1] + 6, size, c.accent), icon("map-pin", margin, y.rows[2] + 6, size, c.accent)],
  boxes: {
    photo: at(0, 0, W, y.photo), eyebrow: at(margin, y.eyebrow, W - margin * 2, 44), title: at(margin, y.title[0], W - margin * 2, y.title[1]), guest: at(margin, y.guest, W - margin * 2, 70),
    date: at(margin + size + 24, y.rows[0], W - margin * 2 - size - 24, y.rowH), time: at(margin + size + 24, y.rows[1], W - margin * 2 - size - 24, y.rowH),
    venue: at(margin + size + 24, y.rows[2], W - margin * 2 - size - 24, y.venueH), note: at(margin, y.note[0], W - margin * 2, y.note[1]),
  },
});
const undangan: PosterPreset = {
  key: "undangan-sederhana", type: "undangan", name: "Undangan Sederhana",
  description: "Foto di atas, nama acara, untuk siapa, lalu tanggal, jam, dan tempat dengan ikon.",
  palette: "segar", formats: ["story", "post", "a5"],
  layouts: {
    story: invitation(1080, 1920, { photo: 760, eyebrow: 830, title: [880, 220], guest: 1120, rows: [1225, 1315, 1405], rowH: 60, venueH: 100, note: [1560, 150] }, 48, 120),
    post: invitation(1080, 1350, { photo: 520, eyebrow: 556, title: [600, 170], guest: 780, rows: [862, 932, 1002], rowH: 52, venueH: 84, note: [1110, 120] }, 38, 100),
    a5: invitation(874, 1240, { photo: 460, eyebrow: 494, title: [540, 160], guest: 708, rows: [792, 854, 916], rowH: 48, venueH: 76, note: [1020, 140] }, 32, 80),
  },
  fields: event => [
    field("photo", "Foto", "Foto acara", { kind: "photo", tone: "", fill: "#d9efe3" }),
    field("eyebrow", "Label", "Undangan", { editable: false, value: "Undangan", weight: 800, tone: "accent", uppercase: true, letterSpacing: 0.25, sizeMax: 30, sizeMin: 16, maxLength: 30 }),
    field("title", "Nama acara", "Nama acara", { value: event.title, font: "playfair", weight: 600, tone: "primary", sizeMax: 92, sizeMin: 40, lineHeight: 1.05, maxLines: 2, maxLength: 80 }),
    field("guest", "Kepada", "Kepada Yth. Bapak/Ibu …", { weight: 600, sizeMax: 36, sizeMin: 18, maxLines: 2, maxLength: 80 }),
    field("date", "Hari & tanggal", "Hari, tanggal", { value: when(event).date, sizeMax: 36, sizeMin: 18, maxLength: 40 }),
    field("time", "Jam", "Jam", { value: when(event).time, sizeMax: 36, sizeMin: 18, maxLength: 30 }),
    field("venue", "Tempat", "Tempat, kota", { value: event.venue_name, sizeMax: 36, sizeMin: 16, maxLines: 2, maxLength: 80 }),
    field("note", "Catatan", "Mohon konfirmasi kehadiran …", { weight: 400, tone: "muted", sizeMax: 30, sizeMin: 15, lineHeight: 1.35, maxLines: 4, maxLength: 200 }),
  ],
};

export const posterPresets: PosterPreset[] = [rempah, ucapan, idcard, sertifikat, undangan];
export const presetOf = (key: string) => posterPresets.find(preset => preset.key === key);

/** A preset's card for an event: its boxes per format, with date, time and venue from the event. */
export function presetPoster(key: string, event: EventRecord, enabled = true): PosterSettings {
  const preset = presetOf(key) ?? posterPresets[0];
  return {
    ...emptyPoster(), enabled, cardType: preset.type, preset: preset.key, palette: preset.palette,
    formats: posterFormatSetups(preset.formats),
    fields: preset.fields(event).map(item => ({ ...item, box: boxes(Object.fromEntries(Object.entries(preset.layouts).map(([format, layout]) => [format, layout?.boxes[item.key] ?? null]))) })),
  };
}
