"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { useT } from "@/components/main-wam/i18n";
import { Card, Segmented, useToast } from "@/components/main-wam/ui";
import { demoRoleCookie } from "@/lib/main-wam/demo";
import { DEMO_ROLES, type DemoRole } from "@/lib/main-wam/types";
import css from "./demo.module.css";

/**
 * "Lihat sebagai: Peserta | Panitia | BOD" in Saya, for a penguji while Mode demo is on (Admin WAM → Main WAM →
 * Pengaturan). The pick is kept on this device (a cookie) and the screens are drawn again for that role: the
 * Panitia tab and Beranda follow it. The server still goes by the account's real roles and refuses
 * writes made as another role; this only changes what is drawn.
 */
export function DemoSwitch({ role }: { role: DemoRole }) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(role);

  function choose(next: DemoRole) {
    setValue(next);
    try {
      document.cookie = demoRoleCookie(next, location.protocol === "https:");
      toast.show({ text: t("demo.switched", { role: t(`demo.role.${next}`) }), tone: "success" });
      router.refresh();
    } catch {
      setValue(role);
      toast.show({ text: t("demo.switchFailed"), tone: "error" });
    }
  }

  return <Card variant="tonal" as="section" aria-labelledby="mw-demo-title">
    <div className={css.head}>
      <FlaskConical aria-hidden className={css.icon} />
      <h2 id="mw-demo-title" className={css.title}>{t("demo.title")}</h2>
    </div>
    <p className={css.hint}>{t("demo.hint")}</p>
    <Segmented label={t("demo.switchLabel")} value={value} onChange={choose} options={DEMO_ROLES.map(item => ({ value: item, label: t(`demo.role.${item}`) }))} />
  </Card>;
}
