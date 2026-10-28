import { PUBLIC_SITE } from "./site-url";
import type { EventRecord, GalleryImage, PlainImage } from "./types";
import { officeArrivalPoints, officeRouteSteps } from "./visit-template";

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

const stepsEn = [
  { title: "Take Jl. Pondok Raya", description: "The easiest and widest road. Avoid Jl. Tengiri Raya." },
  { title: "Turn into Jl. Bhinneka", description: "Look for the turn shown in the photo." },
  { title: "Park in front of the office", description: "Guest parking is right in front of the building." },
];
const pointsEn = [
  { title: "Lobby & reception", description: "Come in through the main glass door; reception will walk you in." },
  { title: "Meeting point", description: "If you are running late, wait at the pendopo and we will come to you." },
];

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
    hero: { ...event.hero, url: cover.url, alt: cover.alt, srcset: cover.srcset, focus: "center", text_position: "left" },
    route: {
      map_image: map,
      steps: officeRouteSteps.map((step, index) => ({ ...step, image: index === 1 ? turn : step.image, en: stepsEn[index] })),
      points: officeArrivalPoints.map((point, index) => ({ ...point, en: pointsEn[index] })),
    },
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
