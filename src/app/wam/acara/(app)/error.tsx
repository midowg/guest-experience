"use client";

import { ScreenFailed } from "@/components/main-wam/shell";

/**
 * Any Main WAM screen that fails unexpectedly and has no error.tsx of its own (Momen, Kelola,
 * Ringkasan, Absen, Silent Meeting, Awarding, Beranda): shown inside the frame and the theme, with
 * "Coba lagi" and "Ke Beranda" (audit R2/T-S02), never Journey's page outside Main WAM.
 */
export default function MainWamScreenError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ScreenFailed reset={reset} />;
}
