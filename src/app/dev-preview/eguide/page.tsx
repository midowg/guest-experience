import { notFound } from "next/navigation";
import { GuidePage } from "@/components/guest/GuidePage";
import type { GuideChapter, GuideItem, GuideSettings } from "@/lib/guide";
import { createSeedEvent } from "@/lib/seed-event";
import type { EventLanguage, EventRecord, PlainImage, ThemeKey } from "@/lib/types";
import { eventLanguages } from "@/lib/wording";
import { themeKeys } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Placeholder photography, for layout checking only — never shipped as event content. */
const photo = (seed: string): PlainImage => ({ url: `https://picsum.photos/seed/eguide-${seed}/1600/1000`, alt: "", srcset: [] });
const noPhoto: PlainImage = { url: "", alt: "", srcset: [] };
const id = (n: number) => `e6000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const item = (n: number, over: Partial<GuideItem>): GuideItem => ({ id: id(100 + n), title: "", text: "", fact: "", photo: noPhoto, link: "", ...over });

const chapters: GuideChapter[] = [
  {
    id: id(1), layout: "story", title: "Mengapa kita berangkat", photo: photo("why"),
    intro: "Contoh paragraf pembuka: perjalanan ini mengajak rombongan mengenal daerah tujuan lebih dekat, dari cerita warganya sampai makanan khasnya.",
    items: [
      item(1, { title: "Cerita dari tangan pertama", text: "Contoh poin: bertemu langsung dengan pengrajin dan pemandu setempat.", en: { title: "Stories first-hand", text: "Sample point: meet local makers and guides in person.", fact: "" } }),
      item(2, { title: "Waktu untuk beristirahat", text: "Contoh poin: jadwal yang longgar, dengan jeda di setiap perpindahan." }),
      item(3, { title: "Kenangan bersama", text: "Contoh poin: sesi foto rombongan di tempat terbaik." }),
    ],
    en: { title: "Why we are going", intro: "Sample opening: this trip brings the group closer to the destination, from its people's stories to its food." },
  },
  {
    id: id(2), layout: "cards", title: "Tempat yang akan dikunjungi", photo: noPhoto,
    intro: "Contoh pengantar bab kartu: tiga tempat dalam rute perjalanan.",
    items: [
      item(4, { title: "Contoh Tempat Satu", text: "Contoh cerita singkat tentang tempat pertama dan apa yang bisa dilihat di sana.", fact: "Contoh fakta menarik tentang tempat ini.", photo: photo("place1"), link: "https://www.google.com/maps" }),
      item(5, { title: "Contoh Tempat Dua", text: "Contoh cerita singkat tentang tempat kedua.", photo: photo("place2") }),
      item(6, { title: "Contoh Tempat Tiga", text: "Contoh cerita singkat tentang tempat ketiga, tanpa foto.", fact: "Contoh fakta kedua.", link: "https://www.google.com/maps" }),
    ],
  },
  {
    id: id(3), layout: "phrases", title: "Frasa sehari-hari", photo: noPhoto, intro: "Contoh beberapa sapaan dalam bahasa setempat.",
    items: [
      item(7, { title: "Sugeng enjing", text: "Selamat pagi" }),
      item(8, { title: "Matur nuwun", text: "Terima kasih" }),
      item(9, { title: "Pinten regine?", text: "Berapa harganya?" }),
    ],
  },
  {
    id: id(4), layout: "tips", title: "Tips singkat", photo: noPhoto, intro: "",
    items: [
      item(10, { title: "Cuaca", text: "Contoh: siang terik, malam sejuk. Bawa jaket tipis." }),
      item(11, { title: "Pembayaran", text: "Contoh: siapkan uang tunai kecil untuk pasar tradisional." }),
      item(12, { title: "Kesehatan", text: "Contoh: minum cukup air dan bawa obat pribadi." }),
    ],
  },
  // Neither a title nor items: left out of the book.
  { id: id(5), layout: "story", title: "", photo: noPhoto, intro: "", items: [] },
];

const guide: GuideSettings = {
  cover: {
    eyebrow: "Panduan perjalanan", title: "Contoh E-Guide Perjalanan", subtitle: "Contoh subjudul: semua yang perlu diketahui sebelum dan selama perjalanan.", photo: photo("cover"),
    en: { eyebrow: "Travel guide", title: "Sample Travel E-Guide", subtitle: "" },
  },
  chapters,
  order: [
    { kind: "chapter", id: id(1) }, { kind: "part", part: "experience" }, { kind: "part", part: "agenda" },
    { kind: "chapter", id: id(2) }, { kind: "part", part: "location" }, { kind: "chapter", id: id(3) },
    { kind: "chapter", id: id(4) }, { kind: "chapter", id: id(5) }, { kind: "part", part: "prepare" }, { kind: "part", part: "contact" },
  ],
};

/**
 * Development-only rendering check for the E-Guide reader. Never reachable in a production build.
 * ?tema=werkudara|nenek|gala|khidmat|segar|rempah · ?bahasa=id|en|id_en · ?foto=0 no photos · ?kosong=1 an empty guide
 */
export default async function DevGuidePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const read = (key: string) => { const value = params[key]; return (Array.isArray(value) ? value[0] : value) ?? ""; };
  const theme = (themeKeys as readonly string[]).includes(read("tema")) ? read("tema") as ThemeKey : "rempah";
  const language = (eventLanguages as string[]).includes(read("bahasa")) ? read("bahasa") as EventLanguage : "id_en";
  const base = createSeedEvent();
  const withPhotos = read("foto") !== "0";
  const strip = (image: PlainImage) => withPhotos ? image : noPhoto;
  const sample: GuideSettings = read("kosong") === "1" ? { ...guide, chapters: [], order: [] } : {
    ...guide,
    cover: { ...guide.cover, photo: strip(guide.cover.photo) },
    chapters: guide.chapters.map(chapter => ({ ...chapter, photo: strip(chapter.photo), items: chapter.items.map(entry => ({ ...entry, photo: strip(entry.photo) })) })),
  };
  const event: EventRecord = {
    ...base,
    id: "10f3a511-2331-4000-8000-0000000000e6", slug: "contoh-eguide", title: "Contoh Perjalanan Rombongan", subtitle: "Contoh subjudul acara",
    event_kind: "eguide", theme: { key: theme, corners: "soft" }, language,
    experience: {
      title: "", story: "Contoh cerita pengalaman: dari penjemputan sampai pulang, tim kami mendampingi rombongan.", image: strip(photo("experience")),
      moments: [
        { icon: "coffee", title: "Sambutan hangat", description: "Contoh: minuman selamat datang saat tiba." },
        { icon: "camera", title: "Foto rombongan", description: "Contoh: fotografer mendampingi sepanjang hari." },
      ],
    },
    prepare: {
      title: "", intro: "Contoh pengantar persiapan.",
      items: [
        { icon: "shirt", title: "Pakaian", description: "Contoh: pakaian santai dan sepatu nyaman.", list: [] },
        { icon: "backpack", title: "Yang perlu dibawa", description: "", list: ["Kartu identitas", "Botol minum", "Topi"] },
      ],
    },
    contact: { ...base.contact, name: "Contoh PIC", phone: "6281200000001", role: "Pendamping rombongan" },
    emergency: { name: "Contoh Kontak Darurat", phone: "6281200000002", hospital: "Contoh Rumah Sakit", hospital_address: "Contoh alamat rumah sakit", hospital_maps_url: "" },
    gallery: withPhotos ? [1, 2].map((n, index) => ({ id: id(200 + n), url: `https://picsum.photos/seed/eguide-venue${n}/1600/1000`, alt: "", caption: "", sort_order: index, srcset: [] })) : [],
    guide: sample,
  };
  return <GuidePage event={event} />;
}
