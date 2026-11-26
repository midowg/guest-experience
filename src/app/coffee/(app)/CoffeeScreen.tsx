import { cookies, headers } from "next/headers";
import { CoffeeApp } from "@/components/coffee/CoffeeApp";
import { CoffeeWaiting } from "@/components/coffee/CoffeeAuth";
import { SETUP_COOKIE, phoneKind } from "@/lib/coffee/setup";
import type { CoffeeTab } from "@/lib/coffee/tabs";
import { myState } from "@/lib/server/coffee/claims";
import { requireCoffeePage } from "@/lib/server/coffee/session";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";

/**
 * Both places of the bottom menu draw the same app, opened at that tab; this is only the first load
 * (or a reload). Moving between them afterwards happens in the browser without asking the server
 * again. A stranger goes to Coffee's own sign-in and comes back here. Before the migration ran the
 * app says it is not open yet instead of failing.
 */
export async function CoffeeScreen({ here, tab, note }: { here: string; tab: CoffeeTab; note?: string }) {
  if (!isSupabaseConfigured()) return <CoffeeWaiting detail="Database belum diatur di server ini." />;
  const member = await requireCoffeePage(here);
  const state = await myState(member).catch((problem: unknown) => {
    if (problem instanceof ServiceError) return problem;
    throw problem;
  });
  if (state instanceof ServiceError) return <CoffeeWaiting detail={state.message} />;
  const [jar, head] = await Promise.all([cookies(), headers()]);
  return <CoffeeApp initial={state} tab={tab} setup={jar.get(SETUP_COOKIE)?.value !== "1"} phone={phoneKind(head.get("user-agent"))} note={note} />;
}
