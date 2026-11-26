import { redirect } from "next/navigation";
import { CoffeeLogin } from "@/components/coffee/CoffeeAuth";
import { safeCoffeeNext } from "@/lib/coffee/setup";
import { coffeePath } from "@/lib/routes";
import { currentAdmin } from "@/lib/server/admin-session";
import { isSupabaseConfigured } from "@/lib/server/config";
import { currentMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk" };

/** Masuk: WG Coffee's own sign-in page (the same employee account). Only a page of the app may be the way back. */
export default async function CoffeeSignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeCoffeeNext((await searchParams).next);
  if (isSupabaseConfigured() && await currentMember()) redirect(next ?? coffeePath.home);
  // Nobody is signed in to Coffee here. Unless a pengelola is signed in to the admin on this browser (their
  // notifications use the same subscription), a subscription left behind is let go of (audit F5-07).
  const admin = isSupabaseConfigured() ? await currentAdmin().catch(() => null) : null;
  return <CoffeeLogin next={next} forget={admin?.kind !== "person"} />;
}
