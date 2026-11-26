import { cookies, headers } from "next/headers";
import { CoffeeApp } from "@/components/coffee/CoffeeApp";
import { CoffeeTrouble, CoffeeWaiting } from "@/components/coffee/CoffeeAuth";
import { SETUP_COOKIE, phoneKind } from "@/lib/coffee/setup";
import type { CoffeeTab } from "@/lib/coffee/tabs";
import { myState } from "@/lib/server/coffee/claims";
import { holdsCoffeeGrant, requireCoffeePage } from "@/lib/server/coffee/session";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";

/**
 * Both places of the bottom menu draw the same app, opened at that tab; this is only the first load
 * (or a reload). Moving between them afterwards happens in the browser without asking the server
 * again. A stranger goes to Coffee's own sign-in and comes back here. Before the migration ran
 * (503) the app says it is not open yet instead of failing; the migration's name is shown to the
 * pengelola only. Any other refusal of the server is not "belum dibuka": it says the app could not
 * be read and offers to try again. The app is keyed by the person, so nothing of someone who was
 * signed in before on this device is carried into the next person's screen.
 */
export async function CoffeeScreen({ here, tab, note }: { here: string; tab: CoffeeTab; note?: string }) {
  if (!isSupabaseConfigured()) return <CoffeeWaiting detail="Database belum diatur di server ini." />;
  const member = await requireCoffeePage(here);
  const state = await myState(member).catch((problem: unknown) => {
    if (problem instanceof ServiceError) return problem;
    throw problem;
  });
  if (state instanceof ServiceError) {
    if (state.status !== 503) return <CoffeeTrouble here={here} />;
    const pengelola = await holdsCoffeeGrant(member.id).catch(() => false);
    return <CoffeeWaiting detail={pengelola ? state.message : undefined} />;
  }
  const [jar, head] = await Promise.all([cookies(), headers()]);
  return <CoffeeApp key={state.me.id} initial={state} tab={tab} setup={jar.get(SETUP_COOKIE)?.value !== "1"} phone={phoneKind(head.get("user-agent"))} note={note} />;
}
