"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode, type TouchEvent } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Download, Lightbulb, List, MapPin, RotateCcw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui";
import type { GuideChapter, GuidePart, GuideSettings } from "@/lib/guide";
import { emptyGuide } from "@/lib/guide";
import { themeStyle } from "@/lib/themes";
import { timezoneInfo, zoneOf } from "@/lib/timezones";
import type { EventRecord, PlainImage } from "@/lib/types";
import { offersSwitch, type Lang, type WordKey } from "@/lib/wording";
import { localizeEvent } from "@/lib/wording/localize";
import { CalendarButton } from "./CalendarSheet";
import { Contact, Location } from "./EventParts";
import { imageSrcSet } from "./Gallery";
import { ExperienceContent, PrepareCards } from "./JourneyPanels";
import { LanguageSwitch, WordingProvider, useEventLanguage, useWording } from "./language";
import { AgendaList, EmergencyCard } from "./ProgramAgenda";
import { hashFor, localizeGuide, readerSteps, viewFromHash, type ReaderStep, type ReaderView } from "./guide-reader";
import guestStyles from "./guest.module.css";
import styles from "./guide.module.css";

/*
 * E-Guide (event_kind "eguide"): the event's guidebook, read one page at a time like a book.
 *
 * Where the reader is lives in the address (#bab-3, #daftar-isi, #selesai), so a shared link
 * opens that page and the browser's back and forward turn pages. Pages are turned with the
 * buttons, the arrow keys, or a horizontal swipe. "Unduh PDF" lays out the whole book (cover,
 * contents, every page) for the browser's print dialog, where the guest saves it as a PDF.
 */

const partWords: Record<GuidePart, WordKey> = {
  experience: "guide.part.experience", agenda: "guide.part.agenda", location: "guide.part.location", prepare: "guide.part.prepare", contact: "guide.part.contact",
};

// The address is the source of truth for the page shown. Turning a page pushes a history entry
// and announces it, since pushState itself fires no event.
const NAVIGATED = "guide:navigated";
function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATED, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATED, onChange);
  };
}
const currentHash = () => window.location.hash;
const serverHash = () => "";
function navigate(view: ReaderView) {
  const hash = hashFor(view);
  if (hash === window.location.hash) {
    // Already there: the contents link still brings the list back into view.
    if (view.kind === "cover" && view.toc) document.getElementById("guide-toc-heading")?.scrollIntoView({ block: "start" });
    return;
  }
  window.history.pushState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
  window.dispatchEvent(new Event(NAVIGATED));
}

/** A clock for the schedule's "now"; null on the server and until the page has mounted. */
function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const interval = window.setInterval(refresh, 60000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

/** Waits until every photo in the printed book has loaded (or failed), at most `timeout` ms. */
async function waitForImages(root: HTMLElement | null, timeout = 12000) {
  if (!root) return;
  const images = [...root.querySelectorAll("img")];
  // A lazy photo outside the screen would otherwise never start loading.
  for (const image of images) image.loading = "eager";
  const loaded = Promise.all(images.map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  })));
  await Promise.race([loaded, new Promise(resolve => window.setTimeout(resolve, timeout))]);
}

/** A swipe that starts on something that scrolls sideways (day tabs, a map) belongs to it. */
function ownsSwipe(target: EventTarget | null, root: Element) {
  for (let node = target instanceof Element ? target : null; node && node !== root; node = node.parentElement) {
    if (node.matches("iframe, input, textarea, select, [data-no-swipe]")) return true;
    if (node.scrollWidth > node.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowX)) return true;
  }
  return false;
}

function typing(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select, [role='tablist']"));
}

function GuidePhoto({ image, className, sizes = "(max-width: 760px) 100vw, 720px", priority = false }: { image: PlainImage; className?: string; sizes?: string; priority?: boolean }) {
  if (!image.url) return null;
  // eslint-disable-next-line @next/next/no-img-element -- stored photo with its own sizes
  return <img className={className} src={image.url} {...imageSrcSet(image.srcset, sizes)} alt={image.alt} loading={priority ? undefined : "lazy"} fetchPriority={priority ? "high" : undefined} referrerPolicy="no-referrer" />;
}

/** Holds the guest's language; the guide's own texts and the event's follow it. */
export function GuidePage({ event: source }: { event: EventRecord }) {
  const [lang, setLang] = useEventLanguage(source.language);
  const localized = useMemo(() => {
    const { event, fallback } = localizeEvent(source, lang);
    const guide = localizeGuide(source.guide ?? emptyGuide(), lang);
    return { event, guide: guide.guide, fallback: fallback || guide.fallback };
  }, [source, lang]);
  return <WordingProvider lang={lang}>
    <GuideBody {...localized} onLang={offersSwitch(source.language) ? setLang : undefined} />
  </WordingProvider>;
}

function GuideBody({ event, guide, fallback, onLang }: { event: EventRecord; guide: GuideSettings; fallback: boolean; onLang?: (lang: Lang) => void }) {
  const { lang, t } = useWording();
  const steps = useMemo(() => readerSteps(event, guide), [event, guide]);
  const total = steps.length;
  const hash = useSyncExternalStore(subscribe, currentHash, serverHash);
  const { view, previous, next } = useMemo(() => {
    const view = viewFromHash(hash, total);
    const previous: ReaderView | null = view.kind === "end" ? { kind: "step", index: total - 1 } : view.kind === "step" ? (view.index > 0 ? { kind: "step", index: view.index - 1 } : { kind: "cover", toc: false }) : null;
    const next: ReaderView | null = view.kind === "cover" ? (total ? { kind: "step", index: 0 } : null) : view.kind === "step" ? (view.index < total - 1 ? { kind: "step", index: view.index + 1 } : { kind: "end" }) : null;
    return { view, previous, next };
  }, [hash, total]);
  const viewKey = hashFor(view);
  const now = useNow();

  // Turning a page starts it at the top, with focus on its heading for screen readers. The
  // contents link scrolls to the list instead. Nothing moves on the first paint of the cover.
  const shown = useRef("");
  useEffect(() => {
    if (shown.current === viewKey) return;
    shown.current = viewKey;
    const target = document.getElementById(viewKey === "#daftar-isi" ? "guide-toc-heading" : "guide-page-heading") ?? document.getElementById("guide-cover-title");
    if (viewKey === "#daftar-isi") target?.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: 0, behavior: "instant" });
    target?.focus({ preventScroll: true });
  }, [viewKey]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || typing(e.target)) return;
      const to = e.key === "ArrowRight" ? next : e.key === "ArrowLeft" ? previous : null;
      if (!to) return;
      e.preventDefault();
      navigate(to);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous]);

  const touch = useRef<{ x: number; y: number; at: number } | null>(null);
  function onTouchStart(e: TouchEvent<HTMLElement>) {
    touch.current = e.touches.length === 1 && !ownsSwipe(e.target, e.currentTarget) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, at: e.timeStamp } : null;
  }
  function onTouchEnd(e: TouchEvent<HTMLElement>) {
    const start = touch.current;
    touch.current = null;
    const point = e.changedTouches[0];
    if (!start || !point || e.timeStamp - start.at > 800) return;
    const dx = point.clientX - start.x, dy = point.clientY - start.y;
    // Clearly sideways and long enough: a scroll that drifts a little is still a scroll.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (window.getSelection()?.toString()) return;
    const to = dx < 0 ? next : previous;
    if (to) navigate(to);
  }

  // The printed book is laid out once asked for and then kept, so a later Ctrl+P prints it too.
  const [printLaid, setPrintLaid] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const printRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The print dialog captures the page as it stands, so the book must exist before it opens.
    const lay = () => flushSync(() => setPrintLaid(true));
    window.addEventListener("beforeprint", lay);
    return () => window.removeEventListener("beforeprint", lay);
  }, []);
  useEffect(() => {
    if (!preparing) return;
    let cancelled = false;
    void waitForImages(printRoot.current).then(() => {
      if (cancelled) return;
      window.print();
      setPreparing(false);
    });
    return () => { cancelled = true; };
  }, [preparing]);
  function downloadPdf() {
    setPrintLaid(true);
    setPreparing(true);
  }

  const label = (step: ReaderStep) => step.kind === "chapter" ? step.chapter.title : step.part === "experience" && event.experience.title ? event.experience.title : t(partWords[step.part]);
  const pdfButton = (variant: "primary" | "secondary") => <div className={styles.pdf}>
    <Button type="button" variant={variant} onClick={downloadPdf} disabled={preparing} aria-describedby="guide-pdf-hint">
      <Download size={18} aria-hidden="true" /> {preparing ? t("guide.pdf.preparing") : t("guide.pdf")}
    </Button>
    <p id="guide-pdf-hint" className={styles.pdfHint}>{t("guide.pdf.hint")}</p>
  </div>;
  const link = (to: ReaderView) => ({
    href: hashFor(to) || "#",
    onClick: (e: MouseEvent<HTMLAnchorElement>) => { e.preventDefault(); navigate(to); },
  });

  const coverPhoto: PlainImage = guide.cover.photo.url ? guide.cover.photo : { url: event.hero.url, alt: event.hero.alt, srcset: event.hero.srcset };
  const cover = {
    eyebrow: guide.cover.eyebrow || t("guide.eyebrow"),
    title: guide.cover.title || event.title,
    subtitle: guide.cover.subtitle || event.subtitle,
  };

  return <div lang={lang} className={`${guestStyles.experience} ${styles.guide}`} data-theme={event.theme?.key ?? "werkudara"} data-print={printLaid ? "book" : undefined} style={themeStyle(event.theme)}>
    <div className={styles.screen}>
      {view.kind === "cover" ? <main id="guide-content">
        <section className={`${styles.cover} ${coverPhoto.url ? styles.coverWithPhoto : ""}`.trimEnd()} aria-labelledby="guide-cover-title">
          {coverPhoto.url && <div className={styles.coverPhoto}><GuidePhoto image={{ ...coverPhoto, alt: "" }} sizes="100vw" priority /></div>}
          <div className={styles.coverScrim} aria-hidden="true" />
          {onLang && <div className={styles.coverLang}><LanguageSwitch lang={lang} onChange={onLang} /></div>}
          <div className={styles.coverInner}>
            <p className={styles.coverEyebrow}><BookOpen size={16} aria-hidden="true" /> {cover.eyebrow}</p>
            <h1 id="guide-cover-title" tabIndex={-1}>{cover.title}</h1>
            {cover.subtitle && <p className={styles.coverSubtitle}>{cover.subtitle}</p>}
            {total > 0 ? <div className={styles.coverActions}>
              <ButtonLink {...link({ kind: "step", index: 0 })}>{t("guide.start")} <ArrowRight size={18} aria-hidden="true" /></ButtonLink>
              <a className={styles.coverTocLink} {...link({ kind: "cover", toc: true })}><List size={16} aria-hidden="true" /> {t("guide.toc")}</a>
            </div> : <p className={styles.coverEmpty}>{t("guide.empty")}</p>}
          </div>
        </section>
        {fallback && <p className={guestStyles.langFallback}>{t("lang.fallback")}</p>}
        {total > 0 && <section className={styles.toc} aria-labelledby="guide-toc-heading">
          <div className={styles.narrow}>
            <h2 id="guide-toc-heading" tabIndex={-1}>{t("guide.toc")}</h2>
            <ol className={styles.tocList}>
              {steps.map((step, index) => <li key={step.key}>
                <a {...link({ kind: "step", index })}><span className={styles.tocNumber}>{String(index + 1).padStart(2, "0")}</span><span>{label(step)}</span><ArrowRight size={16} aria-hidden="true" /></a>
              </li>)}
            </ol>
            {pdfButton("secondary")}
          </div>
        </section>}
      </main> : <>
        <header className={styles.bar}>
          <div className={styles.barInner}>
            <a className={styles.barToc} {...link({ kind: "cover", toc: true })}><List size={18} aria-hidden="true" /> {t("guide.toc")}</a>
            <p className={styles.barPosition}>
              {view.kind === "step" ? <><span aria-hidden="true">{view.index + 1} / {total}</span><span className="sr-only">{t("guide.position", { n: view.index + 1, total })}</span></> : t("guide.end.label")}
            </p>
            {onLang && <LanguageSwitch lang={lang} onChange={onLang} />}
          </div>
          <div className={styles.progress} aria-hidden="true"><span style={{ transform: `scaleX(${view.kind === "step" ? (view.index + 1) / total : 1})` }} /></div>
        </header>
        {fallback && <p className={guestStyles.langFallback}>{t("lang.fallback")}</p>}
        <main id="guide-content" className={styles.reader} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => { touch.current = null; }}>
          {view.kind === "step" ? <article key={steps[view.index].key} className={`${styles.narrow} ${styles.page}`} aria-labelledby="guide-page-heading">
            <StepContent step={steps[view.index]} number={view.index + 1} event={event} now={now} headingId="guide-page-heading" />
          </article> : <article className={`${styles.narrow} ${styles.page} ${styles.end}`} aria-labelledby="guide-page-heading">
            <BookOpen size={32} aria-hidden="true" className={styles.endIcon} />
            <h2 id="guide-page-heading" tabIndex={-1}>{t("guide.end.title")}</h2>
            <p className={styles.endText}>{t("guide.end.text")}</p>
            {pdfButton("primary")}
            <a className={styles.restart} {...link({ kind: "cover", toc: false })}><RotateCcw size={16} aria-hidden="true" /> {t("guide.restart")}</a>
          </article>}
        </main>
        <nav className={styles.pager} aria-label={t("guide.pager.label")}>
          <div className={styles.pagerInner}>
            {previous ? <a className={styles.pagerButton} {...link(previous)}><ArrowLeft size={18} aria-hidden="true" /> {t("guide.prev")}</a> : <span />}
            {next && <a className={`${styles.pagerButton} ${styles.pagerNext}`} {...link(next)}>{t("guide.next")} <ArrowRight size={18} aria-hidden="true" /></a>}
          </div>
        </nav>
      </>}
    </div>

    {printLaid && <div ref={printRoot} className={styles.book}>
      <section className={styles.bookCover}>
        <GuidePhoto image={{ ...coverPhoto, alt: "" }} className={styles.bookCoverPhoto} sizes="100vw" />
        <p className={styles.coverEyebrow}>{cover.eyebrow}</p>
        <h1>{cover.title}</h1>
        {cover.subtitle && <p className={styles.coverSubtitle}>{cover.subtitle}</p>}
        {total > 0 && <>
          <h2>{t("guide.toc")}</h2>
          <ol className={styles.tocList}>{steps.map((step, index) => <li key={step.key}><span className={styles.tocNumber}>{String(index + 1).padStart(2, "0")}</span> <span>{label(step)}</span></li>)}</ol>
        </>}
      </section>
      {steps.map((step, index) => <section key={step.key} className={styles.bookPage}>
        <StepContent step={step} number={index + 1} event={event} now={now} printable />
      </section>)}
      <section className={`${styles.bookPage} ${styles.end}`}><h2>{t("guide.end.title")}</h2></section>
    </div>}
  </div>;
}

function PageHeader({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: string; children?: ReactNode }) {
  return <header className={styles.pageHeader}>
    <p className="eyebrow">{eyebrow}</p>
    <h2 id={id} tabIndex={id ? -1 : undefined}>{title}</h2>
    {children}
  </header>;
}

/** One page: a chapter written for the guide, or a part of the event drawn by the invitation's own components. */
function StepContent({ step, number, event, now, headingId, printable = false }: { step: ReaderStep; number: number; event: EventRecord; now: number | null; headingId?: string; printable?: boolean }) {
  const { t, lang } = useWording();
  const eyebrow = t("guide.chapter", { n: number });
  if (step.kind === "chapter") return <ChapterContent chapter={step.chapter} eyebrow={eyebrow} headingId={headingId} />;
  const partEyebrow = `${eyebrow} · ${t(partWords[step.part])}`;
  switch (step.part) {
    case "experience": return <>
      <PageHeader id={headingId} eyebrow={partEyebrow} title={event.experience.title || t("section.experience.title")} />
      <ExperienceContent event={event} rsvpVisible={false} />
    </>;
    case "agenda": {
      const zone = timezoneInfo[zoneOf(event.timezone)];
      return <>
        <PageHeader id={headingId} eyebrow={partEyebrow} title={t("section.agenda.title")}>
          <p className={styles.pageIntro}>{t("section.agenda.tz", { zone: zone.label, zoneName: lang === "en" ? zone.nameEn : zone.name, offset: zone.offset })}</p>
        </PageHeader>
        <AgendaList event={event} now={now} expanded={printable} />
        {!printable && <CalendarButton event={event} now={now} />}
      </>;
    }
    case "location": return <>
      <PageHeader id={headingId} eyebrow={partEyebrow} title={t("section.location.title")} />
      <Location event={event} printable={printable} />
    </>;
    case "prepare": return <>
      <PageHeader id={headingId} eyebrow={partEyebrow} title={event.prepare.title || t("section.prepare.title")}>
        {event.prepare.intro && <p className={`${styles.pageIntro} ${guestStyles.multiline}`}>{event.prepare.intro}</p>}
      </PageHeader>
      <PrepareCards items={event.prepare.items} />
    </>;
    case "contact": return <>
      <PageHeader id={headingId} eyebrow={partEyebrow} title={event.contact.heading || t("section.contact.title")}>
        <p className={`${styles.pageIntro} ${guestStyles.multiline}`}>{event.contact.description || t("section.contact.sub")}</p>
      </PageHeader>
      <div className={styles.stack}>
        {event.contact.name && <Contact contact={event.contact} />}
        <EmergencyCard event={event} />
      </div>
    </>;
  }
}

function ChapterContent({ chapter, eyebrow, headingId }: { chapter: GuideChapter; eyebrow: string; headingId?: string }) {
  const { t } = useWording();
  const pointsId = useId();
  const items = chapter.items.filter(item => item.title.trim() || item.text.trim() || item.photo.url);
  return <>
    <PageHeader id={headingId} eyebrow={eyebrow} title={chapter.title} />
    <GuidePhoto image={chapter.photo} className={styles.chapterPhoto} priority={!!headingId} />
    {chapter.intro && <p className={`${styles.chapterIntro} ${guestStyles.multiline}`}>{chapter.intro}</p>}
    {items.length > 0 && chapter.layout === "story" && <section className={styles.points} aria-labelledby={pointsId}>
      <h3 id={pointsId}>{t("guide.story.points")}</h3>
      <ul>{items.map(item => <li key={item.id}>
        {item.title && <h4>{item.title}</h4>}
        {item.text && <p className={guestStyles.multiline}>{item.text}</p>}
      </li>)}</ul>
    </section>}
    {items.length > 0 && chapter.layout === "cards" && <ul className={styles.cards}>
      {items.map(item => <li key={item.id} className={styles.card}>
        <GuidePhoto image={item.photo} className={styles.cardPhoto} />
        <div className={styles.cardBody}>
          {item.title && <h3>{item.title}</h3>}
          {item.text && <p className={guestStyles.multiline}>{item.text}</p>}
          {item.fact && <div className={guestStyles.didYouKnow}>
            <p className={guestStyles.didYouKnowTitle}><Lightbulb size={16} aria-hidden="true" /> {t("detail.didYouKnow")}</p>
            <p className={guestStyles.multiline}>{item.fact}</p>
          </div>}
          {item.link && <ButtonLink variant="secondary" href={item.link} target="_blank" rel="noopener noreferrer" className={styles.cardLink}>
            <MapPin size={16} aria-hidden="true" /> {t("guide.map")} <ArrowUpRight size={16} aria-hidden="true" /><span className="sr-only">{t("common.newTab")}</span>
          </ButtonLink>}
        </div>
      </li>)}
    </ul>}
    {items.length > 0 && chapter.layout === "phrases" && <dl className={styles.phrases}>
      <div className={styles.phrasesHead} aria-hidden="true"><span>{t("guide.phrase")}</span><span>{t("guide.meaning")}</span></div>
      {items.map(item => <div key={item.id} className={styles.phrase}><dt>{item.title}</dt><dd className={guestStyles.multiline}>{item.text}</dd></div>)}
    </dl>}
    {items.length > 0 && chapter.layout === "tips" && <ul className={styles.tips}>
      {items.map(item => <li key={item.id}>
        {item.title && <h3>{item.title}</h3>}
        {item.text && <p className={guestStyles.multiline}>{item.text}</p>}
      </li>)}
    </ul>}
  </>;
}
