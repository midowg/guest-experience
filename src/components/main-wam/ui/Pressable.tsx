import Link from "next/link";
import { cloneElement, isValidElement, type AriaAttributes, type ComponentType, type MouseEventHandler, type ReactElement, type ReactNode, type Ref } from "react";
import type { LucideProps } from "lucide-react";

/*
 * Most kit components carry no "use client": they hold no state, so a server page can render them
 * as they are, and a client component can too. Only the ones with state or keyboard handling
 * (Segmented, Switch, Sheet, ConfirmDialog, Toast, the shell) are client components.
 */

/**
 * An icon for a kit component. From a server page pass an element (`icon={<House />}`): a component
 * cannot cross to a client component. From a client component either form works (`icon={House}`).
 * The kit sizes it and hides it from screen readers.
 */
export type IconProp = ComponentType<LucideProps> | ReactElement<LucideProps>;

/** Draws an IconProp, always aria-hidden. */
export function KitIcon({ icon, className }: { icon?: IconProp | null; className?: string }) {
  if (!icon) return null;
  if (isValidElement<LucideProps>(icon)) {
    return cloneElement(icon, { "aria-hidden": true, className: cx(icon.props.className, className) });
  }
  const Icon = icon as ComponentType<LucideProps>;
  return <Icon aria-hidden className={className} />;
}

/** What makes a kit control act: an address (a link) or a handler (a button). */
export type ActionProps = {
  /** An address in the app (client navigation, prefetched) or outside it (with `external`). */
  href?: string;
  /** Opens in a new tab with rel="noopener noreferrer". */
  external?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
};

type Props = ActionProps & AriaAttributes & {
  className?: string;
  children?: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  id?: string;
  title?: string;
  role?: string;
  tabIndex?: number;
  ref?: Ref<HTMLElement>;
  /** Used when there is neither href nor onClick (a row that only shows): a plain <div>. */
  staticAs?: "div" | "span" | "li" | "article" | "section";
  /** Render a <button> even without onClick (e.g. a form's submit, or a trigger wired by a parent). */
  asButton?: boolean;
};

/**
 * The element behind every pressable kit control: next/link for an address in the app (no full
 * reload, prefetch), a plain <a> for an outside address, a <button type="button"> for a handler, and
 * a <div> when the thing only shows. A disabled link is rendered as a span with aria-disabled, as
 * links cannot be disabled.
 */
export function Pressable({ href, external, onClick, className, children, disabled, type = "button", staticAs = "div", asButton, ref, ...rest }: Props) {
  if (href && !disabled) {
    if (external) {
      return <a ref={ref as Ref<HTMLAnchorElement>} href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick} {...rest}>{children}</a>;
    }
    return <Link ref={ref as Ref<HTMLAnchorElement>} href={href} className={className} onClick={onClick} {...rest}>{children}</Link>;
  }
  if (href && disabled) {
    return <span ref={ref as Ref<HTMLSpanElement>} className={className} aria-disabled="true" {...rest}>{children}</span>;
  }
  if (onClick || asButton || type !== "button") {
    return <button ref={ref as Ref<HTMLButtonElement>} type={type} className={className} onClick={onClick} disabled={disabled} {...rest}>{children}</button>;
  }
  const Tag = staticAs as "div";
  return <Tag ref={ref as Ref<HTMLDivElement>} className={className} {...rest}>{children}</Tag>;
}

/** Joins class names, skipping the empty ones. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
