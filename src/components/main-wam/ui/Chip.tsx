import type { AriaAttributes, MouseEventHandler, ReactNode } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cx, KitIcon, Pressable, type ActionProps, type IconProp } from "./Pressable";
import shared from "./shared.module.css";
import css from "./chip.module.css";

/**
 * Chip (DS #12): information, not a control ("Kelompok 4", "Aula Utama"). With `href` it becomes a
 * link with a 44 touch area around the 32 chip. `tone="dark"` on the dark Momen and camera screens.
 */
export function Chip({ icon, children, tone = "default", href, className }: {
  icon?: IconProp;
  children: ReactNode;
  tone?: "default" | "dark";
  href?: string;
  className?: string;
}) {
  const chip = <span className={cx(css.chip, tone === "dark" && css.chipOndark, !href && className)}><KitIcon icon={icon} />{children}</span>;
  if (!href) return chip;
  return <Pressable href={href} className={cx(css.chipLink, className)}>{chip}</Pressable>;
}

type FilterChipBase = AriaAttributes & {
  icon?: IconProp;
  tone?: "default" | "dark";
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  className?: string;
};

/**
 * FilterChip (DS #13, §10.7): a filter that is on or off (`selected`, aria-pressed; a check shows
 * when on), or, with `menu`, a chip that opens a sheet of choices ("Semua sesi ▾"): the chevron at
 * the end, aria-haspopup="dialog" and aria-expanded while the sheet is open. A menu chip shows the
 * current choice (long names end in …, the full name stays in the text for screen readers); `name`
 * is said before it ("Sesi: Pemaparan departemen"); `active` marks a choice other than the default.
 * 36 tall, 44 to touch. `tone="dark"` on Momen.
 */
export function FilterChip(props: FilterChipBase & (
  | { menu?: false; selected: boolean; children: ReactNode }
  | { menu: true; children: ReactNode; name?: string; active?: boolean; expanded?: boolean }
)) {
  const { icon, tone = "default", disabled, onClick, className, ...rest } = props;
  if (props.menu) {
    const { menu: _menu, children, name, active, expanded, ...aria } = rest as { menu: true; children: ReactNode; name?: string; active?: boolean; expanded?: boolean } & AriaAttributes;
    void _menu;
    return <button type="button" onClick={onClick} disabled={disabled} aria-haspopup="dialog" aria-expanded={expanded ?? false}
      className={cx(css.filter, css.menu, tone === "dark" && css.filterOndark, active && css.selected, className)} {...aria}>
      <KitIcon icon={icon} />
      {name && <span className={shared.srOnly}>{name}: </span>}
      <span className={css.value}>{children}</span>
      <ChevronDown aria-hidden />
    </button>;
  }
  const { selected, children, menu: _menu, ...aria } = rest as { selected: boolean; children: ReactNode; menu?: false } & AriaAttributes;
  void _menu;
  return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected}
    className={cx(css.filter, tone === "dark" && css.filterOndark, className)} {...aria}>
    {selected && !icon ? <Check aria-hidden /> : <KitIcon icon={icon} />}
    <span className={css.value}>{children}</span>
  </button>;
}

/** A row of chips: `scroll` slides sideways to the screen edge, otherwise they wrap. */
export function ChipRow({ children, scroll, label, className }: { children: ReactNode; scroll?: boolean; label?: string; className?: string }) {
  return <div role={label ? "group" : undefined} aria-label={label} className={cx(scroll ? css.scroll : css.wrap, className)}>{children}</div>;
}

/**
 * TagChip on the dark camera (§10.7): a dim label and a bright value ("Untuk: Semua ▾"). Pressing it
 * opens the choices (a sheet). With `onClear` it has a second button, ✕, that clears the value
 * ("Sesi: Team building ✕" → Umum); give it `clearLabel` ("Hapus tag sesi, jadikan Umum").
 */
export function TagChip({ label, value, onClick, href, onClear, clearLabel, expanded, className }: Pick<ActionProps, "href" | "onClick"> & {
  /** Dim label before the value ("Untuk:", "Sesi:"). */
  label: string;
  value: ReactNode;
  onClear?: MouseEventHandler<HTMLButtonElement>;
  clearLabel?: string;
  /** The sheet it opens is open. */
  expanded?: boolean;
  className?: string;
}) {
  const main = <>
    <span className={css.tagLabel}>{label}</span>
    <span className={css.tagValue}>{value}</span>
  </>;
  if (onClear) {
    return <span className={cx(css.tag, css.tagClearable, className)}>
      <Pressable href={href} onClick={onClick} asButton className={css.tagMain} aria-haspopup="dialog" aria-expanded={href ? undefined : expanded ?? false}>{main}</Pressable>
      <button type="button" className={css.tagClear} onClick={onClear} aria-label={clearLabel ?? `Hapus ${label.replace(/:$/, "").toLowerCase()}`}><X aria-hidden /></button>
    </span>;
  }
  return <Pressable href={href} onClick={onClick} asButton className={cx(css.tag, className)} aria-haspopup="dialog" aria-expanded={href ? undefined : expanded ?? false}>
    {main}<ChevronDown aria-hidden />
  </Pressable>;
}

/** A centred row of TagChips above the camera's controls. */
export function TagChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(css.tagRow, className)}>{children}</div>;
}
