import { redirect } from "next/navigation";
import { CoffeeNewPassword } from "@/components/coffee/CoffeeAuth";
import { safeCoffeeNext } from "@/lib/coffee/setup";
import { coffeePath } from "@/lib/routes";
import { requireCoffeePage } from "@/lib/server/coffee/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Password baru" };

/** After signing in with the first password: pick a new one, or skip for now. Anyone else goes straight on. */
export default async function CoffeeNewPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeCoffeeNext((await searchParams).next) ?? coffeePath.home;
  const member = await requireCoffeePage(coffeePath.newPassword(next));
  if (!member.mustChangePassword) redirect(next);
  return <CoffeeNewPassword next={next} />;
}
