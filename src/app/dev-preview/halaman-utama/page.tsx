import { notFound } from "next/navigation";
import { EmptyHome } from "@/app/EmptyHome";

export const dynamic = "force-dynamic";

/** Both looks of the front page, before the setting can be saved: ?tampilan=kartu|lampu. */
export default async function DevHomePage({ searchParams }: { searchParams: Promise<{ tampilan?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <EmptyHome style={(await searchParams).tampilan === "lampu" ? "lampu" : "kartu"} />;
}
