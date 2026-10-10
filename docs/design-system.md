# Werkudara Web Design System

Source: `D:/projects/skills/desain-system.md` (Werkudara Presentation Visual Guideline 2026). Adapted to responsive web, not slide dimensions. Pro Max is not installed or used.

## Principles
A considered welcome, not a dashboard for guests. One invitation URL, meaningful reading order, immediate date/location, direct anchor navigation. No entry gate, autoplay music, scroll-jacking, delayed text or unnecessary dialogs.

## Tokens
`src/styles/tokens.css` is the single source for colors, fonts, spacing, sizes, navigation layers and motion. Use semantic tokens or branded aliases; no arbitrary per-component palette.

- Primary #1551A0; support #306FB6; accent #00A3E9; light blues #65C6F2/#C3E6F5.
- Body text #484443; backgrounds white/#EFEFEF. White on primary is suitable for text. Ice blue/orange on white are decorative only, not small text.
- Secondary accents #9A273D, #DD1A7E, #ED7333, #F9BC4E, #72C29C are sparse; never convey state by color alone.
- Source Sans Pro 300/400/600 for titles, content and headings; Montserrat 400/600 for short labels. Fontsource self-hosts font files through the build.
- Square corners, flat fills, no shadows/gradients. Whitespace and hierarchy provide emphasis.
- 74rem container, minimum 16px phone gutters, 44rem reading width. Body 17px, responsive hero 40–88px, section title 32–56px. Never shrink text to hide overflow.

## Components
Shared `Button`, `ButtonLink`, `Field`, `Notice`, `SectionHeading` in `src/components/ui/index.tsx`. Inputs use `.input`, `.textarea`, `.select`; shared layout helpers `.container`, `.stack`, `.row`, `.panel`, `.eyebrow`.

Every control supports focus, hover, disabled and busy states. Buttons minimum 48px high; visible focus outline. Field ID matches label, error/hint connected with aria-describedby. Errors are text, not just colored borders. Submit status announced without stealing focus unnecessarily. Disable duplicate submit while pending; preserve user input on network error.

Icons: one Lucide line-icon family; icon-only controls need accessible labels. Werkudara icon is a separate original asset, preserve ratio and color; it is not a venue photo.

## Composition
Hero → context/topics → agenda → arrival/location → RSVP → enabled post-event feedback → closing/review. Intro and closing frame the page; supporting sections configurable using constrained keys. Alternate whitespace, ruled rows and purposeful blue surfaces instead of wrapping every paragraph in a card.

Mobile navigation should not stack multiple fixed bars or obstruct the onscreen keyboard. Anchor offsets account for sticky header. Respect prefers-reduced-motion. No reliance on hover for essential information.

## Foto dan teks di atasnya
Layar pembuka memakai foto latar bila acara menyediakannya; tanpa foto, tata letak editorial tetap dipakai dan tidak ada kotak kosong.

Teks di atas foto selalu berdiri di atas lapisan redup, dan lapisan itu **tidak dapat dimatikan admin** — keterbacaan bukan pilihan gaya. Posisi teks hanya dua: rata kiri atau rata tengah. Keduanya harus memenuhi kontras WCAG AA, termasuk di atas foto yang terang.

Perataan tengah berlaku untuk seluruh blok, bukan hanya paragrafnya. Di ponsel, baris tanggal/waktu/tempat menumpuk selebar layar dengan ikon di atas labelnya, agar tidak ada teks yang menempel ke tepi sementara judul di atasnya rata tengah.

Foto lokasi tampil di bawah peta sebagai satu rangkaian. Deskripsi gambar bersifat opsional; foto tanpa deskripsi diperlakukan sebagai dekoratif, dan deskripsi tidak pernah dikarang otomatis.

Foto yang diunggah dikecilkan di server menjadi beberapa ukuran. Komponen memakai `srcset` bila tersedia; foto dari tautan luar tampil apa adanya.

## Review checklist
360/390px phones, tablet, desktop; no horizontal overflow; text zoom 200%; keyboard order; visible focus; contrast AA; screen-reader labels; reduced motion; long title/address/error text; pending/error/success; optional sections absent; preview submissions disabled. Each actual browser check must be recorded, not inferred from CSS.
