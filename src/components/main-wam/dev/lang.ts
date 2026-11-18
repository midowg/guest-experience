import { parseLang, type Lang } from "@/lib/main-wam/i18n";

/** A dev-preview page's language: `?lang=en` (anything else is Indonesian). */
export const previewLang = (params: { lang?: string | string[] | undefined } | null | undefined): Lang => {
  const value = params?.lang;
  return parseLang(Array.isArray(value) ? value[0] : value);
};
