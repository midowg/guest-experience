"use client";

import { ScreenContent } from "@/components/main-wam/shell";
import { ScreenError } from "@/components/main-wam/peserta/Live";

/** Saya or one of its screens could not be read: a friendly line and "Coba lagi". Owner A (peserta). */
export default function SayaError({ reset }: { reset: () => void }) {
  return <ScreenContent><ScreenError reset={reset} /></ScreenContent>;
}
