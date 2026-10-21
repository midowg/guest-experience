import { z } from "zod";
import { EMBED_ERROR, parseLocationEmbed } from "./location-embed";
import { parseContactPhone } from "./contact-phone";
import { eventTimezones } from "./timezones";

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
});
const plainImage = z.object({ url: httpsUrl, alt: text(300).default(""), srcset: srcsetSchema.default([]) });
const emptyImage = { url: "", alt: "", srcset: [] };
export const momentIcons = ["coffee", "utensils", "gift", "users", "camera", "music", "map", "sparkles", "presentation", "heart"] as const;
export const themeKeys = ["werkudara", "nenek", "gala", "khidmat", "segar"] as const;
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
});
const afterSchema = z.object({
  title: text(200).default(""), message: text(2000).default(""), image: plainImage.default(emptyImage),
  collaboration: z.object({ enabled: z.boolean().default(false), title: text(200).default(""), description: text(1000).default(""), button_label: text(100).default("") })
    .default({ enabled: false, title: "", description: "", button_label: "" }),
});
export const emptyExperience = { title: "", story: "", image: emptyImage, moments: [] };
export const emptyRoute = { map_image: emptyImage, steps: [] };
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
export const emptyAfter = { title: "", message: "", image: emptyImage, collaboration: { enabled: false, title: "", description: "", button_label: "" } };
export const eventBaseSchema = z.object({
  id: z.uuid(), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  status: z.enum(["draft", "published", "archived"]), title: text(180).min(1), subtitle: text(250),
  organizer: text(250), greeting: text(150), introduction: text(5000), closing: text(2000),
  starts_at: timestamp, ends_at: optionalTime, timezone: z.enum(eventTimezones, "Pilih zona waktu WIB, WITA, atau WIT."),
  venue_name: text(200), address: text(1000), location_url: httpsUrl, location_embed_url: locationEmbed.default(""), location_display: z.enum(["manual", "embed"]).optional(), arrival_notes: text(2000),
  review_url: httpsUrl, review_enabled: z.boolean(), review_heading: text(200).default(""), review_description: text(1000).default(""), review_button_label: text(100).default(""), rsvp_enabled: z.boolean(), rsvp_closes_at: optionalTime,
  invitation_mode: z.enum(["open", "personal"]).default("open"),
  feedback_enabled: z.boolean(), feedback_opens_at: optionalTime, feedback_description: text(1000).default(""),
  contact: contactSchema.default({ name: "", phone: "", channel: "whatsapp", heading: "", description: "", role: "", organization: "" }),
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
  event_kind: z.enum(["kunjungan", "acara", "program"]).default("acara"),
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
  ];
  for (const [path, image] of photos) {
    if (image.url && !image.alt) issue([...path, "alt"], "Isi deskripsi foto.");
    if (!image.url && image.srcset.length) issue([...path, "srcset"], "Ukuran foto tidak boleh ada tanpa foto.");
  }
  const locationDisplay = event.location_display ?? (event.location_embed_url ? "embed" : "manual");
  if (locationDisplay === "embed" && !event.location_embed_url) issue(["location_embed_url"], "Isi kode sematan Google Maps.");
  if (event.status === "published") {
    for (const key of ["organizer", "introduction"] as const) if (!event[key]) issue([key], "Lengkapi sebelum publikasi.");
    if (locationDisplay === "manual") for (const key of ["venue_name", "address", "location_url"] as const) if (!event[key]) issue([key], "Lengkapi sebelum publikasi.");
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
