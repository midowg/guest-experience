"use client";

import { useState } from "react";
import { Button, Field, Notice } from "@/components/ui";
import { passwordRules } from "@/lib/pra-wam/password";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "./api";
import styles from "./pra-wam.module.css";

/**
 * A new password, with the rules ticked off as the person types. `skipHref` adds "Lewati, atur
 * nanti" for the first sign-in; `doneHref` is where to go once it is saved.
 */
export function PasswordForm({ firstTime, skipHref, doneHref }: { firstTime: boolean; skipHref?: string; doneHref?: string }) {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const matches = form.confirm.length > 0 && form.confirm === form.next;
  const differs = form.next.length > 0 && form.next !== form.current;
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setNotice(null);
    try {
      const result = await praWamRequest(praWamApi.password, { method: "POST", json: form });
      if (doneHref) { window.location.assign(doneHref); return; }
      setForm({ current: "", next: "", confirm: "" });
      setNotice({ tone: "success", text: result.message });
    } catch (problem) {
      if (problem instanceof PraWamApiError && problem.fieldErrors) setErrors(Object.fromEntries(Object.entries(problem.fieldErrors).map(([key, list]) => [key, list[0]])));
      setNotice({ tone: "error", text: errorText(problem) });
    } finally { setBusy(false); }
  }

  return <form className={styles.section} onSubmit={submit} noValidate>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <Field name="current" label={firstTime ? "Password awal" : "Password saat ini"} error={errors.current}>
      <input id="current" className="input" type="password" autoComplete="current-password" value={form.current} onChange={set("current")} aria-invalid={!!errors.current} />
    </Field>
    <Field name="next" label="Password baru" error={errors.next}>
      <input id="next" className="input" type="password" autoComplete="new-password" value={form.next} onChange={set("next")} aria-invalid={!!errors.next} aria-describedby="aturan-password" />
    </Field>
    <ul id="aturan-password" className={styles.rules}>
      {passwordRules.map(rule => <li key={rule.id} data-ok={rule.test(form.next)}>{rule.test(form.next) ? "✓" : "•"} {rule.label}</li>)}
      <li data-ok={differs}>{differs ? "✓" : "•"} Berbeda dari password {firstTime ? "awal" : "saat ini"}</li>
    </ul>
    <Field name="confirm" label="Ulangi password baru" error={errors.confirm}>
      <input id="confirm" className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={set("confirm")} aria-invalid={!!errors.confirm} />
    </Field>
    {form.confirm.length > 0 && <p className={matches ? styles.hint : styles.error}>{matches ? "✓ Sama" : "Belum sama dengan password baru."}</p>}
    <div className={styles.actions}>
      <Button type="submit" disabled={busy || !form.current || !form.next || !matches}>{busy ? "Menyimpan…" : firstTime ? "Simpan dan lanjut" : "Simpan password baru"}</Button>
      {skipHref && <a className="button button--quiet" href={skipHref}>Lewati, atur nanti</a>}
    </div>
  </form>;
}
