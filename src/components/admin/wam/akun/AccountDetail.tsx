"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pencil, X } from "lucide-react";
import { Avatar, ConsoleButton, Pill, RolePills } from "@/components/console";
import { blockedRoles, praWamRoles, roleConflicts, roleLabels, roleProblem, type PraWamRole } from "@/lib/pra-wam/roles";
import type { AccountRow } from "@/lib/server/pra-wam/accounts";
import { accountState, lastLoginLabel, roleItems, type AccountStatus } from "./account-view";
import css from "./akun.module.css";

export type AccountDetailProps = {
  row: AccountRow;
  status: AccountStatus;
  photo?: string;
  job?: string;
  /** Which change is running ("role-<id>", "email-<id>"…), or null; every control waits while one runs. */
  busy: string | null;
  passwordReady: boolean;
  /** This person's last change failed: why. */
  error?: string;
  /** The last change went through: what the server said. */
  done?: string;
  onClose: () => void;
  onToggleRole: (role: PraWamRole) => void;
  /** Resolves true once the new email is saved. */
  onSaveEmail: (email: string) => Promise<boolean>;
  onReset: () => void;
  onCreate: () => void;
};

/**
 * One account over the page (a panel from the right, from the bottom on a phone): who it is, the
 * sign-in email (changeable), the roles to tick with the BOD rule explained, and the password
 * reset or, without an account, making one. A native <dialog>: Esc, the dimmed page or X close it.
 */
export function AccountDetail({ row, status, photo, job, busy, passwordReady, error, done, onClose, onToggleRole, onSaveEmail, onReset, onCreate }: AccountDetailProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const before = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); before?.focus?.(); };
  }, []);

  const standing = { isLead: row.leads.length > 0 };
  const blocked = blockedRoles(row.roles, standing);
  const clash = roleConflicts(row.roles, standing).length ? roleProblem(row.roles, standing) : null;
  const hintId = `${id}-peran`;
  const hint = clash ? `${clash} Lepas BOD, atau lepas peran lainnya satu per satu.` : Object.values(blocked)[0];
  const working = !!busy;

  return <dialog ref={ref} className={css.detail} aria-labelledby={`${id}-nama`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === ref.current) onClose(); }}>
    <div className={css.detailInner}>
      <header className={css.detailHead}>
        <Avatar name={row.name} photo={photo} size={56} />
        <div className={css.detailName}>
          <h2 id={`${id}-nama`}>{row.name}</h2>
          {job && <p>{job}</p>}
          <Pill tone={status.tone}>{status.label}</Pill>
        </div>
        <button type="button" className={css.close} onClick={onClose} aria-label="Tutup"><X size={22} aria-hidden /></button>
      </header>

      <div className={css.detailBody}>
        {error && <p role="alert" className={css.error}>{error}</p>}
        {!error && done && <p role="status" className={css.done}>{done}</p>}
        <dl className={css.facts}>
          <div><dt>Unit</dt><dd>{row.department || "—"}</dd></div>
          <div><dt>Peran</dt><dd><RolePills roles={roleItems(row)} max={5} /></dd></div>
          <div><dt>Akun</dt><dd>{accountState(row)}</dd></div>
          <div><dt>Terakhir masuk</dt><dd>{lastLoginLabel(row)}</dd></div>
        </dl>

        <section className={css.detailSection} aria-labelledby={`${id}-email`}>
          <h3 id={`${id}-email`}>Email login</h3>
          {email !== null
            ? <form className={css.emailForm} onSubmit={event => { event.preventDefault(); void onSaveEmail(email).then(ok => { if (ok) setEmail(null); }); }}>
                <input className={css.input} type="email" aria-label={`Email ${row.name}`} value={email} maxLength={200} autoFocus onChange={event => setEmail(event.target.value)} />
                <div className={css.formActions}>
                  <ConsoleButton type="submit" variant="primary" disabled={working || !email.trim()}>{busy === `email-${row.employeeId}` ? "Menyimpan…" : "Simpan"}</ConsoleButton>
                  <ConsoleButton disabled={working} onClick={() => setEmail(null)}>Batal</ConsoleButton>
                </div>
              </form>
            : <div className={css.emailRow}>
                <span className={css.emailText}>{row.email || "Belum ada email"}</span>
                <ConsoleButton aria-label={`Ubah email ${row.name}`} icon={<Pencil size={16} aria-hidden />} disabled={working} onClick={() => setEmail(row.email)}>Ubah</ConsoleButton>
              </div>}
          <p className={css.hint}>Email ini juga email login WAM-nya.</p>
        </section>

        <fieldset className={css.detailSection}>
          <legend>Peran</legend>
          <p className={css.hint}>Semua orang yang punya akun adalah peserta. Panitia, Admin WAM, dan HOD bisa digabung; BOD berdiri sendiri. Perubahan berlaku di halaman berikutnya yang dibuka orang itu.</p>
          <ul className={css.roleChecks}>{praWamRoles.map(role => <li key={role}>
            <label className={css.check} title={blocked[role]}>
              <input type="checkbox" aria-describedby={hint ? hintId : undefined} checked={row.roles.includes(role)} disabled={working || !!blocked[role]} onChange={() => onToggleRole(role)}
                aria-label={`${roleLabels[role]}: ${row.name}`} />
              <span>{roleLabels[role]}</span>
            </label>
          </li>)}</ul>
          {busy === `role-${row.employeeId}` && <p className={css.hint} role="status">Menyimpan peran…</p>}
          {row.leads.length > 0 && <p className={css.leads}>{row.leads.map(name => <Pill key={name} tone="teal">HOD · {name}</Pill>)}</p>}
          {hint && <p id={hintId} className={clash ? css.error : css.hint}>{hint}</p>}
        </fieldset>
      </div>

      {(row.hasAccount || row.active) && <footer className={css.detailFoot}>
        {row.hasAccount
          ? <ConsoleButton disabled={working || !passwordReady} onClick={onReset}>{busy === `reset-${row.employeeId}` ? "Mengatur…" : "Reset password"}</ConsoleButton>
          : row.active && <ConsoleButton variant="primary" disabled={working || !passwordReady || !row.email} onClick={onCreate}>{busy === `create-${row.employeeId}` ? "Membuat akun…" : "Buat akun"}</ConsoleButton>}
        {!row.hasAccount && row.active && !row.email && <p className={css.hint}>Isi emailnya dulu untuk membuat akun.</p>}
      </footer>}
    </div>
  </dialog>;
}
