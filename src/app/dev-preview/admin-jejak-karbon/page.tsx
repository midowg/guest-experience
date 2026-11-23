import { notFound } from "next/navigation";
import { CarbonAdmin } from "@/components/admin/wam/karbon/CarbonAdmin";
import { SAMPLE_CARBON_PEOPLE, SAMPLE_CARBON_SETTINGS } from "@/lib/pra-wam/carbon-sample";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

/* Layout check for Admin Pra WAM → Jejak karbon (prototype, 23 Nov 2026) with made-up people. Nothing is saved. */
export default function DevCarbonAdminPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <div className={styles.app}><CarbonAdmin people={SAMPLE_CARBON_PEOPLE} settings={SAMPLE_CARBON_SETTINGS} /></div>;
}
