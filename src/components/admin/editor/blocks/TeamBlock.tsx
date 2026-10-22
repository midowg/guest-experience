import type { EditorKit } from "@/components/admin/editor/kit";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import { PhotoGuide } from "./PhotoGuide";

export function TeamBlock({ kit }: { kit: EditorKit }) {
  const { event, update, control, errors } = kit;
  return <div className="stack">
    <p>Bagian ini memakai teks tetap tentang lingkungan kerja Werkudara yang inklusif. Aktifkan dan atur urutannya di bawah. Foto tim opsional; unggah hanya foto yang boleh ditampilkan publik.</p>
    <PhotoField name="team_image.url" label="Foto tim (opsional)" value={event.team_image.url} srcset={event.team_image.srcset} onChange={value => update("team_image", { ...event.team_image, ...value, alt: value.url ? event.team_image.alt : "" })} error={errors["team_image.url"]?.join(" ")} />
    {control("team_image.alt", "Deskripsi foto tim", event.team_image.alt, value => update("team_image", { ...event.team_image, alt: value }), { maxLength: 300, hint: "Wajib bila foto diisi. Jelaskan isi foto untuk pembaca layar." })}
    <PhotoGuide />
  </div>;
}
