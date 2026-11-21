import { hrPath } from "@/lib/routes";
import { HrScreen } from "./HrScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "WG People" } };

/** Beranda (20 Nov 2026): today's masuk and pulang with the face and the office point. ?daftar=1 opens enrolment. */
export default async function HrHomePage({ searchParams }: { searchParams: Promise<{ daftar?: string }> }) {
  const { daftar } = await searchParams;
  return <HrScreen here={hrPath.home} enroll={daftar === "1"} />;
}
