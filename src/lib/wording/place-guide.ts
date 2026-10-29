import type { Lang } from "./index";

/**
 * The fixed words of a Panduan lokasi page (src/components/guest/PlaceGuide.tsx), from the page
 * "Panduan ke Werkudara". Section titles stay in English in both languages, as designed.
 */
const words = {
  id: {
    nav: "Bagian panduan", brand: "Kembali ke awal halaman", langGroup: "Pilih bahasa", menu: "MENU",
    welcome: "Welcome", gettingHere: "Getting Here", findingWay: "Finding Your Way", gallery: "Gallery", glimpse: "A Glimpse of {place}",
    mapOpen: "Perbesar peta", mapAria: "Perbesar peta akses", steps: "Langkah menuju lokasi", stepPhoto: "Perbesar foto langkah",
    lost: "Tersesat? Tanya kami", whatsapp: "WhatsApp {name} (tab baru)", call: "Telepon {name}", points: "Saat tiba",
    maps: "BUKA GOOGLE MAPS", galleryAria: "Galeri foto", photoOpen: "Perbesar foto: {alt}",
    mapTitle: "PETA AKSES", photoTitle: "FOTO", close: "Tutup", swipeMap: "Geser untuk melihat seluruh peta.", swipePhoto: "Geser untuk melihat seluruh foto.",
    embedTitle: "Peta lokasi {place}", toRoute: "LIHAT CARA KE SINI", toWelcome: "Gulir ke sambutan",
  },
  en: {
    nav: "Guide sections", brand: "Back to the top", langGroup: "Choose a language", menu: "MENU",
    welcome: "Welcome", gettingHere: "Getting Here", findingWay: "Finding Your Way", gallery: "Gallery", glimpse: "A Glimpse of {place}",
    mapOpen: "Enlarge map", mapAria: "Enlarge the route map", steps: "Steps to the place", stepPhoto: "Enlarge the step photo",
    lost: "Lost? Ask us", whatsapp: "WhatsApp {name} (new tab)", call: "Call {name}", points: "When you arrive",
    maps: "OPEN GOOGLE MAPS", galleryAria: "Photo gallery", photoOpen: "Enlarge photo: {alt}",
    mapTitle: "ROUTE MAP", photoTitle: "PHOTO", close: "Close", swipeMap: "Swipe to see the whole map.", swipePhoto: "Swipe to see the whole photo.",
    embedTitle: "Map of {place}", toRoute: "SEE HOW TO GET HERE", toWelcome: "Scroll to the welcome",
  },
} as const;

export type PlaceGuideKey = keyof typeof words.id;

export function placeGuideText(lang: Lang, key: PlaceGuideKey, values: Record<string, string> = {}): string {
  return (words[lang] ?? words.id)[key].replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
}
