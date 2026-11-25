"use client";

import { useState, type CSSProperties } from "react";
import { figurePicture, initialsOf } from "@/lib/main-wam/kuis/admin";
import type { Alias } from "@/lib/main-wam/kuis/types";
import { cx } from "@/components/main-wam/ui";
import css from "./avatar.module.css";

/**
 * A player as everyone sees them: the tokoh's toy figure, or a silhouette for a Tokoh misterius (never a
 * person's photo or name), on the theme's own surface (KONTRAK: Kuis live reads only the theme's colours).
 * Decorative: the name is written beside it.
 */
export function TokohAvatar({ alias, size = 48, card = false, className }: { alias: Alias; size?: number; /** A rounded card (4:5) instead of a circle: the lobby's big tokoh (prototipe .av). */ card?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  const style = { "--kz-size": `${size}px` } as CSSProperties;
  return <span className={cx(css.avatar, card && css.card, className)} style={style} aria-hidden="true">
    {alias.figure && !broken
      // eslint-disable-next-line @next/next/no-img-element -- a small shipped picture in a circle; next/image adds nothing here
      ? <img src={figurePicture(alias.figure)} alt="" draggable={false} onError={() => setBroken(true)} />
      : alias.figure ? <span className={css.initials}>{initialsOf(alias.name)}</span>
        : <svg viewBox="0 0 64 64" className={css.silhouette}><circle cx="32" cy="24" r="11" /><path d="M12 55c2.2-11 10-17 20-17s17.8 6 20 17z" /></svg>}
  </span>;
}
