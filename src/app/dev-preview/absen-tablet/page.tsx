import { notFound } from "next/navigation";
import { FaceTabletPreview } from "./FaceTabletPreview";

export const dynamic = "force-dynamic";

/** Mode tablet (23 Nov 2026): every state of the screen, without a camera or the server. */
export default function DevFaceTabletPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FaceTabletPreview />;
}
