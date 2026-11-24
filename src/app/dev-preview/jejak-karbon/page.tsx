import { notFound } from "next/navigation";
import { CarbonPlayground } from "@/components/admin/wam/karbon/CarbonPlayground";
import { CarbonHome } from "@/components/pra-wam/carbon/CarbonHome";
import { RoomCard } from "@/components/pra-wam/BerandaCards";
import { WamFrame } from "@/components/pra-wam/WamFrame";
import { SAMPLE_CARBON_PEOPLE, SAMPLE_CARBON_SETUP } from "@/lib/pra-wam/carbon-sample";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

/*
 * Layout check for Pra WAM's Jejak karbon card (23 Nov 2026) with made-up people: pick who you are,
 * answer on the card, open the detail. ?tutup=1 for the card once the panitia closed the form.
 * ?beranda=1: Beranda's own row (CarbonHome, saving with PUT /api/wam/carbon) under a Kamar card, to compare sizes;
 * with &bingkai=1 inside the app's frame (bottom bar), as on Beranda.
 */
export default async function DevCarbonPage({ searchParams }: { searchParams: Promise<{ tutup?: string; beranda?: string; bingkai?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const setup = query.tutup ? { ...SAMPLE_CARBON_SETUP, formOpen: false } : SAMPLE_CARBON_SETUP;
  const cards = <>
    <RoomCard room={{ name: "A3", kind: "Twin", roommates: [{ name: "Contoh Satu", department: "Departemen Contoh" }] }} />
    <CarbonHome setup={setup} occupants={2} travel={null} />
  </>;
  if (query.beranda && query.bingkai) return <WamFrame member={{ id: "dev", name: "Rani Contoh", nickname: "Rani", department: "Contoh", roles: [], photo: null }} unread={0} waiting={0} phaseLabel="Pra WAM">
    <div style={{ display: "grid", gap: 16 }}>{cards}</div>
  </WamFrame>;
  if (query.beranda) return <div className={styles.app} style={{ minHeight: "100vh", background: "var(--pw-page)", padding: 16, display: "grid", gap: 16, alignContent: "start" }}>
    <RoomCard room={{ name: "A3", kind: "Twin", roommates: [{ name: "Contoh Satu", department: "Departemen Contoh" }] }} />
    <CarbonHome setup={setup} occupants={2} travel={null} />
  </div>;
  return <div className={styles.app} style={{ minHeight: "100vh", background: "var(--pw-page)" }}><CarbonPlayground setup={setup} people={SAMPLE_CARBON_PEOPLE} side="peserta" /></div>;
}
