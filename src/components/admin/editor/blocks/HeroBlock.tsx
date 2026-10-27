import type { EditorKit } from "@/components/admin/editor/kit";
import { HeroPreview } from "@/components/admin/editor/HeroPreview";
import { heroTextPositionHints, heroTextPositionOptions } from "@/components/admin/editor/editor-model";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import { defaultFraming } from "@/lib/hero-framing";
import type { EventRecord } from "@/lib/types";
import { PhotoGuide } from "./PhotoGuide";
import styles from "./donation-block.module.css";

export function HeroBlock({ kit }: { kit: EditorKit }) {
  const { event, update, choices, errors } = kit;
  const updateHero = (patch: Partial<EventRecord["hero"]>) => update("hero", { ...event.hero, ...patch });
  if (event.event_kind === "csr") return <CsrCover kit={kit} />;
  return <div className="stack">
    <p>Foto latar adalah gambar pembuka undangan, dan satu-satunya foto yang memiliki pilihan posisi teks. Foto lokasi di galeri tidak memakai pilihan ini. Atur posisi dan zoom foto secara terpisah untuk HP dan desktop melalui pratinjau asli di bawah.</p>
    <PhotoField name="hero.url" label="Foto latar (opsional)" value={event.hero.url} srcset={event.hero.srcset} onChange={value => updateHero({ ...value, framing: defaultFraming() })} error={errors["hero.url"]?.join(" ")} />
    {choices("hero.text_position", "Posisi teks pembuka", heroTextPositionOptions, event.hero.text_position, text_position => updateHero({ text_position }), value => heroTextPositionHints[value])}
    {/* prepareEvent normally prevents this; a server-side field error still needs a focus target. */}
    {errors["hero.srcset"] && <p id="hero.srcset" tabIndex={-1} className="field-error">{errors["hero.srcset"].join(" ")}</p>}
    <HeroPreview event={event} onChange={updateHero} />
    <PhotoGuide />
  </div>;
}

/**
 * Friday Sharing's cover: one photo shown under the title as a tilted polaroid, never with text on
 * it, so there is no text position or framing to set. Only the photo and what it shows.
 */
function CsrCover({ kit }: { kit: EditorKit }) {
  const { event, update, errors } = kit;
  const updateHero = (patch: Partial<EventRecord["hero"]>) => update("hero", { ...event.hero, ...patch });
  return <div className="stack">
    <p>Foto sampul tampil di halaman donasi <strong>di bawah judul</strong>, dalam bingkai foto putih yang sedikit miring dengan stiker &ldquo;Yuk, berbagi!&rdquo;. Teks tidak ditulis di atas foto, jadi foto apa pun tetap terbaca. Pilih foto <strong>mendatar</strong> yang ceria, misalnya anak-anak sedang bermain atau kegiatan berbagi sebelumnya. Bagian tengah foto yang terlihat.</p>
    <PhotoField name="hero.url" label="Foto sampul" value={event.hero.url} srcset={event.hero.srcset} onChange={value => updateHero({ ...value, framing: defaultFraming() })} error={errors["hero.url"]?.join(" ")} />
    {errors["hero.srcset"] && <p id="hero.srcset" tabIndex={-1} className="field-error">{errors["hero.srcset"].join(" ")}</p>}
    <label className="field"><span>Keterangan foto <small>untuk pembaca layar</small></span>
      <input className="input" name="hero.alt" value={event.hero.alt} maxLength={200} placeholder="Anak-anak panti bermain kursi bersama relawan" onChange={change => updateHero({ alt: change.target.value })} />
    </label>
    {event.hero.url && <figure className={styles.csrCover}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a preview of the admin's own photo */}
      <img src={event.hero.url} alt="" />
      <figcaption>Seperti ini foto tampil di halaman donasi.</figcaption>
    </figure>}
  </div>;
}
