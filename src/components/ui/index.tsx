import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export { Loading } from "./Loading";

type Variant = "primary" | "secondary" | "quiet" | "danger";
export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`button button--${variant} ${className}`} {...props} />;
}
export function ButtonLink({ variant = "primary", className = "", ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant }) {
  return <a className={`button button--${variant} ${className}`} {...props} />;
}
export function Field({ label, name, error, hint, children }: { label: string; name: string; error?: string; hint?: string; children: ReactNode }) {
  return <div className="field"><label htmlFor={name}>{label}</label>{children}{hint && <p id={`${name}-hint`} className="field-hint">{hint}</p>}{error && <p id={`${name}-error`} className="field-error">{error}</p>}</div>;
}
export function Notice({ children, tone = "info", role }: { children: ReactNode; tone?: "info" | "error" | "success" | "warning"; role?: "alert" | "status" }) {
  return <div className={`notice notice--${tone}`} role={role ?? (tone === "error" ? "alert" : "status")}>{children}</div>;
}
export function SectionHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return <header className="section-heading">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2>{children && <div className="section-description">{children}</div>}</header>;
}
