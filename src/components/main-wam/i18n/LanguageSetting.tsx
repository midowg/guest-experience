"use client";

import { LANGS, LANG_NAMES, type Lang } from "@/lib/main-wam/i18n";
import { Card } from "../ui/Card";
import { Segmented } from "../ui/Segmented";
import { useLang, useT } from "./LangProvider";
import css from "./language.module.css";

/**
 * Bahasa / Language (Pengaturan, with Tampilan): Indonesia or English, kept on this device (the
 * `mw_lang` cookie). Choosing one changes the screen at once; the server then reads it again
 * (router.refresh in LangProvider) so what it wrote follows. Each language is named in itself.
 */
export function LanguageSetting() {
  const { lang, setLang } = useLang();
  const t = useT();
  return <Card className={css.card}>
    <span className={css.label}>{t("lang.label")}</span>
    <Segmented label={t("lang.group")} value={lang} onChange={(next: Lang) => setLang(next)}
      options={LANGS.map(value => ({ value, label: LANG_NAMES[value] }))} />
    <p className={css.note}>{t("lang.note")}</p>
  </Card>;
}
