import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import css from "./console.module.css";
import type { Crumb } from "./types";

/**
 * The top of a console page: the breadcrumb (the last step is this page), the title, an optional
 * line under it, and the actions on the right (they wrap below on a phone). One primary action per screen.
 */
export function PageHeader({ crumbs = [], title, subtitle, actions }: { crumbs?: readonly Crumb[]; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return <header className={css.pageHeader}>
    <div className={css.pageHeaderMain}>
      {crumbs.length > 0 && <Breadcrumb crumbs={crumbs} />}
      <h1 className={css.pageTitle}>{title}</h1>
      {subtitle && <p className={css.pageSubtitle}>{subtitle}</p>}
    </div>
    {actions && <div className={css.pageActions}>{actions}</div>}
  </header>;
}

export function Breadcrumb({ crumbs }: { crumbs: readonly Crumb[] }) {
  return <nav className={css.crumbs} aria-label="Lokasi halaman">
    <ol>{crumbs.map((crumb, index) => {
      const { label, href } = typeof crumb === "string" ? { label: crumb, href: undefined } : crumb;
      const last = index === crumbs.length - 1;
      return <li key={`${index}-${label}`}>
        {last ? <span aria-current="page">{label}</span> : href ? <a href={href}>{label}</a> : <span>{label}</span>}
      </li>;
    })}</ol>
  </nav>;
}

export type ButtonVariant = "primary" | "secondary";
/** The classes of a console button, for a control that is neither ConsoleButton nor ConsoleButtonLink. */
export const buttonClass = (variant: ButtonVariant = "secondary") => `${css.button} ${variant === "primary" ? css.buttonPrimary : css.buttonSecondary}`;

/** 40 px, radius 12; primary is the blue one (one per screen), secondary white with a line. */
export function ConsoleButton({ variant = "secondary", icon, className, children, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: ReactNode }) {
  return <button type={type} className={`${buttonClass(variant)} ${className ?? ""}`} {...props}>{icon}{children}</button>;
}

export function ConsoleButtonLink({ variant = "secondary", icon, className, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; variant?: ButtonVariant; icon?: ReactNode }) {
  return <a className={`${buttonClass(variant)} ${className ?? ""}`} {...props}>{icon}{children}</a>;
}
