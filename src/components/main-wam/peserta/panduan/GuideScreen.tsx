import { FileText, MapPin } from "lucide-react";
import { fileShown, paragraphs } from "@/lib/main-wam/peserta/guides";
import type { MwGuide } from "@/lib/main-wam/types";
import { mainWamApi } from "@/lib/routes";
import { ScreenContent, ScreenSection } from "@/components/main-wam/shell";
import { Button } from "@/components/main-wam/ui";
import css from "../peserta.module.css";

/**
 * One guide (L04, the page a row opens; not drawn in the prototype): its title, the text as
 * written, and its file through the server (storage stays private): a picture inline (Denah), a PDF
 * as a button. The hotel's guide starts with its name and address when Admin WAM filled them in.
 */
export function GuideScreen({ guide, hotel }: { guide: MwGuide; hotel: { name: string; address: string } | null }) {
  const shown = fileShown(guide.file);
  const file = guide.file ? mainWamApi.guideFile(guide.id) : null;
  return <ScreenContent>
    <ScreenSection>
      <h2 className={css.sessionTitle}>{guide.title}</h2>
      {hotel && (hotel.name || hotel.address) && <div className={css.infoList}>
        <div className={css.infoRow}><MapPin aria-hidden /><span>{[hotel.name, hotel.address].filter(Boolean).join(" · ")}</span></div>
      </div>}
    </ScreenSection>
    {shown === "gambar" && file && <a href={file} target="_blank" rel="noopener noreferrer" aria-label={`${guide.title}, buka gambar penuh`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a private file through the server, shown as it is */}
      <img className={css.guideImage} src={file} alt={guide.title} loading="lazy" decoding="async" />
    </a>}
    {guide.body.trim() && <div className={css.paragraphs}>{paragraphs(guide.body).map((line, index) => <p key={index} className={css.text}>{line}</p>)}</div>}
    {shown === "berkas" && file && <Button variant="secondary" icon={<FileText />} href={file} external block>Buka berkas</Button>}
  </ScreenContent>;
}
