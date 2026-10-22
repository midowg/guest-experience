import { notFound } from "next/navigation";
import { FigmaCheck } from "./FigmaCheck";

export const dynamic = "force-dynamic";

/** Development only: imports public/dev/contoh-figma.svg in the browser and shows the result. Nothing is uploaded. */
export default function DevFigmaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <main style={{ padding: 24, fontFamily: "Nunito, sans-serif" }}><h1>Impor Figma (contoh)</h1><FigmaCheck /></main>;
}
