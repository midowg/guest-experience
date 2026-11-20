import { ClockInFlow } from "@/components/hr/ClockInFlow";
import { clockInState } from "@/lib/server/hr/attendance";
import { requireHrPage } from "@/lib/server/hr/session";

/**
 * Every place of WG People's bottom menu draws the same app (21 Nov 2026), which shows the place in
 * the address; this is only the first load (or a reload). Moving between places afterwards happens in
 * the browser without asking the server again.
 */
export async function HrScreen({ here, enroll = false }: { here: string; enroll?: boolean }) {
  const member = await requireHrPage(here);
  const state = await clockInState(member);
  return <ClockInFlow initial={state} openEnroll={enroll} name={member.nickname || member.name.split(" ")[0]} fullName={member.name} now={new Date().toISOString()} />;
}
