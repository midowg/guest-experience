import type { EditorKit } from "@/components/admin/editor/kit";
import { HeroPreview } from "@/components/admin/editor/HeroPreview";
import { heroTextPositionHints, heroTextPositionOptions } from "@/components/admin/editor/editor-model";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import { defaultFraming } from "@/lib/hero-framing";
import type { EventRecord } from "@/lib/types";
import { PhotoGuide } from "./PhotoGuide";

export function HeroBlock({ kit }: { kit: EditorKit }) {
  const { event, update, choices, errors } = kit;
  const updateHero = (patch: Partial<EventRecord["hero"]>) => update("hero", { ...event.hero, ...patch });
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
