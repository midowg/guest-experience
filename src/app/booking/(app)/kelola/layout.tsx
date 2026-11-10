import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ManageTabs } from "@/components/booking/ManageTabs";
import css from "@/components/booking/booking.module.css";
import { managesFacilities } from "@/lib/pra-wam/roles";
import { currentMember } from "@/lib/server/pra-wam/session";

/**
 * Kelola, for the administration staff (Admin Booking) and Admin WAM: its title and tabs over every
 * place in it. Anyone else finds no page; a stranger is sent to sign in by the page itself.
 */
export default async function ManageLayout({ children }: { children: ReactNode }) {
  const member = await currentMember();
  if (member && !managesFacilities(member)) notFound();
  return <>
    <div><h1>Kelola booking</h1><p className={css.lead}>Untuk bagian administrasi: jadwal semua ruangan, semua booking, ruangan, dan akses.</p></div>
    <ManageTabs />
    {children}
  </>;
}
