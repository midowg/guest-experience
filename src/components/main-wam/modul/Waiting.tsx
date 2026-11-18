"use client";

import type { ReactNode } from "react";
import { Hourglass } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { EmptyState } from "@/components/main-wam/ui";

/** Before the module's migration has run: a calm "menunggu pembaruan sistem", never an error. */
export function Waiting({ children }: { children?: ReactNode }) {
  const t = useT();
  return <ScreenContent>
    <EmptyState icon={<Hourglass />} title={t("srv.waitingTitle")}>{children ?? t("srv.waitingBody")}</EmptyState>
  </ScreenContent>;
}
