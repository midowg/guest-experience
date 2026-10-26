import card from "./card-miniature.module.css";
import { CalendarDays, Clock3, MapPin } from "lucide-react";
import type { EventTemplate } from "@/lib/event-templates";
import { themeDefinition } from "@/lib/themes";
import type { SectionKey } from "@/lib/types";
import styles from "@/components/admin/admin.module.css";

const sectionNames: Partial<Record<SectionKey, string>> = {
  experience: "Pengalaman", agenda: "Jadwal", location: "Lokasi & rute", prepare: "Persiapan", team: "Our Team", rsvp: "Konfirmasi", contact: "Kontak PIC", feedback: "Survei",
};

/**
 * A small, static picture of the guest page a template produces: its own colours and heading
 * font, an example title, and the first sections it shows. Decorative: the card text says it all.
 */
export function TemplateMiniature({ template, title }: { template: EventTemplate; title?: string }) {
  const t = themeDefinition(template.theme).tokens;
  // A card template is no invitation: show the kinds of card it makes instead.
  if (template.kind === "kartu") return <div className={styles.mini} style={{ background: t.background, color: t.text, borderColor: t.border }} aria-hidden="true">
    <div className={card.cards}>
      {[["Poster", 4 / 5], ["Ucapan", 1], ["ID card", 0.63], ["Sertifikat", 1.41]].map(([name, ratio], index) => <span key={name as string} className={card.card} data-wide={(ratio as number) > 1 || undefined} style={{ aspectRatio: String(ratio), background: index % 2 ? t.surface : t.hero, color: index % 2 ? t.heading : t.onHero, fontFamily: t.fontHeading }}>{name}</span>)}
    </div>
    <strong className={styles.miniTitle} style={{ color: t.heading, fontFamily: t.fontHeading, fontWeight: t.headingWeight, padding: "0 10px 10px" }}>{title?.trim() || template.example}</strong>
  </div>;
  // An E-Guide is a book: a cover, then its first chapters. No date, place or RSVP button.
  if (template.kind === "eguide") return <div className={styles.mini} style={{ background: t.background, color: t.text, borderColor: t.border }} aria-hidden="true">
    <div className={styles.miniHero} style={{ background: t.hero, color: t.onHero }}>
      <span className={styles.miniEyebrow} style={{ color: t.heroAccent }}>E-Guide</span>
      <strong className={styles.miniTitle} style={{ fontFamily: t.fontHeading, fontWeight: t.headingWeight }}>{title?.trim() || template.example}</strong>
    </div>
    <div className={styles.miniBody}>
      {(template.guide?.chapters ?? []).slice(0, 4).map((chapter, index) => <div key={chapter.title} className={styles.miniSection} style={{ borderColor: t.border }}>
        <span className={styles.miniNumber} style={{ color: t.heading }}>Bab {index + 1}</span>
        <span className={styles.miniLabel} style={{ color: t.heading, fontFamily: t.fontHeading, fontWeight: t.headingWeight }}>{chapter.title}</span>
        <span className={styles.miniLine} style={{ background: t.soft }} />
      </div>)}
    </div>
  </div>;
  const sections = template.modules.filter(key => key !== "about").map(key => sectionNames[key]).filter(Boolean).slice(0, 4);
  return <div className={styles.mini} style={{ background: t.background, color: t.text, borderColor: t.border }} aria-hidden="true">
    <div className={styles.miniHero} style={{ background: t.hero, color: t.onHero }}>
      <span className={styles.miniEyebrow} style={{ color: t.heroAccent }}>{template.kind === "program" ? "Undangan program" : template.kind === "kunjungan" ? "Undangan kunjungan" : "Undangan acara"}</span>
      <strong className={styles.miniTitle} style={{ fontFamily: t.fontHeading, fontWeight: t.headingWeight }}>{title?.trim() || template.example}</strong>
      <span className={styles.miniFacts}><CalendarDays size={9} /> Sen, 2 Nov <Clock3 size={9} /> 09.00 <MapPin size={9} /> Werkudara</span>
      <span className={styles.miniButton} style={{ background: t.onHero, color: t.hero }}>Konfirmasi kehadiran</span>
    </div>
    <div className={styles.miniBody}>
      {sections.map((name, index) => <div key={name} className={styles.miniSection} style={{ borderColor: t.border }}>
        <span className={styles.miniNumber} style={{ color: t.heading }}>0{index + 1}</span>
        <span className={styles.miniLabel} style={{ color: t.heading, fontFamily: t.fontHeading, fontWeight: t.headingWeight }}>{name}</span>
        <span className={styles.miniLine} style={{ background: t.soft }} />
      </div>)}
    </div>
  </div>;
}
