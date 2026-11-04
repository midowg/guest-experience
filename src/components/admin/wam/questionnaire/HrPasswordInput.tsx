"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field } from "@/components/ui";
import { HR_PASSWORD_MAX, hrPasswordStrength } from "@/lib/pra-wam/hr-password";
import styles from "@/components/admin/admin.module.css";
import hr from "./hr.module.css";

/**
 * A password field with "Tampilkan": the admin login's field, used by every HR password form.
 * `strength` adds the meter under it (for a new password only).
 */
export function HrPasswordInput({ id, label, value, onChange, autoComplete, disabled, error, hint, strength = false, autoFocus = false }: {
  id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: "current-password" | "new-password";
  disabled?: boolean; error?: string; hint?: string; strength?: boolean; autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const meter = strength && value ? hrPasswordStrength(value) : null;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`, meter && `${id}-strength`].filter(Boolean).join(" ") || undefined;
  return <div className={hr.passwordField}>
    <Field label={label} name={id} error={error} hint={hint}>
      <span className={styles.passwordRow}>
        <input className="input" id={id} name={id} type={visible ? "text" : "password"} autoComplete={autoComplete} maxLength={HR_PASSWORD_MAX}
          value={value} disabled={disabled} autoFocus={autoFocus} spellCheck={false} autoCapitalize="off"
          aria-invalid={!!error} aria-describedby={describedBy} onChange={event => onChange(event.target.value)} />
        <button type="button" className={styles.passwordToggle} onClick={() => setVisible(shown => !shown)} aria-pressed={visible} aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}>
          {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </span>
    </Field>
    {meter && <div id={`${id}-strength`} className={hr.strength} data-level={meter.level} aria-live="polite">
      <span className={hr.strengthBars} aria-hidden="true"><span /><span /><span /></span>
      <span><strong>{meter.label}.</strong> {meter.hint}</span>
    </div>}
  </div>;
}
