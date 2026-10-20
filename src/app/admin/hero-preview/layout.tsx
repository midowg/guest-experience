import type { ReactNode } from "react";
import { requireAdminPage } from "@/lib/server/admin-session";

// The page itself is a client component, so the server-side session check lives here.
export default async function HeroPreviewLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return children;
}
