import type { Metadata } from "next";
import { CmsEntry } from "@/components/leadership-reset/CmsEntry";

export const metadata: Metadata = { title: { absolute: "CMS · Refleksi Leader" }, robots: { index: false, follow: false } };

/** /refleksi/kelola: the CMS remembered on this device, or a box for its link (asked once per device). */
export default function LeadershipResetCmsEntryPage() {
  return <CmsEntry />;
}
