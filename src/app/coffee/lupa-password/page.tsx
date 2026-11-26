import { CoffeeForgot } from "@/components/coffee/CoffeeAuth";

export const metadata = { title: "Lupa password" };

/** Lupa password: a request to reset the account to the first password (the same requests as WAM's and WG People's). */
export default function CoffeeForgotPage() {
  return <CoffeeForgot />;
}
