"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { ScreenContent, Stack } from "@/components/main-wam/shell";
import { Avatar, Banner, Button, Card, ConfirmDialog, EmptyState, List, ListRow, PhotoFill, Pill, Sheet, StatusPill, useToast } from "@/components/main-wam/ui";
import { approvalCard, methodLabel, rankTally, topTied, totalVotes, waitingCount, when, type NomineeView } from "@/lib/main-wam/modul/awards";
import { wibTime } from "@/lib/main-wam/rundown";
import type { MwAwardApproval, MwAwardCategory } from "@/lib/main-wam/types";
import { mainWamApi } from "@/lib/routes";
import { errorText, modulRequest } from "../request";
import { nomineeName } from "../awards/AwardList";
import css from "../modul.module.css";

export type ApprovalData = {
  categories: MwAwardCategory[];
  /** Votes per nominee (category → nominee → count), aggregates only, of closed voting only (audit M1). */
  counts: Record<string, Record<string, number>>;
  nominees: Record<string, NomineeView>;
  approvals: Record<string, MwAwardApproval>;
  /** Approver id → nama panggilan. */
  names: Record<string, string>;
  me: string;
};

const short = (nominee: NomineeView | undefined) => (nominee ? (nominee.kind === "foto" ? `foto ${nominee.name}` : nominee.name) : "pemenang");
const clock = (iso: string) => wibTime(iso).replace(":", ".");

/**
 * B06 Persetujuan awarding (BOD): per closed category the count (aggregates, no voters; nothing
 * while voting is open, audit M1), "Setujui <top>"
 * or "Pilih lain" (a sheet of every nominee), and once approved who did and when. A tie at the top
 * asks the BOD to choose. Panitia are told after each approval (toast "Panitia diberi kabar.").
 */
export function AwardApproval({ data, now: nowIso, preview }: { data: ApprovalData; now: string; preview?: { confirm?: string } }) {
  const toast = useToast();
  const now = new Date(nowIso);
  const [approvals, setApprovals] = useState<Record<string, MwAwardApproval>>(data.approvals);
  const [picking, setPicking] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ categoryId: string; nomineeId: string } | null>(() => {
    if (!preview?.confirm) return null;
    const category = data.categories.find(item => item.id === preview.confirm);
    const top = category ? rankTally(category.nominees, new Map(Object.entries(data.counts[category.id] ?? {})))[0] : null;
    return category && top ? { categoryId: category.id, nomineeId: top.nominee.id } : null;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data.categories.length) {
    return <ScreenContent><EmptyState icon={<Trophy />} title="Belum ada kategori">Kategori awarding tampil di sini setelah diterbitkan panitia.</EmptyState></ScreenContent>;
  }

  const approvalMap = new Map(Object.entries(approvals));
  const waiting = waitingCount(data.categories, approvalMap, now);
  const announce = data.categories.map(category => category.announceAt).filter((at): at is string => !!at).sort()[0];
  const nominee = (id: string) => data.nominees[id];
  const confirming = confirm ? data.categories.find(item => item.id === confirm.categoryId) : null;
  const pickingCategory = picking ? data.categories.find(item => item.id === picking) : null;

  async function approve() {
    if (!confirm || busy) return;
    setBusy(true); setError(null);
    try {
      const { data: saved } = await modulRequest<MwAwardApproval>(mainWamApi.approveAward(confirm.categoryId), { method: "POST", json: { nomineeId: confirm.nomineeId } });
      setApprovals(current => ({ ...current, [saved.categoryId]: saved }));
      setConfirm(null);
      toast.show({ text: "Panitia diberi kabar.", tone: "success" });
    } catch (problem) {
      setError(errorText(problem));
      setConfirm(null);
    } finally { setBusy(false); }
  }

  return <ScreenContent>
    {waiting > 0 && <Banner tone="warning" title={`${waiting} menunggu persetujuanmu${announce ? ` · diumumkan ${when(announce, now)}` : ""}`} />}
    {error && <Banner tone="error">{error}</Banner>}
    <Stack>
      {data.categories.map(category => {
        const rows = rankTally(category.nominees, new Map(Object.entries(data.counts[category.id] ?? {})));
        const voting = category.method === "voting";
        const total = totalVotes(rows);
        const state = approvalCard(category, approvalMap.get(category.id), now);
        // A count only once voting closed; while open or before, how it is decided.
        const counted = voting && state.kind !== "voting-buka" && state.kind !== "voting-belum";
        const sub = counted ? `${total.toLocaleString("id-ID")} suara` : methodLabel(category);
        const photos = category.nomineeKind === "foto";
        if (state.kind === "disetujui") {
          const winner = nominee(state.approval.nomineeId);
          const row = rows.find(item => item.nominee.id === state.approval.nomineeId);
          const by = state.approval.approvedBy === data.me ? "kamu" : data.names[state.approval.approvedBy] ?? "BOD";
          return <Card key={category.id} as="article">
            <div><h2 className={css.cardTitle}>{category.title}</h2><p className={css.cardSub}>{sub}</p></div>
            <div className={css.pillRow}><StatusPill status="approved">{`Disetujui ${by} · ${clock(state.approval.approvedAt)}`}</StatusPill></div>
            {winner && <div className={css.rankRows}><Ranked nominee={winner} rank={voting ? row?.rank ?? 1 : null} votes={voting ? row?.votes ?? 0 : null} winner /></div>}
          </Card>;
        }
        const top = rows.filter(row => row.votes > 0).slice(0, 3);
        const tied = topTied(rows);
        return <Card key={category.id} as="article">
          <div><h2 className={css.cardTitle}>{category.title}</h2><p className={css.cardSub}>{sub}</p></div>
          {state.kind === "voting-buka" && <div className={css.pillRow}><Pill tone="active" dot>{`Voting dibuka · sampai ${when(state.closesAt, now)}`}</Pill></div>}
          {state.kind === "voting-belum" && <div className={css.pillRow}><Pill>{state.opensAt ? `Voting dibuka ${when(state.opensAt, now)}` : "Voting belum dibuka"}</Pill></div>}
          {voting && top.length > 0 && (photos
            ? <div className={css.thumbs}>{top.map(row => {
              const item = nominee(row.nominee.id);
              return <div key={row.nominee.id} className={css.thumb}>
                <span className={css.thumbBox}><PhotoFill photo={item?.image ? { src: item.image, alt: `Foto ${item.name}` } : null} tone={((row.rank % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6} className={css.fillBox} /><span className={css.thumbRank}>{row.rank}</span></span>
                <span className={css.thumbCaption}>{`${item?.name ?? "Foto"} · ${row.votes} suara`}</span>
              </div>;
            })}</div>
            : <div className={css.rankRows}>{top.map(row => <Ranked key={row.nominee.id} nominee={nominee(row.nominee.id)} rank={row.rank} votes={row.votes} />)}</div>)}
          {counted && total === 0 && <p className={css.cardNote}>Belum ada suara.</p>}
          {state.kind === "perlu" && <div className={css.cardActions}>
            {voting && top[0] && !tied
              ? <>
                <Button variant="tonal" block onClick={() => setConfirm({ categoryId: category.id, nomineeId: top[0].nominee.id })}>{photos ? "Setujui foto" : `Setujui ${short(nominee(top[0].nominee.id))}`}</Button>
                <Button variant="secondary" block onClick={() => setPicking(category.id)}>Pilih lain</Button>
              </>
              : <>
                {tied && <p className={css.cardNote}>Suara sama di urutan pertama. Pilih pemenangnya.</p>}
                <Button variant="tonal" block onClick={() => setPicking(category.id)}>Pilih pemenang</Button>
              </>}
          </div>}
          {state.kind === "voting-buka" && <p className={css.cardNote}>{`Perolehan suara dan persetujuan setelah ${when(state.closesAt, now)}.`}</p>}
        </Card>;
      })}
    </Stack>
    <Sheet open={!!pickingCategory} onClose={() => setPicking(null)} title="Pilih pemenang" subtitle={pickingCategory?.title} flush>
      {pickingCategory && <List plain inset={16} label="Nominasi">
        {rankTally(pickingCategory.nominees, new Map(Object.entries(data.counts[pickingCategory.id] ?? {}))).map(row => {
          const item = nominee(row.nominee.id);
          return <ListRow key={row.nominee.id} chevron={false}
            leading={item?.kind === "orang" ? <Avatar name={item.name} photo={item.photo} size={40} /> : undefined}
            title={item ? nomineeName(item) : "Nominasi"} sub={pickingCategory.method === "voting" ? `${row.votes} suara` : item?.reason || undefined}
            onClick={() => { setPicking(null); setConfirm({ categoryId: pickingCategory.id, nomineeId: row.nominee.id }); }} />;
        })}
      </List>}
    </Sheet>
    <ConfirmDialog open={!!confirm && !!confirming} title={`Setujui ${short(confirm ? nominee(confirm.nomineeId) : undefined)}?`}
      body={confirming ? `Pemenang ${confirming.title}${confirming.announceAt ? `, diumumkan ${when(confirming.announceAt, now)}` : ""}.` : undefined}
      confirmLabel={`Setujui ${short(confirm ? nominee(confirm.nomineeId) : undefined)}`} busy={busy} busyLabel="Menyimpan…"
      onCancel={() => setConfirm(null)} onConfirm={() => void approve()} />
  </ScreenContent>;
}

/** One row of the count: rank, who, votes ("1 · Sari · HRGA · 31 suara"). */
function Ranked({ nominee, rank, votes, winner }: { nominee: NomineeView | undefined; rank: number | null; votes: number | null; winner?: boolean }) {
  if (!nominee) return null;
  return <div className={css.rankRow}>
    {rank !== null && <span className={css.rankBadge} aria-label={`Peringkat ${rank}`}>{rank}</span>}
    {nominee.kind === "foto" ? <span className={css.winnerPhoto}><PhotoFill photo={nominee.image ? { src: nominee.image, alt: `Foto ${nominee.name}` } : null} className={css.fillBox} /></span>
      : nominee.kind === "orang" ? <Avatar name={nominee.name} photo={nominee.photo} size={40} /> : null}
    <span className={css.rankText}>
      <span className={css.choiceName}>{nominee.kind === "foto" ? `Foto ${nominee.name}` : nominee.name}</span>
      {(nominee.department || winner) && <span className={css.choiceMeta}>{[nominee.department, winner ? "pemenang" : ""].filter(Boolean).join(" · ")}</span>}
    </span>
    {votes !== null && <span className={css.rankVotes}><span className={css.rankNumber}>{votes}</span><span className={css.rankUnit}>suara</span></span>}
  </div>;
}
