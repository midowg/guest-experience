import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { QuestionnaireApp } from "@/components/pra-wam/questionnaire/Frame";
import { CardReveal } from "@/components/pra-wam/questionnaire/CardReveal";
import { colorsOf } from "@/lib/pra-wam/figures";
import type { CardView } from "@/lib/server/pra-wam/cards";

export const dynamic = "force-dynamic";

const tiers = {
  common: { key: "common", name: "Common", color: "#AEB7C7", line: "Karakter klasik, separuh staf dapat ini.", odds: 4500, sort: 0 },
  rare: { key: "rare", name: "Rare", color: "#449DFF", line: "Hanya sekitar 1 dari 6 orang.", odds: 1800, sort: 2 },
  legendary: { key: "legendary", name: "Legendary", color: "#FFC94A", line: "Paling langka. Hanya 3 dari 100.", odds: 300, sort: 4 },
} as const;

/**
 * Layout check for the tokoh card (handoff 12 Nov 2026) without signing in: ?tokoh=freddie-mercury,
 * ?rarity=common|rare|legendary, ?gambar=0 for a figure without its picture (the silhouette). The
 * picture is read from the ignored folder .card-art (the handoff's previews), only here.
 */
export default async function DevFigureCardPage({ searchParams }: { searchParams: Promise<{ tokoh?: string; rarity?: string; gambar?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tokoh = "edmund-hillary", rarity = "rare", gambar } = await searchParams;
  const music = tokoh === "freddie-mercury";
  const bytes = gambar === "0" ? null : await readFile(join(process.cwd(), ".card-art", `${tokoh.replace(/[^a-z-]/g, "")}.webp`)).catch(() => null);
  const persona = music ? "penghibur" : "garda";
  const card: CardView = {
    serial: 12, trial: false, dna: "a1b2c3d4e5", drawnAt: "2026-11-13T03:00:00.000Z",
    character: music
      ? { id: "p", key: persona, name: "Jaka", figure: "", class: "Bard Penghibur", title: "Yang membuat kerja berat terasa ringan", description: "Humor dan keceriaanmu jadi bahan bakar tim. Meja makan selalu ramai kalau ada kamu.", powers: ["Humor", "Gampang akrab", "Mencairkan suasana"], image: null, partner: { name: "Tirta", class: "Penyembuh Hati" } }
      : { id: "p", key: persona, name: "Raka", figure: "", class: "Garda Depan", title: "Yang maju duluan dan menyelesaikan sampai tuntas", description: "Kalau sudah bilang jalan, kamu jalan sampai selesai. Tim merasa aman karena tahu ada yang pasti mengeksekusi.", powers: ["Eksekusi", "Tahan banting", "Apa adanya"], image: null, partner: { name: "Kirana", class: "Penyihir Ide" } },
    tier: tiers[rarity as keyof typeof tiers] ?? tiers.rare,
    background: { number: 1, name: "", image: null }, accent: { number: 1, name: "", image: null }, stickers: [],
    figure: {
      id: "f", key: tokoh, name: music ? "Freddie Mercury" : "Edmund Hillary", costume: music ? "Jaket kuning, mikrofon setengah tiang" : "Jaket pendaki, kapak es, tali gulung", quote: null,
      image: bytes ? `data:image/webp;base64,${bytes.toString("base64")}` : null,
    },
    reason: music
      ? "Kamu dapat Freddie Mercury karena kamu tipe Bard Penghibur, suka musik, paling menikmati musik atau karaoke dan suka musik rock."
      : "Kamu dapat Edmund Hillary karena kamu tipe Garda Depan, suka olahraga & outdoor, paling menikmati kegiatan outdoor dan nyaman di kelompok kecil.",
    colors: colorsOf(persona),
  };
  return <QuestionnaireApp>
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
      <CardReveal formId={`dev-${tokoh}-${rarity}`} initial={card} nickname="Dewi" hasPhoto={false} />
    </main>
  </QuestionnaireApp>;
}
