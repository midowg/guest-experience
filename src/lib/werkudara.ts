/**
 * Werkudara Group as it introduces itself on werkudara.com (contact page and site footer, read
 * 30 Oct 2026). Shown at the foot of every guest page; update here when the website changes.
 */
export const WERKUDARA = {
  name: "Werkudara Group",
  website: "https://werkudara.com",
  email: "info@werkudara.com",
  /** Dialled as written on the website; the page shows buttons, not the numbers. */
  phones: { office: "+62 274-2832-999", mobile: "+62 811-2546-001" },
  offices: [
    { city: "Yogyakarta", label: "Head Office", address: "Jl. Bhinneka No. 9, Condongcatur, Sleman, D.I. Yogyakarta 55283, Indonesia", maps: "https://maps.app.goo.gl/RnDxPL4gDXGBp1529" },
    { city: "Bali", label: "Bali Office", address: "Puri Candra Asri Blok A No. 20, Batubulan, Gianyar, Bali 80582, Indonesia", maps: "" },
  ],
  social: {
    instagram: "https://www.instagram.com/werkudaragroup/",
    linkedin: "https://id.linkedin.com/company/werkudaragroup",
    youtube: "https://www.youtube.com/channel/UCHNI6q_5hWNSfwaBJsbdJPw",
  },
} as const;

/** "+62 274-2832-999" → "+622742832999", for a tel: link. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
