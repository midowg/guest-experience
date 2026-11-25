import { notFound } from "next/navigation";
import { CoffeePrototype } from "@/components/coffee/prototype/CoffeePrototype";

export const dynamic = "force-dynamic";

/*
 * Werkudara Coffee, employee side (25 Nov 2026): a clickable prototype of activation and claiming,
 * built from the Penpot design (file werkudara-coffee, pages 20 and 21) after a design audit.
 * Nothing is saved; HR's actions are simulated from the scenario panel.
 */
export default function DevCoffeePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CoffeePrototype />;
}
