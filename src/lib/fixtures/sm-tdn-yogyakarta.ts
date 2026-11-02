import { createSeedEvent } from "@/lib/seed-event";
import { templateOf } from "@/lib/event-templates";
import type { AgendaDetail, AgendaItem, EventRecord } from "@/lib/types";

/**
 * Surya Madistrindo "Sesarengan Lumampah", Yogyakarta, 5–8 November 2026, as written in the
 * e-handbook REV 01 (eHandbook TDN Yogyakarta - REV 01, 2 November 2026; the contact page from its
 * PDF). Used by /dev-preview/handbook and as the source when the event is entered in the admin;
 * never saved by itself. Photos live on the event, not in this file. Where the handbook still
 * contradicts itself (breakfast on day 2) the guest is told it awaits confirmation.
 */
const id = (n: number) => `5d000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (day: number, time: string) => `2026-11-0${day}T${time}:00+07:00`;

type Row = [day: number, start: string, end: string, title: string, description?: string, detail?: Partial<AgendaDetail>];
const prasmanan = "Menu disajikan prasmanan. Silakan ambil hidangan sesuai selera.";
const rows: Row[] = [
  // Hari 1, Kamis 5 November: Sugeng Rawuh dan Jelajah Kotagede (halaman 11–16).
  [5, "07:45", "13:50", "Kereta Taksaka dari Stasiun Gambir", "Gerbong Eksekutif 6, kursi 5A–9D dan 10C–11D.", { place: "Stasiun Gambir, Hall Utara", teaser: "Kumpul di depan CFC, Hall Utara",
    did_you_know: "Meeting point berada di Hall Utara, yang biasa dikenal sebagai Hall Kedatangan. Jam kumpul dikirim lewat grup peserta.", points_title: "Alur di Gambir",
    points: [{ title: "Temui tim Werkudara Group", text: "Di depan CFC Hall Utara. Tim membawa signage penjemputan, mencatat absensi, dan membagikan tiket kereta." },
      { title: "Menuju gate keberangkatan", text: "Setelah berkumpul, masuk lewat Gate Keberangkatan Hall Utara dan tunggu di ruang tunggu sampai kereta siap berangkat." }],
    note_title: "Penting", note: "Pastikan Anda sudah absen dan menerima tiket kereta sebelum menuju gate keberangkatan." }],
  [5, "13:50", "14:15", "Tiba di Stasiun Yogyakarta", "Tim Werkudara menunggu di area kedatangan.", { place: "Stasiun Tugu Yogyakarta", teaser: "Pintu masuk ke Jogja sejak zaman Belanda",
    did_you_know: "Stasiun Yogyakarta, atau Stasiun Tugu, berada di ujung utara Malioboro. Bangunannya sudah berdiri sejak zaman Belanda dan masih menjadi pintu masuk utama ke Jogja bagi penumpang kereta.", points_title: "Setibanya di stasiun",
    points: [{ title: "Turun dari kereta", text: "Cek kembali bagasi, tas kecil, dan barang di kursi." }, { title: "Menuju gate area kedatangan", text: "Tim Yogyakarta sudah menunggu di area kedatangan kereta." }, { title: "Makan siang", text: "Rombongan langsung menuju Sate Klathak Pak Pong." }] }],
  [5, "14:15", "15:15", "Makan siang di Sate Klathak Pak Pong", "", { place: "Sate Klathak Pak Pong", teaser: "Sate kambing muda bertusuk jeruji besi",
    did_you_know: "Sate klathak adalah sate kambing muda khas Bantul. Dagingnya hanya dibumbui garam, lalu dibakar memakai tusuk jeruji besi. Besi ini menghantarkan panas sampai ke dalam daging, jadi matangnya rata dan tetap empuk.",
    more_story: "Biasanya dimakan bersama kuah gulai dan nasi putih. Pak Pong termasuk warung sate klathak paling dikenal di Jogja, jadi wajar kalau ramai.",
    note_title: "Untuk rombongan", note: "Meja dan menu rombongan sudah dipesan. Tidak makan daging kambing atau punya alergi makanan? Kabari tour leader sebelum hari keberangkatan." }],
  [5, "15:15", "15:45", "Perjalanan ke Kotagede"],
  [5, "15:45", "17:45", "Walking tour keliling Kotagede", "Sentra kerajinan perak, pasar sore, dan jajanan khas Kotagede.", { place: "Kotagede", teaser: "Kampung perajin perak, bekas pusat Mataram Islam",
    did_you_know: "Kotagede adalah pusat Kerajaan Mataram Islam di akhir abad ke-16. Sekarang kawasan ini dikenal sebagai kampung perajin perak, dengan rumah-rumah lama dan gang sempit yang enak dijelajahi dengan berjalan kaki.", points_title: "Yang akan dilihat",
    points: [{ title: "Perajin perak", text: "Melihat langsung perajin membentuk dan mengukir perak." }, { title: "Kipo dan kembang waru", text: "Kue khas Kotagede. Kipo berwarna hijau dengan isian kelapa dan gula jawa." },
      { title: "Peracikan jamu", text: "Melihat cara jamu diracik dari bahan segar." }, { title: "Pasar sore", text: "Suasana pasar tradisional menjelang petang." }],
    note: "Rute melewati permukiman warga. Tetap dekat pemandu dan minta izin sebelum memotret warga dari dekat." }],
  [5, "17:45", "19:30", "Makan malam di Kedai Den Wir", "", { place: "Kedai Den Wir, Kotagede", teaser: "Prasmanan bernuansa Jawa tempo dulu",
    did_you_know: "Kedai Den Wir adalah tempat makan prasmanan bernuansa Jawa tempo dulu di kawasan Kotagede. Suasananya seperti bersantap di rumah, dengan menu Nusantara yang lengkap, aneka jajanan tradisional, hingga berbagai varian jenang khas.", note: prasmanan }],
  [5, "19:30", "20:00", "Check-in THE 1O1 Yogyakarta Tugu, istirahat", "", { place: "THE 1O1 Yogyakarta Tugu" }],
  // Hari 2, Jumat 6 November: Tour Menoreh dan Photo Session di Malioboro (halaman 17–21).
  [6, "06:30", "07:30", "Sarapan di hotel", "Rundown mencantumkan 06.30, sedangkan sarapan hotel mulai 07.00 WIB. Jam menunggu konfirmasi panitia.", { place: "Loteng Resto, THE 1O1 Yogyakarta Tugu" }],
  [6, "07:30", "08:30", "Berangkat ke Nanggulan, Kulon Progo"],
  [6, "08:30", "09:30", "Keliling desa naik VW klasik", "", { place: "Nanggulan, Kulon Progo", teaser: "VW klasik menyusuri perbukitan Menoreh",
    did_you_know: "Menjelajahi keindahan alam Menoreh dengan mobil VW klasik, menyusuri perbukitan hijau, pedesaan, dan panorama alam yang memikat.", note: "Tetap duduk selama VW berjalan. Jangan berdiri atau menjulurkan badan dari kendaraan." }],
  [6, "09:30", "10:00", "Istirahat dan minum di Geblek Pari", "", { place: "Geblek Pari, Nanggulan" }],
  [6, "10:00", "12:00", "Membuat gantungan kunci dari kain perca", "", { place: "Geblek Pari, Nanggulan", teaser: "suvenir buatan sendiri dari kain perca", did_you_know: "Menikmati jajanan lokal di Geblek Pari sekaligus berkreasi membuat gantungan kunci dari kain perca sebagai suvenir unik, lalu menikmati sajian makan siang." }],
  [6, "12:00", "13:00", "Makan siang di Geblek Pari", "", { place: "Geblek Pari, Nanggulan" }],
  [6, "13:00", "14:00", "Kembali ke hotel"],
  [6, "14:00", "15:30", "Bersiap dan berganti busana Jawa", "Detail busana dan aksesori diinfokan panitia."],
  [6, "15:30", "16:00", "Berangkat ke Titik Nol Kilometer", "", { place: "Si Thole Transport", teaser: "Naik Si Thole dari hotel", did_you_know: "Pengalaman unik menggunakan transportasi Si Thole dari hotel ke venue foto, dilanjutkan ke venue makan malam, dan kembali lagi ke hotel." }],
  [6, "16:00", "18:00", "Sesi foto di kawasan Malioboro", "", { place: "Titik Nol Kilometer Yogyakarta", teaser: "Berfoto dalam busana tradisional di jantung Jogja", did_you_know: "Kebersamaan dalam balutan busana tradisional, mengabadikan momen indah di jantung Kota Jogja." }],
  [6, "18:00", "19:30", "Makan malam di Gadri Resto", "", { place: "Gadri Resto, nDalem Joyokusuman", teaser: "Bersantap dalam jejak sejarah Keraton",
    did_you_know: "Berlokasi di lingkungan nDalem Joyokusuman, kawasan Keraton Yogyakarta, Gadri Resto menghadirkan pengalaman bersantap di rumah bergaya Jawa yang menyimpan jejak sejarah keluarga bangsawan.",
    note: "Menu disajikan family style. Silakan pilih hidangan langsung di atas meja yang sudah disediakan." }],
  [6, "19:30", "20:00", "Kembali ke hotel"],
  // Hari 3, Sabtu 7 November: Wellness di Yabbiekayu (halaman 22–26).
  [7, "07:00", "09:00", "Sarapan di hotel", "", { place: "Loteng Resto, THE 1O1 Yogyakarta Tugu" }],
  [7, "09:00", "09:30", "Berangkat ke Yabbiekayu", "", { place: "Yabbiekayu, Sewon, Bantul", teaser: "Penginapan ramah lingkungan di tengah sawah",
    did_you_know: "Yabbiekayu adalah penginapan ramah lingkungan dengan taman rimbun dan pemandangan sawah. Seluruh kegiatan hari ini berlangsung di sini." }],
  [7, "09:30", "11:00", "Intuitive Javanese Dance Meditation", "Gerak dan meditasi bersama fasilitator.", { place: "Yabbiekayu", teaser: "Gerak dan meditasi, terbuka untuk pemula",
    did_you_know: "Menyelaraskan tubuh lewat gerak tari Jawa sederhana dan latihan napas bersama fasilitator. Terbuka untuk pemula, tidak perlu bisa menari.",
    note: "Semua kegiatan boleh diikuti sesuai kenyamanan masing-masing. Bila ada gerakan atau sesi yang kurang cocok, cukup sampaikan ke fasilitator." }],
  [7, "11:00", "12:00", "Beyond the Box", "Melukis di atas kardus.", { place: "Yabbiekayu", teaser: "Melukis di kardus, tanpa perlu bisa melukis",
    did_you_know: "Mengekspresikan ide dan perasaan lewat goresan warna di atas kardus. Tanpa pengalaman melukis, dan hasil karya bisa dibawa pulang." }],
  [7, "12:00", "13:00", "Makan siang di Yabbiekayu Resto", "", { place: "Yabbiekayu Resto", teaser: "Santap siang di suasana alam yang asri",
    did_you_know: "Yabbiekayu memadukan suasana modern dengan sentuhan alam yang asri, nyaman untuk beristirahat di sela perjalanan. Pilihan hidangannya Nusantara dan internasional.", note: prasmanan }],
  [7, "13:00", "14:00", "Sesi personal (bergiliran)", "Tarot Jawa, numerologi, primbon Jawa, cek kesehatan.", { place: "Yabbiekayu", teaser: "Satu sesi pribadi untuk setiap peserta",
    did_you_know: "Pilihan sesi: Tarot Jawa, Numerologi, Primbon Jawa, dan Cek Kesehatan. Penentuan sesi personal diinformasikan langsung di lokasi." }],
  [7, "14:00", "14:30", "Coffee break", "", { place: "Yabbiekayu" }],
  [7, "14:30", "15:30", "Sesi personal, lanjutan", "", { place: "Yabbiekayu" }],
  [7, "15:30", "17:00", "Kembali ke hotel, istirahat"],
  [7, "17:00", "18:00", "Bersiap, berganti busana lurik", "Detail busana diinfokan panitia."],
  [7, "18:00", "18:30", "Berangkat ke tempat makan malam"],
  [7, "18:30", "20:30", "Makan malam dengan hiburan di Galarasa", "", { place: "Galarasa", teaser: "Hidangan Nusantara dalam suasana klasik",
    did_you_know: "Galarasa menyajikan hidangan khas Nusantara dengan beragam pilihan menu, dari masakan tradisional yang akrab di lidah hingga racikan rempah yang menggugah selera.",
    more_story: "Suasananya hangat, dengan sentuhan arsitektur klasik dan interior yang elegan. Kuliner Nusantara di sini bukan sekadar soal rasa, tetapi juga tradisi dan kekayaan budaya.",
    note_title: "Untuk rombongan", note: "Meja dan menu rombongan sudah dipesan. Punya alergi atau pantangan makanan? Kabari tour leader sebelum hari keberangkatan." }],
  [7, "20:30", "21:00", "Kembali ke hotel"],
  // Hari 4, Minggu 8 November: Sugeng Tindak (halaman 27–29).
  [8, "08:00", "08:30", "Sarapan di hotel", "", { place: "Loteng Resto, THE 1O1 Yogyakarta Tugu" }],
  [8, "08:30", "10:30", "Waktu bebas", "Berkemas, jalan pagi ke Tugu, atau cari oleh-oleh."],
  [8, "10:30", "10:50", "Check-out hotel", "Sebelum keluar kamar, cek lemari, laci, kamar mandi, brankas, serta charger dan kabel di stop kontak. Simpan KTP dan dompet di tas kecil."],
  [8, "10:50", "12:20", "Perjalanan ke Kopi Jolotundo, dekat Bandara YIA"],
  [8, "12:20", "12:50", "Makan siang di Kopi Jolotundo", "", { place: "Kopi Jolotundo, Sogan, Wates", teaser: "Joglo di tengah sawah, 15 menit dari YIA",
    did_you_know: "Rumah makan berbentuk joglo di tengah sawah di Sogan, Wates, sekitar 15 menit dari Bandara YIA. Menunya masakan rumahan Jawa, seperti sayur lodeh, ayam goreng lengkuas, dan oseng daun pepaya.",
    more_story: "Arsitektur tradisional Jawa berpadu dengan panorama alam yang menenangkan, tempat yang pas untuk makan siang sebelum terbang pulang.", note: prasmanan }],
  [8, "12:50", "15:25", "Ke bandara, check-in, dan menunggu boarding", "Tim mengantar ke bandara dan mendampingi proses check-in.", { place: "Bandara YIA" }],
  [8, "15:25", "16:40", "Penerbangan Citilink QG 773 ke Jakarta"],
  [8, "16:40", "17:00", "Tiba di Bandara Soekarno-Hatta"],
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
    title: "SM RO Jakarta TDN Yogyakarta", subtitle: "Sesarengan Lumampah · Surya Madistrindo TDN Yogyakarta",
    organizer: "Werkudara Group", greeting: "Sugeng Rawuh",
    introduction: "Melalui Sesarengan Lumampah, mari kita melangkah dan tumbuh bersama.\n\nLewat eksplorasi budaya dan alam Jogja, perjalanan ini lebih dari sekadar outing biasa. Ini adalah ruang untuk menumbuhkan kepercayaan, berbagi cerita, dan merajut kenangan indah yang abadi.\n\nSampai jumpa di Jogja.\n\nKamis–Minggu, 5–8 November 2026 (4 hari 3 malam). Seluruh jadwal memakai WIB, sama dengan Jakarta. Info terbaru dikirim lewat tour leader dan grup peserta.",
    closing: "",
    starts_at: at(5, "07:45"), ends_at: at(8, "16:40"), timezone: "Asia/Jakarta",
    // The hotel is the trip's base. Its Maps link is not in the deck: fill it in before publishing.
    venue_name: "THE 1O1 Yogyakarta Tugu", address: "Jl. Margo Utomo No. 103, Gowongan, Jetis, Yogyakarta", location_url: "",
    event_kind: template.kind, audience: template.audience, theme: { key: template.theme, corners: "square" },
    rsvp_enabled: false, feedback_enabled: false, review_enabled: false,
    contact: { ...seed.contact, name: "Dimas Wijanarko", phone: "0811-2546-096", role: "Project Manager", organization: "Werkudara Group" },
    sections: seed.sections.map(section => ({ ...section, enabled: (template.modules as string[]).includes(section.key) && section.key !== "feedback" })),
    // Fresh copies on every call, so a test that changes one event does not change the next.
    topics: [], agenda: structuredClone(agenda), agenda_details: structuredClone(agenda_details),
    prepare: { title: "", intro: "", items: [
      { icon: "shirt", title: "Panduan busana", description: "Foto hanya sebagai referensi. Baju adat sudah disiapkan panitia di lokasi; detail aksesori dan kain batik mengikuti konfirmasi panitia.", list: [
        "Hari 1, kedatangan: pakaian kasual yang nyaman, seperti kaos, hoodie, sweatshirt, atau jaket ringan.",
        "Hari 2, tur VW: kaos acara, dibagikan setibanya di Jogja.",
        "Hari 2, sesi foto dan makan malam: busana Jawa, berganti di hotel mulai 14.00.",
        "Hari 3, wellness: pakaian longgar yang nyaman untuk bergerak dan duduk di lantai.",
        "Hari 3, makan malam di Galarasa: busana lurik.",
      ] },
      { icon: "backpack", title: "Sebelum berangkat", description: "Bagasi: pasang label nama dan nomor ponsel di setiap koper. Simpan barang berharga dan obat di tas kabin, bukan di koper bagasi.", list: [
        "KTP asli, nama sama dengan tiket", "Ponsel, charger, dan power bank",
        "Pakaian santai untuk empat hari", "Pakaian longgar untuk hari ketiga", "Sepatu nyaman untuk berjalan", "Sandal untuk di hotel",
        "Obat pribadi dan resepnya", "Payung lipat atau jas hujan", "Topi, kacamata hitam, dan tabir surya", "Botol minum isi ulang",
      ] },
    ] },
    trip: {
      transport: { title: "", intro: "Jangan lupa: bawa KTP asli, dan nama di KTP harus sama dengan nama di tiket kereta dan pesawat. Power bank wajib dibawa di tas kabin, tidak boleh masuk bagasi.", legs: [
        { id: id(10), mode: "train", carrier: "Kereta Taksaka", number: "KA 46", date: "Kamis, 5 November 2026", from: "Stasiun Gambir, Jakarta (GMR)", to: "Stasiun Yogyakarta (YK)", departs: "07.45 WIB", arrives: "13.50 WIB",
          seat: "Gerbong Eksekutif 6 · Kursi 5A–9D dan 10C–11D", meeting_point: "Hall Utara Stasiun Gambir, di depan CFC", meeting_time: "",
          note: "Jam kumpul dikirim lewat grup peserta. Tim Werkudara Group menunggu di area kedatangan Stasiun Yogyakarta." },
        { id: id(11), mode: "flight", carrier: "Citilink", number: "QG 773", date: "Minggu, 8 November 2026", from: "Bandara Yogyakarta (YIA), Kulon Progo", to: "Bandara Soekarno-Hatta (CGK)", departs: "15.25 WIB", arrives: "16.40 WIB",
          seat: "", meeting_point: "", meeting_time: "", note: "Tim mengantar ke bandara dan mendampingi proses check-in. Cek jatah bagasi kabin dan bagasi tercatat di e-tiket Anda." },
      ] },
      stay: { title: "", name: "THE 1O1 Yogyakarta Tugu", address: "Jl. Margo Utomo No. 103, Gowongan, Jetis, Yogyakarta", maps_url: "", phone: "0274-2920101",
        check_in: "Kamis, 5 November, setelah makan malam (±19.30 WIB)", check_out: "Minggu, 8 November, pukul 10.30 WIB", breakfast_place: "Loteng Resto", breakfast_time: "mulai 07.00 WIB", meeting_point: "Lobi hotel",
        note: "Dekat Tugu dan Stasiun Yogyakarta. Foto kamar adalah contoh; tipe dan pembagian kamar mengikuti daftar dari panitia.", photos: [] },
      guidelines: { title: "", intro: "Kalau terpisah dari rombongan atau tersesat, tetap di tempat yang ramai dan aman, lalu telepon tour leader. Nomornya ada di Kontak penting.",
        weather: "Prakiraan per 31 Oktober 2026, suhu maksimum harian:\nKamis, 5 Nov: 32°C (min 24°C), peluang hujan 15%\nJumat, 6 Nov: 33°C (min 24°C), peluang hujan 15%\nSabtu, 7 Nov: 32°C (min 24°C), peluang hujan 5%\nMinggu, 8 Nov: data belum tersedia, cek lagi mendekati hari H\n\nCuaca cenderung panas dan cerah. Hujan lokal di sore hari tetap mungkin karena masa peralihan ke musim hujan. Jaga kesehatan dan stamina. Untuk informasi resmi, cek bmkg.go.id.",
        dos: ["Datang tepat waktu di titik kumpul", "Simpan nomor tour leader di ponsel", "Minum yang cukup selama kegiatan", "Minta izin sebelum memotret warga", "Kabari tim bila merasa kurang sehat", "Jaga barang bawaan sendiri"],
        donts: ["Berdiri atau menjulurkan badan dari VW", "Memisahkan diri dari rombongan tanpa kabar", "Membuang sampah sembarangan", "Meninggalkan barang berharga di kendaraan"] },
      contacts: { title: "", intro: "Info terbaru selama perjalanan dikirim lewat grup peserta. Pastikan nomor Anda sudah masuk grup.", people: [
        { id: id(20), role: "Project Manager · Werkudara Group", name: "Dimas Wijanarko", phone: "0811-2546-096" },
        { id: id(23), role: "Area Office Jakarta 1 · PT Surya Madistrindo", name: "Ahmad Ruki", phone: "0811-146-339" },
        { id: id(24), role: "Area Office Jakarta 3 · PT Surya Madistrindo", name: "Byantara Adi", phone: "0813-1122-9785" },
        { id: id(21), role: "PIC · Area Office Tangerang, PT Surya Madistrindo", name: "Agi Andriyansah", phone: "0811-1136-113" },
        { id: id(25), role: "Regional Office Bekasi · PT Surya Madistrindo", name: "Firmansyah", phone: "0822-2529-1797" },
        { id: id(22), role: "Hotel", name: "THE 1O1 Yogyakarta Tugu", phone: "0274-2920101" },
        { id: id(26), role: "Darurat · ambulans, polisi, pemadam kebakaran", name: "Nomor darurat 112", phone: "112" },
      ], hospital: "RS Bethesda Yogyakarta", hospital_phone: "(0274) 586688", hospital_address: "", hospital_maps_url: "" },
      // The handbook's DAY covers are uploaded to the event itself; here only each day's words.
      day_covers: [
        { day: "2026-11-05", image: { url: "", alt: "", srcset: [] }, title: "Sugeng Rawuh dan Jelajah Kotagede", summary: "Kereta dari Jakarta, makan siang sate klathak, jalan kaki keliling Kotagede, lalu check-in hotel.",
          tips: [{ title: "Pakaian hari ini", text: "Pakaian santai yang nyaman dan sepatu untuk berjalan kaki sekitar dua jam." }, { title: "Bawa di tas kecil", text: "KTP, ponsel, air minum, dan kebutuhan pribadi." },
            { title: "Jam bisa bergeser", text: "Jam kegiatan setelah tiba bisa sedikit bergeser mengikuti kedatangan kereta. Panitia mengabarkan perubahannya langsung di lokasi." }] },
        { day: "2026-11-06", image: { url: "", alt: "", srcset: [] }, title: "Tour Menoreh dan Photo Session di Malioboro", summary: "Naik VW klasik keliling desa, membuat gantungan kunci, foto bersama di Titik Nol, makan malam di Gadri Resto.",
          tips: [{ title: "Pagi–siang: kaos acara", text: "Dibagikan setibanya di Jogja. Padukan dengan celana yang nyaman untuk bergerak." }, { title: "Sore–malam: busana Jawa", text: "Berganti di hotel mulai 14.00. Detail busana dan aksesori diinfokan panitia." }] },
        { day: "2026-11-07", image: { url: "", alt: "", srcset: [] }, title: "Wellness di Yabbiekayu", summary: "Gerak dan meditasi, melukis bersama, sesi personal, lalu makan malam dengan hiburan.",
          tips: [{ title: "Siang: pakaian nyaman", text: "Yang nyaman untuk bergerak dan duduk di lantai. Hindari rok atau celana yang ketat." }, { title: "Malam: busana lurik", text: "Untuk makan malam di Galarasa. Detail busana diinfokan panitia." }] },
        { day: "2026-11-08", image: { url: "", alt: "", srcset: [] }, title: "Sugeng Tindak (Selamat Tinggal) Yogyakarta", summary: "Waktu bebas, check-out, makan siang di Kopi Jolotundo, lalu terbang ke Jakarta dari Bandara YIA.",
          tips: [{ title: "Sebelum check-out", text: "Cek lemari, laci, kamar mandi, brankas, serta charger dan kabel di stop kontak." }, { title: "Bawa di tas kecil", text: "KTP dan dompet." }] },
      ],
    },
  };
}
