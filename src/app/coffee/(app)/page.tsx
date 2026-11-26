import { coffeePath } from "@/lib/routes";
import { GA_ONLY } from "@/lib/server/coffee/session";
import { CoffeeScreen } from "./CoffeeScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "Werkudara Coffee" } };

/** Menu: what is left of this month's quota, and the drinks. ?pesan=ga: someone without Mode GA was sent back here. */
export default async function CoffeeMenuPage({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const { pesan } = await searchParams;
  return <CoffeeScreen here={coffeePath.home} tab="menu" note={pesan === "ga" ? GA_ONLY : undefined} />;
}
