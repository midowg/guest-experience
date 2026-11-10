import { AccessAdmin } from "@/components/booking/AccessAdmin";
import css from "@/components/booking/booking.module.css";
import { bookingPath } from "@/lib/routes";
import { accessList } from "@/lib/server/booking/admin";
import { requireMemberPage } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Akses · Kelola" };

/** Kelola → Akses: who is Admin Booking, given and taken here. */
export default async function ManageAccess() {
  const member = await requireMemberPage(bookingPath.manageAccess);
  const { rows, migrated } = await accessList();
  return <>
    {!migrated && <p className={css.noteWarn}>Daftar akun belum tersedia: menunggu migrasi WAM.</p>}
    <AccessAdmin people={rows} meId={member.id} />
  </>;
}
