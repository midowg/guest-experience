import { z } from "zod";
import { clock, shortDate, t, type Lang } from "@/lib/main-wam/i18n";
import { wibDate, wibTime } from "@/lib/main-wam/rundown";

/*
 * The rules (TNC, "syarat dan ketentuan") of a photo mission: a structured list that the phone shows as
 * chips and as a checklist, that the server checks (the ones it can check without AI, in
 * checkRules) and that the verifier reads (pose / object, tags, place). Pure: no server, no clock of
 * its own. A rule is one of:
 *   foto_langsung  the photo comes from the app's camera (no gallery)
 *   lokasi         {name, latitude, longitude, radiusM}: the photo is taken inside the circle
 *   tag            {count, relation, required}: friends tagged in the photo; relation says who
 *   pose           {label, text}: what the photo must show (read by the verifier; shown to people)
 *   waktu          {start, end}: when the mission counts (ISO instants)
 *   batas_kali     {times}: how many times a person may send a proof (a rejected one counts)
 */

export const TAG_RELATIONS = ["bod", "sebangku", "sekamar", "departemen_lain", "siapa_saja"] as const;
export type TagRelation = (typeof TAG_RELATIONS)[number];
export const TAG_MAX = 6;
export const RULE_TYPES = ["foto_langsung", "lokasi", "tag", "pose", "waktu", "batas_kali"] as const;
export type RuleType = (typeof RULE_TYPES)[number];

const iso = z.iso.datetime({ offset: true, message: "Tanggal dan jam belum lengkap." });

export const ruleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("foto_langsung") }).strict(),
  z.object({
    type: z.literal("lokasi"),
    name: z.string().trim().min(2, "Nama tempat minimal 2 huruf.").max(100, "Nama tempat paling banyak 100 karakter."),
    latitude: z.number("Isi garis lintang.").min(-90, "Garis lintang di antara -90 dan 90.").max(90, "Garis lintang di antara -90 dan 90."),
    longitude: z.number("Isi garis bujur.").min(-180, "Garis bujur di antara -180 dan 180.").max(180, "Garis bujur di antara -180 dan 180."),
    radiusM: z.number("Isi radius.").int("Radius berupa bilangan bulat.").min(10, "Radius paling kecil 10 m.").max(5000, "Radius paling besar 5.000 m."),
  }).strict(),
  z.object({
    type: z.literal("tag"),
    count: z.number("Isi jumlah orang.").int("Jumlah berupa bilangan bulat.").min(1, "Minimal 1 orang.").max(TAG_MAX, `Paling banyak ${TAG_MAX} orang.`),
    relation: z.enum(TAG_RELATIONS, "Pilih hubungan orang yang ditandai."),
    /** false: tagging is welcome but not needed (up to `count` people). */
    required: z.boolean().default(true),
  }).strict(),
  z.object({
    type: z.literal("pose"),
    label: z.string().trim().min(2, "Label minimal 2 huruf.").max(40, "Label paling banyak 40 karakter."),
    text: z.string().trim().min(2, "Tulis apa yang harus tampak di foto.").max(200, "Paling banyak 200 karakter."),
  }).strict(),
  z.object({ type: z.literal("waktu"), start: iso.nullable().default(null), end: iso.nullable().default(null) }).strict()
    .refine(rule => rule.start !== null || rule.end !== null, { message: "Isi jam mulai atau jam akhir.", path: ["end"] })
    .refine(rule => !rule.start || !rule.end || Date.parse(rule.end) > Date.parse(rule.start), { message: "Jam akhir harus setelah jam mulai.", path: ["end"] }),
  z.object({ type: z.literal("batas_kali"), times: z.number("Isi batas kirim.").int("Batas berupa bilangan bulat.").min(1, "Minimal 1 kali.").max(10, "Paling banyak 10 kali.") }).strict(),
]);
export type MissionRule = z.infer<typeof ruleSchema>;

/** A list holds each type once (except none: every type is once), at most one tag rule. */
export const rulesSchema = z.array(ruleSchema).max(10, "Paling banyak 10 aturan.").superRefine((rules, context) => {
  const seen = new Set<string>();
  rules.forEach((rule, index) => {
    if (seen.has(rule.type)) context.addIssue({ code: "custom", path: [index], message: "Setiap jenis aturan cukup satu." });
    seen.add(rule.type);
  });
});

/** What a participant's phone gets: the place has a name and a radius, never the point (trilateration). */
export type PublicRule = Exclude<MissionRule, { type: "lokasi" }> | { type: "lokasi"; name: string; radiusM: number };
export const publicRules = (rules: readonly MissionRule[]): PublicRule[] =>
  rules.map(rule => (rule.type === "lokasi" ? { type: "lokasi" as const, name: rule.name, radiusM: rule.radiusM } : rule));

/** A stored rules value (jsonb) → rules; anything odd is dropped rule by rule, never throws. */
export function parseRules(value: unknown): MissionRule[] {
  if (!Array.isArray(value)) return [];
  const out: MissionRule[] = [];
  for (const item of value) {
    const parsed = ruleSchema.safeParse(item);
    if (parsed.success && !out.some(rule => rule.type === parsed.data.type)) out.push(parsed.data);
  }
  return out;
}

/** The fields of a mission the rules are read with (the legacy columns stand in for rules that are not there). */
export type RuleSource = {
  kind: string; rules: readonly MissionRule[]; placeName: string; latitude: number | null; longitude: number | null; radiusM: number | null;
  opensAt: string | null; closesAt: string | null;
};

/**
 * The mission's rules as they apply: the saved list, plus what the older columns say (a place, a window)
 * when the list lacks it, and for a photo mission the camera and "once". Order is fixed: how the sheet
 * and the chips read.
 */
export function effectiveRules(source: RuleSource, defaultRadiusM = 50): MissionRule[] {
  const own = new Map(source.rules.map(rule => [rule.type, rule] as const));
  const out: MissionRule[] = [];
  if (source.kind === "foto") out.push(own.get("foto_langsung") ?? { type: "foto_langsung" });
  const lokasi = own.get("lokasi") ?? (source.latitude !== null && source.longitude !== null
    ? { type: "lokasi" as const, name: source.placeName || "", latitude: source.latitude, longitude: source.longitude, radiusM: source.radiusM ?? defaultRadiusM } : null);
  if (lokasi) out.push(lokasi);
  const tag = own.get("tag"); if (tag) out.push(tag);
  const pose = own.get("pose"); if (pose) out.push(pose);
  const waktu = own.get("waktu") ?? (source.opensAt || source.closesAt ? { type: "waktu" as const, start: source.opensAt, end: source.closesAt } : null);
  if (waktu) out.push(waktu);
  const batas = own.get("batas_kali"); if (batas) out.push(batas);
  return out;
}

/** The tag rule of a list, if any. */
export const tagRuleOf = (rules: readonly { type: string }[]) => rules.find((rule): rule is Extract<MissionRule, { type: "tag" }> => rule.type === "tag") ?? null;
export const timesOf = (rules: readonly { type: string }[]) => rules.find((rule): rule is Extract<MissionRule, { type: "batas_kali" }> => rule.type === "batas_kali")?.times ?? null;

/* ── Words ────────────────────────────────────────────────────────────────────────────────────── */

export type RuleIcon = "camera" | "map-pin" | "users" | "clock" | "tag" | "pose" | "repeat";
export type RuleDisplay = { key: string; type: RuleType; icon: RuleIcon; chips: string[]; title: string; note: string };

const when = (lang: Lang, instant: string) => `${shortDate(lang, wibDate(instant))} ${clock(lang, wibTime(instant))}`;

/** Chips and the sheet's lines for one rule (the same list drives both). */
export function ruleDisplay(rule: PublicRule, lang: Lang = "id"): RuleDisplay {
  switch (rule.type) {
    case "foto_langsung":
      return { key: rule.type, type: rule.type, icon: "camera", chips: [t(lang, "misi.req.photo"), t(lang, "misi.req.location")], title: t(lang, "misi.rule.photo.title"), note: t(lang, "misi.rule.photo.note") };
    case "lokasi": {
      const name = rule.name || t(lang, "misi.place.generic");
      return { key: rule.type, type: rule.type, icon: "map-pin", chips: [t(lang, "misi.req.at", { place: name })], title: t(lang, "misi.rule.place.title"), note: t(lang, "misi.rule.place.photoNote", { radius: rule.radiusM, place: name }) };
    }
    case "tag": {
      const optional = !rule.required;
      return { key: rule.type, type: rule.type, icon: "tag", chips: [t(lang, optional ? `misi.tag.chip.${rule.relation}.opt` as const : `misi.tag.chip.${rule.relation}` as const, { n: rule.count })],
        title: t(lang, optional ? "misi.tag.rule.optional" : "misi.tag.rule.title", { n: rule.count, who: t(lang, `misi.tag.who.${rule.relation}` as const, { n: rule.count }) }), note: t(lang, `misi.tag.note.${rule.relation}` as const, { n: rule.count }) };
    }
    case "pose":
      return { key: rule.type, type: rule.type, icon: "pose", chips: [rule.label], title: rule.label, note: rule.text };
    case "waktu": {
      const chip = rule.end ? t(lang, "misi.req.until", { when: when(lang, rule.end) }) : t(lang, "misi.req.from", { when: when(lang, rule.start as string) });
      const title = rule.end ? t(lang, "misi.rule.window.until", { when: when(lang, rule.end) }) : t(lang, "misi.rule.window.from", { when: when(lang, rule.start as string) });
      return { key: rule.type, type: rule.type, icon: "clock", chips: [chip], title, note: rule.start && rule.end ? t(lang, "misi.rule.window.between", { from: when(lang, rule.start), to: when(lang, rule.end) }) : "" };
    }
    case "batas_kali":
      return { key: rule.type, type: rule.type, icon: "repeat", chips: [t(lang, "misi.req.max", { n: rule.times })], title: t(lang, "misi.rule.max.title", { n: rule.times }), note: t(lang, "misi.rule.max.note") };
  }
}
export const ruleDisplays = (rules: readonly PublicRule[], lang: Lang = "id") => rules.map(rule => ruleDisplay(rule, lang));

/* ── The checks the server can make without AI ───────────────────────────────────────────────── */

/** A person who could be tagged, with what is known about them (the server fills it; nothing private). */
export type TagCandidate = { id: string; name: string; department: string; bod: boolean; seatmate: boolean; roommate: boolean };
export type RuleCheck = {
  type: RuleType;
  /** true / false, or null: not for this check (the verifier reads it: pose). */
  ok: boolean | null;
  /** Indonesian, shown to the person (a violation is the reason of a rejection). */
  reason: string;
};
export type CheckContext = {
  now: Date;
  /** Where the person stood: inside the mission's circle, or not; null when no place is asked or it is not known (yet). */
  inside: boolean | null;
  /** The people tagged (already looked up: a person who is not an active participant never gets here). */
  tags: readonly TagCandidate[];
  submitter: { id: string; department: string };
  /** How many proofs this person has sent for the mission before this one. */
  previous: number;
  /** The photo is a live camera shot (always true on this server path; the field keeps the rule honest). */
  live?: boolean;
};

const RELATION_WORDS: Record<TagRelation, string> = {
  bod: "anggota BOD", sebangku: "teman sebangku di kereta", sekamar: "teman sekamar", departemen_lain: "rekan dari departemen berbeda", siapa_saja: "teman",
};

/** Does the tag rule hold for these people? A reason when it does not. */
export function tagProblem(rule: Extract<MissionRule, { type: "tag" }>, tags: readonly TagCandidate[], submitter: { id: string; department: string }): string | null {
  const need = rule.required ? rule.count : 0;
  const unique = new Set(tags.map(tag => tag.id));
  if (unique.size !== tags.length || tags.some(tag => tag.id === submitter.id)) return "Tag tidak boleh berisi dirimu sendiri atau orang yang sama dua kali.";
  if (tags.length > rule.count) return `Paling banyak ${rule.count} orang yang ditandai.`;
  if (tags.length < need) return `Tandai ${rule.count} ${RELATION_WORDS[rule.relation]} (baru ${tags.length}).`;
  const wrong = (test: (tag: TagCandidate) => boolean) => tags.some(tag => !test(tag));
  switch (rule.relation) {
    case "bod": return wrong(tag => tag.bod) ? "Orang yang ditandai harus anggota BOD." : null;
    case "sebangku": return wrong(tag => tag.seatmate) ? "Orang yang ditandai harus teman sebangkumu di kereta." : null;
    case "sekamar": return wrong(tag => tag.roommate) ? "Orang yang ditandai harus teman sekamarmu." : null;
    case "departemen_lain": {
      const departments = tags.map(tag => tag.department.trim().toLowerCase());
      if (departments.some(department => !department || department === submitter.department.trim().toLowerCase())) return "Orang yang ditandai harus dari departemen selain departemenmu.";
      return new Set(departments).size !== departments.length ? "Orang yang ditandai harus dari departemen yang berbeda satu sama lain." : null;
    }
    case "siapa_saja": return null;
  }
}

/** Every rule against what is known now; `ok` when none is false. Deterministic: the same input, the same answer. */
export function checkRules(rules: readonly (MissionRule | PublicRule)[], context: CheckContext): { checks: RuleCheck[]; ok: boolean; reasons: string[] } {
  const checks: RuleCheck[] = rules.map((rule): RuleCheck => {
    switch (rule.type) {
      case "foto_langsung": return context.live === false ? { type: rule.type, ok: false, reason: "Foto harus langsung dari kamera aplikasi." } : { type: rule.type, ok: true, reason: "" };
      case "lokasi": return context.inside === false ? { type: rule.type, ok: false, reason: `Foto tidak diambil di ${rule.name || "lokasi misi"}.` } : { type: rule.type, ok: context.inside === null ? null : true, reason: "" };
      case "tag": { const problem = tagProblem(rule, context.tags, context.submitter); return { type: rule.type, ok: problem === null, reason: problem ?? "" }; }
      case "pose": return { type: rule.type, ok: null, reason: "" };
      case "waktu": {
        const at = context.now.getTime();
        if (rule.start && Date.parse(rule.start) > at) return { type: rule.type, ok: false, reason: "Misi ini belum dibuka." };
        if (rule.end && Date.parse(rule.end) <= at) return { type: rule.type, ok: false, reason: "Misi ini sudah ditutup." };
        return { type: rule.type, ok: true, reason: "" };
      }
      case "batas_kali": return context.previous >= rule.times ? { type: rule.type, ok: false, reason: `Batas kirim ${rule.times} kali sudah tercapai.` } : { type: rule.type, ok: true, reason: "" };
    }
  });
  return { checks, ok: checks.every(check => check.ok !== false), reasons: checks.filter(check => check.ok === false).map(check => check.reason) };
}
