import { notFound } from "next/navigation";
import { BookPreview } from "./BookPreview";

export const dynamic = "force-dynamic";

/** Layout check for Book's week and month views with sample bookings: ?tampilan=bulan for the month. */
export default async function DevBookPage({ searchParams }: { searchParams: Promise<{ tampilan?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <BookPreview view={(await searchParams).tampilan ?? "minggu"} />;
}
