import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { CardImage } from "@/components/pra-wam/colleagues/CardImage";
import { QuestionnaireApp } from "@/components/pra-wam/questionnaire/Frame";
import { CardReveal } from "@/components/pra-wam/questionnaire/CardReveal";
import { colorsOf } from "@/lib/pra-wam/figures";
import type { CardView } from "@/lib/server/pra-wam/cards";

export const dynamic = "force-dynamic";

const tiers = {
  common: { key: "common", name: "Common", color: "#AEB7C7", line: "Karakter klasik, separuh staf dapat ini.", odds: 4500, sort: 0 },
  uncommon: { key: "uncommon", name: "Uncommon", color: "#47D6AA", line: "Lumayan, tidak semua orang dapat.", odds: 2700, sort: 1 },
  rare: { key: "rare", name: "Rare", color: "#449DFF", line: "Hanya sekitar 1 dari 6 orang.", odds: 1800, sort: 2 },
  epic: { key: "epic", name: "Epic", color: "#C37BFF", line: "Langka. Sekitar 1 dari 14 orang.", odds: 700, sort: 3 },
  legendary: { key: "legendary", name: "Legendary", color: "#FFC94A", line: "Paling langka. Hanya 3 dari 100.", odds: 300, sort: 4 },
} as const;
const tierList = Object.values(tiers);
const personas: Record<string, { class: string; title: string; description: string; powers: string[] }> = {
  garda: { class: "Garda Depan", title: "Yang maju duluan dan menyelesaikan sampai tuntas", description: "Kalau sudah bilang jalan, kamu jalan sampai selesai.", powers: ["Eksekusi", "Tahan banting", "Apa adanya"] },
  penyihir: { class: "Penyihir Ide", title: "Yang mengubah ide biasa jadi luar biasa", description: "Kepalamu penuh kemungkinan.", powers: ["Kreatif", "Imajinatif", "Punya selera"] },
  siasat: { class: "Ahli Siasat", title: "Yang melihat papan permainan dari atas", description: "Kamu memikirkan tiga langkah ke depan.", powers: ["Strategi", "Tenang", "Visioner"] },
  penjaga: { class: "Penjaga Damai", title: "Yang membuat semua orang duduk lagi", description: "Adil dan dipercaya semua pihak.", powers: ["Adil", "Sabar", "Dipercaya"] },
  pemantik: { class: "Pemantik Semangat", title: "Yang terbang paling depan saat tim mulai lelah", description: "Energimu menular.", powers: ["Energi", "Berani", "Menggerakkan"] },
  pengintai: { class: "Pengintai Jeli", title: "Yang menangkap detail sebelum jadi masalah", description: "Hal kecil yang luput dari orang lain tertangkap olehmu.", powers: ["Detail", "Rapi", "Konsisten"] },
  penyembuh: { class: "Penyembuh Hati", title: "Yang membuat orang merasa didengar", description: "Hangat dan sabar.", powers: ["Mendengar", "Empati", "Hangat"] },
  penghibur: { class: "Bard Penghibur", title: "Yang membuat kerja berat terasa ringan", description: "Humor dan keceriaanmu jadi bahan bakar tim.", powers: ["Humor", "Gampang akrab", "Mencairkan suasana"] },
};

type Seed = { number: number; key: string; name: string; persona: string; costume: string };
/** The 48 figures, read from their migration's seed rows (this page only, while developing). */
async function figures(): Promise<Seed[]> {
  const sql = await readFile(join(process.cwd(), "supabase", "migrations", "202611130010_wam_figures.sql"), "utf8");
  return [...sql.matchAll(/^\s*\((\d+), '([^']+)', '((?:[^']|'')+)', '([a-z]+)', '((?:[^']|'')*)'/gm)]
    .map(([, number, key, name, persona, costume]) => ({ number: Number(number), key, name: name.replace(/''/g, "'"), persona, costume: costume.replace(/''/g, "'") }));
}

function cardOf(seed: Seed, tier: (typeof tierList)[number], serial: number, picture = true): CardView {
  const persona = personas[seed.persona] ?? personas.garda;
  return {
    serial, trial: false, dna: "a1b2c3d4e5", drawnAt: "2026-11-13T03:00:00.000Z",
    character: { id: seed.persona, key: seed.persona, name: persona.class, figure: "", ...persona, image: null, partner: null },
    tier, background: { number: 1, name: "", image: null }, accent: { number: 1, name: "", image: null }, stickers: [],
    figure: { id: seed.key, key: seed.key, name: seed.name, costume: seed.costume, quote: null, image: picture ? `/figur/${seed.key}.webp` : null },
    reason: `Kamu dapat ${seed.name} karena kamu tipe ${persona.class}.`,
    colors: colorsOf(seed.persona),
  };
}

/**
 * Layout check for the tokoh card (handoff 12 Nov 2026) without signing in, with the pictures
 * shipped in public/figur. One card to open: ?tokoh=freddie-mercury&rarity=legendary (?gambar=0
 * for the silhouette). Every card at once: ?semua=1.
 */
export default async function DevFigureCardPage({ searchParams }: { searchParams: Promise<{ tokoh?: string; rarity?: string; gambar?: string; semua?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tokoh = "edmund-hillary", rarity = "rare", gambar, semua } = await searchParams;
  const all = await figures();

  if (semua) return <QuestionnaireApp>
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1 style={{ margin: "8px 0 16px" }}>48 kartu tokoh</h1>
      <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12, margin: 0, padding: 0, listStyle: "none" }}>
        {all.map((seed, index) => <li key={seed.key}>
          <a href={`?tokoh=${seed.key}&rarity=${tierList[index % tierList.length].key}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            <CardImage card={cardOf(seed, tierList[index % tierList.length], seed.number)} alt={seed.name} scale={0.3} />
            <small>{seed.number}. {seed.name} · {personas[seed.persona]?.class}</small>
          </a>
        </li>)}
      </ul>
    </main>
  </QuestionnaireApp>;

  const seed = all.find(item => item.key === tokoh) ?? all[0];
  const card = cardOf(seed, tiers[rarity as keyof typeof tiers] ?? tiers.rare, 12, gambar !== "0");
  return <QuestionnaireApp>
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
      <p style={{ margin: "0 0 12px" }}><a href="?semua=1">Lihat semua 48 kartu</a></p>
      <CardReveal key={`${seed.key}-${rarity}-${gambar}`} formId={`dev-${seed.key}-${rarity}-${gambar ?? ""}`} initial={card} nickname="Dewi" hasPhoto={false} />
    </main>
  </QuestionnaireApp>;
}
