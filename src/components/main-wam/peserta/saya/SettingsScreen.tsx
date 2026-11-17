"use client";

import { useState, type FormEvent } from "react";
import { Bell, Check, CircleAlert, CircleCheck, Eye, EyeOff, KeyRound, Send } from "lucide-react";
import { passwordRules } from "@/lib/pra-wam/password";
import { praWamApi } from "@/lib/routes";
import { ScreenContent } from "@/components/main-wam/shell";
import { Banner, Button, List, ListRow, Pill, Sheet, Spinner, SwitchRow, TextField, useToast } from "@/components/main-wam/ui";
import { InstallSteps } from "../InstallSteps";
import { MwRequestError, failText, mwRequest } from "../request";
import { pushWords, usePushDevice, type PushState } from "../usePushDevice";
import css from "../peserta.module.css";

/**
 * Pengaturan (S02, revisi 16 Nov malam): Notifikasi (this phone's permission) and Ganti password,
 * each in a sheet, and the version, small. The per-topic switches are gone; quiet hours still hold
 * (aturan-wam §7a). The same Web Push and password API as WAM.
 */
export function SettingsScreen({ version, preview }: { version: string; preview?: { push?: PushState; open?: "notifikasi" | "password" } }) {
  const push = usePushDevice({ preview: preview?.push });
  const [open, setOpen] = useState<"notifikasi" | "password" | null>(preview?.open ?? null);
  const words = pushWords[push.state];
  return <ScreenContent>
    <List>
      <ListRow icon={<Bell />} title="Notifikasi" sub="Izin di HP ini" onClick={() => setOpen("notifikasi")} chevron aria-haspopup="dialog"
        trailing={<Pill tone={words.tone} icon={push.state === "on" ? <Check /> : undefined}>{words.pill}</Pill>} />
      <ListRow icon={<KeyRound />} title="Ganti password" onClick={() => setOpen("password")} chevron aria-haspopup="dialog" />
    </List>
    <p className={css.version}>WAM versi {version}</p>
    <Sheet open={open === "notifikasi"} onClose={() => setOpen(null)} title="Notifikasi" subtitle="Izin di HP ini" locked={push.busy}>
      <NotificationPanel push={push} />
    </Sheet>
    <PasswordSheet open={open === "password"} onClose={() => setOpen(null)} />
  </ScreenContent>;
}

function NotificationPanel({ push }: { push: ReturnType<typeof usePushDevice> }) {
  const { state, busy, message } = push;
  return <div className={css.sheetStack}>
    {state === "checking" && <Spinner label="Memeriksa HP ini" />}
    {(state === "on" || state === "off") && <List plain bleed>
      <SwitchRow inList title="Notifikasi di HP" sub={state === "on" ? "Aktif di HP ini" : "Nyalakan supaya kabar penting muncul di HP"} checked={state === "on"}
        onChange={() => (state === "on" ? push.disable() : push.enable())} />
    </List>}
    {state === "on" && <Button variant="secondary" icon={<Send />} loading={busy} loadingLabel="Mengirim…" onClick={() => push.test()}>Kirim tes</Button>}
    {state === "denied" && <>
      <Banner tone="warning" title="Notifikasi diblokir di HP ini" />
      <InstallSteps part="izin" />
    </>}
    {state === "ios-install" && <>
      <Banner tone="info" title="Pasang WAM ke layar utama dulu">Di iPhone, notifikasi hanya bisa masuk lewat WAM yang dipasang.</Banner>
      <InstallSteps />
    </>}
    {state === "unsupported" && <p className={css.textMuted}>Browser ini belum mendukung notifikasi. Pakai Chrome di Android, atau WAM dari layar utama iPhone.</p>}
    {state === "not-ready" && <p className={css.textMuted}>Notifikasi belum disiapkan. Hubungi panitia.</p>}
    {message && <p className={`${css.status} ${message.tone === "error" ? css.statusError : ""}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}
    {(state === "on" || state === "off") && <p className={css.textMuted}>Pukul 21.00–06.00 hanya pengumuman panitia dan perubahan jadwal yang dikirim ke HP.</p>}
  </div>;
}

type Field = "current" | "next" | "confirm";

/** Ganti password (S02): the current one, a new one with its rules ticked as it is typed, and again. */
function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Record<Field, string>>({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field | "form", string>>>({});
  const set = (key: Field) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));
  const rules = [
    ...passwordRules.map(rule => ({ id: rule.id, label: rule.label, ok: rule.test(form.next) })),
    { id: "differs", label: "Berbeda dari password saat ini", ok: !!form.next && form.next !== form.current },
  ];
  const matches = form.confirm.length > 0 && form.confirm === form.next;
  const ready = !!form.current && rules.every(rule => rule.ok) && matches;

  function close() { if (busy) return; setForm({ current: "", next: "", confirm: "" }); setErrors({}); onClose(); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true); setErrors({});
    try {
      const { message } = await mwRequest(praWamApi.password, { method: "POST", json: form });
      setBusy(false);
      close();
      toast.show({ text: "Password baru tersimpan", sub: message.includes("Perangkat lain") ? "HP lain perlu masuk lagi." : undefined, tone: "success" });
    } catch (problem) {
      const fields = problem instanceof MwRequestError ? problem.fieldErrors : undefined;
      setErrors({ ...Object.fromEntries(Object.entries(fields ?? {}).map(([key, list]) => [key, list[0]])), ...(fields ? {} : { form: failText(problem) }) });
      setBusy(false);
    }
  }

  const toggle = <button type="button" className={css.eye} onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? "Sembunyikan password" : "Tampilkan password"}>{show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}</button>;
  return <Sheet open={open} onClose={close} title="Ganti password" locked={busy}>
    <form className={css.form} onSubmit={submit} noValidate>
      {errors.form && <Banner tone="error">{errors.form}</Banner>}
      <TextField label="Password saat ini" type={show ? "text" : "password"} autoComplete="current-password" value={form.current} onChange={set("current")} error={errors.current} suffix={toggle} />
      <TextField label="Password baru" type={show ? "text" : "password"} autoComplete="new-password" value={form.next} onChange={set("next")} error={errors.next} aria-describedby="mw-password-rules" />
      <ul id="mw-password-rules" className={css.rules}>
        {rules.map(rule => <li key={rule.id} className={`${css.rule} ${rule.ok ? css.ruleOk : form.next ? css.ruleBad : ""}`}>
          {rule.ok || !form.next ? <CircleCheck aria-hidden /> : <CircleAlert aria-hidden />}{rule.label}
        </li>)}
      </ul>
      <TextField label="Ulangi password baru" type={show ? "text" : "password"} autoComplete="new-password" value={form.confirm} onChange={set("confirm")}
        error={errors.confirm ?? (form.confirm && !matches ? "Belum sama dengan password baru." : undefined)} />
      <Button block type="submit" loading={busy} loadingLabel="Menyimpan…" disabled={!ready}>Simpan</Button>
      {!ready && <p className={css.textMuted}>Isi ketiganya sesuai aturan untuk menyimpan.</p>}
    </form>
  </Sheet>;
}
