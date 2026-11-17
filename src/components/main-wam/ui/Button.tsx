import type { AriaAttributes, ReactNode, Ref } from "react";
import { LoaderCircle } from "lucide-react";
import { Badge } from "./Status";
import { cx, KitIcon, Pressable, type ActionProps, type IconProp } from "./Pressable";
import shared from "./shared.module.css";
import css from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "tonal" | "text" | "danger" | "danger-outline" | "danger-text" | "ondark";

const VARIANT: Record<ButtonVariant, string> = {
  primary: css.primary, secondary: css.secondary, tonal: css.tonal, text: css.text,
  danger: css.danger, "danger-outline": css.dangerOutline, "danger-text": css.dangerText, ondark: css.ondark,
};

export type ButtonProps = ActionProps & AriaAttributes & {
  variant?: ButtonVariant;
  /** L 48 (default) or M 40; both keep a 44 touch area. */
  size?: "l" | "m";
  /** As wide as its parent (action bars, dialogs, sheets). */
  block?: boolean;
  /** Icon before the label (20). */
  icon?: IconProp;
  /** Working: a spinner replaces the icon, clicks are ignored, focus stays (aria-busy, not disabled). */
  loading?: boolean;
  /** Words while loading ("Mengirim…"); the label stays when left out. */
  loadingLabel?: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  children: ReactNode;
  className?: string;
  id?: string;
  ref?: Ref<HTMLElement>;
};

/**
 * Button (DS #10). One primary per screen; the others secondary, tonal or text. A risky action goes
 * through ConfirmDialog first, its label naming the result ("Hapus foto", not "Ya"). A disabled
 * button always has its reason written next to it. Labels are 1–2 words and never cut.
 * With `href` it is a link that looks like a button.
 */
export function Button({ variant = "primary", size = "l", block, icon, loading, loadingLabel, disabled, type = "button", children, className, href, external, onClick, ref, ...aria }: ButtonProps) {
  const busy = !!loading && !disabled;
  return <Pressable ref={ref} href={busy ? undefined : href} external={external} onClick={busy ? undefined : onClick}
    // A busy submit button does not submit again.
    type={busy && type === "submit" ? "button" : type} asButton disabled={disabled}
    aria-busy={busy || undefined} className={cx(css.btn, VARIANT[variant], size === "m" && css.m, block && css.block, className)} {...aria}>
    {busy ? <LoaderCircle aria-hidden className={shared.spin} /> : <KitIcon icon={icon} />}
    <span className={css.label}>{busy && loadingLabel ? loadingLabel : children}</span>
  </Pressable>;
}

export type IconButtonVariant = "standard" | "tonal" | "filled" | "onmedia" | "ondark";

const ICON_VARIANT: Record<IconButtonVariant, string> = {
  standard: css.iconStandard, tonal: css.iconTonal, filled: css.iconFilled, onmedia: css.iconOnmedia, ondark: css.iconOndark,
};

/**
 * IconButton (DS #11): 44 round (56 for the torch), always with a spoken name (`label`), e.g.
 * "Kembali", "Tutup", "Notifikasi, 3 belum dibaca". `pressed` makes it a toggle (aria-pressed);
 * with `liked` a pressed heart fills red.
 */
export function IconButton({ icon, label, variant = "standard", size = 44, pressed, liked, badge, disabled, href, external, onClick, className, ref, ...aria }: ActionProps & AriaAttributes & {
  icon: IconProp;
  /** Spoken name; include a count when there is a badge ("Notifikasi, 3 belum dibaca"). */
  label: string;
  variant?: IconButtonVariant;
  size?: 44 | 56;
  /** A toggle: aria-pressed. */
  pressed?: boolean;
  /** Pressed shows a filled red heart. */
  liked?: boolean;
  /** A count or "dot" on the icon. */
  badge?: number | "dot";
  disabled?: boolean;
  className?: string;
  ref?: Ref<HTMLElement>;
}) {
  return <Pressable ref={ref} href={href} external={external} onClick={onClick} disabled={disabled} asButton aria-label={label} aria-pressed={pressed}
    className={cx(css.icon, ICON_VARIANT[variant], size === 56 && css.icon56, liked && css.liked, className)} {...aria}>
    <KitIcon icon={icon} />
    {badge !== undefined && <Badge className={css.badge} dot={badge === "dot"} count={typeof badge === "number" ? badge : undefined} />}
  </Pressable>;
}
