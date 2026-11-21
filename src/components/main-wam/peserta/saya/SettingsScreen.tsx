"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Activity, Bell, Check, CircleAlert, CircleCheck, ExternalLink, Eye, EyeOff, Globe, KeyRound, LifeBuoy, MessageCircle, Send, Sun, SquarePlus, type LucideIcon } from "lucide-react";
import { passwordRules } from "@/lib/pra-wam/password";
import type { MessageKey } from "@/lib/main-wam/i18n";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import { mainWamPath, praWamApi, praWamPath } from "@/lib/routes";
import type { MainWamMode } from "@/lib/main-wam/appearance";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { MainWamModeSetting, MainWamMotionSwitch } from "@/components/main-wam/theme";
import { Banner, Button, IconBox, List, ListRow, Pill, Sheet, Spinner, SwitchRow, TextField, useToast } from "@/components/main-wam/ui";
import { LanguageSetting, useKnown, useT } from "@/components/main-wam/i18n";
import { ContactSheet } from "../ContactSheet";
import { InstallSteps } from "../InstallSteps";
import { MwRequestError, failText, mwRequest } from "../request";
import { isStandalone, pushWords, usePushDevice, type PushState } from "../usePushDevice";
import css from "../peserta.module.css";

type Panel = "notifikasi" | "pasang" | "password" | "panitia";

/**
 * Pengaturan (S02, final prototype): Tampilan first, its controls inline at the end of each row:
 * Tema (Terang, Gelap, Sistem), Bahasa (ID / EN with a small flag) and Kurangi gerak (a switch), all
 * kept on this device; every switch sits flush right, level with its row's title. Then Aplikasi
 * (Notifikasi: this phone's permission and a test; Pasang ke layar utama), Akun (Ganti password) and
 * Bantuan (the Bantuan page, Hubungi panitia). At the bottom the version and, for a BOD with access,
 * Akses MCP. Quiet hours still hold (aturan-wam §7a). The same Web Push and password API as WAM.
 */
export function SettingsScreen({ version, mode = "system", reduceMotion = false, help = null, mcp = false, preview }: {
  version: string;
  /** This device's "Kurangi gerak" (cookie, read by the page). */
  reduceMotion?: boolean;
  /** This device's pick (cookie, read by the page). */
  mode?: MainWamMode;
  /** The panitia contact for "Hubungi panitia"; none = no such row. */
  help?: Contact | null;
  /** BOD with Akses MCP (Pra WAM's Pengaturan holds McpCard). */
  mcp?: boolean;
  preview?: { push?: PushState; open?: Panel; installed?: boolean };
}) {
  const t = useT();
  const push = usePushDevice({ preview: preview?.push });
  const [open, setOpen] = useState<Panel | null>(preview?.open ?? null);
  const [installed, setInstalled] = useState(preview?.installed ?? false);
  // Opened from its icon or from a browser tab: only the phone knows, after the first paint.
  useEffect(() => {
    if (preview?.installed !== undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser after the first paint
    setInstalled(isStandalone());
  }, [preview?.installed]);
  const words = pushWords[push.state];
  const close = () => setOpen(null);
  return <ScreenContent>
    <ScreenSection>
      <h2 className={css.groupHead}>{t("peserta.settings.groupLook")}</h2>
      <List>
        <SettingRow icon={Sun} title={t("peserta.settings.theme")}><MainWamModeSetting initial={mode} /></SettingRow>
        <SettingRow icon={Globe} title={t("peserta.settings.language")}><LanguageSetting inline /></SettingRow>
        <SettingRow icon={Activity} title={t("peserta.settings.reduceMotion")}>{id => <MainWamMotionSwitch initial={reduceMotion} labelledBy={id} />}</SettingRow>
      </List>
      <p className={css.status}>{t("peserta.appearance.note")}</p>
    </ScreenSection>
    <ScreenSection>
      <h2 className={css.groupHead}>{t("peserta.settings.groupApp")}</h2>
      <List>
        <ListRow icon={<Bell />} title={t("peserta.settings.notifications")} sub={t("peserta.settings.notificationsSub")} onClick={() => setOpen("notifikasi")} aria-haspopup="dialog"
          trailing={<Pill tone={words.tone} icon={push.state === "on" ? <Check /> : undefined}>{t(words.pill)}</Pill>} />
        <ListRow icon={<SquarePlus />} title={t("peserta.settings.install")} sub={t(installed ? "peserta.settings.installed" : "peserta.settings.installSub")} onClick={() => setOpen("pasang")} aria-haspopup="dialog" />
      </List>
    </ScreenSection>
    <ScreenSection>
      <h2 className={css.groupHead}>{t("peserta.settings.groupAccount")}</h2>
      <List>
        <ListRow icon={<KeyRound />} title={t("peserta.settings.changePassword")} sub={t("peserta.settings.passwordSub")} onClick={() => setOpen("password")} aria-haspopup="dialog" />
      </List>
    </ScreenSection>
    <ScreenSection>
      <h2 className={css.groupHead}>{t("peserta.settings.groupHelp")}</h2>
      <List>
        <ListRow icon={<LifeBuoy />} title={t("peserta.me.help")} sub={t("peserta.settings.helpSub")} href={mainWamPath.help} />
        {help && <ListRow icon={<MessageCircle />} title={t("peserta.settings.contact")} sub={t("peserta.settings.contactSub")} onClick={() => setOpen("panitia")} aria-haspopup="dialog" />}
      </List>
    </ScreenSection>
    <div className={css.settingsFoot}>
      <p className={css.version}>{t("peserta.settings.version", { version })}</p>
      {mcp && <a className={css.footLink} href={`${praWamPath.settings}#mcp`}>{t("peserta.me.mcp")}<ExternalLink aria-hidden /></a>}
    </div>

    <Sheet open={open === "notifikasi"} onClose={close} title={t("peserta.settings.notifications")} subtitle={t("peserta.settings.permission")} locked={push.busy}>
      <NotificationPanel push={push} />
    </Sheet>
    <Sheet open={open === "pasang"} onClose={close} title={t("peserta.settings.install")} subtitle={installed ? t("peserta.settings.installedNote") : undefined}>
      <InstallSteps />
    </Sheet>
    <PasswordSheet open={open === "password"} onClose={close} />
    {help && <ContactSheet contact={help} title={t("peserta.session.contactCommittee")} open={open === "panitia"} onClose={close} />}
  </ScreenContent>;
}

/**
 * A Pengaturan row whose control ends the row (a segmented choice or a switch): icon, the title, the
 * control flush right. A narrow row (zoom) puts the control under the title, still at the right. A
 * child function gets the id of the title, to name a switch by it.
 */
function SettingRow({ icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode | ((titleId: string) => ReactNode) }) {
  const id = useId();
  return <div className={css.setRow}>
    <IconBox icon={icon} />
    <span id={`${id}-t`} className={css.setTitle}>{title}</span>
    <span className={css.setControl}>{typeof children === "function" ? children(`${id}-t`) : children}</span>
  </div>;
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
