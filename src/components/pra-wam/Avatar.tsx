"use client";

import { useState } from "react";
import { initialsOf } from "@/lib/pra-wam/photo";
import css from "./avatar.module.css";

export type AvatarSize = "sm" | "md" | "lg" | "xl";
const pixels: Record<AvatarSize, number> = { sm: 28, md: 36, lg: 56, xl: 96 };

/**
 * A person's round profile photo with a brass ring, or their initials when there is none (or it
 * fails to load). `decorative` when the name is written right beside it, so it is not read twice.
 */
export function Avatar({ name, photo, size = "md", decorative, className = "" }: { name: string; photo: string | null; size?: AvatarSize; decorative?: boolean; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = !!photo && failed !== photo;
  const classes = `${css.avatar} ${css[size]} ${className}`;
  if (showPhoto) {
    return <span className={classes}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a redirect to a signed storage address; next/image would cache it */}
      <img src={photo} alt={decorative ? "" : name} width={pixels[size]} height={pixels[size]} decoding="async" onError={() => setFailed(photo)} />
    </span>;
  }
  return <span className={`${classes} ${css.initials}`} {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })}>
    {initialsOf(name) || "?"}
  </span>;
}
