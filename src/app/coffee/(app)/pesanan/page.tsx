import { coffeeTabLabels } from "@/lib/coffee/tabs";
import { coffeePath } from "@/lib/routes";
import { CoffeeScreen } from "../CoffeeScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: coffeeTabLabels.pesanan };

/** Pesanan saya: the same app as Menu, opened at the person's claims. */
export default function CoffeeOrdersPage() {
  return <CoffeeScreen here={coffeePath.orders} tab="pesanan" />;
}
