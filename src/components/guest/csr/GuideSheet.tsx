import { Info, Navigation } from "lucide-react";
import type { CsrGuide } from "@/lib/csr-guide";
import { imageSrcSet } from "../Gallery";
import { arrivalIconComponents } from "../VisitRoute";
import s from "./csr.module.css";

/**
 * Panduan ke lokasi inside Friday Sharing: the route from Panduan lokasi (map, steps, arrival notes,
 * photos) drawn in the page's own theme, with a button to open Google Maps.
 */
export function GuideContent({ guide, mapsHref }: { guide: CsrGuide; mapsHref: string }) {
  const lines = guide.address.split("\n").map(line => line.trim()).filter(Boolean);
  return <div className={s.guide}>
    {guide.mapImage.url && <a className={s.guideMap} href={guide.mapImage.url} target="_blank" rel="noopener noreferrer" aria-label="Buka peta rute ukuran penuh">
      {/* eslint-disable-next-line @next/next/no-img-element -- stored images with their own srcset */}
      <img src={guide.mapImage.url} {...imageSrcSet(guide.mapImage.srcset, "(min-width: 576px) 540px, 92vw")} alt={guide.mapImage.alt || "Peta rute"} loading="lazy" decoding="async" />
      <span>Ketuk untuk memperbesar peta</span>
    </a>}
    {(guide.venueName || lines.length > 0) && <div className={s.guidePlace}>
      {guide.venueName && <p className={s.guidePlaceName}>{guide.venueName}</p>}
      {lines.map((line, index) => <p key={index}>{line}</p>)}
    </div>}
    {guide.arrivalNotes && <p className={s.guideNote}>{guide.arrivalNotes}</p>}
    {guide.steps.length > 0 && <ol className={s.guideSteps} aria-label="Langkah menuju lokasi">
      {guide.steps.map((step, index) => <li key={`${index}-${step.title}`}>
        <span className={s.guideNum} aria-hidden="true">{index + 1}</span>
        <div>
          <p className={s.guideStepTitle}>{step.title}</p>
          {step.description && <p className={s.guideStepText}>{step.description}</p>}
          {step.image.url && <a href={step.image.url} target="_blank" rel="noopener noreferrer" className={s.guideStepPhoto} aria-label={`Foto langkah ${index + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- stored images with their own srcset */}
            <img src={step.image.url} {...imageSrcSet(step.image.srcset, "(min-width: 576px) 460px, 80vw")} alt={step.image.alt} loading="lazy" decoding="async" />
          </a>}
        </div>
      </li>)}
    </ol>}
    {guide.points.length > 0 && <ul className={s.guidePoints} aria-label="Info kedatangan">
      {guide.points.map((point, index) => {
        const Icon = arrivalIconComponents[point.icon] ?? Info;
        return <li key={`${index}-${point.title}`}><span aria-hidden="true"><Icon size={18} /></span><div><p className={s.guideStepTitle}>{point.title}</p>{point.description && <p className={s.guideStepText}>{point.description}</p>}</div></li>;
      })}
    </ul>}
    {guide.gallery.length > 0 && <ul className={s.guideGallery} aria-label="Foto lokasi">
      {guide.gallery.map(photo => <li key={photo.id}>
        {/* eslint-disable-next-line @next/next/no-img-element -- stored images with their own srcset */}
        <img src={photo.url} {...imageSrcSet(photo.srcset ?? [], "33vw")} alt={photo.alt || photo.caption || "Foto lokasi"} loading="lazy" decoding="async" />
      </li>)}
    </ul>}
    <a className={s.guideMaps} href={guide.locationUrl || mapsHref} target="_blank" rel="noopener noreferrer"><Navigation size={18} aria-hidden="true" /> Buka Google Maps</a>
  </div>;
}
