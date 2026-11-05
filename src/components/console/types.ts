import type { ReactNode } from "react";

/** The two colour sets: Admin WAM (light admin tokens) and Kelola acara (the app's --pw-* tokens, light or dark). */
export type ConsoleThemeName = "admin" | "pw";

/** The tinted colours of pills, icons, stat values and timeline blocks. */
export type ConsoleTone = "ok" | "warn" | "bad" | "blue" | "brass" | "purple" | "teal" | "neutral";

/** One page in the sidebar. `badge` is a count that waits (shown with "menunggu" for screen readers unless `badgeLabel` says otherwise). */
export type ConsoleNavItem = { key: string; label: string; href: string; icon?: ReactNode; badge?: string; badgeLabel?: string };
export type ConsoleNavGroup = { label: string; items: ConsoleNavItem[] };

/** A link at the foot of the sidebar; `external` opens it in a new tab. */
export type ConsoleLink = { key?: string; label: string; href: string; icon?: ReactNode; external?: boolean };

/** Something the command palette can jump to besides the menu (a person, a hidden page). */
export type ConsoleSearchItem = { key: string; label: string; href: string; sub?: string; icon?: ReactNode };

export type ConsolePerson = { name: string; sub?: string; photo?: string };

/** A breadcrumb step; the last one is the current page. */
export type Crumb = string | { label: string; href?: string };
