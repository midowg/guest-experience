"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bus, CalendarClock, QrCode, Smartphone, type LucideIcon } from "lucide-react";
import { ONBOARDED_KEY, onboardingNews, type OnboardingReason } from "@/lib/main-wam/peserta/onboarding";
import type { ModuleSwitches } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { useLang, useT } from "@/components/main-wam/i18n";
import { ShellChrome } from "@/components/main-wam/shell";
import { ActionBar, Banner, Button, IconBox, Sheet, useToast } from "@/components/main-wam/ui";
import { InstallSteps } from "../InstallSteps";
import { usePushDevice, type PushState } from "../usePushDevice";
import css from "../peserta.module.css";

const REASON: Record<OnboardingReason, { icon: LucideIcon; key: "peserta.onboard.reasonSchedule" | "peserta.onboard.reasonAbsen" | "peserta.onboard.reasonGather" }> = {
  jadwal: { icon: CalendarClock, key: "peserta.onboard.reasonSchedule" }, absen: { icon: QrCode, key: "peserta.onboard.reasonAbsen" }, kumpul: { icon: Bus, key: "peserta.onboard.reasonGather" },
};

/** Remembered on this phone: O03 was seen (see onboarding.ts). Storage may be off: then it shows again, harmless. */
export function markOnboarded() {
  try { window.localStorage.setItem(ONBOARDED_KEY, new Date().toISOString()); } catch { /* private mode */ }
}

/**
 * Izin notifikasi (O03, revisi 16 Nov): after the first sign-in on a phone, once. A short
 * explanation first; the phone's own prompt only after "Izinkan" is tapped (pre-permission, RISET
 * §5, web.dev). On an iPhone outside the installed app there is no push, so it says to install WAM
 * first and "Lihat caranya" (and "Izinkan") open the guide. "Nanti" goes to Beranda; Pengaturan can
 * turn it on later. Only modules that are on are named (onboardingNews).
 */
export function OnboardingScreen({ name, modules, preview }: {
  name: string;
  modules: Pick<ModuleSwitches, "absen" | "silent">;
  preview?: { push?: PushState; guide?: boolean };
}) {
  const router = useRouter();
  const t = useT();
  const toast = useToast();
  const { lang } = useLang();
  const push = usePushDevice({ preview: preview ? preview.push ?? "off" : undefined });
  const [guide, setGuide] = useState(!!preview?.guide);
  const [leaving, setLeaving] = useState(false);
  const news = onboardingNews(modules, lang);

  function home() { markOnboarded(); setLeaving(true); router.replace(mainWamPath.home); }

  async function allow() {
    if (push.state === "ios-install") { setGuide(true); return; }
    // Prototipe: "Izinkan" ends in a toast on Beranda ("Notifikasi aktif di HP ini"); the toast lives in the shell, so it outlasts the page change.
    if ((push.state === "off" || push.state === "on") && await push.enable()) toast.show({ text: t("peserta.push.enabled") });
    home();
  }

  return <>
    <ShellChrome hideTopBar />
    <div className={css.onboard}>
      <div className={css.welcome}>
        <p className={css.welcomeKicker}>{t("peserta.onboard.welcome", { name })}</p>
        <h1 className={css.pageTitle}>{t("peserta.onboard.title")}</h1>
      </div>
      <div className={css.previewWrap} aria-hidden>
        <div className={css.preview}>
          <span className={css.previewApp}>WAM</span>
          <span className={css.previewText}><span className={css.previewTitle}>{news.example.title}</span><span className={css.previewBody}>{news.example.body}</span></span>
        </div>
      </div>
      {push.state === "ios-install" && <Banner tone="info" icon={<Smartphone />} action={{ label: t("peserta.onboard.howTo"), onClick: () => setGuide(true) }}>
        {t("peserta.onboard.ios")}
      </Banner>}
      <ul className={css.bullets}>
        {news.reasons.map(reason => {
          const { icon: Icon, key } = REASON[reason];
          return <li key={reason}><IconBox icon={<Icon />} tone="primary" />{t(key)}</li>;
        })}
      </ul>
      {push.message?.tone === "error" && <p className={`${css.status} ${css.statusError}`} role="alert">{push.message.text}</p>}
    </div>
    <ActionBar>
      <Button onClick={allow} loading={push.busy || leaving} loadingLabel={t("peserta.onboard.preparing")}>{t("peserta.onboard.allow")}</Button>
      <Button variant="text" onClick={home} disabled={push.busy}>{t("peserta.onboard.later")}</Button>
    </ActionBar>
    <Sheet open={guide} onClose={() => setGuide(false)} title={t("peserta.onboard.installTitle")}>
      <InstallSteps />
    </Sheet>
  </>;
}
