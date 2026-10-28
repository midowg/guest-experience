"use client";

import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { eventPath } from "@/lib/routes";
import { themeStyle } from "@/lib/themes";
import type { EventRecord } from "@/lib/types";
import { offersSwitch, type Lang } from "@/lib/wording";
import { localizeEvent } from "@/lib/wording/localize";
import { visitText, type VisitKey } from "@/lib/wording/visit";
import { LanguageSwitch, WordingProvider, useEventLanguage, useWording } from "./language";
import { VisitRoute } from "./VisitRoute";
import guest from "./guest.module.css";
import styles from "./visit.module.css";
import own from "./arrival-guide.module.css";

/**
 * /KODE/panduan: the office visit's "Cara datang" on a page of its own, to send to a guest on
 * WhatsApp the day before. Only the way here; the visit page is one link away.
 */
export function ArrivalGuide({ event: source }: { event: EventRecord }) {
  const [lang, setLang] = useEventLanguage(source.language);
  const { event, fallback } = useMemo(() => localizeEvent(source, lang), [source, lang]);
  return <WordingProvider lang={lang}>
    <ArrivalBody event={event} fallback={fallback} onLang={offersSwitch(source.language) ? setLang : undefined} />
  </WordingProvider>;
}

function ArrivalBody({ event, fallback, onLang }: { event: EventRecord; fallback: boolean; onLang?: (lang: Lang) => void }) {
  const { lang, t } = useWording();
  const v = (key: VisitKey) => visitText(lang, key);
  return <div lang={lang} className={`${guest.experience} ${styles.visit}`} data-theme={event.theme?.key ?? "werkudara"} style={themeStyle(event.theme)}>
    {fallback && <p className={guest.langFallback}>{t("lang.fallback")}</p>}
    <main id="event-content" tabIndex={-1} className={`${styles.main} ${own.main}`}>
      <section className={styles.page} aria-labelledby="panduan-heading">
        <div className={own.head}>
          <div>
            <p className={own.event}>{event.title}</p>
            <h1 id="panduan-heading" className={styles.pageTitle}>{v("tab.route")}</h1>
          </div>
          {onLang && <LanguageSwitch lang={lang} onChange={onLang} />}
        </div>
        <VisitRoute event={event} words={{ lost: v("route.lost"), maps: v("route.maps"), steps: v("route.steps"), arrival: v("route.arrival") }} />
        <a className={own.visit} href={eventPath(event)}>{v("route.page")} <ArrowUpRight size={16} aria-hidden="true" /></a>
      </section>
    </main>
  </div>;
}
