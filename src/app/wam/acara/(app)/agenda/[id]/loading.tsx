import { SessionSheetLoading } from "@/components/main-wam/peserta/agenda/SessionSheet";
import { AgendaSkeleton } from "@/components/main-wam/peserta/Skeletons";

/** Detail sesi while it loads: Agenda's skeleton behind, and the sheet already open with its own skeleton inside. Owner A (peserta). */
export default function Loading() {
  return <>
    <AgendaSkeleton />
    <SessionSheetLoading />
  </>;
}
