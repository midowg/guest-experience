import type { Lang } from "./index";

/*
 * Words of the office-visit page (VisitExperience, board 11 in docs/journey-platform.pen). Kept
 * here rather than in dictionary.ts, which is generated from docs/wording-draf.xlsx: these belong
 * to one layout only, and move into the sheet once the layout settles.
 */
const id = {
  "tabs.label": "Navigasi kunjungan",
  "tab.home": "Beranda", "tab.route": "Cara datang", "tab.schedule": "Jadwal", "tab.contact": "Kontak",
  "back": "Kembali ke Beranda",
  "home.hello": "Halo, {name}",
  "home.welcome": "Selamat datang di Werkudara",
  "home.lead": "Kami senang Anda akan berkunjung. Semua yang perlu Anda tahu sebelum datang ada di sini.",
  "home.deadline": "Mohon konfirmasi sebelum {when}",
  "home.route": "Lihat cara datang",
  "home.explore": "Jelajahi",
  "home.share": "Tautan ini boleh dibagikan ke rombongan Anda. Setiap orang mengisi namanya sendiri saat konfirmasi.",
  "home.for": "Undangan untuk {name}",
  "home.remembered": "Terkonfirmasi atas nama {name}",
  "home.remembered.no": "Tercatat berhalangan atas nama {name}",
  "home.remembered.note": "Perangkat ini mengingat konfirmasi Anda.",
  "home.other": "Konfirmasi atas nama lain",
  "tile.about": "Tentang kunjungan", "tile.about.sub": "Tujuan dan topik yang dibahas",
  "tile.agenda": "Rundown", "tile.agenda.sub": "Jam dan tempat tiap sesi",
  "tile.team": "Kenali Tim Werkudara", "tile.team.sub": "Sedikit tentang kami",
  "tile.experience": "Pengalaman kunjungan", "tile.experience.sub": "Suasana yang kami siapkan",
  "tile.prepare": "Persiapan", "tile.prepare.sub": "Yang perlu Anda siapkan",
  "about.why": "Kenapa kami mengundang Anda",
  "about.topics": "Yang akan dibahas",
  "about.agenda": "Jam dan tempat tiap sesi ada di Rundown.",
  "schedule.title": "Rundown kunjungan",
  "schedule.note": "Jadwal bisa berubah; halaman ini selalu menampilkan yang terbaru.",
  "team.lead": "Sedikit tentang kami",
  "contact.lead": "Ada pertanyaan sebelum atau saat kunjungan? Tanya kami kapan saja.",
  "contact.host": "Pendamping kunjungan Anda",
  "contact.ask": "Tanya kami", "contact.call": "Telepon",
  "thanks.survey": "Bagaimana kunjungan Anda?",
};
type VisitWords = Record<keyof typeof id, string>;
const en: VisitWords = {
  "tabs.label": "Visit navigation",
  "tab.home": "Home", "tab.route": "Getting here", "tab.schedule": "Schedule", "tab.contact": "Contact",
  "back": "Back to Home",
  "home.hello": "Hello, {name}",
  "home.welcome": "Welcome to Werkudara",
  "home.lead": "We're glad you're coming. Everything you need to know before you arrive is here.",
  "home.deadline": "Please confirm before {when}",
  "home.route": "See how to get here",
  "home.explore": "Explore",
  "home.share": "You may share this link with your group. Everyone fills in their own name when they confirm.",
  "home.for": "Invitation for {name}",
  "home.remembered": "Confirmed for {name}",
  "home.remembered.no": "Noted as unable to attend for {name}",
  "home.remembered.note": "This device remembers your confirmation.",
  "home.other": "Confirm for someone else",
  "tile.about": "About the visit", "tile.about.sub": "Purpose and topics",
  "tile.agenda": "Schedule", "tile.agenda.sub": "Time and place of each session",
  "tile.team": "Meet the Werkudara team", "tile.team.sub": "A little about us",
  "tile.experience": "Your visit", "tile.experience.sub": "What we have prepared",
  "tile.prepare": "Before you come", "tile.prepare.sub": "What to prepare",
  "about.why": "Why we invited you",
  "about.topics": "What we'll discuss",
  "about.agenda": "The time and place of each session are in the Schedule.",
  "schedule.title": "Visit schedule",
  "schedule.note": "The schedule may change; this page always shows the latest.",
  "team.lead": "A little about us",
  "contact.lead": "Any questions before or during your visit? Ask us any time.",
  "contact.host": "Your visit host",
  "contact.ask": "Ask us", "contact.call": "Call",
  "thanks.survey": "How was your visit?",
};

export type VisitKey = keyof typeof id;
const words: Record<Lang, VisitWords> = { id, en };

export function visitText(lang: Lang, key: VisitKey, vars: Record<string, string | number> = {}): string {
  return words[lang][key].replace(/\{(\w+)\}/g, (match, name: string) => name in vars ? String(vars[name]) : match);
}
