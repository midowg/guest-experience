"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import type { PlainImage } from "@/lib/types";
import { imageSrcSet } from "./Gallery";
import { useWording } from "./language";
import styles from "./guest.module.css";

/**
 * A small picture that opens full size: the thumbnail is a button, the full photo a native modal
 * dialog (Esc, the close button or a tap on the dark backdrop closes it, and focus returns).
 */
export function PhotoZoom({ image, className, sizes, children }: { image: PlainImage; className?: string; sizes: string; children?: ReactNode }) {
  const { t } = useWording();
  const dialog = useRef<HTMLDialogElement>(null);
  const open = () => { const box = dialog.current; if (!box) return; if (typeof box.showModal === "function") box.showModal(); else box.setAttribute("open", ""); };
  const close = () => { const box = dialog.current; if (!box) return; if (typeof box.close === "function") box.close(); else box.removeAttribute("open"); };
  return <>
    <button type="button" className={`${styles.zoomThumb} ${className ?? ""}`.trimEnd()} onClick={open} aria-label={t("photo.open", { name: image.alt })}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.url} {...imageSrcSet(image.srcset, sizes)} alt="" loading="lazy" referrerPolicy="no-referrer" />
      {children}
    </button>
    <dialog ref={dialog} className={styles.zoomDialog} aria-label={image.alt} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <button type="button" className={styles.zoomClose} onClick={close}><X size={20} aria-hidden="true" /><span>{t("photo.close")}</span></button>
      <figure>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} {...imageSrcSet(image.srcset, "100vw")} alt={image.alt} loading="lazy" referrerPolicy="no-referrer" />
        {image.alt && <figcaption>{image.alt}</figcaption>}
      </figure>
    </dialog>
  </>;
}
