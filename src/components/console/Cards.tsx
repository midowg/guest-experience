import { Children, type MouseEventHandler, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import css from "./console.module.css";
import { Avatar, Pill, RolePills, type RoleItem } from "./Pill";
import type { ConsoleTone } from "./types";

/** A wrapping grid of cards (262 px each, one column on a phone), as a list. */
export function CardGrid({ label, children }: { label?: string; children: ReactNode }) {
  return <ul className={css.cardGrid} aria-label={label}>{Children.map(children, child => child == null || child === false ? null : <li>{child}</li>)}</ul>;
}

export type PersonCardProps = {
  name: string;
  job?: string;
  photo?: string | null;
  avatarTone?: ConsoleTone;
  status?: { label: string; tone?: ConsoleTone };
  unit?: string;
  roles?: readonly RoleItem[];
  maxRoles?: number;
  email?: string;
  /** e.g. "Terakhir masuk: 3 Nov, 09.12". */
  meta?: ReactNode;
  /** The whole card opens this, or calls onClick. */
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

/** One person: avatar and status, name and job, unit and roles, then email and a meta line. */
export function PersonCard({ name, job, photo, avatarTone, status, unit, roles = [], maxRoles = 1, email, meta, href, onClick }: PersonCardProps) {
  const body = <>
    <span className={css.personTop}>
      <Avatar name={name} photo={photo} tone={avatarTone} />
      {status && <Pill tone={status.tone ?? "neutral"}>{status.label}</Pill>}
    </span>
    <span className={css.personName}><span>{name}</span>{job && <span>{job}</span>}</span>
    <span className={css.personCols}>
      <span className={css.personCol}><span>Unit</span><span title={unit}>{unit || "—"}</span></span>
      <span className={css.personCol}><span>Peran</span><RolePills roles={roles} max={maxRoles} /></span>
    </span>
    {(email || meta || href || onClick) && <span className={css.personFoot}>
      <span className={css.personFootText}>
        {email && <span title={email}>{email}</span>}
        {meta && <span className={css.personMeta}>{meta}</span>}
      </span>
      {(href || onClick) && <ChevronRight size={18} aria-hidden="true" />}
    </span>}
  </>;
  if (href) return <a href={href} className={css.personCard}>{body}</a>;
  if (onClick) return <button type="button" className={css.personCard} onClick={onClick}>{body}</button>;
  return <div className={css.personCard}>{body}</div>;
}

/** Key numbers side by side in equal columns; they wrap on a phone. */
export function StatRow({ label, children }: { label?: string; children: ReactNode }) {
  return <ul className={css.statRow} aria-label={label}>{Children.map(children, child => child == null || child === false ? null : <li>{child}</li>)}</ul>;
}

/** One key number: label and icon, the value (in its tone), and a note. With `href` the card opens it. */
export function StatCard({ label, value, note, icon, tone, href }: { label: string; value: ReactNode; note?: ReactNode; icon?: ReactNode; tone?: ConsoleTone; href?: string }) {
  const body = <>
    <span className={css.statHead}><span>{label}</span>{icon && <span className={css.statIcon} aria-hidden="true">{icon}</span>}</span>
    <span className={`${css.statValue} ${tone ? css.toned : ""}`} data-tone={tone}>{value}</span>
    {note && <span className={css.statNote}>{note}</span>}
  </>;
  return href ? <a href={href} className={css.statCard}>{body}</a> : <div className={css.statCard}>{body}</div>;
}

/** A white card with a title and an optional link on the right ("Lihat semua"). */
export function Card({ title, action, headingLevel = 2, id, children }: { title: ReactNode; action?: { label: string; href: string }; headingLevel?: 2 | 3; id?: string; children: ReactNode }) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return <section className={css.card} aria-labelledby={id}>
    <div className={css.cardHead}>
      <Heading className={css.cardTitle} id={id}>{title}</Heading>
      {action && <a href={action.href} className={css.cardAction}>{action.label}</a>}
    </div>
    {children}
  </section>;
}

/** The list a ListRow goes in. */
export function RowList({ label, children }: { label?: string; children: ReactNode }) {
  return <ul className={css.rowList} aria-label={label}>{children}</ul>;
}

/** One row: a tinted icon square, a title and a line, and something on the right. With `href` the row's text is a link. */
export function ListRow({ icon, tone = "blue", title, sub, trailing, href }: { icon?: ReactNode; tone?: ConsoleTone; title: ReactNode; sub?: ReactNode; trailing?: ReactNode; href?: string }) {
  const main = <>
    {icon && <span className={`${css.listIcon} ${css.toned}`} data-tone={tone} aria-hidden="true">{icon}</span>}
    <span className={css.listText}><span className={css.listTitle}>{title}</span>{sub && <span className={css.listSub}>{sub}</span>}</span>
  </>;
  return <li className={css.listRow}>
    {href ? <a href={href} className={css.listMain}>{main}</a> : <span className={css.listMain}>{main}</span>}
    {trailing && <span className={css.listTrailing}>{trailing}</span>}
  </li>;
}
