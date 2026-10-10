import { z } from "zod";
import { EMBED_ERROR, parseLocationEmbed } from "./location-embed";

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
export const eventBaseSchema = z.object({
  id: z.uuid(), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  status: z.enum(["draft", "published", "archived"]), title: text(180).min(1), subtitle: text(250),
  organizer: text(250), greeting: text(150), introduction: text(5000), closing: text(2000),
  starts_at: timestamp, ends_at: optionalTime, timezone: z.literal("Asia/Jakarta"),
  venue_name: text(200), address: text(1000), location_url: httpsUrl, location_embed_url: locationEmbed.default(""), location_display: z.enum(["manual", "embed"]).optional(), arrival_notes: text(2000),
  review_url: httpsUrl, review_enabled: z.boolean(), rsvp_enabled: z.boolean(), rsvp_closes_at: optionalTime,
  feedback_enabled: z.boolean(), feedback_opens_at: optionalTime,
  sections: z.array(z.object({ key: z.enum(["about", "agenda", "location", "rsvp", "feedback"]), enabled: z.boolean() })).max(5),
  topics: z.array(z.object({ title: text(200).min(1), description: text(1500) })).max(20),
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
  created_at: timestamp, updated_at: timestamp,
});
export const eventSchema = eventBaseSchema.superRefine((event, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  if (new Set(event.sections.map(s => s.key)).size !== event.sections.length) issue(["sections"], "Bagian tidak boleh berulang.");
  if (event.ends_at && Date.parse(event.ends_at) <= Date.parse(event.starts_at)) issue(["ends_at"], "Waktu selesai harus setelah waktu mulai.");
  for (const [index, item] of event.agenda.entries()) if (Date.parse(item.ends_at) <= Date.parse(item.starts_at)) issue(["agenda", index, "ends_at"], "Waktu selesai harus setelah waktu mulai.");
  for (const key of ["agenda", "feedback_questions", "gallery"] as const) if (new Set(event[key].map(i => i.id)).size !== event[key].length) issue([key], "ID tidak boleh berulang.");
  for (const [index, q] of event.feedback_questions.entries()) if (q.kind === "choice" && (q.options.length < 2 || new Set(q.options).size !== q.options.length)) issue(["feedback_questions", index, "options"], "Isi minimal dua pilihan berbeda.");
  if (!event.hero.url && event.hero.srcset.length) issue(["hero", "srcset"], "Ukuran foto tidak boleh ada tanpa foto latar.");
  const locationDisplay = event.location_display ?? (event.location_embed_url ? "embed" : "manual");
  if (locationDisplay === "embed" && !event.location_embed_url) issue(["location_embed_url"], "Isi kode sematan Google Maps.");
  if (event.status === "published") {
    for (const key of ["organizer", "introduction"] as const) if (!event[key]) issue([key], "Lengkapi sebelum publikasi.");
    if (locationDisplay === "manual") for (const key of ["venue_name", "address", "location_url"] as const) if (!event[key]) issue([key], "Lengkapi sebelum publikasi.");
    if (event.feedback_enabled && !event.feedback_questions.length) issue(["feedback_questions"], "Isi pertanyaan sebelum mengaktifkan survei.");
    if (event.review_enabled && !event.review_url) issue(["review_url"], "Isi tautan review resmi.");
  }
}).transform(event => ({ ...event, location_display: event.location_display ?? (event.location_embed_url ? "embed" : "manual") }));
export const rsvpSchema = z.object({
  name: text(150).min(2, "Isi nama lengkap."), organization: text(200).min(1, "Isi instansi atau komunitas."),
  attendance: z.enum(["yes", "no"]), phone: text(30).refine(v => !v || /^[+\d\s().-]{6,30}$/.test(v), "Periksa nomor telepon."),
  email: z.union([z.literal(""), z.email().max(254)]), has_allergy: z.boolean(), allergy_details: text(1000),
  consent: z.literal(true, { error: "Persetujuan penggunaan data diperlukan." }), website: z.string().max(0), idempotency_key: z.uuid(),
}).superRefine((v, ctx) => {
  if (v.attendance === "yes" && v.has_allergy && !v.allergy_details) ctx.addIssue({ code: "custom", path: ["allergy_details"], message: "Jelaskan alergi makanan yang perlu diperhatikan." });
}).transform(v => ({ ...v, has_allergy: v.attendance === "yes" && v.has_allergy, allergy_details: v.attendance === "yes" && v.has_allergy ? v.allergy_details : "" }));
export const feedbackSchema = z.object({ idempotency_key: z.uuid(), website: z.string().max(0), answers: z.array(z.object({ question_id: z.uuid(), value: text(3000) })).max(30) }).refine(v => new Set(v.answers.map(a => a.question_id)).size === v.answers.length, "Pertanyaan tidak boleh dijawab dua kali.");
