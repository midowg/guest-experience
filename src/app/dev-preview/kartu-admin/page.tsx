import { notFound } from "next/navigation";
import { ConsoleShell, PageHeader } from "@/components/console";
import { CardCatalog } from "@/components/admin/wam/questionnaire/CardCatalog";
import admin from "@/components/admin/admin.module.css";
import type { AdminCards } from "@/lib/server/pra-wam/cards-admin";
import type { Roll } from "@/lib/server/pra-wam/cards";

export const dynamic = "force-dynamic";

const tier = (key: string, name: string, color: string, odds: number, sort: number) => ({ key, name, color, odds, maxCards: null, line: "", sort });
const persona = (n: number, key: string, cls: string) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, number: n, key, name: cls, figure: "", class: cls, title: "", description: "", powers: [], partnerId: null, hidden: false, rules: [], image: null, stored: false });
const figure = (n: number, key: string, name: string, personaId: string) => ({
  id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`, number: n, key, name, personaId, costume: "", hobbies: [], activities: [], energy: "", genre: "",
  indonesian: false, funny: false, quote: null, hidden: false, image: `/figur/${key}.webp`, stored: false, legendImage: `/figur/leg/${key}.webp`,
});
const roll = (patch: Partial<Roll>): Roll => ({ at: "2026-11-16T03:00:00.000Z", odds: {}, caps: {}, taken: {}, number: 4210, landed: "common", passed: [], tier: "common", scores: {}, tied: [], character: "garda", look: { background: 1, accent: 1, stickers: [] }, ...patch });

/** Layout check for Admin WAM → Kuesioner → Kartu, the cards drawn, without signing in (18 Nov 2026). Its buttons call the real API, which refuses without a session. */
export default async function DevAdminCardsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const garda = persona(1, "garda", "Garda Depan"), penyihir = persona(2, "penyihir", "Penyihir Ide"), siasat = persona(3, "siasat", "Ahli Siasat");
  const figures = [figure(4, "edmund-hillary", "Edmund Hillary", garda.id), figure(5, "susi-susanti", "Susi Susanti", garda.id), figure(22, "hayao-miyazaki", "Hayao Miyazaki", penyihir.id), figure(26, "marie-curie", "Marie Curie", siasat.id), figure(35, "ada-lovelace", "Ada Lovelace", siasat.id)];
  const data: AdminCards = {
    catalog: {
      tiers: [tier("common", "Common", "#AEB7C7", 4500, 0), tier("uncommon", "Uncommon", "#47D6AA", 2700, 1), tier("rare", "Rare", "#449DFF", 1800, 2), tier("epic", "Epic", "#C37BFF", 700, 3), tier("legendary", "Legendary", "#FFC94A", 300, 4)],
      characters: [garda, penyihir, siasat], parts: [], figures, figuresReady: true,
    },
    questions: [], willChange: 0, following: false, rerollUntil: "2026-11-23T14:00:00.000Z",
    drawn: [
      { employeeId: "a1", name: "Dewi Lestari", department: "Center of Excellence", serial: 1, trial: false, characterId: garda.id, tierKey: "rare", drawnAt: "2026-11-16T03:00:00.000Z", dna: "a1b2c3d4e5", figureId: figures[1].id, reason: "Kamu dapat Susi Susanti karena kamu tipe Garda Depan.",
        roll: roll({ figure: { key: "edmund-hillary", score: 4, tied: ["edmund-hillary"], at: "2026-11-16T03:00:00.000Z", gender: "P" }, reroll: { at: "2026-11-17T05:00:00.000Z", from: "edmund-hillary", to: "susi-susanti", score: 2, tierFrom: "common", tierTo: "rare", tierRoll: 7300 } }) },
      { employeeId: "a2", name: "Raja Damai Sejahtera Waruwu", department: "Human Resources & General Affair", serial: 2, trial: false, characterId: penyihir.id, tierKey: "legendary", drawnAt: "2026-11-16T04:00:00.000Z", dna: "f0e1d2c3b4", figureId: figures[2].id, reason: null,
        roll: roll({ landed: "legendary", tier: "legendary", character: "penyihir", figure: { key: "hayao-miyazaki", score: 5, tied: ["hayao-miyazaki"], at: "2026-11-16T04:00:00.000Z", gender: "L" } }) },
      { employeeId: "a3", name: "Sinta Maharani", department: "Event Production", serial: 3, trial: false, characterId: siasat.id, tierKey: "epic", drawnAt: "2026-11-16T05:00:00.000Z", dna: "1122334455", figureId: figures[4].id, reason: null,
        roll: roll({ character: "siasat", reroll: { at: "2026-11-17T06:00:00.000Z", from: "marie-curie", to: "ada-lovelace", score: 1, tierFrom: "epic", tierTo: "epic", tierRoll: 9500 } }) },
      { employeeId: "a4", name: "Admin WAM (uji)", department: "", serial: null, trial: true, characterId: siasat.id, tierKey: "uncommon", drawnAt: "2026-11-15T05:00:00.000Z", dna: "9988776655", figureId: figures[3].id, reason: null, roll: roll({ character: "siasat" }) },
    ],
  };
  return <ConsoleShell theme="admin" area="Admin WAM" storageKey="dev-kartu" className={admin.shell} person={{ name: "Admin WAM", sub: "Werkudara" }}
    groups={[{ label: "Kuesioner", items: [{ key: "kartu", label: "Kartu", href: "/dev-preview/kartu-admin" }] }]} current="kartu" pageTitle="Kartu">
    <PageHeader title="Kartu" subtitle="Pratinjau tata letak dengan data rekaan." />
    <CardCatalog initial={data} />
  </ConsoleShell>;
}
