import type { CSSProperties, ReactNode } from "react";
import css from "./console.module.css";
import type { ConsoleTone } from "./types";

/** A status or role in a rounded pill; `tone` picks its colour pair. */
export function Pill({ tone = "neutral", title, className, children }: { tone?: ConsoleTone; title?: string; className?: string; children: ReactNode }) {
  return <span className={`${css.pill} ${css.toned} ${className ?? ""}`} data-tone={tone} title={title}>{children}</span>;
}

export type RoleItem = string | { label: string; tone?: ConsoleTone };

/**
 * A person's roles in one line: the first `max` as pills, the rest as a neutral "+N" whose tooltip
 * and screen-reader text name them, so a table cell never overflows. `empty` shows when there are none.
 */
export function RolePills({ roles, max = 1, tone = "blue", empty = "—" }: { roles: readonly RoleItem[]; max?: number; tone?: ConsoleTone; empty?: ReactNode }) {
  const items = roles.map(role => typeof role === "string" ? { label: role, tone } : { label: role.label, tone: role.tone ?? tone });
  if (items.length === 0) return <span className={css.rolePills}>{empty}</span>;
  const shown = items.slice(0, Math.max(0, max));
  const rest = items.slice(shown.length);
  const restNames = rest.map(item => item.label).join(", ");
  return <span className={css.rolePills}>
    {shown.map(item => <Pill key={item.label} tone={item.tone} title={item.label}>{item.label}</Pill>)}
    {rest.length > 0 && <Pill tone="neutral" title={restNames} className={css.pillMore}>
      <span aria-hidden="true">+{rest.length}</span><span className="sr-only">dan {rest.length} peran lain: {restNames}</span>
    </Pill>}
  </span>;
}

const avatarTones: ConsoleTone[] = ["blue", "teal", "purple", "brass", "ok", "warn"];

/** Up to two initials: "Dewi Lestari" → "DL", "Andi" → "AN". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** The same name always gets the same tone. */
export function toneFor(name: string): ConsoleTone {
  let sum = 0;
  for (const char of name) sum = (sum * 31 + char.charCodeAt(0)) >>> 0;
  return avatarTones[sum % avatarTones.length];
}

/** A photo, or the initials on a tone. Decorative: the name is always written next to it. */
export function Avatar({ name, photo, size = 44, tone }: { name: string; photo?: string | null; size?: number; tone?: ConsoleTone }) {
  const style = { "--avatar": `${size}px` } as CSSProperties;
  return <span className={`${css.avatar} ${css.toned}`} data-tone={tone ?? toneFor(name)} style={style} aria-hidden="true">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {photo ? <img src={photo} alt="" width={size} height={size} loading="lazy" /> : initials(name)}
  </span>;
}
