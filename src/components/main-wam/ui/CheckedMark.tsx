"use client";

import { CircleCheck } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";

/** The green check that ends a checked-in SessionRow, with its spoken name in the current language. */
export function CheckedMark({ className }: { className?: string }) {
  return <CircleCheck className={className} role="img" aria-label={useT()("ui.checkedIn")} />;
}
