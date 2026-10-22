import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GalleryPage } from "@/app/_guest/pages";
import { eventByCode } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Galeri foto", robots: { index: false, follow: false } };

export default async function ShortGalleryPage({ params }: { params: Promise<{ code: string }> }) {
  if (!isSupabaseConfigured()) notFound();
  return <GalleryPage event={await eventByCode((await params).code, "/galeri")} />;
}
