import { ClockInFlow } from "@/components/hr/ClockInFlow";
import hr from "@/components/hr/hr.module.css";
import { hrPath } from "@/lib/routes";
import { clockInState } from "@/lib/server/hr/attendance";
import { requireHrPage } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Absen" };

/** Absen (20 Nov 2026): today's masuk and pulang with the face and the office point. ?daftar=1 opens enrolment. */
export default async function HrHomePage({ searchParams }: { searchParams: Promise<{ daftar?: string }> }) {
  const member = await requireHrPage(hrPath.home);
  const [state, { daftar }] = await Promise.all([clockInState(member), searchParams]);
  return <div className={hr.narrow}><ClockInFlow initial={state} openEnroll={daftar === "1"} name={member.nickname || member.name.split(" ")[0]} now={new Date().toISOString()} /></div>;
}
