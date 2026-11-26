import { cookies } from "next/headers";
import { z } from "zod";
import { CoffeeTrouble, CoffeeWaiting } from "@/components/coffee/CoffeeAuth";
import { GaApp } from "@/components/coffee/ga/GaApp";
import { HOLD_COOKIE } from "@/components/coffee/ga/hold";
import { COFFEE_GA_ORDER, coffeePath } from "@/lib/routes";
import { DRINKS, LEGACY_OPTIONS } from "@/lib/coffee/menu";
import { gaMenu, gaState } from "@/lib/server/coffee/meetings";
import { gaPinSet } from "@/lib/server/coffee/pin";
import { holdsCoffeeGrant, requireGaPage } from "@/lib/server/coffee/session";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mode GA" };

/**
 * The GA tablet: meeting orders for guests and the team in the room. A stranger goes to the
 * tablet's own sign-in (coffeePath.gaLogin) and comes back here; an employee without Mode GA goes
 * there too, where the page says so. Before the migration ran (503) the page says it is not open yet, with the
 * migration's name for the pengelola only; any other refusal says it could not load, with a way to
 * try again.
 *
 * A page loaded while a guest holds the tablet (the cookie the tablet sets in "Serahkan ke tamu")
 * carries no GA data at all: no orders, no employees. It opens on the menu book, and GA's data is
 * read only after the GA officer left the book. The book's own contents do come with it: the
 * menu and what a guest is asked with a drink (the code's menu if they cannot be read).
 */
export default async function CoffeeGaPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  if (!isSupabaseConfigured()) return <CoffeeWaiting detail="Database belum diatur di server ini." />;
  const member = await requireGaPage(coffeePath.ga);
  const me = { name: member.nickname || member.name };
  if ((await cookies()).get(HOLD_COOKIE)?.value === "1") {
    const [pin, book] = await Promise.all([gaPinSet().catch(() => false), gaMenu().catch(() => ({ menu: DRINKS, options: LEGACY_OPTIONS }))]);
    return <GaApp held initial={{ ...book, today: [], people: [], rooms: [], pin }} me={me} />;
  }
  const state = await gaState(member).catch((problem: unknown) => {
    if (problem instanceof ServiceError) return problem;
    throw problem;
  });
  if (state instanceof ServiceError) {
    if (state.status !== 503) return <CoffeeTrouble here={coffeePath.ga} />;
    return <CoffeeWaiting detail={await holdsCoffeeGrant(member.id).catch(() => false) ? state.message : undefined} />;
  }
  // ?pesanan=<id>: where a notification about that order leads. Only an id is taken; the tablet opens it when it is one of today's.
  const asked = (await searchParams)?.[COFFEE_GA_ORDER];
  const openId = typeof asked === "string" && z.uuid().safeParse(asked).success ? asked : undefined;
  return <GaApp initial={state} me={me} openId={openId} />;
}
