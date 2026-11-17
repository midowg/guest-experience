import { Suspense } from "react";
import { moduleAllows } from "@/lib/main-wam/access";
import { summaryRows } from "@/lib/main-wam/panitia/summary";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { bodSummary } from "@/lib/server/main-wam/panitia/summary";
import { Banner } from "@/components/main-wam/ui";
import { RingkasanCard, RingkasanSkeleton } from "./BerandaCards";
import { RetryBanner } from "./RetryBanner";

/**
 * B01: BOD's Ringkasan card on Beranda, at most 4 rows: Kehadiran hari ini, Awarding perlu
 * persetujuan (module voting), Silent Meeting (module silent), Jejak karbon (module karbon, a number
 * only). A module that is off has no row. SLOT (fondasi): owner agen C; agen A's Beranda renders it
 * as it is, so keep the name and props. Returns nothing for anyone who is not BOD (mainWamCan "ringkasan").
 *
 * Streams: Beranda shows at once with the card's skeleton (as many rows as there will be, known from
 * the modules), and the numbers replace it when they are counted.
 */
export async function BerandaBod({ context, now }: { context: MainWamContext; now: Date }) {
  if (!moduleAllows(context.viewer, "ringkasan", context.settings.modules)) return null;
  const rowCount = summaryRows({ modules: context.settings.modules, attendance: { percent: null, day: null }, awards: { pending: 0, approved: 0 }, silentFeedback: 0, carbonKg: null }).length;
  if (!rowCount) return null;
  return <Suspense fallback={<RingkasanSkeleton rows={rowCount} />}><Ringkasan context={context} now={now} /></Suspense>;
}

async function Ringkasan({ context, now }: { context: MainWamContext; now: Date }) {
  const summary = await bodSummary(context, now).catch(() => null);
  if (!summary) return <RingkasanCard rows={[]}><RetryBanner title="Ringkasan belum dapat dimuat." /></RingkasanCard>;
  if (!summary.migrated) return <RingkasanCard rows={[]}><Banner tone="info" title="Menunggu pembaruan sistem">Ringkasan tampil setelah pembaruan sistem dijalankan.</Banner></RingkasanCard>;
  return <RingkasanCard rows={summary.rows} />;
}
