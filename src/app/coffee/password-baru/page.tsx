import { redirect } from "next/navigation";
import { CoffeeNewPassword } from "@/components/coffee/CoffeeAuth";
import { safeCoffeeNext, safeGaNext } from "@/lib/coffee/setup";
import { coffeePath } from "@/lib/routes";
import { requireCoffeePage } from "@/lib/server/coffee/session";
import { currentMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Password baru" };

/** After signing in with the first password: pick a new one, or skip for now. Anyone else goes straight on. */
export default async function CoffeeNewPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeCoffeeNext((await searchParams).next) ?? coffeePath.home;
  // On the way to Mode GA (the tablet's sign-in sent the person here): a stranger goes back to the tablet's sign-in, not the employee app's.
  if (safeGaNext(next) && !(await currentMember())) redirect(coffeePath.gaLogin(next === coffeePath.ga ? undefined : next));
  const member = await requireCoffeePage(coffeePath.newPassword(next));
  if (!member.mustChangePassword) redirect(next);
  return <CoffeeNewPassword next={next} />;
}
