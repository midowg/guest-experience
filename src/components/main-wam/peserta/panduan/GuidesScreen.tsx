"use client";

import { ClipboardList, FileText, Hotel, Hourglass, Map as MapIcon, Shirt } from "lucide-react";
import { guideIcon, guideLine } from "@/lib/main-wam/peserta/guides";
import type { MwGuide } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { useT } from "@/components/main-wam/i18n";
import { ScreenContent } from "@/components/main-wam/shell";
import { EmptyState } from "@/components/main-wam/ui";
import { Row, RowGroup } from "../saya/Rows";
import { OfflineBanner } from "../Live";

const ICONS = { map: MapIcon, hotel: Hotel, shirt: Shirt, "clipboard-list": ClipboardList, "file-text": FileText } as const;

/**
 * Panduan (L04, revisi 16 Nov malam): one list without tabs (Denah venue, Hotel & fasilitas, Dress
 * code per hari, Tata tertib kegiatan), written in Admin WAM; a row opens its page.
 */
export function GuidesScreen({ migrated, guides, since, forceOffline }: { migrated: boolean; guides: MwGuide[]; since: string; forceOffline?: boolean }) {
  const t = useT();
  return <ScreenContent>
    <OfflineBanner since={since} force={forceOffline} />
    {!migrated
      ? <EmptyState size="s" icon={<Hourglass />} title={t("peserta.waiting.title")}>{t("peserta.waiting.guides")}</EmptyState>
      : !guides.length
        ? <EmptyState size="s" icon={<MapIcon />} title={t("peserta.guides.none")} />
        : <RowGroup>
          {guides.map(guide => {
            const Icon = ICONS[guideIcon[guide.kind]];
            return <Row key={guide.id} icon={<Icon />} title={guide.title} sub={guideLine(guide) || undefined} href={mainWamPath.guide(guide.slug)} />;
          })}
        </RowGroup>}
  </ScreenContent>;
}
