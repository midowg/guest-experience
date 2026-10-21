import { notFound } from "next/navigation";
import { LivePreviewFrame } from "@/components/admin/editor/LivePreviewFrame";

export const dynamic = "force-dynamic";

/** Development-only twin of /admin/pratinjau-langsung, for the editor preview at /dev-preview/editor. */
export default function DevLivePreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LivePreviewFrame />;
}
