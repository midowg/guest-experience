"use client";

import { useEffect, useState } from "react";
import { detectInstall, installBrowserLabels, installDevices, installSteps, notificationSteps, type InstallBrowser, type InstallDevice } from "@/lib/pra-wam/install";
import { useKnown, useT } from "@/components/main-wam/i18n";
import { FilterChip, ChipRow, Segmented } from "@/components/main-wam/ui";
import css from "./peserta.module.css";

/**
 * How to put WAM on the home screen, then allow its notifications: Pra WAM's install guide
 * (src/lib/pra-wam/install.ts, from Apple's, Google's, Microsoft's and Samsung's own help pages),
 * drawn with Main WAM's kit. Opens on this device and browser; the person can switch. On iPhone,
 * push only works from the installed app (RISET §5), so this is what O03 and S02 show there.
 */
export function InstallSteps({ part = "pasang" }: { part?: "pasang" | "izin" }) {
  const t = useT();
  const known = useKnown();
  const [device, setDevice] = useState<InstallDevice>("iphone");
  const [browser, setBrowser] = useState<InstallBrowser>("safari");
  useEffect(() => {
    const found = detectInstall(navigator.userAgent, navigator.maxTouchPoints ?? 0);
    /* eslint-disable react-hooks/set-state-in-effect -- read once from the browser after the first paint */
    setDevice(found.device);
    setBrowser(found.browser);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const browsers = installDevices.find(item => item.id === device)!.browsers;
  const steps = part === "pasang" ? installSteps[browser] : notificationSteps(device).slice(-1);
  return <div className={css.sheetStack}>
    <Segmented label={t("peserta.install.device")} value={device} onChange={value => { const next = value as InstallDevice; setDevice(next); setBrowser(installDevices.find(item => item.id === next)!.browsers[0]); }}
      options={installDevices.map(item => ({ value: item.id, label: item.id === "iphone" ? "iPhone" : item.label }))} />
    {part === "pasang" && browsers.length > 1 && <ChipRow label="Browser">
      {browsers.map(item => <FilterChip key={item} selected={browser === item} onClick={() => setBrowser(item)}>{installBrowserLabels[item]}</FilterChip>)}
    </ChipRow>}
    <ol className={css.steps} aria-label={part === "pasang" ? t("peserta.install.howInstall", { browser: installBrowserLabels[browser] }) : t("peserta.install.howAllow")}>
      {steps.map((step, index) => <li key={`${step.art}-${index}`} className={css.stepItem}>
        <span className={css.stepNumber} aria-hidden>{index + 1}</span>
        <span className={css.stepCopy}><strong>{known(step.title)}</strong><p>{known(step.text)}</p></span>
      </li>)}
    </ol>
    {part === "pasang" && <p className={css.textMuted}>{t("peserta.install.then")}</p>}
  </div>;
}
