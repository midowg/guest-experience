/**
 * Werkudara Group as it introduces itself on werkudara.com (contact page and site footer, read
 * 30 Oct 2026). Shown at the foot of every guest page; update here when the website changes.
 */
export const WERKUDARA = {
  name: "Werkudara Group",
  website: "https://werkudara.com",
  email: "info@werkudara.com",
  /** As written on the website; the page shows them and dials them. */
  phones: { office: "+62 274-2832-999", mobile: "+62 811-2546-001" },
  /** The head office only, shortened for the page foot (revision 30 Oct); the Bali office is on the website. */
  address: "Jl. Bhinneka No. 9, Condongcatur, Sleman, Yogyakarta",
  maps: "https://maps.app.goo.gl/RnDxPL4gDXGBp1529",
  social: {
    instagram: "https://www.instagram.com/werkudaragroup/",
    linkedin: "https://id.linkedin.com/company/werkudaragroup",
    youtube: "https://www.youtube.com/channel/UCHNI6q_5hWNSfwaBJsbdJPw",
  },
} as const;

/** "+62 274-2832-999" → "+622742832999", for a tel: link. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
