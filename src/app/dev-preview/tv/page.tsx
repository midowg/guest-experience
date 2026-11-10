import { notFound } from "next/navigation";
import { TvBoard } from "@/components/tv/TvBoard";
import { tvQrPositions, weekOf, type TvDay, type TvFeed, type TvQrPosition, type TvRoom } from "@/lib/pra-wam/tv";

export const dynamic = "force-dynamic";

const DATE = "2026-11-10";
const at = (date: string, time: string) => `${date}T${time}:00+07:00`;
const entry = (date: string, key: string, title: string, by: string, start: string, end: string) => ({ key: `${date}-${key}`, title, by, start, end, startsAt: at(date, start), endsAt: at(date, end) });
const poster = (label: string, width: number, height: number, fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/><text x="50%" y="50%" fill="#fff" font-family="sans-serif" font-size="${Math.round(height / 10)}" text-anchor="middle">${label}</text></svg>`)}`;

const few = (date: string, index: number): TvRoom[] => [
  { id: "a", name: "Nagapadma", entries: [entry(date, "a1", "Appraisal 1-on-1", "SM - Contoh Satu", "09:00", "10:00"), entry(date, "a2", "Review data departemen", "CoE - Contoh Dua", "10:00", "12:30"), entry(date, "a3", "Rekonsiliasi ACC", "BAS - Contoh Tiga", "14:00", "15:30")] },
  { id: "b", name: "Vasuki", entries: [entry(date, "b1", "HOD Meeting", "", "10:30", "12:00")] },
  { id: "c", name: "Limasan", entries: [entry(date, "c1", "Forum Pra WAM: Sales & Marketing dengan judul yang sangat panjang sekali", "SM - Contoh Empat", "13:00", "17:00")] },
].slice(0, index === 3 ? 0 : 1 + (index % 3));
const many = (date: string): TvRoom[] => Array.from({ length: 14 }, (_, room) => ({
  id: `r${room}`, name: `Ruang ${room + 1}`,
  entries: Array.from({ length: 1 + (room % 3) }, (_, index) => entry(date, `r${room}-${index}`, `Rapat ${index + 1} ruang ${room + 1}`, "TEE - Contoh Lima",
    `${String(8 + ((room + index * 3) % 9)).padStart(2, "0")}:00`, `${String(9 + ((room + index * 3) % 9)).padStart(2, "0")}:30`)),
}));

/**
 * Layout check for the TV board without a TV key or the database: ?isi=banyak for a full day and
 * week (14 rooms), ?isi=kosong for no room in use, ?isi=gambar for pictures only, ?isi=sambutan for
 * two guests being welcomed (one with a cover photo, one typed), and
 * ?tema=werkudara for the Werkudara theme (Dream Out Loud otherwise), ?mode=terang for light, and
 * ?qr=kanan-bawah (or another corner) for the QR code. The clock is
 * fixed at 10.15 WIB on Tuesday 10 Nov 2026, so the "now" line and "Sedang berlangsung" show.
 */
export default async function DevTvPage({ searchParams }: { searchParams: Promise<{ isi?: string; tema?: string; mode?: string; qr?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { isi, tema, mode, qr } = await searchParams;
  const days: TvDay[] = weekOf(DATE).map((date, index) => ({ date, rooms: isi === "kosong" || index > 4 ? [] : isi === "banyak" ? many(date) : few(date, index === 1 ? 2 : index) }));
  const feed: TvFeed = {
    now: at(DATE, "10:15"), date: DATE, days,
    slides: isi === "kosong" ? [] : [
      { id: "s1", title: "Poster mendatar", seconds: 5, src: poster("Mendatar 16:9", 1920, 1080, "#006EC1") },
      { id: "s2", title: "Poster tegak", seconds: 5, src: poster("Tegak 4:5", 1080, 1350, "#7a4b00") },
    ],
    settings: {
      showDay: isi !== "gambar", daySeconds: 8, showWeek: isi !== "gambar", weekSeconds: 8,
      mode: mode === "terang" ? "light" : "dark", qrShow: !!qr, qrUrl: "", qrLabel: qr ? "Pindai untuk membuka" : "",
      qrPosition: (tvQrPositions as readonly string[]).includes(qr ?? "") ? qr as TvQrPosition : "kanan-bawah",
    },
    look: tema === "werkudara" ? "werkudara" : "dream",
    // Pra WAM's countdown (10 Nov 2026): Appraisal ends on Friday 20 Nov.
    ...(isi === "sambutan" ? {
      playlist: [{ id: "w", kind: "sambutan" as const, title: "", body: "", seconds: 8 }, { id: "t", kind: "tamu" as const, title: "Contoh Satu", body: "Terima kasih sudah berkunjung ke kantor kami.", seconds: 8 }],
      welcomes: [{ id: "v1", name: "PT Contoh Dua Sejahtera", greeting: "Selamat datang di Werkudara", note: "", hours: "10.00–12.00 WIB", place: "Kantor Werkudara", image: poster("Foto sampul", 1920, 1080, "#35506b") }],
    } : {}),
    countdown: isi === "kosong" ? null : { entry: { id: "appraisal", title: "Appraisal: isi form & 1-on-1", color: 0 }, edge: "berakhir", date: "2026-11-20", left: "10 hari lagi", next: { title: "HOD Meeting", date: "2026-11-24" } },
  };
  return <TvBoard initial={feed} />;
}
