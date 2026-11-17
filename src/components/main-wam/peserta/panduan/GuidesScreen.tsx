import { ClipboardList, FileText, Hotel, Hourglass, Map as MapIcon, Shirt } from "lucide-react";
import { guideIcon, guideLine } from "@/lib/main-wam/peserta/guides";
import type { MwGuide } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { ScreenContent } from "@/components/main-wam/shell";
import { EmptyState, List, ListRow } from "@/components/main-wam/ui";
import { OfflineBanner } from "../Live";

const ICONS = { map: MapIcon, hotel: Hotel, shirt: Shirt, "clipboard-list": ClipboardList, "file-text": FileText } as const;

/**
 * Panduan (L04, revisi 16 Nov malam): one list without tabs (Denah venue, Hotel & fasilitas, Dress
 * code per hari, Tata tertib kegiatan), written in Admin WAM; a row opens its page.
 */
export function GuidesScreen({ migrated, guides, since, forceOffline }: { migrated: boolean; guides: MwGuide[]; since: string; forceOffline?: boolean }) {
  return <ScreenContent>
    <OfflineBanner since={since} force={forceOffline} />
    {!migrated
      ? <EmptyState size="s" icon={<Hourglass />} title="Menunggu pembaruan sistem">Panduan tampil setelah pembaruan selesai.</EmptyState>
      : !guides.length
        ? <EmptyState size="s" icon={<MapIcon />} title="Panduan belum tersedia" />
        : <List>
          {guides.map(guide => {
            const Icon = ICONS[guideIcon[guide.kind]];
            return <ListRow key={guide.id} icon={<Icon />} title={guide.title} sub={guideLine(guide) || undefined} href={mainWamPath.guide(guide.slug)} />;
          })}
        </List>}
  </ScreenContent>;
}
