"use client";

import { useEffect, useId, useRef } from "react";
import { useKnown, useT } from "@/components/main-wam/i18n";
import css from "./sheet.module.css";

/** The animations of the loader kit (public/wam/loader-*.svg, from the prototype). */
export const LOADERS = {
  pegasus: "/wam/loader-pegasus.svg",
  orbit: "/wam/loader-orbit.svg",
  network: "/wam/loader-jaringan-putar.svg",
  mini: "/wam/loader-mini.svg",
} as const;
export type LoaderKind = keyof typeof LOADERS;

/**
 * Loading dialog (prototype "Sedang masuk"): a themed card in the middle of the screen over a dimmed
 * page, with the kit's loader, a short title ("Sedang masuk", "Mengirim foto") and "Mohon tunggu
 * sebentar". For waits that must not be interrupted (sign-in, sending a photo): a native modal, so the
 * page under it is inert, and Esc does nothing. The person cannot close it, only `open` turning false
 * does. The loader animations stop with reduced motion (inside the SVG).
 */
export function LoadingDialog({ open, title, loader = "pegasus", className }: { open: boolean; title: string; loader?: LoaderKind; className?: string }) {
  const t = useT();
  const known = useKnown();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", ""); }
    if (!open && dialog.open) { if (dialog.close) dialog.close(); else dialog.removeAttribute("open"); }
  }, [open]);
  useEffect(() => () => { const dialog = ref.current; if (dialog?.open && dialog.close) dialog.close(); }, []);
  return <dialog ref={ref} role="alertdialog" aria-modal="true" aria-busy="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-s`}
    className={`${css.loadingDialog} ${className ?? ""}`} onCancel={event => event.preventDefault()} data-testid="loading-dialog">
    {open && <>
      {/* eslint-disable-next-line @next/next/no-img-element -- an animated SVG: next/image would not run it */}
      <img className={css.loadingLoader} src={LOADERS[loader]} alt="" width={160} height={160} />
      <p id={`${id}-t`} className={css.loadingTitle}>{known(title)}</p>
      <p id={`${id}-s`} className={css.loadingSub}>{t("ui.pleaseWait")}</p>
    </>}
  </dialog>;
}
