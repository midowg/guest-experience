import { SessionSheetLoading } from "@/components/main-wam/peserta/agenda/SessionSheet";

/** Only the sheet is a skeleton while Detail sesi loads; the screen behind it is not touched. Owner A (peserta). */
export default function Loading() {
  return <SessionSheetLoading />;
}
