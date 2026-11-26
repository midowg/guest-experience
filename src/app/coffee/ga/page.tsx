import { CoffeeWaiting } from "@/components/coffee/CoffeeAuth";
import { GaApp } from "@/components/coffee/ga/GaApp";
import { coffeePath } from "@/lib/routes";
import { gaState } from "@/lib/server/coffee/meetings";
import { requireGaPage } from "@/lib/server/coffee/session";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mode GA" };

/**
 * The GA tablet: meeting orders for guests and the team in the room. A stranger goes to Coffee's
 * sign-in and comes back here; an employee without Mode GA lands on the employee app with a note
 * (coffeePath.gaDenied). Before the migration ran the page says it is not open yet instead of failing.
 */
export default async function CoffeeGaPage() {
  if (!isSupabaseConfigured()) return <CoffeeWaiting detail="Database belum diatur di server ini." />;
  const member = await requireGaPage(coffeePath.ga);
  const state = await gaState(member).catch((problem: unknown) => {
    if (problem instanceof ServiceError) return problem;
    throw problem;
  });
  if (state instanceof ServiceError) return <CoffeeWaiting detail={state.message} />;
  return <GaApp initial={state} me={{ name: member.nickname || member.name }} />;
}
