"use client";

import { startTransition } from "react";
import { CircleAlert, House, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, EmptyState } from "@/components/main-wam/ui";
import { mainWamPath } from "@/lib/routes";
import { ScreenContent } from "./Layout";
import css from "./shell.module.css";

/**
 * A screen that failed unexpectedly (an error boundary's view, audit R2/T-S02): inside the frame,
 * in Main WAM's theme, with "Coba lagi" (reads the screen again) and the way back to Beranda, so a
 * phone without a Back button (an installed iPhone app) is never stuck.
 */
export function ScreenFailed({ reset }: { reset: () => void }) {
  const router = useRouter();
  const again = () => startTransition(() => { router.refresh(); reset(); });
  return <ScreenContent>
    <EmptyState icon={<CircleAlert />} title="Layar ini belum dapat dibuka"
      action={<div className={css.failedActions}>
        <Button variant="tonal" size="m" icon={<RotateCw />} onClick={again}>Coba lagi</Button>
        <Button variant="text" size="m" icon={<House />} href={mainWamPath.home}>Ke Beranda</Button>
      </div>}>
      Periksa sinyal, lalu coba lagi.
    </EmptyState>
  </ScreenContent>;
}
