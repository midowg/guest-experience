import { emptyGuide } from "./guide";
import { emptyDonation } from "./donations";
import { z } from "zod";
import { EMBED_ERROR, parseLocationEmbed } from "./location-embed";
import { parseContactPhone } from "./contact-phone";
import { eventTimezones } from "./timezones";
import { cardTypes, paletteRoles, posterFormats } from "./poster";

const text = (max: number) => z.string().trim().max(max);
/** `new URL()` throws on malformed input, so a half-typed address must never reach it. */
const isHttps = (value: string) => { try { return new URL(value).protocol === "https:"; } catch { return false; } };
const requiredHttpsUrl = z.string().trim().max(8000).refine(isHttps, "Gunakan tautan HTTPS yang lengkap, diawali https://");
const httpsUrl = z.union([z.literal(""), requiredHttpsUrl]);
const locationEmbed = z.string().max(10000).transform((value, ctx) => {
  const url = parseLocationEmbed(value);
  if (url === null) { ctx.addIssue({ code: "custom", message: EMBED_ERROR }); return z.NEVER; }
  return url;
});
const srcsetSchema = z.array(z.object({ width: z.number().int().min(16).max(8000), url: requiredHttpsUrl })).max(6);
export const photoFrameSchema = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), zoom: z.number().min(1).max(3) });
const timestamp = z.iso.datetime({ offset: true });
const optionalTime = timestamp.nullable();
const contactSchema = z.object({
  name: text(150),
  phone: text(30).refine(value => !value || parseContactPhone(value) !== null, "Gunakan nomor HP Indonesia, misalnya 0812 3456 7890."),
  channel: z.enum(["whatsapp", "phone"]),
  heading: text(200).default(""), description: text(1000).default(""),
  role: text(150).default(""), organization: text(200).default(""),
  photo: z.lazy(() => plainImage).default({ url: "", alt: "", srcset: [] }),
  staff_id: z.union([z.uuid(), z.literal("")]).default(""),
});
const plainImage = z.object({ url: httpsUrl, alt: text(300).default(""), srcset: srcsetSchema.default([]) });
const emptyImage = { url: "", alt: "", srcset: [] };

/** A team member as the super admin enters them. The number must be an Indonesian mobile number. */
export const staffInputSchema = z.object({
  name: z.string().trim().min(2, "Isi nama minimal 2 huruf.").max(150),
  role: z.string().trim().max(150).default(""),
  phone: z.string().trim().max(30).refine(value => parseContactPhone(value) !== null, "Gunakan nomor HP Indonesia, misalnya 0812 3456 7890."),
  photo: plainImage.default(emptyImage),
  active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(10000).default(0),
});
export type StaffInput = z.infer<typeof staffInputSchema>;
export const momentIcons = ["coffee", "utensils", "gift", "users", "camera", "music", "map", "sparkles", "presentation", "heart"] as const;
export const themeKeys = ["werkudara", "nenek", "gala", "khidmat", "segar", "rempah", "berbagi"] as const;
const pairSchema = (title = 200, description = 1500) => z.object({ title: text(title).default(""), description: text(description).default("") });
export const emptyEnglish = {
  title: "", subtitle: "", greeting: "", introduction: "", closing: "", arrival_notes: "", day_note: "",
  experience_title: "", experience_story: "", prepare_title: "", prepare_intro: "", after_title: "", after_message: "",
  contact_heading: "", contact_description: "", feedback_description: "", review_heading: "", review_description: "", review_button_label: "",
  agenda: {},
};
const englishSchema = z.object({
  title: text(180).default(""), subtitle: text(250).default(""), greeting: text(150).default(""), introduction: text(5000).default(""), closing: text(2000).default(""),
  arrival_notes: text(2000).default(""), day_note: text(1000).default(""),
  experience_title: text(200).default(""), experience_story: text(2000).default(""), prepare_title: text(200).default(""), prepare_intro: text(1000).default(""),
  after_title: text(200).default(""), after_message: text(2000).default(""),
  contact_heading: text(200).default(""), contact_description: text(1000).default(""), feedback_description: text(1000).default(""),
  review_heading: text(200).default(""), review_description: text(1000).default(""), review_button_label: text(100).default(""),
  agenda: z.record(z.uuid(), pairSchema(200, 1500)).default({}),
});
export const arrivalIcons = ["door", "pin", "parking", "clock", "info", "coffee"] as const;
export const prepareIcons = ["shirt", "backpack", "gift", "id-card", "umbrella", "sun", "footprints", "utensils", "camera", "pill", "package", "info"] as const;
const prepareSchema = z.object({
  title: text(200).default(""), intro: text(1000).default(""),
  items: z.array(z.object({
    icon: z.enum(prepareIcons).default("info"), title: text(150).min(1, "Isi judul kartu."), description: text(1000).default(""),
    list: z.array(text(150).min(1, "Isi atau hapus baris kosong.")).max(15).default([]),
    en: pairSchema(150, 1000).extend({ list: z.array(text(150)).max(15).default([]) }).optional(),
  })).max(8).default([]),
});
const experienceSchema = z.object({
  title: text(200).default(""), story: text(2000).default(""), image: plainImage.default(emptyImage),
  moments: z.array(z.object({ icon: z.enum(momentIcons), title: text(150).min(1, "Isi judul momen."), description: text(300).default(""), en: pairSchema(150, 300).optional() })).max(6).default([]),
});
const routeSchema = z.object({
  map_image: plainImage.default(emptyImage),
  steps: z.array(z.object({ title: text(150).min(1, "Isi judul langkah."), description: text(500).default(""), image: plainImage.default(emptyImage) })).max(6).default([]),
  points: z.array(z.object({ icon: z.enum(arrivalIcons).default("info"), title: text(120).min(1, "Isi judul info."), description: text(300).default("") })).max(4).default([]),
});
const afterSchema = z.object({
  title: text(200).default(""), message: text(2000).default(""), image: plainImage.default(emptyImage),
  collaboration: z.object({ enabled: z.boolean().default(false), title: text(200).default(""), description: text(1000).default(""), button_label: text(100).default("") })
    .default({ enabled: false, title: "", description: "", button_label: "" }),
});
export const emptyExperience = { title: "", story: "", image: emptyImage, moments: [] };
export const emptyRoute = { map_image: emptyImage, steps: [], points: [] };
export const emptyEmergency = { name: "", phone: "", hospital: "", hospital_address: "", hospital_maps_url: "" };
export const emptyAgendaDetail = { teaser: "", did_you_know: "", more_story: "", place: "", pdf_page: null };
const agendaDetailSchema = z.object({
  teaser: text(200).default(""), did_you_know: text(600).default(""), more_story: text(4000).default(""), place: text(200).default(""),
  pdf_page: z.number().int().min(1).max(999).nullable().default(null),
});
const emergencySchema = z.object({
  name: text(150).default(""),
  phone: text(30).refine(value => !value || parseContactPhone(value) !== null, "Gunakan nomor HP Indonesia, misalnya 0812 3456 7890.").default(""),
  hospital: text(200).default(""), hospital_address: text(500).default(""), hospital_maps_url: httpsUrl.default(""),
});
export const emptyPrepare = { title: "", intro: "", items: [] };
/** Studio Poster. Boxes are design pixels from Figma; a poster is at most 2000 px on a side. */
const coordinate = z.number().min(0).max(2000);
const posterBox = z.object({ x: coordinate, y: coordinate, w: z.number().min(1).max(2000), h: z.number().min(1).max(2000) });
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Gunakan warna hex, misalnya #0f4a3a.");
const posterFieldSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/), label: text(80).min(1), hint: text(200).default(""),
  kind: z.enum(["text", "photo"]), editable: z.boolean(), value: text(2000).default(""), maxLength: z.number().int().min(1).max(1000),
  font: z.enum(["playfair", "nunito", "inter", "lora", "cormorant"]), weight: z.number().int().min(100).max(900),
  tone: z.union([z.enum(paletteRoles), z.literal("")]).default(""), color: hexColor,
  align: z.enum(["left", "center", "right"]), valign: z.enum(["top", "middle", "bottom"]).optional(), uppercase: z.boolean(), letterSpacing: z.number().min(-0.1).max(1),
  sizeMax: z.number().min(6).max(300), sizeMin: z.number().min(6).max(300), lineHeight: z.number().min(0.8).max(3), maxLines: z.number().int().min(1).max(20),
  radius: z.number().min(0).max(500), fill: hexColor, optional: z.boolean().default(false), zoomOut: z.boolean().default(false), list: z.boolean().default(false),
  stack: z.string().regex(/^[a-z0-9_]{1,40}$/).optional(),
  labelBox: z.object(Object.fromEntries(posterFormats.map(format => [format, posterBox.optional()])) as Record<(typeof posterFormats)[number], z.ZodOptional<typeof posterBox>>).optional(),
  sizes: z.object(Object.fromEntries(posterFormats.map(format => [format, z.number().min(0.2).max(5).optional()])) as Record<(typeof posterFormats)[number], z.ZodOptional<z.ZodNumber>>).optional(),
  box: z.object(Object.fromEntries(posterFormats.map(format => [format, posterBox.nullable().default(null)])) as Record<(typeof posterFormats)[number], z.ZodDefault<z.ZodNullable<typeof posterBox>>>),
});
const posterPartSchema = z.object({ key: z.string().regex(/^[a-z0-9_]{1,40}$/), art: plainImage.default(emptyImage), slot: plainImage.default(emptyImage), label: plainImage.default(emptyImage) });
const posterFormatSchema = z.object({ enabled: z.boolean(), background: plainImage.default(emptyImage), overlay: plainImage.default(emptyImage), parts: z.array(posterPartSchema).max(30).default([]) });
const posterFormatsSchema = z.object(Object.fromEntries(posterFormats.map(format => [format, posterFormatSchema.default({ enabled: false, background: emptyImage, overlay: emptyImage, parts: [] })])) as Record<(typeof posterFormats)[number], z.ZodDefault<typeof posterFormatSchema>>);
const cardTypeSchema = z.enum(cardTypes.map(type => type.key) as [(typeof cardTypes)[number]["key"], ...(typeof cardTypes)[number]["key"][]]);
const posterFieldsSchema = z.array(posterFieldSchema).max(30).refine(fields => new Set(fields.map(field => field.key)).size === fields.length, "Kunci kolom poster tidak boleh sama.");
export const posterSchema = z.object({
  enabled: z.boolean().default(false), cardType: cardTypeSchema.default("poster"), preset: z.string().max(60).default(""),
  palette: z.string().max(40).default("rempah"), paletteChoice: z.boolean().default(false),
  formats: posterFormatsSchema.default(() => posterFormatsSchema.parse({ post: { enabled: true }, story: { enabled: true } })),
  fields: posterFieldsSchema.default([]),
});
/** A design for the library: the poster of an event without its on/off switch. */
export const posterDesignInputSchema = z.object({
  name: z.string().trim().min(2, "Isi nama desain minimal 2 huruf.").max(80),
  description: z.string().trim().max(300).default(""),
  template: z.object({
    cardType: cardTypeSchema.default("poster"), preset: z.string().max(60).default(""),
    palette: z.string().max(40).default("rempah"), paletteChoice: z.boolean().default(false),
    formats: posterFormatsSchema,
    fields: posterFieldsSchema.refine(fields => fields.length > 0, "Desain perlu minimal satu kotak."),
  }),
});
export type PosterDesignInput = z.infer<typeof posterDesignInputSchema>;
export const emptyAfter = { title: "", message: "", image: emptyImage, collaboration: { enabled: false, title: "", description: "", button_label: "" } };
/** CSR donations (src/lib/donations.ts): the chips, how to pay, what the page shows, the handover news. */
const donationItemSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{1,40}$/), label: text(60).min(1, "Isi nama bantuan."), category: z.enum(["fund", "goods", "other"]),
  unit: text(20).default(""), target: z.number().min(1).max(1_000_000_000_000).nullable().default(null),
});
const bankAccountSchema = z.object({
  id: z.string().min(1).max(40), bank: text(60).min(1, "Isi nama bank."),
  number: text(40).regex(/^[0-9][0-9 .-]*$/, "Nomor rekening hanya angka."), holder: text(120).min(1, "Isi nama pemilik rekening."),
});
const donationRecipientSchema = z.object({
  id: z.string().min(1).max(40), name: text(150).min(1, "Isi nama penerima."), description: text(500).default(""), place: text(200).default(""), photo: plainImage.default(emptyImage),
});
const donationSchema = z.object({
  enabled: z.boolean().default(false),
  recipients: z.array(donationRecipientSchema).max(20).default([]),
  items: z.array(donationItemSchema).max(40).refine(items => new Set(items.map(item => item.key)).size === items.length, "Jenis bantuan tidak boleh berulang.").default([]),
  accounts: z.array(bankAccountSchema).max(5).default([]),
  qris: plainImage.default(emptyImage),
  proofRequired: z.boolean().default(false),
  goodsNote: text(1000).default(""),
  closesAt: optionalTime.default(null),
  show: z.object({ fundTotal: z.boolean(), fundTarget: z.boolean(), goods: z.boolean(), donors: z.boolean(), donorAmounts: z.boolean(), messages: z.boolean() }).default(() => emptyDonation().show),
  delivered: z.object({ at: optionalTime.default(null), photo: plainImage.default(emptyImage), note: text(1000).default("") }).default(() => emptyDonation().delivered),
  notify: z.object({ template: text(2000).default(() => emptyDonation().notify.template), prayer: text(300).default("") }).default(() => emptyDonation().notify),
});
/** What a donor sends. Money needs an amount; goods need how many; anything else just its name. */
export const donationInputSchema = z.object({
  item_key: z.string().max(40).regex(/^[a-z0-9-]*$/).default(""),
  item_label: text(120).min(2, "Tulis bantuan yang ingin diberikan."),
  category: z.enum(["fund", "goods", "other"]),
  amount: z.number().min(0).max(1_000_000_000_000).default(0),
  unit: text(20).default(""),
  donor_name: text(150).min(2, "Isi nama Anda."),
  display: z.enum(["name", "hamba_allah", "hidden"]),
  donor_phone: text(30).refine(value => !value || parseContactPhone(value) !== null, "Gunakan nomor HP Indonesia, misalnya 0812 3456 7890.").default(""),
  message: text(500).default(""),
  website: z.string().max(0),
  idempotency_key: z.uuid(),
}).superRefine((value, ctx) => {
  if (value.category === "fund" && value.amount < 1000) ctx.addIssue({ code: "custom", path: ["amount"], message: "Isi nominal dana, minimal Rp 1.000." });
  if (value.category === "goods" && value.amount <= 0) ctx.addIssue({ code: "custom", path: ["amount"], message: "Isi jumlah barang." });
});
/** The committee records a donation by hand (cash, goods dropped off), already received. */
export const manualDonationSchema = z.object({
  item_key: z.string().max(40).regex(/^[a-z0-9-]*$/).default(""),
  item_label: text(120).min(2, "Tulis bantuannya."),
  category: z.enum(["fund", "goods", "other"]),
  amount: z.number().min(0).max(1_000_000_000_000).default(0),
  unit: text(20).default(""),
  donor_name: text(150).min(2, "Isi nama donatur."),
  display: z.enum(["name", "hamba_allah", "hidden"]),
  donor_phone: text(30).refine(value => !value || parseContactPhone(value) !== null, "Gunakan nomor HP Indonesia, misalnya 0812 3456 7890.").default(""),
  message: text(500).default(""),
});
/** Receive (with the amount that actually came in), reject (with a reason), or mark the handover message sent. */
export const donationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("receive"), received_amount: z.number().min(0).max(1_000_000_000_000).nullable().default(null) }),
  z.object({ action: z.literal("reject"), reason: text(300).min(2, "Tulis alasan singkat.") }),
  z.object({ action: z.literal("pending") }),
  z.object({ action: z.literal("notified") }),
]);

/** E-Guide (src/lib/guide.ts): a cover, up to 20 chapters of up to 30 items, and the book's order. */
const guideImage = plainImage.default(emptyImage);
const guideItemSchema = z.object({
  id: z.string().min(1).max(40), title: text(200).default(""), text: text(2000).default(""), fact: text(600).default(""), photo: guideImage, link: httpsUrl.default(""),
  en: z.object({ title: text(200).default(""), text: text(2000).default(""), fact: text(600).default("") }).optional(),
});
const guideChapterSchema = z.object({
  id: z.string().min(1).max(40), layout: z.enum(["story", "cards", "phrases", "tips"]), title: text(200).default(""), intro: text(2000).default(""), photo: guideImage,
  items: z.array(guideItemSchema).max(30).default([]), en: z.object({ title: text(200).default(""), intro: text(2000).default("") }).optional(),
});
const guideSchema = z.object({
  cover: z.object({ eyebrow: text(120).default(""), title: text(200).default(""), subtitle: text(400).default(""), photo: guideImage, en: z.object({ eyebrow: text(120).default(""), title: text(200).default(""), subtitle: text(400).default("") }).optional() }).default({ eyebrow: "", title: "", subtitle: "", photo: emptyImage }),
  chapters: z.array(guideChapterSchema).max(20).default([]),
  order: z.array(z.union([z.object({ kind: z.literal("chapter"), id: z.string().min(1).max(40) }), z.object({ kind: z.literal("part"), part: z.enum(["experience", "agenda", "location", "prepare", "contact"]) })])).max(30).default([]),
});

export const eventBaseSchema = z.object({
  id: z.uuid(), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  status: z.enum(["draft", "published", "archived"]), title: text(180).min(1), subtitle: text(250),
  organizer: text(250), greeting: text(150), introduction: text(5000), closing: text(2000),
  starts_at: timestamp, ends_at: optionalTime, timezone: z.enum(eventTimezones, "Pilih zona waktu WIB, WITA, atau WIT."),
  venue_name: text(200), address: text(1000), location_url: httpsUrl, location_embed_url: locationEmbed.default(""), location_display: z.enum(["manual", "embed"]).optional(), arrival_notes: text(2000),
  review_url: httpsUrl, review_enabled: z.boolean(), review_heading: text(200).default(""), review_description: text(1000).default(""), review_button_label: text(100).default(""), rsvp_enabled: z.boolean(), rsvp_closes_at: optionalTime,
  invitation_mode: z.enum(["open", "personal"]).default("open"),
  feedback_enabled: z.boolean(), feedback_opens_at: optionalTime, feedback_description: text(1000).default(""),
  contact: contactSchema.default({ name: "", phone: "", channel: "whatsapp", heading: "", description: "", role: "", organization: "", photo: { url: "", alt: "", srcset: [] }, staff_id: "" }),
  team_image: plainImage.default(emptyImage),
  sections: z.array(z.object({ key: z.enum(["about", "experience", "agenda", "location", "prepare", "rsvp", "contact", "feedback", "team"]), enabled: z.boolean() })).max(9),
  topics: z.array(z.object({ title: text(200).min(1), description: text(1500), en: pairSchema(200, 1500).optional() })).max(20),
  agenda: z.array(z.object({ id: z.uuid(), starts_at: timestamp, ends_at: timestamp, title: text(200).min(1), description: text(1500), sort_order: z.number().int().min(0).max(1000) })).max(100),
  feedback_questions: z.array(z.object({ id: z.uuid(), label: text(500).min(1), kind: z.enum(["rating", "choice", "text"]), required: z.boolean(), options: z.array(text(200).min(1)).max(20), sort_order: z.number().int().min(0).max(1000) })).max(30),
  venue_image_url: httpsUrl, venue_image_alt: text(300), venue_image_credit: text(500),
  hero: z.object({
    url: httpsUrl, alt: text(300), srcset: srcsetSchema,
    focus: z.enum(["top", "center", "bottom"]).default("center"),
    text_position: z.enum(["left", "center"]),
    framing: z.object({ mobile: photoFrameSchema, desktop: photoFrameSchema }).optional(),
  }),
  gallery: z.array(z.object({ id: z.uuid(), url: requiredHttpsUrl, alt: text(300), caption: text(300), sort_order: z.number().int().min(0).max(1000), srcset: srcsetSchema })).max(12),
  event_kind: z.enum(["kunjungan", "acara", "program", "kartu", "eguide", "csr"]).default("acara"),
  audience: z.enum(["external", "internal"]).default("external"),
  theme: z.object({ key: z.enum(themeKeys).default("werkudara"), corners: z.enum(["square", "soft"]).default("square") }).default({ key: "werkudara", corners: "square" }),
  phase_override: z.enum(["auto", "before", "day", "after"]).default("auto"),
  experience: experienceSchema.default(emptyExperience),
  route: routeSchema.default(emptyRoute),
  day_note: text(1000).default(""),
  after: afterSchema.default(emptyAfter),
  prepare: prepareSchema.default(emptyPrepare),
  language: z.enum(["id", "en", "id_en"]).default("id"),
  guest_estimate: z.number().int().min(1).max(5000).nullable().default(null),
  agenda_details: z.record(z.uuid(), agendaDetailSchema).default({}),
  presentation_pdf_url: httpsUrl.default(""),
  emergency: emergencySchema.default(emptyEmergency),
  poster: posterSchema.default(() => posterSchema.parse({})),
  guide: guideSchema.default(emptyGuide),
  donation: donationSchema.default(emptyDonation),
  translations: z.object({ en: englishSchema.default(emptyEnglish) }).default({ en: emptyEnglish }),
  created_at: timestamp, updated_at: timestamp,
});
export const eventSchema = eventBaseSchema.superRefine((event, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  if (new Set(event.sections.map(s => s.key)).size !== event.sections.length) issue(["sections"], "Bagian tidak boleh berulang.");
  if (Boolean(event.emergency.name) !== Boolean(event.emergency.phone)) issue([event.emergency.name ? "emergency.phone" : "emergency.name"], "Isi nama dan nomor kontak darurat bersama-sama.");
  for (const [id, detail] of Object.entries(event.agenda_details)) if (detail.pdf_page && !event.presentation_pdf_url) issue(["agenda_details", id, "pdf_page"], "Isi tautan PDF presentasi dulu.");
  if (Boolean(event.contact.name) !== Boolean(event.contact.phone)) issue([event.contact.name ? "contact.phone" : "contact.name"], "Isi nama dan nomor PIC bersama-sama.");
  if (event.ends_at && Date.parse(event.ends_at) <= Date.parse(event.starts_at)) issue(["ends_at"], "Waktu selesai harus setelah waktu mulai.");
  for (const [index, item] of event.agenda.entries()) if (Date.parse(item.ends_at) <= Date.parse(item.starts_at)) issue(["agenda", index, "ends_at"], "Waktu selesai harus setelah waktu mulai.");
  for (const key of ["agenda", "feedback_questions", "gallery"] as const) if (new Set(event[key].map(i => i.id)).size !== event[key].length) issue([key], "ID tidak boleh berulang.");
  for (const [index, q] of event.feedback_questions.entries()) if (q.kind === "choice" && (q.options.length < 2 || new Set(q.options).size !== q.options.length)) issue(["feedback_questions", index, "options"], "Isi minimal dua pilihan berbeda.");
  if (!event.hero.url && event.hero.srcset.length) issue(["hero", "srcset"], "Ukuran foto tidak boleh ada tanpa foto latar.");
  if (event.team_image.url && !event.team_image.alt) issue(["team_image", "alt"], "Isi deskripsi foto tim.");
  const photos: [(string | number)[], { url: string; alt: string; srcset: unknown[] }][] = [
    [["team_image"], event.team_image], [["experience", "image"], event.experience.image], [["route", "map_image"], event.route.map_image],
    [["after", "image"], event.after.image], ...event.route.steps.map((step, index) => [["route", "steps", index, "image"], step.image] as [(string | number)[], typeof step.image]),
    [["guide", "cover", "photo"], event.guide.cover.photo],
    ...event.guide.chapters.flatMap((chapter, index) => [
      [["guide", "chapters", index, "photo"], chapter.photo] as [(string | number)[], typeof chapter.photo],
      ...chapter.items.map((item, at) => [["guide", "chapters", index, "items", at, "photo"], item.photo] as [(string | number)[], typeof item.photo]),
    ]),
  ];
  for (const [path, image] of photos) {
    if (image.url && !image.alt) issue([...path, "alt"], "Isi deskripsi foto.");
    if (!image.url && image.srcset.length) issue([...path, "srcset"], "Ukuran foto tidak boleh ada tanpa foto.");
  }
  const locationDisplay = event.location_display ?? (event.location_embed_url ? "embed" : "manual");
  if (locationDisplay === "embed" && !event.location_embed_url) issue(["location_embed_url"], "Isi kode sematan Google Maps.");
  if (new Set(event.guide.chapters.map(chapter => chapter.id)).size !== event.guide.chapters.length) issue(["guide", "chapters"], "ID bab tidak boleh berulang.");
  // A card and an E-Guide have no invitation: organiser, introduction and place are not asked of them.
  if (event.status === "published" && event.event_kind === "eguide") {
    if (!event.guide.cover.title) issue(["guide", "cover", "title"], "Isi judul sampul sebelum publikasi.");
    if (!event.guide.chapters.length) issue(["guide", "chapters"], "Tambahkan minimal satu bab sebelum publikasi.");
  }
  // CSR: a page to give, so it needs something to give and, for money, a way to pay; a place is optional.
  if (event.status === "published" && event.event_kind === "csr" && event.donation.enabled) {
    if (!event.donation.items.length) issue(["donation", "items"], "Tambahkan minimal satu jenis bantuan sebelum publikasi.");
    if (event.donation.items.some(item => item.category === "fund") && !event.donation.accounts.length && !event.donation.qris.url) issue(["donation", "accounts"], "Isi rekening atau QRIS untuk donasi dana.");
  }
  if (event.status === "published" && event.event_kind !== "kartu" && event.event_kind !== "eguide") {
    for (const key of ["organizer", "introduction"] as const) if (!event[key]) issue([key], "Lengkapi sebelum publikasi.");
    if (locationDisplay === "manual" && event.event_kind !== "csr") for (const key of ["venue_name", "address", "location_url"] as const) if (!event[key]) issue([key], "Lengkapi sebelum publikasi.");
    if (event.feedback_enabled && !event.feedback_questions.length) issue(["feedback_questions"], "Isi pertanyaan sebelum mengaktifkan survei.");
    if (event.review_enabled && !event.review_url) issue(["review_url"], "Isi tautan review resmi.");
  }
}).transform(event => ({ ...event, location_display: event.location_display ?? (event.location_embed_url ? "embed" : "manual") }));
export const dietaryOptions = ["vegetarian", "allergy", "other"] as const;
export const accessOptions = ["wheelchair", "companion", "sign_interpreter", "other"] as const;
const uniqueList = <T extends string>(values: readonly [T, ...T[]]) => z.array(z.enum(values)).max(values.length).refine(list => new Set(list).size === list.length, "Pilihan tidak boleh berulang.");
/**
 * One RSVP. The stepped form sends party, needs and photo choices; older clients send only the
 * allergy pair. Either way `has_allergy` follows the "allergy" choice, and a guest who declines
 * carries no party or needs.
 */
export const rsvpSchema = z.object({
  name: text(150).min(2, "Isi nama lengkap."), organization: text(200).min(1, "Isi instansi atau komunitas."),
  attendance: z.enum(["yes", "no"]), phone: text(30).refine(v => !v || /^[+\d\s().-]{6,30}$/.test(v), "Periksa nomor telepon."),
  email: z.union([z.literal(""), z.email().max(254)]), has_allergy: z.boolean().default(false), allergy_details: text(1000).default(""),
  party_size: z.number().int().min(1).max(10).default(1),
  companion_names: z.array(text(150)).max(9).default([]),
  dietary: uniqueList(dietaryOptions).default([]), dietary_other: text(300).default(""),
  access: uniqueList(accessOptions).default([]), access_other: text(300).default(""),
  photo_opt_out: z.boolean().default(false), whatsapp_consent: z.boolean().default(false),
  consent: z.literal(true, { error: "Persetujuan penggunaan data diperlukan." }), website: z.string().max(0), idempotency_key: z.uuid(),
}).transform(v => {
  const attending = v.attendance === "yes";
  const dietary = attending ? [...new Set<(typeof dietaryOptions)[number]>([...v.dietary, ...(v.has_allergy ? ["allergy" as const] : [])])] : [];
  const allergy = dietary.includes("allergy");
  return {
    ...v,
    party_size: attending ? v.party_size : 1,
    companion_names: attending ? v.companion_names.filter(Boolean).slice(0, v.party_size - 1) : [],
    dietary, dietary_other: dietary.includes("other") ? v.dietary_other : "",
    access: attending ? v.access : [], access_other: attending && v.access.includes("other") ? v.access_other : "",
    has_allergy: allergy, allergy_details: allergy ? v.allergy_details : "",
  };
}).superRefine((v, ctx) => {
  if (v.has_allergy && !v.allergy_details) ctx.addIssue({ code: "custom", path: ["allergy_details"], message: "Jelaskan alergi makanan yang perlu diperhatikan." });
  if (v.dietary.includes("other") && !v.dietary_other) ctx.addIssue({ code: "custom", path: ["dietary_other"], message: "Jelaskan kebutuhan makanan lainnya." });
  if (v.access.includes("other") && !v.access_other) ctx.addIssue({ code: "custom", path: ["access_other"], message: "Jelaskan kebutuhan akses lainnya." });
});
export const feedbackSchema = z.object({ idempotency_key: z.uuid(), website: z.string().max(0), answers: z.array(z.object({ question_id: z.uuid(), value: text(3000) })).max(30) }).refine(v => new Set(v.answers.map(a => a.question_id)).size === v.answers.length, "Pertanyaan tidak boleh dijawab dua kali.");
