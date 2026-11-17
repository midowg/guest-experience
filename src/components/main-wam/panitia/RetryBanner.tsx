"use client";

import { useRouter } from "next/navigation";
import { Banner } from "@/components/main-wam/ui";

/** A part of the screen could not be read: say so, and "Coba lagi" reads it again in place (no full reload). */
export function RetryBanner({ title }: { title: string }) {
  const router = useRouter();
  return <Banner tone="error" title={title} action={{ label: "Coba lagi", onClick: () => router.refresh() }} />;
}
