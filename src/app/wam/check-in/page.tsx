import { CheckInScanner } from "@/components/pra-wam/CheckInScanner";
import { BackRow, PraWamShell } from "@/components/pra-wam/PraWamShell";
import { praWamPath } from "@/lib/routes";
import { requireMemberPage } from "@/lib/server/pra-wam/session";
import styles from "@/components/pra-wam/pra-wam.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scan QR absen · WAM", robots: { index: false } };

/** Scan QR absen (Penpot "P12"), for phones whose camera app does not open links. */
export default async function ScanPage() {
  const member = await requireMemberPage(praWamPath.scan);
  return <PraWamShell member={member} current="agenda">
    <BackRow href={praWamPath.agenda} title="Scan QR absen" />
    <div className={styles.narrow} style={{ marginInline: "auto" }}><CheckInScanner /></div>
  </PraWamShell>;
}
