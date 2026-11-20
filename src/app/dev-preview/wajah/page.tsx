import { notFound } from "next/navigation";
import hr from "@/components/hr/hr.module.css";
import { WajahLab } from "./WajahLab";

export const dynamic = "force-dynamic";

/**
 * Kalibrasi absen wajah (20 Nov 2026): enrol a face in this tab's memory, try clock-ins against it,
 * and score photos picked from disk (a GreatDay base photo against a new selfie). Nothing is
 * uploaded or stored. Camera and location are allowed here by next.config.ts. 404 in production.
 */
export default function DevWajahPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <div className={hr.theme} style={{ minHeight: "100vh", padding: 20 }}><WajahLab /></div>;
}
