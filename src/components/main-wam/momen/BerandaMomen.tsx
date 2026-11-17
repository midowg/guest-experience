import { Camera } from "lucide-react";
import { Button, Card, StackPreview } from "@/components/main-wam/ui";
import { newPhotosText } from "@/lib/main-wam/momen/stack";
import { mainWamPath } from "@/lib/routes";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { newForMe } from "@/lib/server/main-wam/momen/feed";
import { MomenQueueRunner } from "./upload/QueueRunner";

/**
 * P01: the Momen card on Beranda: a small stack "12 foto baru" with Lihat (→ Momen) and Ambil foto
 * (→ Kamera; the first time through the camera's pre-permission O04). SLOT (fondasi), owner agen B;
 * agen A renders it as it is. It also starts sending photos still queued on this phone (U03): the app
 * was opened.
 */
export async function BerandaMomen({ context, now }: { context: MainWamContext; now: Date }) {
  void now;
  const news = await newForMe(context).catch(() => ({ unseen: 0, total: 0, latest: [], migrated: false }));
  return <MomenCard photos={news.latest.map(photo => photo.src.kecil)} sub={news.migrated ? newPhotosText(news.unseen, news.total) : "Belum ada foto"} />;
}

/** The card itself (also for previews): three small photos, "12 foto baru", Lihat; Ambil foto. */
export function MomenCard({ photos, sub, runner = true }: { photos: (string | null)[]; sub: string; runner?: boolean }) {
  return <Card>
    {runner && <MomenQueueRunner />}
    <StackPreview photos={photos.map(src => ({ src }))} title="Momen" sub={sub} cta="Lihat" href={mainWamPath.moments()} />
    <Button variant="secondary" block icon={<Camera />} href={mainWamPath.camera()}>Ambil foto</Button>
  </Card>;
}
