import Link from "next/link";
import { Camera, Images } from "lucide-react";
import { Words } from "@/components/main-wam/i18n";
import { Button, Card, EyebrowLabel, PhotoFill, Pill, PulseDot } from "@/components/main-wam/ui";
import { newPhotosText, uploadedByText } from "@/lib/main-wam/momen/stack";
import { mainWamPath } from "@/lib/routes";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { t } from "@/lib/main-wam/i18n";
import { newForMe } from "@/lib/server/main-wam/momen/feed";
import { sessionById } from "@/lib/server/main-wam/read";
import { MomenQueueRunner } from "./upload/QueueRunner";
import css from "./beranda-momen.module.css";

/**
 * P01: the Momen tile on Beranda (prototipe .ft.mm), the right half of the pair beside Jejak karbon: a
 * "Momen" pill with "12 baru" in gold, three small tilted photos, one line ("12 foto baru"). The whole tile
 * opens Momen (the camera is there). SLOT (fondasi), owner agen B; agen A renders it as it is. It also
 * starts sending photos still queued on this phone (U03): the app was opened.
 */
export async function BerandaMomen({ context, now }: { context: MainWamContext; now: Date }) {
  const lang = await readLang();
  const news = await newForMe(context).catch(() => ({ unseen: 0, total: 0, latest: [], migrated: false }));
  // "Sari mengunggah di Aula Utama · 2 mnt lalu": the newest photo of someone else, with the name Momen itself shows on it. Never the person's own.
  const latest = news.latest.find(photo => !photo.mine);
  const place = latest?.sessionId ? (await sessionById(latest.sessionId).catch(() => null))?.title ?? null : null;
  const by = latest ? uploadedByText(latest.owner.name, place, latest.visibleAt, now, lang) : null;
  return <MomenCard photos={news.latest.map(photo => photo.src.kecil)} unseen={news.unseen} by={by} sub={news.migrated ? newPhotosText(news.unseen, news.total, lang) : t(lang, "momen.noneYet")} />;
}

/** The tile itself (also for previews): the pill, three small photos, one line. */
export function MomenCard({ photos, sub, by = null, unseen = 0, runner = true }: { photos: (string | null)[]; sub: string; /** "Sari mengunggah di Aula Utama · 2 mnt lalu": replaces `sub` when there is a photo of someone else. */ by?: string | null; /** How many are new: the gold "12 baru" at the top right. */ unseen?: number; runner?: boolean }) {
  const three = [0, 1, 2].map(index => photos[index] ?? null);
  return <Card as="article" className={css.tile}>
    {runner && <MomenQueueRunner />}
    <Link href={mainWamPath.moments()} className={css.open}>
    <span className={css.head}>
      <Pill icon={<Images />}><Words k="ui.moments" /></Pill>
      {unseen > 0 && <EyebrowLabel tone="gold" className={css.fresh}><PulseDot /><Words k="momen.card.new" vars={{ n: unseen }} /></EyebrowLabel>}
    </span>
    <span className={css.fan} aria-hidden>
      {three.map((src, index) => <PhotoFill key={index} photo={src ? { src } : null} tone={(index + 2) as 2 | 3 | 4} className={css.photo} />)}
    </span>
    <span className={css.line}>{by ?? sub}</span>
    </Link>
    <Button variant="tonal" size="m" block icon={Camera} href={mainWamPath.camera()}><Words k="momen.takePhoto" /></Button>
  </Card>;
}
