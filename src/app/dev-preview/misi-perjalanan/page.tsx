import { notFound } from "next/navigation";
import { MissionJourney } from "@/components/pra-wam/mission/MissionJourney";
import type { MissionView } from "@/lib/pra-wam/mission";
import { testMissionView } from "@/lib/pra-wam/test-accounts";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

/*
 * Layout check for Misi Perjalanan without signing in, with made-up people only (the real room
 * list stays in pw_settings). ?peran=bod for a BoD who is the CEO (a CoS takes part as a HoD).
 */
export default async function DevMissionPage({ searchParams }: { searchParams: Promise<{ peran?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const role = (await searchParams).peran;
  // The same made-up HoD as an Akun uji gets (24 Nov 2026).
  const hod: MissionView = testMissionView({ id: "dev-hod", name: "Rani Contoh", nickname: "Rani" });
  const view: MissionView = role === "bod" ? { employeeId: "dev-bod", name: "Bima Contoh", nick: "Bima", role: "BoD", ceo: true, sentences: [1], room: null }
    : hod;
  return <div className={styles.app} style={{ padding: 16 }}><MissionJourney view={view} detailHref="#" /></div>;
}
