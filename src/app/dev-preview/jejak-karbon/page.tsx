import { notFound } from "next/navigation";
import { CarbonCard } from "@/components/pra-wam/carbon/CarbonCard";
import { carbonView, type CarbonInput } from "@/lib/pra-wam/carbon";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";

/*
 * Layout check for Pra WAM's Jejak karbon card (23 Nov 2026) with a made-up trip: the card as on
 * Beranda; tapping it opens the detail. ?kosong=1 for the card before anything is counted.
 */
const SAMPLE_CARBON: CarbonInput = {
  legs: [
    { mode: "kereta", label: "Jakarta → Yogyakarta", km: 513 },
    { mode: "kereta", label: "Yogyakarta → Jakarta", km: 513 },
    { mode: "bus", label: "Stasiun → venue", km: 27, sharedBy: 30 },
    { mode: "bus", label: "Venue → stasiun", km: 27, sharedBy: 30 },
  ],
  nights: 2, roomOccupants: 3, meals: 6,
};

export default async function DevCarbonPage({ searchParams }: { searchParams: Promise<{ kosong?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const view = carbonView((await searchParams).kosong ? null : SAMPLE_CARBON);
  return <div className={styles.app} style={{ padding: 16, minHeight: "100vh", background: "var(--pw-page)" }}>
    <div style={{ maxWidth: 440, margin: "0 auto" }}><CarbonCard view={view} /></div>
  </div>;
}
