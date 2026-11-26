import { redirect } from "next/navigation";
import { CoffeeLogin } from "@/components/coffee/CoffeeAuth";
import { safeCoffeeNext } from "@/lib/coffee/setup";
import { coffeePath } from "@/lib/routes";
import { isSupabaseConfigured } from "@/lib/server/config";
import { currentMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk" };

/** Masuk: Werkudara Coffee's own sign-in page (the same employee account). Only a page of the app may be the way back. */
export default async function CoffeeSignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeCoffeeNext((await searchParams).next);
  if (isSupabaseConfigured() && await currentMember()) redirect(next ?? coffeePath.home);
  return <CoffeeLogin next={next} />;
}
