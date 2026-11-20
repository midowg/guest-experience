"use client";

import { useState, type CSSProperties } from "react";
import { figurePicture, initialsOf } from "@/lib/main-wam/kuis/admin";
import type { Alias } from "@/lib/main-wam/kuis/types";
import { cx } from "@/components/main-wam/ui";
import css from "./avatar.module.css";

/**
 * A player as everyone sees them: the tokoh's toy figure on its persona's colours, or a silhouette
 * for a Tokoh misterius (never a person's photo or name). Decorative: the name is written beside it.
 */
export function TokohAvatar({ alias, size = 48, breathe = false, className }: { alias: Alias; size?: number; breathe?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  // The persona's colours are data (the card's), set as the circle's own properties.
  const style = { "--kz-size": `${size}px`, ...(alias.colors ? { "--kz-c1": alias.colors[0], "--kz-c2": alias.colors[1] } : {}) } as CSSProperties;
  return <span className={cx(css.avatar, alias.colors ? css.persona : css.mystery, breathe && css.breathe, className)} style={style} aria-hidden="true">
    {alias.figure && !broken
      // eslint-disable-next-line @next/next/no-img-element -- a small shipped picture in a circle; next/image adds nothing here
      ? <img src={figurePicture(alias.figure)} alt="" draggable={false} onError={() => setBroken(true)} />
      : alias.figure ? <span className={css.initials}>{initialsOf(alias.name)}</span>
        : <svg viewBox="0 0 64 64" className={css.silhouette}><circle cx="32" cy="24" r="11" /><path d="M12 55c2.2-11 10-17 20-17s17.8 6 20 17z" /></svg>}
  </span>;
}
