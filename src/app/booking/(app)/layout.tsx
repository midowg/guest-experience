import type { ReactNode } from "react";
import { BookingFrame } from "@/components/booking/BookingFrame";
import { managesFacilities } from "@/lib/pra-wam/roles";
import { currentMember } from "@/lib/server/pra-wam/session";

/**
 * Every Booking Kantor page shares one frame. The pages check the sign-in themselves
 * (requireMemberPage sends a stranger to the WAM sign-in and back); with no one signed in there is
 * no frame to draw.
 */
export default async function BookingAppLayout({ children }: { children: ReactNode }) {
  const member = await currentMember();
  if (!member) return children;
  return <BookingFrame name={member.nickname || member.name} canManage={managesFacilities(member)}>{children}</BookingFrame>;
}
