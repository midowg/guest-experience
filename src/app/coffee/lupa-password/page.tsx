import { CoffeeForgot } from "@/components/coffee/CoffeeAuth";
import { COFFEE_FROM, coffeePath } from "@/lib/routes";

export const metadata = { title: "Lupa password" };

/**
 * Lupa password: a request to reset the account to the first password (the same requests as WAM's and WG People's).
 * ?dari=ga (the tablet's sign-in sent the person here): the way back is the tablet's sign-in, not the employee app's.
 */
export default async function CoffeeForgotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const fromTablet = (await searchParams)[COFFEE_FROM] === "ga";
  return <CoffeeForgot back={fromTablet ? coffeePath.gaLogin() : undefined} />;
}
