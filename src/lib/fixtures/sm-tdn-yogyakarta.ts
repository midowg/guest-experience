import { createSeedEvent } from "@/lib/seed-event";
import { templateOf } from "@/lib/event-templates";
import type { AgendaDetail, AgendaItem, EventRecord } from "@/lib/types";

/**
 * Surya Madistrindo "Sesarengan Lumampah", Yogyakarta, 5–8 November 2026, as written in the
 * handbook deck (D:\projects\surya-madristindo\Handbook Surya Madistrindo.odp). Used by
 * /dev-preview/handbook and as the source when the event is entered in the admin; never saved by
 * itself. Where the deck contradicts itself the deck's shown value is kept and the guest is told
 * it awaits confirmation; blanks in the deck ([lokasi], [jam], [tautan]) stay blank.
 */
const id = (n: number) => `5d000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (day: number, time: string) => `2026-11-0${day}T${time}:00+07:00`;

type Row = [day: number, start: string, end: string, title: string, description?: string, detail?: Partial<AgendaDetail>];
const rows: Row[] = [
  // Hari 1, Kamis 5 November: kedatangan dan Kotagede (slide 11–15).
  [5, "07:45", "13:50", "Berangkat dari Stasiun Gambir", "Kereta Taksaka KA 46 menuju Stasiun Yogyakarta. Jam kegiatan hari pertama menunggu penyesuaian dengan tiket kereta final."],
  [5, "13:50", "14:15", "Tiba di Stasiun Yogyakarta dan penjemputan", "", { place: "Stasiun Tugu Yogyakarta", teaser: "tim Werkudara menunggu di area kedatangan", did_you_know: "Tim Werkudara Group sudah stand by di Area Kedatangan Stasiun Tugu Yogyakarta, dan perjalanan TDN akan dimulai. Pintu keluar melalui Pintu Timur." }],
  [5, "14:15", "15:15", "Makan siang di Sate Klathak Pak Pong", "Tempat dan hidangan rombongan sudah disiapkan lebih awal. Setibanya di lokasi, mohon tetap bersama rombongan dan mengikuti arahan tour leader.", { place: "Sate Klathak Pak Pong", teaser: "sate kambing muda bertusuk jeruji besi sepeda", did_you_know: "Sate Klathak Pak Pong adalah destinasi kuliner legendaris paling ikonik di Yogyakarta, terkenal dengan sate kambing muda empuk yang dipanggang menggunakan tusukan jeruji besi sepeda. Rasanya gurih-asin alami, disajikan bersama kuah gulai yang rempahnya meresap hingga ke dalam daging." }],
  [5, "15:45", "17:45", "Walking tour Kotagede", "Gunakan alas kaki nyaman. Tetap bersama rombongan dan minta izin sebelum memotret warga dari dekat.", { place: "Kotagede", teaser: "kerajinan perak, kipo, kembang waru, dan jamu", did_you_know: "Tur berjalan kaki bersama pemandu untuk mengunjungi sentra kerajinan perak, pasar sore, dan mencicipi kuliner tradisional. Peserta mengenal kerajinan perak, mencoba kipo dan kembang waru, serta melihat peracikan jamu." }],
  [5, "17:45", "19:30", "Makan malam di Kedai Den Wir", "Menu disajikan secara prasmanan; peserta dapat memilih hidangan langsung di lokasi sesuai selera.", { place: "Kedai Den Wir, Kotagede", teaser: "prasmanan bernuansa Jawa tempo dulu", did_you_know: "Kedai Den Wir adalah destinasi kuliner prasmanan bernuansa Jawa tempo dulu di kawasan Kotagede. Suasananya seperti bersantap di rumah, dengan menu Nusantara yang lengkap, aneka jajanan tradisional, hingga berbagai varian jenang khas." }],
  [5, "19:30", "20:00", "Check-in THE 1O1 Yogyakarta Tugu dan istirahat", "", { place: "THE 1O1 Yogyakarta Tugu" }],
  // Hari 2, Jumat 6 November: Menoreh dan sesi foto busana Jawa (slide 17–21).
  [6, "06:30", "07:30", "Sarapan di hotel", "Rundown mencantumkan 06.30, sedangkan sarapan hotel mulai 07.00 WIB. Jam menunggu konfirmasi panitia.", { place: "Loteng Resto, THE 1O1 Yogyakarta Tugu" }],
  [6, "07:30", "08:30", "Berangkat menuju Nanggulan"],
  [6, "08:30", "09:30", "Tur Volkswagen di Menoreh", "Tetap duduk selama kendaraan berjalan, ambil foto saat kendaraan berhenti, dan ikuti pembagian kendaraan dari panitia. Bawa topi dan pelindung matahari.", { place: "Nanggulan, Kulon Progo", teaser: "VW klasik menyusuri perbukitan Menoreh", did_you_know: "Menjelajahi keindahan alam Menoreh dengan mobil VW klasik, menyusuri perbukitan hijau, pedesaan, persawahan, dan panorama alam yang memikat." }],
  [6, "09:30", "10:00", "Istirahat dan minum di Geblek Pari", "", { place: "Geblek Pari, Nanggulan" }],
  [6, "10:00", "12:00", "Membuat gantungan kunci dari kain perca", "", { place: "Geblek Pari, Nanggulan", teaser: "suvenir buatan sendiri dari kain perca", did_you_know: "Menikmati jajanan lokal di Geblek Pari sekaligus berkreasi membuat gantungan kunci dari kain perca sebagai suvenir unik, lalu menikmati sajian makan siang." }],
  [6, "12:00", "13:00", "Makan siang di Geblek Pari", "", { place: "Geblek Pari, Nanggulan" }],
  [6, "13:00", "14:00", "Kembali ke hotel"],
  [6, "14:00", "15:30", "Persiapan busana Jawa untuk sesi foto", "Ketentuan busana dan perlengkapan foto mengikuti informasi panitia."],
  [6, "15:30", "16:00", "Berangkat menuju Titik Nol Kilometer", "", { teaser: "naik Si Thole dari hotel", did_you_know: "Pengalaman unik menggunakan transportasi Si Thole dari hotel ke venue foto, dilanjutkan ke venue makan malam, dan kembali lagi ke hotel." }],
  [6, "16:00", "18:00", "Sesi foto di kawasan Malioboro", "", { place: "Titik Nol Kilometer Yogyakarta", teaser: "berfoto dalam busana tradisional di jantung Jogja", did_you_know: "Kebersamaan dalam balutan busana tradisional, mengabadikan momen indah di jantung Kota Jogja." }],
  [6, "18:00", "19:30", "Makan malam di Gadri Resto", "Menu disajikan secara family style; peserta dapat memilih hidangan langsung di atas meja yang telah disediakan.", { place: "Gadri Resto, nDalem Joyokusuman", teaser: "bersantap dalam jejak sejarah Keraton", did_you_know: "Berlokasi di lingkungan nDalem Joyokusuman, kawasan Keraton Yogyakarta, Gadri Resto menghadirkan pengalaman bersantap di rumah bergaya Jawa yang menyimpan jejak sejarah keluarga bangsawan." }],
  [6, "19:30", "20:00", "Kembali ke hotel"],
  // Hari 3, Sabtu 7 November: kegiatan wellness dan makan malam (slide 23–25).
  [7, "07:00", "09:00", "Sarapan di hotel", "", { place: "Loteng Resto, THE 1O1 Yogyakarta Tugu" }],
  [7, "09:00", "09:30", "Berangkat menuju Yabbiekayu"],
  [7, "09:30", "11:00", "Intuitive Javanese Dance Meditation", "Gunakan pakaian yang leluasa untuk bergerak. Sampaikan bila ada aktivitas yang membuat Anda tidak nyaman.", { place: "Yabbiekayu", teaser: "gerak dan latihan kesadaran tubuh", did_you_know: "Peserta mengikuti gerak dan latihan kesadaran tubuh bersama fasilitator." }],
  [7, "11:00", "12:00", "Beyond The Box, Mindfulness Art Therapy", "", { place: "Yabbiekayu", teaser: "melukis di kardus, tanpa perlu bisa melukis", did_you_know: "Peserta melukis pada kardus bersama fasilitator. Tidak memerlukan kemampuan melukis." }],
  [7, "12:00", "13:00", "Makan siang di Yabbiekayu Resto", "Menu disajikan secara prasmanan; peserta dapat memilih hidangan langsung di lokasi sesuai selera.", { place: "Yabbiekayu Resto", teaser: "santap siang di suasana alam yang asri", did_you_know: "Yabbiekayu memadukan suasana modern dengan sentuhan alam yang asri, nyaman untuk beristirahat di sela perjalanan, dengan pilihan hidangan Nusantara dan internasional." }],
  [7, "13:00", "14:00", "Sesi personal 1-on-1: tarot, numerologi, palmistry, tes kesehatan", "Panitia akan membagikan pilihan dan giliran peserta.", { place: "Yabbiekayu", teaser: "satu sesi pilihan untuk setiap peserta", did_you_know: "Pilihan sesi mencakup tarot, numerologi, pembacaan telapak tangan atau Pandara Card, dan pemeriksaan kesehatan. Pembagian sesi menunggu konfirmasi panitia." }],
  [7, "14:00", "14:30", "Coffee break", "", { place: "Yabbiekayu" }],
  [7, "14:30", "15:30", "Sesi personal 1-on-1 (lanjutan)", "Panitia akan membagikan pilihan dan giliran peserta.", { place: "Yabbiekayu" }],
  [7, "15:30", "17:00", "Kembali ke hotel dan bersiap"],
  [7, "17:00", "18:00", "Ganti pakaian Jawa lurik", "Ketentuan busana menunggu konfirmasi panitia."],
  [7, "18:00", "18:30", "Berangkat menuju tempat makan malam"],
  [7, "18:30", "20:30", "Makan malam dengan hiburan di Galarasa", "", { place: "Galarasa" }],
  [7, "20:30", "21:00", "Kembali ke hotel, lalu istirahat"],
  // Hari 4, Minggu 8 November: belanja dan kepulangan (slide 26).
  [8, "08:00", "08:30", "Sarapan di hotel", "", { place: "Loteng Resto, THE 1O1 Yogyakarta Tugu" }],
  [8, "08:30", "10:30", "Waktu bebas"],
  [8, "10:30", "10:50", "Check-out hotel", "Sebelum check-out, periksa lemari, kamar mandi, dan brankas. Pastikan identitas dan barang pribadi sudah masuk ke tas."],
  [8, "10:50", "12:20", "Perjalanan menuju Kopi Jolotundo", "Dekat Bandara YIA."],
  [8, "12:20", "12:50", "Makan siang", "", { place: "Kopi Jolotundo" }],
  [8, "12:50", "15:25", "Check-in dan proses keberangkatan", "", { place: "Bandara YIA" }],
  [8, "15:25", "16:40", "Penerbangan ke Jakarta, tiba di Soekarno-Hatta dan penjemputan", "Citilink QG 773. Jadwal penerbangan mengikuti proposal dan perlu dicocokkan dengan tiket final."],
];

const agenda: AgendaItem[] = rows.map(([day, start, end, title, description = ""], index) => ({ id: id(100 + index), starts_at: at(day, start), ends_at: at(day, end), title, description, sort_order: index }));
const agenda_details: Record<string, AgendaDetail> = Object.fromEntries(rows.flatMap(([, , , , , detail], index) => detail
  ? [[id(100 + index), { teaser: "", did_you_know: "", more_story: "", place: "", pdf_page: null, ...detail }]] : []));

export function smTdnYogyakarta(): EventRecord {
  const seed = createSeedEvent();
  const template = templateOf("handbook-trip")!;
  return {
    ...seed,
    id: id(1), slug: "sm-ro-jakarta-tdn-yogyakarta", status: "draft",
    title: "SM RO Jakarta TDN Yogyakarta", subtitle: "Sesarengan Lumampah · Tour program Yogyakarta",
    organizer: "Werkudara Group", greeting: "Selamat datang, sugeng rawuh",
    introduction: "Di setiap sudut Jogja, selalu ada cerita yang ingin diingat dan hangat yang tak ingin usai. Mari menikmati setiap momen di Yogyakarta.\n\nPanduan perjalanan, agenda, akomodasi, dan kebutuhan pribadi untuk tour di Yogyakarta, Kamis–Minggu, 5–8 November 2026 (4 hari 3 malam). Seluruh jadwal menggunakan WIB. Pembaruan akan disampaikan melalui tour leader dan grup peserta.",
    closing: "",
    starts_at: at(5, "07:45"), ends_at: at(8, "16:40"), timezone: "Asia/Jakarta",
    // The hotel is the trip's base. Its Maps link is not in the deck: fill it in before publishing.
    venue_name: "THE 1O1 Yogyakarta Tugu", address: "Jl. Margo Utomo No. 103, Gowongan, Jetis, Yogyakarta", location_url: "",
    event_kind: template.kind, audience: template.audience, theme: { key: template.theme, corners: "square" },
    rsvp_enabled: false, feedback_enabled: false, review_enabled: false,
    contact: { ...seed.contact, name: "Dimas Wijanarko", phone: "0811-2546-096", role: "Project Manager", organization: "Werkudara Group" },
    sections: seed.sections.map(section => ({ ...section, enabled: (template.modules as string[]).includes(section.key) && section.key !== "feedback" })),
    topics: [], agenda, agenda_details,
    prepare: { title: "", intro: "", items: [
      { icon: "shirt", title: "Panduan busana", description: "Pilih pakaian kasual yang nyaman, seperti kaos, hoodie, sweatshirt, atau jaket ringan. Outfit yang tepat membuat perjalanan lebih rileks, sehingga Anda tiba dengan segar dan siap menikmati pengalaman bersama.", list: [
        "Sesi foto busana Jawa, 6 November: ketentuan pakaian dan aksesori mengikuti konfirmasi panitia.",
        "Makan malam 7 November di Galarasa: berangkat dari hotel pukul 18.00 WIB dengan pakaian Jawa lurik.",
        "Kain batik untuk makan malam masih pilihan dan menunggu konfirmasi panitia.",
      ] },
      { icon: "backpack", title: "Perlengkapan pribadi", description: "Periksa ketentuan bagasi pada tiket. Pastikan kembali perlengkapan yang disediakan panitia sebelum mengemas barang.", list: [
        "Identitas asli sesuai data tiket", "E-ticket dan kontak tour leader", "Telepon, charger, serta power bank", "Uang tunai atau alat pembayaran",
        "Tas kecil untuk barang selama kegiatan", "Pakaian ganti untuk empat hari perjalanan", "Busana sesuai agenda", "Alas kaki nyaman untuk berjalan",
        "Perlengkapan mandi dan obat pribadi", "Topi, payung kecil, serta pelindung matahari", "Label bagasi pada setiap koper",
      ] },
      { icon: "gift", title: "Perlengkapan acara & oleh-oleh", description: "Item mengikuti proposal dan belum final.", list: [
        "Kaos acara", "Topi acara", "Tas lipat berbahan parasut, 20 × 40 cm", "Oleh-oleh pilihan: Coklat Monggo, Bakpiaku, Dodol Ny. Pang",
      ] },
    ] },
    trip: {
      transport: { title: "", intro: "", legs: [
        { id: id(10), mode: "train", carrier: "Kereta Taksaka", number: "KA 46", date: "Kamis, 5 November 2026", from: "Stasiun Gambir (GMR)", to: "Stasiun Yogyakarta (YK)", departs: "07.45 WIB", arrives: "13.50 WIB",
          seat: "EKS 6, kursi 5–9 ABCD dan 10–11 CD", meeting_point: "", meeting_time: "",
          note: "Jam kereta masih menunggu tiket final. Titik dan waktu kumpul di Gambir akan diinformasikan panitia. Di Stasiun Tugu, keluar melalui Pintu Timur; tim Werkudara Group menunggu di area kedatangan." },
        { id: id(11), mode: "flight", carrier: "Citilink", number: "QG 773", date: "Minggu, 8 November 2026", from: "Bandara YIA", to: "Bandara Soekarno-Hatta (CGK)", departs: "15.25 WIB", arrives: "16.40 WIB",
          seat: "", meeting_point: "", meeting_time: "", note: "Jadwal penerbangan mengikuti proposal dan perlu dicocokkan dengan tiket final. Terminal dan ketentuan bagasi mengikuti tiket final." },
      ] },
      stay: { title: "", name: "THE 1O1 Yogyakarta Tugu", address: "Jl. Margo Utomo No. 103, Gowongan, Jetis, Yogyakarta", maps_url: "", phone: "0274-2920101",
        check_in: "5 November 2026", check_out: "8 November 2026", breakfast_place: "Loteng Resto", breakfast_time: "mulai 07.00 WIB", meeting_point: "Lobby hotel", note: "", photos: [] },
      guidelines: { title: "", intro: "",
        weather: "BMKG dalam prakiraan mingguan periode 2–5 November 2026 menyebutkan potensi peningkatan hujan intensitas sedang di wilayah DI Yogyakarta. Prakiraan per 30 Oktober 2026: berawan dan dimungkinkan hujan.",
        dos: ["Gunakan alas kaki nyaman saat walking tour", "Bawa air minum selama kegiatan", "Ikuti pemandu dan waktu kumpul", "Tetap duduk saat tur VW berjalan", "Minta izin sebelum memotret orang", "Sampaikan batasan aktivitas ke fasilitator"],
        donts: ["Berdiri atau menjulur keluar dari kendaraan", "Meninggalkan rombongan tanpa memberi kabar", "Membuang sampah di lokasi kegiatan"] },
      contacts: { title: "", intro: "Titik kumpul, jam kumpul, dan tautan grup peserta akan dibagikan panitia sebelum berangkat.", people: [
        { id: id(20), role: "Project Manager", name: "Dimas Wijanarko", phone: "0811-2546-096" },
        { id: id(21), role: "PIC Surya Madistrindo", name: "Agi Andriyansyah", phone: "0811-1136-113" },
        { id: id(22), role: "Hotel", name: "THE 1O1 Yogyakarta Tugu", phone: "0274-2920101" },
      ], hospital: "Rumah Sakit Bethesda Yogyakarta", hospital_phone: "(0274) 586688", hospital_address: "", hospital_maps_url: "" },
      // The handbook's DAY 1-3 covers are uploaded to the event itself, not kept in this file.
      day_covers: [],
    },
  };
}
