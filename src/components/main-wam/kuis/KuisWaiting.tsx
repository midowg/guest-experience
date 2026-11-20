"use client";

import { Hourglass } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { EmptyState } from "@/components/main-wam/ui";

/** Kuis live before its migration (KONTRAK §8): the plain words, never the file's name. */
export function KuisWaiting() {
  const t = useT();
  return <ScreenContent><EmptyState icon={<Hourglass />} title={t("kuis.waiting.title")}>{t("kuis.waiting.body")}</EmptyState></ScreenContent>;
}
