import { notFound } from "next/navigation";
import { KartuUji } from "./KartuUji";

export const dynamic = "force-dynamic";

/** Development only: try a card from Figma SVGs, as the admin sets it up and as a guest fills it. Nothing is uploaded. */
export default function DevKartuUjiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto", fontFamily: "Nunito, sans-serif" }}><h1>Uji coba kartu</h1><KartuUji /></main>;
}
