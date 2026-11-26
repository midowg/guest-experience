import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GaDenied, GaLogin } from "@/components/coffee/ga/GaAuth";
import { HOLD_COOKIE } from "@/components/coffee/ga/hold";
import { safeGaNext } from "@/lib/coffee/setup";
import { coffeePath } from "@/lib/routes";
import { currentAdmin } from "@/lib/server/admin-session";
import { opensGa } from "@/lib/server/coffee/session";
import { isSupabaseConfigured } from "@/lib/server/config";
import { currentMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk · Mode GA" };

/**
 * The tablet's own sign-in (26 Nov 2026): the GA officer's employee account, the same session as
 * everywhere, then straight to Mode GA. Only an address of Mode GA may be the way back.
 *
 * - Someone who may use Mode GA is already signed in: on to the tablet. While a guest holds the
 *   tablet (the cookie of "Serahkan ke tamu") that is always the tablet's own address, which opens
 *   the menu book again: this page is no way around the PIN GA.
 * - Signed in without Mode GA: the page says so and offers to sign out; it never bounces silently.
 * - Nobody signed in: the form. It carries nothing of anyone: no name, no orders.
 */
export default async function CoffeeGaSignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeGaNext((await searchParams).next);
  const configured = isSupabaseConfigured();
  const member = configured ? await currentMember() : null;
  if (member) {
    if (!(await opensGa(member))) return <GaDenied name={member.nickname || member.name} />;
    const held = (await cookies()).get(HOLD_COOKIE)?.value === "1";
    redirect(held ? coffeePath.ga : next ?? coffeePath.ga);
  }
  // Nobody is signed in here. Unless a pengelola is signed in to the admin on this browser (their
  // notifications use the same subscription), a subscription left behind is let go of (audit F5-07).
  const admin = configured ? await currentAdmin().catch(() => null) : null;
  return <GaLogin next={next} forget={admin?.kind !== "person"} />;
}
