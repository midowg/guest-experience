import { notFound } from "next/navigation";
import { CarbonPlayground } from "@/components/admin/wam/karbon/CarbonPlayground";
import { SAMPLE_CARBON_PEOPLE, SAMPLE_CARBON_SETUP } from "@/lib/pra-wam/carbon-sample";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

/*
 * Layout check for Pra WAM's Jejak karbon card (23 Nov 2026) with made-up people: pick who you are,
 * answer on the card, open the detail. ?tutup=1 for the card once the panitia closed the form.
 */
export default async function DevCarbonPage({ searchParams }: { searchParams: Promise<{ tutup?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const setup = (await searchParams).tutup ? { ...SAMPLE_CARBON_SETUP, formOpen: false } : SAMPLE_CARBON_SETUP;
  return <div className={styles.app} style={{ minHeight: "100vh", background: "var(--pw-page)" }}><CarbonPlayground setup={setup} people={SAMPLE_CARBON_PEOPLE} side="peserta" /></div>;
}
