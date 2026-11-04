"use client";

import { useEffect, useRef, useState } from "react";
import type { CardView } from "@/lib/server/pra-wam/cards";
import { drawFront } from "../questionnaire/cardArt";
import css from "./colleagues.module.css";

/**
 * A character card drawn in the browser, as at the end of the questionnaire (cardArt), once it is
 * near the screen: a gallery of a hundred cards draws only the ones looked at. Until then, and if
 * drawing fails, the level's colour holds its place.
 */
export function CardImage({ card, alt, scale = 0.3, eager = false }: { card: CardView; alt: string; scale?: number; eager?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [near, setNear] = useState(eager);

  useEffect(() => {
    if (near) return;
    const element = box.current;
    if (!element || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(seen => { if (seen.some(entry => entry.isIntersecting)) { setNear(true); observer.disconnect(); } }, { rootMargin: "300px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return;
    let gone = false;
    drawFront(card, scale).then(canvas => { if (!gone) setSrc(canvas.toDataURL("image/webp", 0.86)); }).catch(() => undefined);
    return () => { gone = true; };
  }, [near, card, scale]);

  return <div ref={box} className={css.art} style={{ background: `linear-gradient(160deg, ${card.tier.color}, #141325)` }}>
    {/* eslint-disable-next-line @next/next/no-img-element -- drawn in the browser, a data URL */}
    {src ? <img src={src} alt={alt} /> : <span className="sr-only">{alt}</span>}
  </div>;
}
