"use client";

import { useId } from "react";
import type { Lang } from "@/lib/main-wam/i18n";
import { FONT_STACK, hasTemplate, hexRgb, LOGO_SRC, NET_SRC, withAlpha, SHADOW, templateLayout, type SignId } from "@/lib/main-wam/momen/camera-templates";

/*
 * The live preview of a camera sign: the same ops the sent photo draws (templateLayout), as an SVG over
 * the 4:5 viewfinder. The viewBox is the 4:5 design (400 x 500) and stretches to the viewfinder, so the
 * preview is the result. Nothing for Tanpa. The tone is not here: it is a CSS filter on the video, under this. The colours come from the template list (src/lib), not from here.
 */

export const TEMPLATE_VIEW = { width: 400, height: 500 } as const;

export function TemplateOverlay({ sign, lang, className }: { sign: SignId; lang: Lang; className?: string }) {
  const uid = useId().replace(/:/g, "");
  if (!hasTemplate(sign)) return null;
  const ops = templateLayout(sign, TEMPLATE_VIEW.width, TEMPLATE_VIEW.height, lang);
  return <svg className={className} data-sign={sign} viewBox={`0 0 ${TEMPLATE_VIEW.width} ${TEMPLATE_VIEW.height}`} preserveAspectRatio="none" aria-hidden focusable="false">
    <defs>
      <filter id={`${uid}-shadow`} x="-10%" y="-30%" width="120%" height="170%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
        <feOffset in="blur" dy="0.8" result="off" />
        <feFlood floodColor={SHADOW} floodOpacity="0.55" />
        <feComposite in2="off" operator="in" result="shade" />
        <feMerge><feMergeNode in="shade" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      {ops.map((op, i) => {
        if (op.k === "grad") return <linearGradient key={i} id={`${uid}-g${i}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={withAlpha(op.color, 1)} stopOpacity={op.dir === "down" ? op.a0 : op.a1} />
          <stop offset="1" stopColor={withAlpha(op.color, 1)} stopOpacity={op.dir === "down" ? op.a1 : op.a0} />
        </linearGradient>;
        if (op.k === "logo") {
          const [r, g, b] = hexRgb(op.color).map(v => (v / 255).toFixed(4));
          return <filter key={i} id={`${uid}-t${i}`} x="-20%" y="-20%" width="140%" height="150%">
            <feColorMatrix type="matrix" values={`0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 1 0`} result="tint" />
            {op.shadow && <>
              <feGaussianBlur in="tint" stdDeviation="2.2" result="blur" />
              <feOffset in="blur" dy="1" result="off" />
              <feFlood floodColor={SHADOW} floodOpacity="0.5" />
              <feComposite in2="off" operator="in" result="shade" />
              <feMerge><feMergeNode in="shade" /><feMergeNode in="tint" /></feMerge>
            </>}
          </filter>;
        }
        return null;
      })}
    </defs>
    {ops.map((op, i) => {
      switch (op.k) {
        case "rect": return <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill={op.fill} fillOpacity={op.opacity ?? 1} />;
        case "grad": return <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill={`url(#${uid}-g${i})`} />;
        case "frame": return <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill="none" stroke={op.color} strokeWidth={op.line} strokeOpacity={op.opacity ?? 1} />;
        case "text": return <text key={i} x={op.x} y={op.y} fontFamily={FONT_STACK} fontSize={op.size} fontWeight={op.weight} fill={op.color} textAnchor={op.align} letterSpacing={op.ls * op.size} filter={op.shadow ? `url(#${uid}-shadow)` : undefined}>{op.text}</text>;
        case "logo": return <image key={i} href={LOGO_SRC} x={op.x} y={op.y} width={op.w} height={op.h} filter={`url(#${uid}-t${i})`} data-logo="" />;
        case "net": return <image key={i} href={NET_SRC} x={op.x} y={op.y} width={op.w} height={op.h} opacity={op.opacity} preserveAspectRatio="none" />;
      }
    })}
  </svg>;
}
