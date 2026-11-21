import { Images } from "lucide-react";
import { Words } from "@/components/main-wam/i18n";
import { Card, EyebrowLabel, PhotoFill, Pill, PulseDot } from "@/components/main-wam/ui";
import { newPhotosText } from "@/lib/main-wam/momen/stack";
import { mainWamPath } from "@/lib/routes";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { t } from "@/lib/main-wam/i18n";
import { newForMe } from "@/lib/server/main-wam/momen/feed";
import { MomenQueueRunner } from "./upload/QueueRunner";
import css from "./beranda-momen.module.css";

/**
 * P01: the Momen tile on Beranda (prototipe .ft.mm), the right half of the pair beside Jejak karbon: a
 * "Momen" pill with "12 baru" in gold, three small tilted photos, one line ("12 foto baru"). The whole tile
 * opens Momen (the camera is there). SLOT (fondasi), owner agen B; agen A renders it as it is. It also
 * starts sending photos still queued on this phone (U03): the app was opened.
 */
export async function BerandaMomen({ context, now }: { context: MainWamContext; now: Date }) {
  void now;
  const lang = await readLang();
  const news = await newForMe(context).catch(() => ({ unseen: 0, total: 0, latest: [], migrated: false }));
  return <MomenCard photos={news.latest.map(photo => photo.src.kecil)} unseen={news.unseen} sub={news.migrated ? newPhotosText(news.unseen, news.total, lang) : t(lang, "momen.noneYet")} />;
}

/** The tile itself (also for previews): the pill, three small photos, one line. */
export function MomenCard({ photos, sub, unseen = 0, runner = true }: { photos: (string | null)[]; sub: string; /** How many are new: the gold "12 baru" at the top right. */ unseen?: number; runner?: boolean }) {
  const three = [0, 1, 2].map(index => photos[index] ?? null);
  return <Card as="article" href={mainWamPath.moments()} className={css.tile}>
    {runner && <MomenQueueRunner />}
    <span className={css.head}>
      <Pill icon={<Images />}><Words k="ui.moments" /></Pill>
      {unseen > 0 && <EyebrowLabel tone="gold" className={css.fresh}><PulseDot /><Words k="momen.card.new" vars={{ n: unseen }} /></EyebrowLabel>}
    </span>
    <span className={css.fan} aria-hidden>
      {three.map((src, index) => <PhotoFill key={index} photo={src ? { src } : null} tone={(index + 2) as 2 | 3 | 4} className={css.photo} />)}
    </span>
    <span className={css.line}>{sub}</span>
  </Card>;
}
