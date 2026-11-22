import { notFound } from "next/navigation";
import { FaceCheckInPreview } from "./FaceCheckInPreview";

export const dynamic = "force-dynamic";

/** Absen pakai wajah (22 Nov 2026): the camera with a stand-in server, and every result. */
export default function DevFaceCheckInPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FaceCheckInPreview />;
}
