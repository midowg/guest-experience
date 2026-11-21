import { notFound } from "next/navigation";
import { AdminOptions } from "./AdminOptions";

export const dynamic = "force-dynamic";

/** Three directions for the admin's home (A galeri, B ringkas, C sorotan), sample data only: ?opsi=a|b|c. */
export default async function DevAdminOptions({ searchParams }: { searchParams: Promise<{ opsi?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const opsi = (await searchParams).opsi;
  return <AdminOptions initial={opsi === "b" || opsi === "c" ? opsi : "a"} />;
}
