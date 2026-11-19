import { notFound } from "next/navigation";
import { PreviewCms } from "@/components/leadership-reset/preview";

export const dynamic = "force-dynamic";

/** Refleksi Leader on sample data, without a database (development only). */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewCms />;
}
