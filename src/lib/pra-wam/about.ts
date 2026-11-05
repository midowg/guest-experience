import { z } from "zod";

/*
 * "Apa itu WAM?": a short text the super admin writes (migration 202611040008), shown as a card on
 * Beranda and in full on its own screen. Plain text only: paragraphs are split here and rendered
 * as text, never as HTML. Until the super admin saves one, a default built from the events applies.
 * The default follows "WAM Werkudara Group: Panduan Umum" (5 Nov 2026), in short; the full guide
 * is a general document (Dokumen umum) titled WAM_GUIDE_TITLE, offered for download under the text.
 */

/** The general document with this title is the guide "Apa itu WAM?" offers for download; the newest wins. */
export const WAM_GUIDE_TITLE = "Panduan Umum WAM";
export type AboutGuide = { id: string; filename: string; size: number };

export const ABOUT_LIMITS = { title: 80, summary: 220, body: 4000, points: 6, point: 120 } as const;

export type About = {
  title: string; summary: string; body: string; points: string[];
  /** Only for showing: the guide to download, when one is uploaded. Never saved with the text. */
  guide?: AboutGuide | null;
};
type EventDates = { kind: "pra_wam" | "wam"; name: string; startDate: string; endDate: string };

/** Line endings, spaces at line ends and runs of blank lines tidied; blank points dropped. */
export function cleanAbout(input: About): About {
  const text = (value: string) => value.replace(/\r\n?/g, "\n").split("\n").map(line => line.trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return {
    title: text(input.title).replace(/\s+/g, " "),
    summary: text(input.summary).replace(/\s+/g, " "),
    body: text(input.body),
    points: input.points.map(point => point.replace(/\s+/g, " ").trim()).filter(Boolean),
  };
}

const field = (label: string, min: number, max: number) => z.string()
  .min(min, `${label} minimal ${min} karakter.`)
  .max(max, `${label} maksimal ${max} karakter.`);

/** What the super admin may save, after cleanAbout. */
export const aboutSchema = z.object({
  title: field("Judul", 2, ABOUT_LIMITS.title),
  summary: field("Ringkasan", 10, ABOUT_LIMITS.summary),
  body: field("Isi", 20, ABOUT_LIMITS.body),
  points: z.array(field("Poin", 2, ABOUT_LIMITS.point)).max(ABOUT_LIMITS.points, `Maksimal ${ABOUT_LIMITS.points} poin penting.`),
});

/** The raw request body: strings, cleaned and then checked against aboutSchema. */
export const aboutInputSchema = z.object({
  title: z.string().max(400), summary: z.string().max(1000), body: z.string().max(8000),
  points: z.array(z.string().max(400)).max(20),
}).transform(cleanAbout).pipe(aboutSchema);

/** Per field, the first problem, for the editor to show beside the field ("points" for any point). */
export function aboutProblems(input: About): Partial<Record<keyof About, string>> {
  const result = aboutSchema.safeParse(cleanAbout(input));
  if (result.success) return {};
  const problems: Partial<Record<keyof About, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] as keyof About;
    if (key && !problems[key]) problems[key] = issue.path.length > 1 ? `Poin ${Number(issue.path[1]) + 1}: ${issue.message}` : issue.message;
  }
  return problems;
}

/** The body's paragraphs: split at blank lines; single line breaks stay inside a paragraph. */
export const aboutParagraphs = (body: string) => body.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);

/** "Kapan: 4–7 Jan 2027" reads as a label and its text; a point without a short label is just text. */
export function pointParts(point: string): { label: string | null; text: string } {
  const match = /^([^:]{1,30}):\s+(\S.*)$/.exec(point.trim());
  return match ? { label: match[1].trim(), text: match[2].trim() } : { label: null, text: point.trim() };
}

/** "28 Okt – 23 Des 2026", "4–7 Jan 2027", "5 Jan 2027" (dates are plain YYYY-MM-DD). */
export function dateRange(start: string, end: string): string {
  const part = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const [sy, sm] = start.split("-"), [ey, em] = end.split("-");
  const endLabel = part(end, { day: "numeric", month: "short", year: "numeric" });
  if (start === end) return endLabel;
  if (sy === ey && sm === em) return `${part(start, { day: "numeric" })}–${endLabel}`;
  return `${part(start, sy === ey ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })} – ${endLabel}`;
}

/** What the app already says about itself, with the dates the events hold. */
export function defaultAbout(events: EventDates[]): About {
  const pra = events.find(event => event.kind === "pra_wam");
  const wam = events.find(event => event.kind === "wam");
  const wamName = wam?.name ?? "WAM 2027";
  return {
    title: "Apa itu WAM?",
    summary: "WAM (Werkudara Annual Meeting) adalah rangkaian pertemuan tahunan internal Werkudara Group untuk meninjau kinerja, menyepakati arah perusahaan, dan menyelaraskan rencana kerja serta anggaran.",
    body: [
      "WAM meninjau kinerja, mengevaluasi pelaksanaan kerja, menyepakati arah dan prioritas perusahaan, serta menyelaraskan rencana kerja dan anggaran untuk periode berikutnya.",
      "Rangkaian ini menghubungkan evaluasi individu, pembahasan dalam departemen, koordinasi antar departemen, dan keputusan pimpinan, agar setiap orang memahami kontribusinya terhadap tujuan bersama.",
      "Alurnya: evaluasi individu dan tim, sinkronisasi lintas departemen, pembahasan bersama pimpinan, lalu penyelarasan seluruh tim dengan ruang masukan bagi karyawan. Hasilnya dicatat dengan penanggung jawab dan tenggat, lalu menjadi dasar pelaksanaan kerja.",
      `Sebelum ${wamName} ada Pra WAM: beberapa minggu berisi forum, rapat, dan appraisal. Di aplikasi ini kamu bisa melihat agenda dan sesi yang kamu ikuti, absen, membaca dokumen dan pengumuman dari panitia, serta book ruang. Jadwal diatur panitia; setiap perubahan dikabarkan lewat notifikasi.`,
    ].join("\n\n"),
    points: [
      ...(pra ? [`Pra WAM: ${dateRange(pra.startDate, pra.endDate)}, forum, rapat, dan appraisal`] : []),
      ...(wam ? [`${wam.name}: ${dateRange(wam.startDate, wam.endDate)}`] : []),
      "SMM: forum pimpinan untuk keuangan, arah dan keberlanjutan perusahaan, serta bisnis dan investasi",
      "OPM: forum tim untuk appraisal, evaluasi departemen (ITAM), dan sinkronisasi antar departemen (ITEM)",
      "Yang ikut: BOD, HOD/leader, dan anggota tim Werkudara",
    ],
  };
}
