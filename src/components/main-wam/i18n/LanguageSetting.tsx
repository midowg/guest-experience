"use client";

import { LANGS, LANG_NAMES, type Lang } from "@/lib/main-wam/i18n";
import { Card } from "../ui/Card";
import { Segmented } from "../ui/Segmented";
import { flagOf } from "./Flag";
import { useLang, useT } from "./LangProvider";
import css from "./language.module.css";

/**
 * Bahasa / Language (Pengaturan, with Tampilan): Indonesia or English, kept on this device (the
 * `mw_lang` cookie). Choosing one changes the screen at once; the server then reads it again
 * (router.refresh in LangProvider) so what it wrote follows. Each language is named in itself, with its flag.
 */
export function LanguageSetting({ bare = false, inline = false }: {
  /** Without its own card and label (inside a sheet that already names it). */ bare?: boolean;
  /** Only the two-choice control, short ("ID", "EN"), to end a Pengaturan row that is already named "Bahasa". */ inline?: boolean;
}) {
  const { lang, setLang } = useLang();
  const t = useT();
  const options = LANGS.map(value => ({ value, label: inline ? value.toUpperCase() : LANG_NAMES[value], icon: flagOf(value) }));
  if (inline) return <Segmented label={t("lang.group")} value={lang} onChange={(next: Lang) => setLang(next)} options={options} />;
  const body = <>
    {!bare && <span className={css.label}>{t("lang.label")}</span>}
    <Segmented label={t("lang.group")} value={lang} onChange={(next: Lang) => setLang(next)}
      options={options} />
    <p className={css.note}>{t("lang.note")}</p>
  </>;
  return bare ? <div className={css.bare}>{body}</div> : <Card className={css.card}>{body}</Card>;
}
