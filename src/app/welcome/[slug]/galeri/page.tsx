import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GalleryPage } from "@/app/_guest/pages";
import { welcomeEvent } from "@/app/_guest/find";
import { isSupabaseConfigured } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Galeri foto", robots: { index: false, follow: false } };

/** /welcome/vortex/galeri: the visit's photos. */
export default async function WelcomeGalleryPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) notFound();
  return <GalleryPage event={await welcomeEvent((await params).slug)} />;
}
