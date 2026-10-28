import type { EditorKit } from "@/components/admin/editor/kit";
import { HeroPreview } from "@/components/admin/editor/HeroPreview";
import { heroTextPositionHints, heroTextPositionOptions } from "@/components/admin/editor/editor-model";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import { defaultFraming, getFraming } from "@/lib/hero-framing";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
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
    <p>Foto sampul tampil di halaman donasi <strong>di bawah judul</strong>, dalam bingkai foto putih yang sedikit miring dengan stiker &ldquo;Yuk, berbagi!&rdquo;. Teks tidak ditulis di atas foto, jadi foto apa pun tetap terbaca. Pilih foto <strong>mendatar</strong> yang ceria, misalnya anak-anak sedang bermain atau kegiatan berbagi sebelumnya. Geser foto di pratinjau untuk memilih bagian yang terlihat.</p>
    <PhotoField name="hero.url" label="Foto sampul" value={event.hero.url} srcset={event.hero.srcset} onChange={value => updateHero({ ...value, framing: defaultFraming() })} error={errors["hero.url"]?.join(" ")} />
    {errors["hero.srcset"] && <p id="hero.srcset" tabIndex={-1} className="field-error">{errors["hero.srcset"].join(" ")}</p>}
    <label className="field"><span>Keterangan foto <small>untuk pembaca layar</small></span>
      <input className="input" name="hero.alt" value={event.hero.alt} maxLength={200} placeholder="Anak-anak panti bermain kursi bersama relawan" onChange={change => updateHero({ alt: change.target.value })} />
    </label>
    {event.hero.url && <CoverFrame url={event.hero.url} frame={getFraming(event.hero).mobile} onChange={frame => updateHero({ framing: { mobile: frame, desktop: frame } })} />}
  </div>;
}

const clamp = (value: number) => Math.round(Math.min(100, Math.max(0, value)));

/**
 * The cover as it shows on the donation page, to drag: moving the photo picks which part fills the
 * frame (saved as its x/y position, 0 to 100). Arrow keys move it too; Tengahkan resets it.
 */
function CoverFrame({ url, frame, onChange }: { url: string; frame: { x: number; y: number; zoom: number }; onChange: (frame: { x: number; y: number; zoom: number }) => void }) {
  const drag = useRef<{ x: number; y: number; frameX: number; frameY: number; width: number; height: number } | null>(null);
  const move = (x: number, y: number) => onChange({ ...frame, x: clamp(x), y: clamp(y) });
  function start(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, frameX: frame.x, frameY: frame.y, width: box.width, height: box.height };
  }
  function follow(event: PointerEvent<HTMLDivElement>) {
    const from = drag.current;
    if (!from) return;
    // Dragging the photo right shows more of its left side, so the position moves the other way.
    move(from.frameX - (event.clientX - from.x) / from.width * 100, from.frameY - (event.clientY - from.y) / from.height * 100);
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[event.key];
    if (!step) return;
    event.preventDefault();
    move(frame.x + step[0], frame.y + step[1]);
  }
  return <figure className={styles.csrCover}>
    <div className={styles.csrFrame} tabIndex={0} role="group" aria-label={`Posisi foto sampul, ${frame.x}% dari kiri dan ${frame.y}% dari atas. Geser fotonya, atau pakai tombol panah.`}
      onPointerDown={start} onPointerMove={follow} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onKeyDown={key}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a preview of the admin's own photo */}
      <img src={url} alt="" draggable={false} style={{ objectPosition: `${frame.x}% ${frame.y}%` }} />
    </div>
    <figcaption>Geser foto untuk memilih bagian yang tampil di halaman donasi. <button type="button" className={styles.csrCenter} onClick={() => move(50, 50)}>Tengahkan</button></figcaption>
  </figure>;
}
