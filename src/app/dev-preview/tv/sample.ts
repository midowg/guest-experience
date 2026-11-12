import { tvQrPositions, weekOf, type TvDay, type TvFeed, type TvQrPosition, type TvRoom } from "@/lib/pra-wam/tv";

/* Made-up content for the TV board's layout checks (/dev-preview/tv and /dev-preview/tv/lite): no TV key, no database. */

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

export type SampleTvAsk = { isi?: string; tema?: string; mode?: string; qr?: string };

/** The sample board as the query asks (see /dev-preview/tv). The clock is fixed at 10.15 WIB on Tuesday 10 Nov 2026. */
export function sampleTvFeed({ isi, tema, mode, qr }: SampleTvAsk): TvFeed {
  const days: TvDay[] = weekOf(DATE).map((date, index) => ({ date, rooms: isi === "kosong" || index > 4 ? [] : isi === "banyak" ? many(date) : few(date, index === 1 ? 2 : index) }));
  return {
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
    // ?isi=daftar: one of every kind the list can hold, for the lite board (/dev-preview/tv/lite?isi=daftar).
    ...(isi === "daftar" ? {
      playlist: [
        { id: "w", kind: "sambutan" as const, title: "", body: "", seconds: 10, design: "werkudara" },
        { id: "t", kind: "tamu" as const, title: "Pak Contoh Dua", body: "Terima kasih sudah berkunjung ke kantor kami.", seconds: 10, design: "polos" },
        { id: "h", kind: "kalender_hari" as const, title: "", body: "", seconds: 20 },
        { id: "m", kind: "kalender_minggu" as const, title: "", body: "", seconds: 20 },
        { id: "x", kind: "teks" as const, title: "Rapat bulanan", body: "Jumat, 13 November\npukul 14.00 di Limasan", seconds: 10 },
        { id: "s1", kind: "gambar" as const, title: "Poster mendatar", body: "", seconds: 10, src: poster("Mendatar 16:9", 1920, 1080, "#006EC1") },
        { id: "u", kind: "ultah" as const, title: "Contoh Tiga Lengkap", body: "", seconds: 10, call: "Tiga", date: "2026-11-11" },
        { id: "l", kind: "timeline" as const, title: "", body: "", seconds: 10 },
        { id: "p", kind: "pengumuman" as const, title: "", body: "", seconds: 10 },
        { id: "v", kind: "video" as const, title: "Video", body: "dQw4w9WgXcQ", seconds: 10 },
      ],
      welcomes: [{ id: "v1", name: "PT Contoh Dua Sejahtera", greeting: "Selamat datang di Werkudara", note: "", hours: "10.00–12.00 WIB", place: "Kantor Werkudara", image: poster("Foto sampul", 1920, 1080, "#35506b") }],
      timeline: [
        { id: "a", title: "Appraisal: isi form & 1-on-1", when: "28 Okt–20 Nov", hours: null, state: "berlangsung" as const, color: 0, left: "berakhir 9 hari lagi" },
        { id: "b", title: "HOD Meeting", when: "Sel, 24 Nov", hours: "09.00–12.00", state: "akan" as const, color: 1, left: "mulai 13 hari lagi" },
      ],
      notes: [{ id: "n1", title: "Kumpul di lobi", body: "Semua peserta diminta berkumpul di lobi pukul 08.30.", at: at(DATE, "08:00") }],
    } : {}),
    ...(isi === "sambutan" ? {
      playlist: [{ id: "w", kind: "sambutan" as const, title: "", body: "", seconds: 8 }, { id: "t", kind: "tamu" as const, title: "Contoh Satu", body: "Terima kasih sudah berkunjung ke kantor kami.", seconds: 8 }],
      welcomes: [{ id: "v1", name: "PT Contoh Dua Sejahtera", greeting: "Selamat datang di Werkudara", note: "", hours: "10.00–12.00 WIB", place: "Kantor Werkudara", image: poster("Foto sampul", 1920, 1080, "#35506b") }],
    } : {}),
    // ?isi=dua: a TV laid out in two rows, with photos of several shapes running along the bottom.
    ...(isi === "dua" ? { strip: [["Rapat mingguan", 1920, 1280, "#1f5f8b"], ["Forum HOD", 1920, 1080, "#7a4b00"], ["Foto tegak", 1080, 1440, "#2f6f4f"], ["Kunjungan", 1600, 1200, "#6b3fa0"], ["Pelatihan", 1920, 1280, "#a03f4f"]].map(([title, width, height, color], index) => ({ id: `foto-${index}`, title: String(title), src: poster(String(title), Number(width), Number(height), String(color)) })) } : {}),
    countdown: isi === "kosong" ? null : { entry: { id: "appraisal", title: "Appraisal: isi form & 1-on-1", color: 0 }, edge: "berakhir", date: "2026-11-20", left: "10 hari lagi", next: { title: "HOD Meeting", date: "2026-11-24" } },
  };
}
