"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { passwordRules } from "@/lib/pra-wam/password";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "./api";
import own from "./akun.module.css";
import styles from "./pra-wam.module.css";

type Key = "current" | "next" | "confirm";

/** A password box with the eye button of Penpot "A2". */
function Secret({ id, label, value, error, autoComplete, onChange, describedBy }: { id: Key; label: string; value: string; error?: string; autoComplete: string; onChange: (value: string) => void; describedBy?: string }) {
  const [show, setShow] = useState(false);
  return <div>
    <label className={styles.label} htmlFor={id}>{label}</label>
    <div className={own.eyeWrap}>
      <input id={id} className="input" type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} aria-invalid={!!error} aria-describedby={describedBy} />
      <button type="button" className={own.eye} onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? `Sembunyikan ${label.toLowerCase()}` : `Lihat ${label.toLowerCase()}`}>{show ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}</button>
    </div>
    {error && <p className={styles.error}>{error}</p>}
  </div>;
}

/**
 * A new password (Penpot "A2 · Buat password baru"), the rules ticked off as the person types.
 * `skipHref` adds "Lewati, atur nanti" for the first sign-in; `doneHref` is where to go once saved.
 */
export function PasswordForm({ firstTime, skipHref, doneHref }: { firstTime: boolean; skipHref?: string; doneHref?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const matches = form.confirm.length > 0 && form.confirm === form.next;
  const differs = form.next.length > 0 && form.next !== form.current;
  const set = (key: Key) => (value: string) => setForm({ ...form, [key]: value });
  const rules = [
    ...passwordRules.map(rule => ({ id: rule.id, label: rule.label, ok: rule.test(form.next) })),
    { id: "differs", label: `Berbeda dari password ${firstTime ? "awal" : "saat ini"}`, ok: differs },
  ];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setNotice(null);
    try {
      const result = await praWamRequest(praWamApi.password, { method: "POST", json: form });
      if (doneHref) { router.refresh(); router.replace(doneHref); return; }
      setForm({ current: "", next: "", confirm: "" });
      setNotice({ tone: "success", text: result.message });
    } catch (problem) {
      if (problem instanceof PraWamApiError && problem.fieldErrors) setErrors(Object.fromEntries(Object.entries(problem.fieldErrors).map(([key, list]) => [key, list[0]])));
      setNotice({ tone: "error", text: errorText(problem) });
    } finally { setBusy(false); }
  }

  return <form className={styles.section} onSubmit={submit} noValidate>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    <Secret id="current" label={firstTime ? "Password awal" : "Password saat ini"} value={form.current} error={errors.current} autoComplete="current-password" onChange={set("current")} />
    <Secret id="next" label="Password baru" value={form.next} error={errors.next} autoComplete="new-password" onChange={set("next")} describedBy="aturan-password" />
    <ul id="aturan-password" className={styles.rules}>
      {rules.map(rule => <li key={rule.id} data-ok={rule.ok} className={`${own.ruleIcon} ${!rule.ok && form.next ? own.ruleWarn : ""}`}>
        {rule.ok || !form.next ? <CheckCircle2 aria-hidden /> : <AlertTriangle aria-hidden />}{rule.label}
      </li>)}
    </ul>
    <Secret id="confirm" label="Ulangi password baru" value={form.confirm} error={errors.confirm} autoComplete="new-password" onChange={set("confirm")} />
    {form.confirm.length > 0 && !matches && <p className={styles.error}>Belum sama dengan password baru.</p>}
    <div className={styles.section} style={{ marginTop: 8 }}>
      <Button type="submit" disabled={busy || !form.current || !form.next || !matches}>{busy ? "Menyimpan…" : firstTime ? "Simpan dan lanjut" : "Simpan password baru"}</Button>
      {skipHref && <a className="button button--quiet" href={skipHref}>Lewati, atur nanti</a>}
    </div>
  </form>;
}
