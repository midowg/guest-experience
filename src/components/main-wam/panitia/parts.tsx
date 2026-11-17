import type { ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import { IconBox, type IconBoxTone } from "@/components/main-wam/ui";
import type { IconProp } from "@/components/main-wam/ui";
import css from "./panitia.module.css";

/*
 * Small pieces of area C the kit does not have (KIT.md §6: CheckboxRow, a bar without a label row,
 * an empty state in a status colour). Stateless: server pages and client screens both use them.
 */

/** A bar under a number that already says it ("112 dari 120 hadir"), spoken as a progressbar. */
export function Bar({ value, label, thin }: { value: number; label: string; thin?: boolean }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} className={`${css.bar} ${thin ? css.barThin : ""}`}>
    <span className={css.barFill} style={{ width: `${clamped}%` }} />
  </span>;
}

/** CheckboxRow (.wam-check): the whole row toggles; an error under its line keeps the row described. */
export function CheckboxRow({ title, sub, checked, onToggle, error, id }: { title: ReactNode; sub?: ReactNode; checked: boolean; onToggle: () => void; error?: string | null; id?: string }) {
  const errorId = error && id ? `${id}-e` : undefined;
  return <button type="button" role="checkbox" aria-checked={checked} aria-invalid={error ? true : undefined} aria-describedby={errorId} onClick={onToggle} className={`${css.check} ${error ? css.checkTop : ""}`}>
    <span className={css.checkBox} aria-hidden><Check /></span>
    <span className={css.checkText}>
      <span className={css.checkTitle}>{title}</span>
      {sub && <span className={css.checkSub}>{sub}</span>}
      {error && <span id={errorId} className={`${css.errorText} ${css.checkError}`}><CircleAlert aria-hidden />{error}</span>}
    </span>
  </button>;
}

/** An empty state with its icon in a status colour ("Semua sudah hadir." in green). */
export function EmptyBlock({ icon, tone = "neutral", title, children }: { icon: IconProp; tone?: IconBoxTone; title: ReactNode; children?: ReactNode }) {
  return <div className={css.empty}>
    <IconBox icon={icon} size={64} round tone={tone} />
    <h3 className={css.emptyTitle}>{title}</h3>
    {children}
  </div>;
}

/** An error line in words (with its icon), e.g. under a pair of fields. */
export function ErrorLine({ id, children }: { id?: string; children: ReactNode }) {
  return <p id={id} className={css.errorText} role="alert"><CircleAlert aria-hidden />{children}</p>;
}
