import { templateContent } from "@/lib/wording/template-content";

/** Every Indonesian starting text the templates use for one field, without repeats. */
function fromTemplates(field: string, part?: (text: string) => string): string[] {
  const texts = Object.entries(templateContent).filter(([key]) => key.slice(key.indexOf(".") + 1) === field).map(([, value]) => value.id);
  return [...new Set(part ? texts.map(part) : texts)].filter(Boolean);
}
// Template moments are written "Title — description".
const momentTitle = (text: string) => text.split(" — ")[0]?.trim() ?? "";
const momentText = (text: string) => text.split(" — ")[1]?.trim() ?? "";
const moments = ["moment1", "moment2", "moment3"];

export const WERKUDARA_OFFICE = {
  venue_name: "PT. Werkudara",
  address: "Jl. Bhinneka No. 09 RT 03/RW 07, Pondok, Condong Catur, Depok, Sleman",
  location_url: "https://maps.app.goo.gl/ctLcnKszth9QX83AA",
};

/**
 * Fields whose answer is usually one of a few known texts: the editor shows these as chips
 * that replace the field. Keys are field names, with "*" standing for a list position.
 */
export const fieldSuggestions: Record<string, string[]> = {
  greeting: [...new Set([...fromTemplates("greeting"), "Assalamu'alaikum Warahmatullahi Wabarakatuh", "Salam sejahtera untuk kita semua", "Om Swastyastu"])],
  introduction: fromTemplates("intro"),
  closing: fromTemplates("closing"),
  "experience.title": fromTemplates("exp_title"),
  "experience.story": fromTemplates("exp_story"),
  "experience.moments.*.title": [...new Set(moments.flatMap(field => fromTemplates(field, momentTitle)))],
  "experience.moments.*.description": [...new Set(moments.flatMap(field => fromTemplates(field, momentText)))],
  "after.message": fromTemplates("after"),
  "after.title": ["Terima kasih atas kehadiran Anda.", "Sampai jumpa di kesempatan berikutnya."],
  "after.collaboration.title": ["Mari lanjutkan percakapannya", "Tertarik berkolaborasi?"],
  "after.collaboration.button_label": ["Hubungi tim Werkudara", "Diskusikan kolaborasi"],
  "contact.heading": ["Ada pertanyaan?", "Butuh bantuan?", "Hubungi kami"],
  "contact.description": ["Hubungi PIC untuk informasi lebih lanjut.", "Kami siap membantu sebelum dan selama acara."],
  "contact.role": ["Hospitality Specialist", "PIC Acara", "Koordinator Acara", "Panitia"],
  review_heading: ["Berkenan berbagi pengalaman?", "Bagaimana kunjungan Anda?"],
  review_description: ["Ulasan Google sepenuhnya sukarela.", "Ulasan Anda membantu orang lain mengenal Werkudara."],
  review_button_label: ["Bagikan ulasan Anda", "Tulis ulasan di Google"],
  feedback_description: ["Bagikan masukan untuk membantu acara berikutnya.", "Survei singkat, sekitar 2 menit, tanpa nama."],
  "prepare.title": ["Yang perlu Anda ketahui sebelum datang.", "Persiapan sebelum berangkat"],
};

/** Fields that cannot be predicted get an example sentence instead, shown while they are empty. */
export const fieldExamples: Record<string, string> = {
  title: "Contoh: Kunjungan PT Sinar Abadi ke Werkudara",
  subtitle: "Contoh: Perkenalan layanan dan diskusi kerja sama",
  organizer: "Contoh: Tim Hospitality Werkudara",
  greeting: "Contoh: Selamat datang",
  introduction: "Contoh: Dengan senang hati kami mengundang Bapak/Ibu untuk berkunjung ke kantor Werkudara.",
  closing: "Contoh: Terima kasih atas waktu Bapak/Ibu. Sampai jumpa di Werkudara.",
  venue_name: "Contoh: PT. Werkudara atau nama gedung/hotel",
  address: "Contoh: Jl. Bhinneka No. 09, Condong Catur, Depok, Sleman",
  location_url: "Contoh: https://maps.app.goo.gl/…",
  arrival_notes: "Contoh: Parkir mobil tersedia di halaman depan. Lapor ke resepsionis di lantai 1.",
  day_note: "Contoh: Wi-Fi tamu tersedia, tanyakan sandinya ke resepsionis.",
  "topics.*.title": "Contoh: Rencana kerja sama 2027",
  "topics.*.description": "Contoh: Membahas ruang lingkup, jadwal, dan pembagian peran.",
  "agenda.*.title": "Contoh: Sambutan dan perkenalan",
  "agenda.*.description": "Contoh: Disampaikan oleh Direktur Werkudara.",
  "contact.name": "Contoh: Raja Pratama",
  "contact.phone": "Contoh: 0812 3456 7890",
  "contact.organization": "Contoh: Werkudara",
  "experience.story": "Contoh: Kami menyiapkan kunjungan ini seperti menyambut kerabat: santai, hangat, dan penuh percakapan.",
  "prepare.intro": "Contoh: Mohon siapkan beberapa hal berikut sebelum berangkat.",
  "prepare.items.*.description": "Contoh: Batik atau kemeja berkerah. Hindari sandal karena ada sesi jalan kaki.",
  "after.message": "Contoh: Terima kasih telah berkunjung. Kami menantikan kerja sama berikutnya.",
  review_url: "Contoh: https://g.page/r/…/review",
};

/** "experience.moments.2.title" → "experience.moments.*.title", the key used above. */
export function fieldPattern(name: string): string {
  return name.replace(/\.\d+(?=\.|$)/g, ".*");
}

/** Chip text is short; the full sentence goes into the field and the chip's tooltip. */
export function chipLabel(text: string, max = 46): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Template sentences name the event as {nama acara}; fill it from the title when known. */
export function fillSuggestion(text: string, title: string): string {
  return title.trim() ? text.replace(/\{nama (?:acara|program)\}/g, title.trim()) : text;
}
