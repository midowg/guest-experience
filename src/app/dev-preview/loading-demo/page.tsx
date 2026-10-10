import { notFound } from "next/navigation";
import { Loading } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Development-only: renders the loading state for visual review. */
export default function LoadingDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Loading label="Memuat undangan" />;
}
