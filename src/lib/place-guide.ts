import { PUBLIC_SITE } from "./site-url";
import type { ArrivalPoint, EventRecord, GalleryImage, PlainImage, RouteStep } from "./types";

/*
 * Panduan lokasi (event_kind "panduan"): the public page "Panduan ke Werkudara" as a template. A
 * welcome over a cover photo, Getting Here (map, address, numbered turns, the host to ask, arrival
 * points, Google Maps held at the bottom of the screen), and a gallery. A new one starts filled with
 * Werkudara's own guide, photos included, so it reads complete before the admin changes a word;
 * the same page then serves any other place by replacing the texts and photos.
 */

/** The guide's photos, served beside the static page (public/panduan-ke-werkudara/assets). */
const ASSETS = `${PUBLIC_SITE}/panduan-ke-werkudara/assets`;
const photo = (name: string, small: number, large: number, alt: string): PlainImage => ({
  url: `${ASSETS}/${name}-${large}.webp`, alt,
  srcset: [{ width: small, url: `${ASSETS}/${name}-${small}.webp` }, { width: large, url: `${ASSETS}/${name}-${large}.webp` }],
});

const cover = photo("exterior", 768, 1280, "Tampak depan Werkudara Office");
const map = photo("map", 820, 1601, "Peta rute menuju Werkudara Office: lurus di Jl. Pondok Raya, lalu masuk ke Jl. Bhinneka. Rute melalui Jl. Gurameh Raya dan Jl. Tengiri Raya tidak disarankan.");
const turn = photo("turn", 800, 1400, "Belokan dari Jl. Pondok Raya ke Jl. Bhinneka menuju Werkudara Office, dengan Warmindo Harum di sisi kiri jalan");
const galleryPhotos = [
  photo("pendopo", 600, 1000, "Pendopo di area terbuka Werkudara Office"),
  photo("garden", 640, 960, "Area luar Werkudara Office dengan jalur berundak"),
  photo("workspace", 600, 1000, "Area duduk semi-terbuka di Werkudara Office"),
  photo("team", 768, 1280, "Tim Werkudara"),
  cover,
];

const noImage: PlainImage = { url: "", alt: "", srcset: [] };
const steps: RouteStep[] = [
  { title: "Lewat Jl. Pondok Raya", description: "Rute paling mudah dan lebar. Hindari Jl. Tengiri Raya.", image: noImage,
    en: { title: "Take Jl. Pondok Raya", description: "The easiest and widest road. Avoid Jl. Tengiri Raya." } },
  { title: "Belok di Jl. Bhinneka", description: "Perhatikan titik belok seperti di foto.", image: turn,
    en: { title: "Turn into Jl. Bhinneka", description: "Look for the turn shown in the photo." } },
  { title: "Parkir di depan kantor", description: "Area parkir tamu tepat di depan gedung.", image: noImage,
    en: { title: "Park in front of the office", description: "Guest parking is right in front of the building." } },
];
const points: ArrivalPoint[] = [
  { icon: "door", title: "Lobi & resepsionis", description: "Masuk lewat pintu kaca utama; resepsionis akan mengantar.",
    en: { title: "Lobby & reception", description: "Come in through the main glass door; reception will walk you in." } },
  { icon: "pin", title: "Titik temu", description: "Jika terlambat, tunggu di pendopo — kami jemput.",
    en: { title: "Meeting point", description: "If you are running late, wait at the pendopo and we will come to you." } },
];

export const galleryText = {
  id: [
    "Beberapa area kantor Werkudara berada di ruang terbuka.",
    "Untuk menuju beberapa titik, Anda mungkin perlu melewati tangga atau area berundak. Kami menyarankan menggunakan alas kaki yang nyaman agar lebih leluasa saat berkunjung.",
    "Jika membutuhkan bantuan akses atau mobilitas, silakan menghubungi Hospitality Specialist kami.",
  ].join("\n\n"),
  en: [
    "Some areas of the Werkudara office are open-air.",
    "To reach certain spots, you may need to use stairs or stepped paths. We suggest wearing comfortable footwear so you can move around with ease during your visit.",
    "If you need any assistance with access or mobility, please contact our Hospitality Specialist.",
  ].join("\n\n"),
};

/** The Werkudara guide a new Panduan lokasi starts with. The host (PIC) comes from the setup. */
export function placeGuideStarter(event: EventRecord, uuid: () => string): EventRecord {
  const gallery: GalleryImage[] = galleryPhotos.map((image, sort_order) => ({ id: uuid(), url: image.url, alt: image.alt, caption: "", sort_order, srcset: image.srcset }));
  return {
    ...event,
    organizer: event.organizer || "Werkudara Group",
    subtitle: "A Little Guide Before We Meet",
    greeting: "Welcome to Werkudara.",
    introduction: "Kami senang dapat menyambut kehadiran Anda.\n\nPanduan singkat ini kami siapkan agar Anda lebih mudah menemukan lokasi, mengenal suasana kantor, dan mempersiapkan kunjungan dengan nyaman.",
    venue_name: "Werkudara Office",
    address: "Jl. Bhinneka No. 9\nCondongcatur, Sleman, Yogyakarta",
    location_url: "https://maps.app.goo.gl/BKkDQWsgH3pFMzeA7",
    location_display: "manual",
    // The gallery's text, from "What to Expect" of the original guide; the first paragraph reads large.
    closing: galleryText.id,
    hero: { ...event.hero, url: cover.url, alt: cover.alt, srcset: cover.srcset, focus: "center", text_position: "left" },
    route: { map_image: map, steps, points },
    gallery,
    contact: { ...event.contact, role: event.contact.role || "Hospitality Specialist" },
    language: "id_en",
    translations: {
      ...event.translations,
      en: {
        ...event.translations.en,
        title: event.translations.en.title || event.title,
        subtitle: "A Little Guide Before We Meet",
        greeting: "Welcome to Werkudara.",
        closing: galleryText.en,
        introduction: "We are delighted to be welcoming you.\n\nWe have put together this short guide to help you find us, get a feel for the office, and prepare comfortably for your visit.",
      },
    },
    rsvp_enabled: false, rsvp_closes_at: null, feedback_enabled: false, review_enabled: false,
  };
}

/** A gallery photo's shape, for the justified rows: 3:2 until the photo itself is known. */
export const defaultPhotoRatio = 1.5;

/** The city on the welcome: the last part of the address's last line ("…, Yogyakarta"). */
export function placeCity(address: string): string {
  const last = address.split("\n").map(line => line.trim()).filter(Boolean).pop() ?? "";
  return last.includes(",") ? last.split(",").pop()!.trim() : "";
}
