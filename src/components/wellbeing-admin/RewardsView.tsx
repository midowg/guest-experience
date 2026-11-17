"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Gift, ImagePlus, PackageCheck, Plus, Trash2, X } from "lucide-react";
import { ConsoleButton, PageHeader, Pill } from "@/components/console";
import type { ConsoleTone } from "@/components/console/types";
import { errorMessage } from "@/components/admin/shared/api";
import { Panel, SkeletonRows } from "@/components/app-shell/Panel";
import { revalidate, setResource, useResource } from "@/components/app-shell/resource";
import { useToast } from "@/components/app-shell/Toast";
import { compressImage } from "@/lib/compress-image";
import { wellbeingAdminApi } from "@/lib/routes";
import { MAX_REWARD_PHOTOS, MIGRATION_WELLBEING_REWARDS, PHOTO_MIMES, claimStatusLabels, type ClaimAction, type ClaimStatus, type PhotoMime, type RewardInput } from "@/lib/wellbeing/rules";
import type { WbAdminClaim, WbAdminReward, WbRewardUpload, WbRewardsAdmin } from "@/lib/wellbeing/types";
import { points, send, wb } from "./api";
import { Empty, LoadError, Refreshing } from "./parts";
import css from "./wellbeing-admin.module.css";

/*
 * Hadiah (18 Nov 2026, docs/rancangan-wellbeing.md "Hadiah"): what employees can trade their saldo for,
 * and their claims. Permintaan: the claims to decide (Setujui, Tandai diserahkan, Tolak with a reason
 * the employee reads; a rejected claim gives the points back). Katalog: the rewards (photos,
 * description, price, stock, a limit per person, Aktif), a draft until switched on.
 */

type Tab = "permintaan" | "katalog";
type ClaimFilter = "requested" | "approved" | "delivered" | "closed";
const claimTone: Record<ClaimStatus, ConsoleTone> = { requested: "warn", approved: "blue", delivered: "ok", rejected: "bad", cancelled: "neutral" };
const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

export function RewardsView() {
  const rewards = useResource(wb.rewards.key, wb.rewards.fetch);
  const data = rewards.data;
  const waiting = (data?.counts.requested ?? 0) + (data?.counts.approved ?? 0);
  const [tab, setTab] = useState<Tab | null>(null);
  // Opens on Permintaan while claims wait, else on Katalog.
  const shown: Tab = tab ?? (data && waiting === 0 ? "katalog" : "permintaan");
  const [editing, setEditing] = useState<WbAdminReward | "new" | null>(null);

  return <>
    <PageHeader title="Hadiah" subtitle="Karyawan menukar saldo poin dengan hadiah. Poin ditahan saat klaim diajukan; peringkat dan total poin tidak berubah."
      actions={<ConsoleButton variant="primary" icon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing("new")} disabled={!data?.migrated}>Tambah hadiah</ConsoleButton>} />
    <Refreshing on={rewards.refreshing} />
    {data && !data.migrated && <div className={css.notice} data-tone="warn" role="status"><AlertTriangle size={20} aria-hidden="true" />
      <div><strong>Hadiah belum dipasang.</strong> Menu ini bisa dipakai setelah migrasi <code>{MIGRATION_WELLBEING_REWARDS}</code> dijalankan pemilik di Supabase SQL Editor.</div></div>}
    <div className={css.reviewTools}>
      <div className={css.statusTabs} role="group" aria-label="Bagian">
        <button type="button" className={css.statusTab} aria-pressed={shown === "permintaan"} onClick={() => setTab("permintaan")}>
          Permintaan<span className={css.statusCount} data-zero={waiting === 0}>{waiting}</span></button>
        <button type="button" className={css.statusTab} aria-pressed={shown === "katalog"} onClick={() => setTab("katalog")}>
          Katalog<span className={css.statusCount} data-zero="true">{data?.rewards.length ?? 0}</span></button>
      </div>
    </div>
    {!data ? rewards.error ? <LoadError message={rewards.error} onRetry={() => void rewards.reload()} /> : <SkeletonRows rows={5} />
      : shown === "permintaan" ? <Claims data={data} /> : <Catalog data={data} onEdit={setEditing} />}
    <RewardPanel reward={editing} onClose={() => setEditing(null)} />
  </>;
}

/* ---------- Permintaan ---------- */

function Claims({ data }: { data: WbRewardsAdmin }) {
  const [filter, setFilter] = useState<ClaimFilter>("requested");
  const tabs: { value: ClaimFilter; label: string; count: number }[] = [
    { value: "requested", label: "Diajukan", count: data.counts.requested },
    { value: "approved", label: "Disetujui", count: data.counts.approved },
    { value: "delivered", label: "Diserahkan", count: data.counts.delivered },
    { value: "closed", label: "Ditolak & batal", count: data.counts.rejected + data.counts.cancelled },
  ];
  const items = data.claims.filter(claim => filter === "closed" ? claim.status === "rejected" || claim.status === "cancelled" : claim.status === filter);
  return <>
    <div className={css.statusTabs} role="group" aria-label="Status klaim" style={{ marginBottom: "1rem" }}>
      {tabs.map(item => <button key={item.value} type="button" className={css.statusTab} aria-pressed={item.value === filter} onClick={() => setFilter(item.value)}>
        {item.label}<span className={css.statusCount} data-zero={item.value === "requested" || item.value === "approved" ? item.count === 0 : true}>{item.count}</span></button>)}
    </div>
    {items.length === 0
      ? <Empty icon={<PackageCheck size={24} aria-hidden="true" />} title={filter === "requested" ? "Tidak ada klaim yang menunggu" : "Belum ada klaim di sini"}>
          {filter === "requested" ? "Klaim baru dari karyawan muncul di sini." : null}</Empty>
      : <ul className={css.claimRows} aria-label={`Klaim ${tabs.find(item => item.value === filter)?.label.toLowerCase()}`}>
          {items.map(claim => <ClaimRow key={claim.id} claim={claim} />)}
        </ul>}
    {filter !== "requested" && filter !== "approved" && <p className={css.help} style={{ marginTop: ".75rem" }}>Yang tampil: 200 klaim terakhir yang sudah selesai.</p>}
  </>;
}

function ClaimRow({ claim }: { claim: WbAdminClaim }) {
  const toast = useToast();
  const [busy, setBusy] = useState<ClaimAction | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState("");
  async function decide(action: ClaimAction) {
    if (action === "reject" && reason.trim().length < 2) { setProblem("Tulis alasan penolakan (dibaca karyawan)."); return; }
    setBusy(action); setProblem("");
    try {
      const { data, message } = await send<WbAdminClaim>(wellbeingAdminApi.claim(claim.id), "POST", { action, reason: reason.trim() });
      setResource<WbRewardsAdmin>(wb.rewards.key, current => current && {
        ...current, claims: current.claims.map(item => item.id === data.id ? data : item),
        counts: { ...current.counts, [claim.status]: current.counts[claim.status] - 1, [data.status]: current.counts[data.status] + 1 },
      });
      revalidate(wb.rewards.key);
      toast({ message, tone: "ok" });
    } catch (error) { setProblem(errorMessage(error)); revalidate(wb.rewards.key); }
    finally { setBusy(null); }
  }
  const open = claim.status === "requested" || claim.status === "approved";
  return <li className={css.claimRow}>
    <span className={css.claimThumb}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses */}
      {claim.rewardPhoto ? <img src={claim.rewardPhoto} alt="" loading="lazy" /> : <Gift size={22} aria-hidden="true" />}
    </span>
    <div className={css.claimMain}>
      <div className={css.claimHead}>
        <strong>{claim.rewardTitle}</strong>
        <Pill tone={claimTone[claim.status]}>{claimStatusLabels[claim.status]}</Pill>
      </div>
      <span className={css.claimWho}>{claim.employeeName}{claim.department ? ` · ${claim.department}` : ""} · <b>{points(claim.cost)} poin</b></span>
      <span className={css.help}>Diajukan {when(claim.createdAt)}
        {claim.decidedAt && claim.status !== "cancelled" ? ` · ${claim.status === "rejected" ? "ditolak" : "disetujui"} ${claim.decidedBy ?? ""} ${when(claim.decidedAt)}` : ""}
        {claim.deliveredAt ? ` · diserahkan ${claim.deliveredBy ?? ""} ${when(claim.deliveredAt)}` : ""}</span>
      {claim.note && <span className={css.claimNote}>Catatan karyawan: {claim.note}</span>}
      {claim.reason && <span className={css.reason} data-tone="bad">Alasan: {claim.reason}</span>}
      {open && rejecting && <div className={css.claimReject}>
        <label className={css.field}><span>Alasan penolakan (dibaca karyawan)</span>
          <input className={css.input} value={reason} maxLength={300} autoFocus onChange={event => setReason(event.target.value)} placeholder="mis. Stok di toko habis, diganti bulan depan" /></label>
        <div className={css.claimActions}>
          <ConsoleButton onClick={() => { setRejecting(false); setProblem(""); }} disabled={!!busy}>Batal</ConsoleButton>
          <ConsoleButton variant="primary" onClick={() => void decide("reject")} disabled={!!busy}>{busy === "reject" ? "Menolak…" : "Tolak klaim"}</ConsoleButton>
        </div>
      </div>}
      {problem && <p className={css.problem} role="alert">{problem}</p>}
    </div>
    {open && !rejecting && <div className={css.claimActions}>
      {claim.status === "requested" && <ConsoleButton icon={<Check size={18} aria-hidden="true" />} onClick={() => void decide("approve")} disabled={!!busy}>{busy === "approve" ? "Menyetujui…" : "Setujui"}</ConsoleButton>}
      <ConsoleButton variant="primary" icon={<PackageCheck size={18} aria-hidden="true" />} onClick={() => void decide("deliver")} disabled={!!busy}>{busy === "deliver" ? "Menyimpan…" : "Tandai diserahkan"}</ConsoleButton>
      <ConsoleButton icon={<X size={18} aria-hidden="true" />} onClick={() => setRejecting(true)} disabled={!!busy}>Tolak</ConsoleButton>
    </div>}
  </li>;
}

/* ---------- Katalog ---------- */

function Catalog({ data, onEdit }: { data: WbRewardsAdmin; onEdit: (reward: WbAdminReward) => void }) {
  if (!data.rewards.length) return <Empty icon={<Gift size={24} aria-hidden="true" />} title="Belum ada hadiah">Tambah hadiah dengan tombol di kanan atas. Hadiah baru tersimpan sebagai draf sampai Aktif dinyalakan.</Empty>;
  return <ul className={css.rewardCards} aria-label="Katalog hadiah">
    {data.rewards.map(reward => <li key={reward.id}>
      <button type="button" className={css.rewardCard} data-off={!reward.active} onClick={() => onEdit(reward)} aria-label={`Ubah ${reward.title}`}>
        <span className={css.rewardImage}>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses */}
          {reward.photos[0]?.url ? <img src={reward.photos[0].url} alt="" loading="lazy" /> : <Gift size={28} aria-hidden="true" />}
          {reward.photos.length > 1 && <span className={css.rewardCount}>{reward.photos.length} foto</span>}
        </span>
        <span className={css.rewardInfo}>
          <span className={css.claimHead}><strong>{reward.title}</strong><Pill tone={reward.active ? "ok" : "neutral"}>{reward.active ? "Aktif" : "Draf"}</Pill></span>
          <span className={css.rewardPrice}>{points(reward.cost)} poin</span>
          <span className={css.help}>
            {reward.stock === null ? `${points(reward.taken)} diklaim · stok tanpa batas` : `${points(reward.taken)} dari ${points(reward.stock)} diklaim`}
            {` · ${reward.perPerson}x per orang`}{reward.waiting ? ` · ${reward.waiting} menunggu` : ""}
          </span>
        </span>
      </button>
    </li>)}
  </ul>;
}

/* ---------- the editor ---------- */

type DraftPhoto = { key: string; url: string | null; upload?: { mime: PhotoMime; size: number; token: string } };
type Draft = { title: string; description: string; cost: string; stock: string; perPerson: string; active: boolean; photos: DraftPhoto[] };
const draftOf = (reward: WbAdminReward | "new" | null): Draft => !reward || reward === "new"
  ? { title: "", description: "", cost: "", stock: "", perPerson: "1", active: false, photos: [] }
  : { title: reward.title, description: reward.description, cost: String(reward.cost), stock: reward.stock === null ? "" : String(reward.stock), perPerson: String(reward.perPerson), active: reward.active,
      photos: reward.photos.map(photo => ({ key: photo.key, url: photo.url })) };
const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

/** One photo up: smaller first, an address from the server, then PUT (the dev preview's "mock:" addresses skip the network). */
async function uploadRewardPhoto(file: File): Promise<DraftPhoto> {
  const small = await compressImage(file);
  const mime: PhotoMime = (PHOTO_MIMES as readonly string[]).includes(small.type) ? small.type as PhotoMime : "image/jpeg";
  const { data: start } = await send<WbRewardUpload>(wellbeingAdminApi.rewardUploads, "POST", { mime, size: small.size });
  if (!start.uploadUrl.startsWith("mock:")) {
    const response = await fetch(start.uploadUrl, { method: "PUT", body: small, headers: { "Content-Type": mime } });
    if (!response.ok) throw new Error("Foto gagal diunggah. Coba lagi.");
  }
  return { key: start.key, url: URL.createObjectURL(small), upload: { mime, size: small.size, token: start.token } };
}

function RewardPanel({ reward, onClose }: { reward: WbAdminReward | "new" | null; onClose: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftOf(reward));
  const [shown, setShown] = useState(reward);
  if (reward !== shown) { setShown(reward); if (reward) setDraft(draftOf(reward)); }
  const [busy, setBusy] = useState<"save" | "delete" | "photo" | null>(null);
  const [problem, setProblem] = useState("");
  const [deleting, setDeleting] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const isNew = reward === "new";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy("photo"); setProblem("");
    try {
      for (const file of [...files].slice(0, MAX_REWARD_PHOTOS - draft.photos.length)) {
        const photo = await uploadRewardPhoto(file);
        setDraft(current => ({ ...current, photos: [...current.photos, photo].slice(0, MAX_REWARD_PHOTOS) }));
      }
    } catch (error) { setProblem(errorMessage(error)); }
    finally { setBusy(null); if (picker.current) picker.current.value = ""; }
  }
  const move = (index: number, by: -1 | 1) => setDraft(current => {
    const photos = [...current.photos], target = index + by;
    if (target < 0 || target >= photos.length) return current;
    [photos[index], photos[target]] = [photos[target], photos[index]];
    return { ...current, photos };
  });

  async function save() {
    setProblem("");
    if (draft.title.trim().length < 2) return setProblem("Isi nama hadiah.");
    if (!Number(draft.cost)) return setProblem("Isi harga dalam poin (lebih dari 0).");
    if (!Number(draft.perPerson)) return setProblem("Batas per orang minimal 1.");
    const input: RewardInput = {
      title: draft.title.trim(), description: draft.description.trim(), cost: Number(draft.cost), stock: draft.stock === "" ? null : Number(draft.stock), perPerson: Number(draft.perPerson), active: draft.active,
      photos: draft.photos.map(photo => photo.upload ? { key: photo.key, upload: photo.upload } : { key: photo.key }),
    };
    setBusy("save");
    try {
      const { data, message } = isNew
        ? await send<WbAdminReward>(wellbeingAdminApi.rewards, "POST", input)
        : await send<WbAdminReward>(wellbeingAdminApi.reward((reward as WbAdminReward).id), "PATCH", input);
      setResource<WbRewardsAdmin>(wb.rewards.key, current => current && { ...current, rewards: isNew ? [data, ...current.rewards] : current.rewards.map(item => item.id === data.id ? data : item) });
      revalidate(wb.rewards.key);
      toast({ message, tone: "ok" });
      onClose();
    } catch (error) { setProblem(errorMessage(error)); }
    finally { setBusy(null); }
  }

  async function remove() {
    if (isNew || !reward) return;
    setBusy("delete"); setProblem("");
    try {
      const { message } = await send(wellbeingAdminApi.reward(reward.id), "DELETE");
      setResource<WbRewardsAdmin>(wb.rewards.key, current => current && { ...current, rewards: current.rewards.filter(item => item.id !== reward.id) });
      revalidate(wb.rewards.key);
      toast({ message, tone: "ok" });
      onClose();
    } catch (error) { setProblem(errorMessage(error)); setDeleting(false); }
    finally { setBusy(null); }
  }

  return <Panel open={!!reward} onClose={onClose} title={isNew ? "Tambah hadiah" : "Ubah hadiah"} locked={busy === "save" || busy === "delete"}
    subtitle={isNew ? "Tersimpan sebagai draf sampai Aktif dinyalakan." : "Klaim yang sudah ada tetap memakai harga saat diklaim."}
    footer={<>
      {!isNew && (deleting
        ? <><ConsoleButton onClick={() => setDeleting(false)} disabled={!!busy}>Batal hapus</ConsoleButton><ConsoleButton onClick={() => void remove()} disabled={!!busy}>{busy === "delete" ? "Menghapus…" : "Ya, hapus"}</ConsoleButton></>
        : <ConsoleButton icon={<Trash2 size={18} aria-hidden="true" />} onClick={() => setDeleting(true)} disabled={!!busy}>Hapus</ConsoleButton>)}
      <ConsoleButton onClick={onClose} disabled={busy === "save"}>Batal</ConsoleButton>
      <ConsoleButton variant="primary" onClick={() => void save()} disabled={!!busy}>{busy === "save" ? "Menyimpan…" : "Simpan"}</ConsoleButton>
    </>}>
    <form className={css.form} onSubmit={event => { event.preventDefault(); void save(); }}>
      <label className={css.field}><span>Nama hadiah</span><input className={css.input} value={draft.title} maxLength={120} onChange={event => set("title", event.target.value)} autoFocus={isNew} /></label>
      <div className={css.field}>
        <span>Foto ({draft.photos.length}/{MAX_REWARD_PHOTOS}) <small className={css.help}>Foto pertama tampil di daftar.</small></span>
        <ul className={css.photoGrid} aria-label="Foto hadiah">
          {draft.photos.map((photo, index) => <li key={photo.key} className={css.photoTile}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local previews and signed storage addresses */}
            {photo.url ? <img src={photo.url} alt={`Foto ${index + 1}`} /> : <Gift size={22} aria-hidden="true" />}
            <span className={css.photoTools}>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Geser foto ${index + 1} ke kiri`}><ArrowLeft size={16} aria-hidden="true" /></button>
              <button type="button" onClick={() => setDraft(current => ({ ...current, photos: current.photos.filter(item => item.key !== photo.key) }))} aria-label={`Hapus foto ${index + 1}`}><X size={16} aria-hidden="true" /></button>
            </span>
          </li>)}
          {draft.photos.length < MAX_REWARD_PHOTOS && <li>
            <button type="button" className={css.photoAdd} onClick={() => picker.current?.click()} disabled={busy === "photo"}>
              <ImagePlus size={22} aria-hidden="true" />{busy === "photo" ? "Mengunggah…" : "Tambah foto"}</button>
          </li>}
        </ul>
        <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-testid="reward-file" onChange={event => void addPhotos(event.target.files)} />
      </div>
      <label className={css.field}><span>Keterangan (dibaca karyawan)</span>
        <textarea className={css.input} rows={4} value={draft.description} maxLength={2000} onChange={event => set("description", event.target.value)} placeholder="Apa hadiahnya, cara dan waktu penyerahan, masa berlaku" /></label>
      <div className={css.fieldRow}>
        <label className={css.field}><span>Harga (poin)</span><input className={css.input} inputMode="numeric" value={draft.cost} onChange={event => set("cost", digits(event.target.value, 8))} /></label>
        <label className={css.field}><span>Stok <small className={css.help}>kosong = tanpa batas</small></span><input className={css.input} inputMode="numeric" value={draft.stock} onChange={event => set("stock", digits(event.target.value, 6))} /></label>
      </div>
      <label className={css.field}><span>Batas per orang</span><input className={css.input} inputMode="numeric" value={draft.perPerson} onChange={event => set("perPerson", digits(event.target.value, 3))} /></label>
      <label className={css.switchRow}><input type="checkbox" checked={draft.active} onChange={event => set("active", event.target.checked)} />
        <span><strong>Aktif</strong><small>Tampil di aplikasi karyawan dan bisa diklaim. Matikan untuk menyembunyikan; klaim yang ada tetap.</small></span></label>
      {problem && <p className={css.problem} role="alert">{problem}</p>}
    </form>
  </Panel>;
}
