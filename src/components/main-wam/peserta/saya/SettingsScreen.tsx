"use client";

import { useState, type FormEvent } from "react";
import { Bell, Check, CircleAlert, CircleCheck, Eye, EyeOff, KeyRound, Send } from "lucide-react";
import { passwordRules } from "@/lib/pra-wam/password";
import type { MessageKey } from "@/lib/main-wam/i18n";
import { praWamApi } from "@/lib/routes";
import type { MainWamMode } from "@/lib/main-wam/appearance";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { MainWamModeSetting } from "@/components/main-wam/theme";
import { Banner, Button, Card, List, ListRow, Pill, Sheet, Spinner, SwitchRow, TextField, useToast } from "@/components/main-wam/ui";
import { LanguageSetting, useKnown, useT } from "@/components/main-wam/i18n";
import { InstallSteps } from "../InstallSteps";
import { MwRequestError, failText, mwRequest } from "../request";
import { pushWords, usePushDevice, type PushState } from "../usePushDevice";
import css from "../peserta.module.css";

/**
 * Pengaturan (S02, revisi 16 Nov malam): Tampilan (Terang, Gelap, Sistem; this device), Notifikasi (this phone's permission) and Ganti password,
 * each in a sheet, and the version, small. The per-topic switches are gone; quiet hours still hold
 * (aturan-wam §7a). The same Web Push and password API as WAM.
 */
export function SettingsScreen({ version, mode = "system", preview }: { version: string; /** This device's pick (cookie, read by the page). */ mode?: MainWamMode; preview?: { push?: PushState; open?: "notifikasi" | "password" } }) {
  const t = useT();
  const push = usePushDevice({ preview: preview?.push });
  const [open, setOpen] = useState<"notifikasi" | "password" | null>(preview?.open ?? null);
  const words = pushWords[push.state];
  return <ScreenContent>
    <ScreenSection>
      <h2 className={css.groupHead}>{t("peserta.appearance.title")}</h2>
      <Card>
        <MainWamModeSetting initial={mode} />
        <p className={css.textMuted}>{t("peserta.appearance.note")}</p>
      </Card>
      <LanguageSetting />
    </ScreenSection>
    <List>
      <ListRow icon={<Bell />} title={t("peserta.settings.notifications")} sub={t("peserta.settings.permission")} onClick={() => setOpen("notifikasi")} chevron aria-haspopup="dialog"
        trailing={<Pill tone={words.tone} icon={push.state === "on" ? <Check /> : undefined}>{t(words.pill)}</Pill>} />
      <ListRow icon={<KeyRound />} title={t("peserta.settings.changePassword")} onClick={() => setOpen("password")} chevron aria-haspopup="dialog" />
    </List>
    <p className={css.version}>{t("peserta.settings.version", { version })}</p>
    <Sheet open={open === "notifikasi"} onClose={() => setOpen(null)} title={t("peserta.settings.notifications")} subtitle={t("peserta.settings.permission")} locked={push.busy}>
      <NotificationPanel push={push} />
    </Sheet>
    <PasswordSheet open={open === "password"} onClose={() => setOpen(null)} />
  </ScreenContent>;
}

function NotificationPanel({ push }: { push: ReturnType<typeof usePushDevice> }) {
  const { state, busy, message } = push;
  const t = useT();
  return <div className={css.sheetStack}>
    {state === "checking" && <Spinner label={t("peserta.settings.checkingPhone")} />}
    {(state === "on" || state === "off") && <List plain bleed>
      <SwitchRow inList title={t("peserta.settings.phoneSwitch")} sub={state === "on" ? t("peserta.settings.activeHere") : t("peserta.settings.turnOnHint")} checked={state === "on"}
        onChange={() => (state === "on" ? push.disable() : push.enable())} />
    </List>}
    {state === "on" && <Button variant="secondary" icon={<Send />} loading={busy} loadingLabel={t("peserta.login.sending")} onClick={() => push.test()}>{t("peserta.settings.sendTest")}</Button>}
    {state === "denied" && <>
      <Banner tone="warning" title={t("peserta.settings.blocked")} />
      <InstallSteps part="izin" />
    </>}
    {state === "ios-install" && <>
      <Banner tone="info" title={t("peserta.settings.installFirst")}>{t("peserta.settings.iosOnly")}</Banner>
      <InstallSteps />
    </>}
    {state === "unsupported" && <p className={css.textMuted}>{t("peserta.settings.unsupported")}</p>}
    {state === "not-ready" && <p className={css.textMuted}>{t("peserta.settings.notReady")}</p>}
    {message && <p className={`${css.status} ${message.tone === "error" ? css.statusError : ""}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}
    {(state === "on" || state === "off") && <p className={css.textMuted}>{t("peserta.settings.quiet")}</p>}
  </div>;
}

type Field = "current" | "next" | "confirm";

/** Ganti password (S02): the current one, a new one with its rules ticked as it is typed, and again. */
function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const known = useKnown();
  const toast = useToast();
  const [form, setForm] = useState<Record<Field, string>>({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field | "form", string>>>({});
  const set = (key: Field) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));
  const rules = [
    ...passwordRules.map(rule => ({ id: rule.id, label: t(`peserta.settings.rule.${rule.id}` as MessageKey), ok: rule.test(form.next) })),
    { id: "differs", label: t("peserta.settings.rule.differs"), ok: !!form.next && form.next !== form.current },
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
      toast.show({ text: t("peserta.settings.saved"), sub: message.includes("Perangkat lain") ? t("peserta.settings.otherPhones") : undefined, tone: "success" });
    } catch (problem) {
      const fields = problem instanceof MwRequestError ? problem.fieldErrors : undefined;
      setErrors({ ...Object.fromEntries(Object.entries(fields ?? {}).map(([key, list]) => [key, known(list[0] ?? "")])), ...(fields ? {} : { form: failText(problem) }) });
      setBusy(false);
    }
  }

  const toggle = <button type="button" className={css.eye} onClick={() => setShow(!show)} aria-pressed={show} aria-label={show ? t("peserta.login.hide") : t("peserta.login.show")}>{show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}</button>;
  return <Sheet open={open} onClose={close} title={t("peserta.settings.changePassword")} locked={busy}>
    <form className={css.form} onSubmit={submit} noValidate>
      {errors.form && <Banner tone="error">{errors.form}</Banner>}
      <TextField label={t("peserta.settings.current")} type={show ? "text" : "password"} autoComplete="current-password" value={form.current} onChange={set("current")} error={errors.current} suffix={toggle} />
      <TextField label={t("peserta.settings.new")} type={show ? "text" : "password"} autoComplete="new-password" value={form.next} onChange={set("next")} error={errors.next} aria-describedby="mw-password-rules" />
      <ul id="mw-password-rules" className={css.rules}>
        {rules.map(rule => <li key={rule.id} className={`${css.rule} ${rule.ok ? css.ruleOk : form.next ? css.ruleBad : ""}`}>
          {rule.ok || !form.next ? <CircleCheck aria-hidden /> : <CircleAlert aria-hidden />}{rule.label}
        </li>)}
      </ul>
      <TextField label={t("peserta.settings.repeat")} type={show ? "text" : "password"} autoComplete="new-password" value={form.confirm} onChange={set("confirm")}
        error={errors.confirm ?? (form.confirm && !matches ? t("peserta.settings.mismatch") : undefined)} />
      <Button block type="submit" loading={busy} loadingLabel={t("peserta.settings.saving")} disabled={!ready}>{t("peserta.settings.save")}</Button>
      {!ready && <p className={css.textMuted}>{t("peserta.settings.fillAll")}</p>}
    </form>
  </Sheet>;
}
