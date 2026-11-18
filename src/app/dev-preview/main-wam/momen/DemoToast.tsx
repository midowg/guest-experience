"use client";

import { useEffect } from "react";
import { PhotoFill, useToast, type ToastTone } from "@/components/main-wam/ui";
import css from "@/components/main-wam/momen/momen.module.css";

/** Dev preview only: shows one toast as a screen state would (kept long enough for a screenshot). */
export function DemoToast({ text, sub, tone, action, secondary, timer, thumb }: { text: string; sub?: string; tone?: ToastTone; action?: string; secondary?: string; timer?: boolean; thumb?: boolean }) {
  const toast = useToast();
  useEffect(() => {
    const id = toast.show({ text, sub, tone, timer, duration: 600_000, thumb: thumb ? <PhotoFill tone={2} className={css.fill} /> : undefined, action: action ? { label: action, onAction: () => undefined } : undefined, secondary: secondary ? { label: secondary, onAction: () => undefined } : undefined });
    return () => toast.dismiss(id);
  }, [toast, text, sub, tone, action, secondary, timer, thumb]);
  return null;
}
