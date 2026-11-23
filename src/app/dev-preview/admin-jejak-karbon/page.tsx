import { notFound } from "next/navigation";
import { CarbonPlayground } from "@/components/admin/wam/karbon/CarbonPlayground";
import { SAMPLE_CARBON_PEOPLE, SAMPLE_CARBON_SETUP } from "@/lib/pra-wam/carbon-sample";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

/* Layout check for Admin Pra WAM → Jejak karbon (prototype, 23 Nov 2026) with made-up people; ?sisi=peserta for the participant's card and form. Nothing is saved. */
export default async function DevCarbonAdminPage({ searchParams }: { searchParams: Promise<{ sisi?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const side = (await searchParams).sisi === "peserta" ? "peserta" : "panitia";
  return <div className={styles.app} style={{ minHeight: "100vh", background: "var(--pw-page)" }}><CarbonPlayground setup={SAMPLE_CARBON_SETUP} people={SAMPLE_CARBON_PEOPLE} side={side} /></div>;
}
