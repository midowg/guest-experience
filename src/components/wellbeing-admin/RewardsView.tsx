"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Banknote, Check, Dices, Gift, ImagePlus, KeyRound, PackageCheck, Plus, Sparkles, Ticket, Trash2, Undo2, X } from "lucide-react";
import { ConsoleButton, PageHeader, Pill } from "@/components/console";
import type { ConsoleTone } from "@/components/console/types";
import { errorMessage } from "@/components/admin/shared/api";
import { Panel, SkeletonRows } from "@/components/app-shell/Panel";
import { revalidate, setResource, useResource } from "@/components/app-shell/resource";
import { useToast } from "@/components/app-shell/Toast";
import { compressImage } from "@/lib/compress-image";
import { wellbeingAdminApi } from "@/lib/routes";
import {
  CODE_MODES, DELIVERIES, MAX_REWARD_PHOTOS, MIGRATION_WELLBEING_REWARD_TYPES, MIGRATION_WELLBEING_REWARDS, MIGRATION_WELLBEING_VOUCHERS, PHOTO_MIMES, REWARD_CATEGORIES, VOUCHER_KINDS,
  autoAllowed, categoryOf, claimStatusLabels, codeLines, codeModeLabels, deliveryLabels, isReroll, needsRewardTypes, rewardCategoryLabels, rewardEnded, voucherKindLabels, wibToday,
  type ClaimAction, type ClaimStatus, type CodeMode, type Delivery, type PhotoMime, type RewardCategory, type RewardInput, type RewardKind, type VoucherKind,
} from "@/lib/wellbeing/rules";
import type { WbAdminClaim, WbAdminReward, WbRewardUpload, WbRewardsAdmin } from "@/lib/wellbeing/types";
import { points, send, wb } from "./api";
import { Empty, LoadError, Refreshing } from "./parts";
import css from "./wellbeing-admin.module.css";

/*
 * Hadiah (18 Nov 2026, docs/rancangan-wellbeing.md "Hadiah"): what employees can trade their saldo for,
 * and their claims. Permintaan: the claims to decide (Setujui, Tandai diserahkan, Tolak with a reason
 * the employee reads; a rejected claim gives the points back). Katalog: the rewards (photos,
 * description, price, stock, a limit per person, Aktif), a draft until switched on.
 *
 * Jenis hadiah dan voucher kode (18 Nov 2026): Jenis is Barang, Uang, Voucher or Lainnya; a voucher holds
 * a code or a link (unique codes, one code for everyone, or typed in when handing over) or re-rolls the
 * tokoh card. Penyerahan, per reward: the admin approves first, approved at once, or at once (a voucher
 * whose code is ready).
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
    <RewardPanel reward={editing} vouchersReady={!!data?.vouchersReady} typesReady={!!data?.typesReady} onClose={() => setEditing(null)} />
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
          {/* The tab already says the status; only Ditolak & batal mixes two, so only there each row says which. */}
          {items.map(claim => <ClaimRow key={claim.id} claim={claim} showStatus={filter === "closed"} />)}
        </ul>}
    {filter !== "requested" && filter !== "approved" && <p className={css.help} style={{ marginTop: ".75rem" }}>Yang tampil: 200 klaim terakhir yang sudah selesai.</p>}
  </>;
}

/** Who did what when, in one line ("Otomatis": the reward's delivery did it at the claim). */
function claimTrail(claim: WbAdminClaim) {
  const parts = [`Diajukan ${when(claim.createdAt)}`];
  if (claim.decidedAt && claim.status !== "cancelled") {
    const verb = claim.status === "rejected" ? "ditolak" : "disetujui";
    if (claim.decidedBy !== "Otomatis") parts.push(`${verb} ${claim.decidedBy ?? ""} ${when(claim.decidedAt)}`);
    else if (claim.deliveredBy !== "Otomatis") parts.push("disetujui otomatis");
  }
  if (claim.deliveredAt) parts.push(claim.deliveredBy === "Otomatis" ? "diterima otomatis" : `diserahkan ${claim.deliveredBy ?? ""} ${when(claim.deliveredAt)}`);
  return parts.join(" · ");
}

function ClaimRow({ claim, showStatus }: { claim: WbAdminClaim; showStatus: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<ClaimAction | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  // A voucher whose code the admin types in: asked for when handing it over.
  const [giving, setGiving] = useState(false);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState("");
  async function decide(action: ClaimAction) {
    if (action === "reject" && reason.trim().length < 2) { setProblem("Tulis alasan penolakan (dibaca karyawan)."); return; }
    if (action === "deliver" && claim.needsCode && !code.trim()) { setProblem("Isi kode atau link voucher untuk karyawan."); return; }
    setBusy(action); setProblem("");
    try {
      const { data, message } = await send<WbAdminClaim>(wellbeingAdminApi.claim(claim.id), "POST", { action, reason: reason.trim(), code: code.trim() });
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
  const asking = rejecting || giving;
  return <li className={css.claimRow}>
    <span className={css.claimThumb}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses */}
      {claim.rewardPhoto ? <img src={claim.rewardPhoto} alt="" loading="lazy" /> : <KindIcon kind={claim.kind} size={22} />}
    </span>
    <div className={css.claimMain}>
      <div className={css.claimHead}>
        <strong>{claim.rewardTitle}</strong>
        {showStatus && <Pill tone={claimTone[claim.status]}>{claimStatusLabels[claim.status]}</Pill>}
      </div>
      <span className={css.claimWho}><strong>{claim.employeeName}</strong>{claim.department ? ` · ${claim.department}` : ""}</span>
      <span className={css.help}>{claimTrail(claim)}</span>
      {claim.note && <span className={css.claimNote}>Catatan karyawan: {claim.note}</span>}
      {claim.code && <span className={css.claimCode}><KeyRound size={14} aria-hidden="true" /><span className="sr-only">Kode voucher: </span><code>{claim.code}</code></span>}
      {open && claim.needsCode && !giving && <span className={css.help}>Kode atau link diisi saat menandai diserahkan.</span>}
      {claim.reason && <span className={css.reason} data-tone="bad">Alasan: {claim.reason}</span>}
      {open && rejecting && <div className={css.claimReject}>
        <label className={css.field}><span>Alasan penolakan (dibaca karyawan)</span>
          <input className={css.input} value={reason} maxLength={300} autoFocus onChange={event => setReason(event.target.value)} placeholder="mis. Stok di toko habis, diganti bulan depan" /></label>
        <div className={css.claimActions}>
          <ConsoleButton onClick={() => { setRejecting(false); setProblem(""); }} disabled={!!busy}>Batal</ConsoleButton>
          <ConsoleButton variant="primary" onClick={() => void decide("reject")} disabled={!!busy}>{busy === "reject" ? "Menolak…" : "Tolak klaim"}</ConsoleButton>
        </div>
      </div>}
      {open && giving && <div className={css.claimReject}>
        <label className={css.field}><span>Kode atau link voucher (tampil di aplikasi karyawan)</span>
          <input className={cx(css.input, css.mono)} value={code} maxLength={500} autoFocus onChange={event => setCode(event.target.value)} placeholder="mis. KOPI-8H2K atau https://…" /></label>
        <div className={css.claimActions}>
          <ConsoleButton onClick={() => { setGiving(false); setProblem(""); }} disabled={!!busy}>Batal</ConsoleButton>
          <ConsoleButton variant="primary" icon={<PackageCheck size={18} aria-hidden="true" />} onClick={() => void decide("deliver")} disabled={!!busy}>{busy === "deliver" ? "Menyimpan…" : "Serahkan"}</ConsoleButton>
        </div>
      </div>}
      {problem && <p className={css.problem} role="alert">{problem}</p>}
    </div>
    <div className={css.claimSide}>
      <span className={css.claimCost}>{points(claim.cost)}<small> poin</small></span>
      {open && !asking && <div className={css.claimActions}>
        <ConsoleButton icon={<X size={18} aria-hidden="true" />} onClick={() => setRejecting(true)} disabled={!!busy}>Tolak</ConsoleButton>
        {claim.status === "requested" && <ConsoleButton icon={<Check size={18} aria-hidden="true" />} onClick={() => void decide("approve")} disabled={!!busy}>{busy === "approve" ? "Menyetujui…" : "Setujui"}</ConsoleButton>}
        <ConsoleButton variant="primary" icon={<PackageCheck size={18} aria-hidden="true" />} onClick={() => claim.needsCode ? setGiving(true) : void decide("deliver")} disabled={!!busy}>{busy === "deliver" ? "Menyimpan…" : "Tandai diserahkan"}</ConsoleButton>
      </div>}
    </div>
  </li>;
}

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/** A reward without a photo: its kind's sign (re-roll Legendary in gold). */
function KindIcon({ kind, size }: { kind: RewardKind; size: number }) {
  if (isReroll(kind)) return kind === "reroll_legendary" ? <Sparkles size={size} aria-hidden="true" /> : <Dices size={size} aria-hidden="true" />;
  if (kind === "uang") return <Banknote size={size} aria-hidden="true" />;
  if (kind === "voucher") return <Ticket size={size} aria-hidden="true" />;
  return <Gift size={size} aria-hidden="true" />;
}
const kindPill: Partial<Record<RewardKind, { tone: ConsoleTone; label: string }>> = {
  uang: { tone: "teal", label: "Uang" }, voucher: { tone: "purple", label: "Voucher" }, lainnya: { tone: "blue", label: "Lainnya" },
  reroll: { tone: "purple", label: "Re-roll" }, reroll_legendary: { tone: "brass", label: "Re-roll Legendary" },
};

/* ---------- Katalog ---------- */

function Catalog({ data, onEdit }: { data: WbRewardsAdmin; onEdit: (reward: WbAdminReward) => void }) {
  if (!data.rewards.length) return <Empty icon={<Gift size={24} aria-hidden="true" />} title="Belum ada hadiah">Tambah hadiah dengan tombol di kanan atas. Hadiah baru tersimpan sebagai draf sampai Aktif dinyalakan.</Empty>;
  const today = wibToday();
  return <ul className={css.rewardCards} aria-label="Katalog hadiah">
    {data.rewards.map(reward => {
      const pill = kindPill[reward.kind], ended = rewardEnded(reward.validUntil, today);
      return <li key={reward.id}>
        <button type="button" className={css.rewardCard} data-off={!reward.active || ended} onClick={() => onEdit(reward)} aria-label={`Ubah ${reward.title}`}>
          <span className={css.rewardImage}>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage addresses */}
            {reward.photos[0]?.url ? <img src={reward.photos[0].url} alt="" loading="lazy" /> : <KindIcon kind={reward.kind} size={28} />}
            <span className={css.rewardBadge}><Pill tone={reward.active ? "ok" : "neutral"}>{reward.active ? "Aktif" : "Draf"}</Pill>
              {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
              {ended && <Pill tone="bad">Berakhir</Pill>}</span>
            {reward.photos.length > 1 && <span className={css.rewardCount}>{reward.photos.length} foto</span>}
          </span>
          <span className={css.rewardInfo}>
            <strong className={css.rewardName}>{reward.title}</strong>
            <span className={css.rewardPrice}>{points(reward.cost)} poin</span>
            <span className={css.help}>
              {reward.codes ? `${points(reward.codes.free)} dari ${points(reward.codes.total)} kode tersisa · ${points(reward.taken)} diklaim`
                : reward.stock === null ? `${points(reward.taken)} diklaim · stok tanpa batas` : `${points(reward.taken)} dari ${points(reward.stock)} diklaim`}
              {` · ${reward.perPerson}x per orang`}{reward.waiting ? ` · ${reward.waiting} menunggu` : ""}
            </span>
            <span className={css.help}>{deliveryShort[reward.delivery]}{reward.validUntil ? ` · berlaku s.d. ${shortDate(reward.validUntil)}` : ""}</span>
          </span>
        </button>
      </li>;
    })}
  </ul>;
}

const deliveryShort: Record<Delivery, string> = { admin: "Disetujui admin dulu", approved: "Langsung disetujui", auto: "Otomatis" };
const shortDate = (date: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/* ---------- the editor ---------- */

type DraftPhoto = { key: string; url: string | null; upload?: { mime: PhotoMime; size: number; token: string } };
type Draft = {
  title: string; description: string; cost: string; stock: string; perPerson: string; active: boolean; photos: DraftPhoto[]; kind: RewardKind;
  delivery: Delivery; codeMode: CodeMode; sharedCode: string; validUntil: string; howTo: string;
  /** Pool codes typed or pasted (one per line), and free ones marked to take off. */
  newCodes: string; removeCodes: string[];
};
const draftOf = (reward: WbAdminReward | "new" | null): Draft => !reward || reward === "new"
  ? { title: "", description: "", cost: "", stock: "", perPerson: "1", active: false, photos: [], kind: "barang", delivery: "admin", codeMode: "pool", sharedCode: "", validUntil: "", howTo: "", newCodes: "", removeCodes: [] }
  : { title: reward.title, description: reward.description, cost: String(reward.cost), stock: reward.stock === null ? "" : String(reward.stock), perPerson: String(reward.perPerson), active: reward.active,
      photos: reward.photos.map(photo => ({ key: photo.key, url: photo.url })), kind: reward.kind, delivery: reward.delivery, codeMode: reward.codeMode ?? "pool",
      sharedCode: reward.sharedCode ?? "", validUntil: reward.validUntil ?? "", howTo: reward.howTo, newCodes: "", removeCodes: [] };
/** What each Jenis is, under the choice. */
const categoryHelp: Record<RewardCategory, string> = {
  barang: "Barang yang diserahkan admin, mis. tumbler atau jam olahraga.",
  uang: "Uang tunai atau transfer, mis. saldo e-wallet. Tulis cara penyerahannya di Keterangan.",
  voucher: "Kode atau link (mis. voucher belanja), atau re-roll kartu tokoh WAM.",
  lainnya: "Hadiah lain, mis. kelas, pengalaman, atau fasilitas kantor.",
};
const rerollHelp: Record<"reroll" | "reroll_legendary", string> = {
  reroll: "Langsung aktif saat diklaim, poin langsung terpotong, tanpa persetujuan admin. Karyawan memakainya di kartu tokoh WAM: tokoh dan rarity diundi ulang.",
  reroll_legendary: "Langsung aktif saat diklaim, tanpa persetujuan admin. Tokoh diundi ulang dan rarity pasti Legendary. Tidak bisa diklaim kalau tempat Legendary sudah penuh (poin tidak terpotong).",
};
const codeModeHelp: Record<CodeMode, string> = {
  pool: "Tiap klaim mendapat satu kode atau link yang berbeda. Sisa stok = kode yang belum diberikan.",
  shared: "Semua yang klaim mendapat kode atau link yang sama.",
  manual: "Admin mengetik kode atau link saat menandai diserahkan.",
};
const deliveryHelp: Record<Delivery, string> = {
  admin: "Klaim masuk Permintaan sebagai Diajukan. Admin menyetujui, lalu menandai diserahkan. Karyawan bisa membatalkan selama Diajukan.",
  approved: "Klaim langsung Disetujui (poin ditahan, karyawan tidak bisa membatalkan). Admin tinggal menandai diserahkan.",
  auto: "Langsung diterima saat diklaim: kode atau link tampil di aplikasi karyawan dan poin terpotong. Tanpa admin.",
};
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

function RewardPanel({ reward, vouchersReady, typesReady, onClose }: { reward: WbAdminReward | "new" | null; vouchersReady: boolean; typesReady: boolean; onClose: () => void }) {
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
  const category = categoryOf(draft.kind);
  const codeVoucher = draft.kind === "voucher", pool = codeVoucher && draft.codeMode === "pool";
  // What a kind needs: re-roll the voucher migration, Uang / Voucher kode / Lainnya the types migration (a reward keeps its own kind).
  const kindReady = (kind: RewardKind) => kind === draft.kind || (isReroll(kind) ? vouchersReady : needsRewardTypes(kind) ? typesReady : true);
  const firstVoucher = (["voucher", "reroll", "reroll_legendary"] as const).find(kindReady);
  /** Jenis: a voucher keeps what it held; a delivery that no longer fits goes back to the admin. */
  const pickCategory = (next: RewardCategory) => setDraft(current => {
    const kind: RewardKind = next !== "voucher" ? next : categoryOf(current.kind) === "voucher" ? current.kind : firstVoucher ?? "voucher";
    return { ...current, kind, delivery: !isReroll(kind) && current.delivery === "auto" && !autoAllowed(kind, current.codeMode) ? "admin" : current.delivery };
  });
  const pickVoucher = (kind: VoucherKind) => setDraft(current => ({ ...current, kind, delivery: kind === "voucher" && current.delivery === "auto" && !autoAllowed(kind, current.codeMode) ? "admin" : current.delivery }));
  const pickCodeMode = (codeMode: CodeMode) => setDraft(current => ({ ...current, codeMode, delivery: current.delivery === "auto" && !autoAllowed(current.kind, codeMode) ? "admin" : current.delivery }));

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
    if (codeVoucher && draft.codeMode === "shared" && !draft.sharedCode.trim()) return setProblem("Isi kode atau link untuk semua.");
    const input: RewardInput = {
      title: draft.title.trim(), description: draft.description.trim(), cost: Number(draft.cost), stock: draft.stock === "" ? null : Number(draft.stock), perPerson: Number(draft.perPerson), active: draft.active,
      photos: draft.photos.map(photo => photo.upload ? { key: photo.key, upload: photo.upload } : { key: photo.key }), kind: draft.kind,
      delivery: isReroll(draft.kind) ? "auto" : draft.delivery, codeMode: codeVoucher ? draft.codeMode : null, sharedCode: draft.sharedCode.trim(),
      validUntil: codeVoucher && draft.validUntil ? draft.validUntil : null, howTo: codeVoucher ? draft.howTo.trim() : "",
      addCodes: pool ? codeLines(draft.newCodes) : [], removeCodes: pool ? draft.removeCodes : [],
    };
    setBusy("save");
    try {
      const { data, message } = isNew
        ? await send<WbAdminReward>(wellbeingAdminApi.rewards, "POST", input)
        : await send<WbAdminReward>(wellbeingAdminApi.reward((reward as WbAdminReward).id), "PATCH", input);
      setResource<WbRewardsAdmin>(wb.rewards.key, current => current && { ...current, rewards: isNew ? [data, ...current.rewards] : current.rewards.map(item => item.id === data.id ? data : item) });
      revalidate(wb.rewards.key);
      if (pool) revalidate(wb.rewardCodes(data.id).key);
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

  const waitingFor = [!vouchersReady && `Re-roll menunggu migrasi ${MIGRATION_WELLBEING_VOUCHERS}.`, !typesReady && `Uang, Voucher kode, dan Lainnya menunggu migrasi ${MIGRATION_WELLBEING_REWARD_TYPES}.`].filter(Boolean).join(" ");
  const newCodes = pool ? codeLines(draft.newCodes).length : 0;
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
        <span id="reward-kind-label">Jenis hadiah</span>
        <div className={css.statusTabs} role="group" aria-labelledby="reward-kind-label">
          {REWARD_CATEGORIES.map(item => <button key={item} type="button" className={css.statusTab} aria-pressed={category === item} onClick={() => pickCategory(item)}
            disabled={item === "voucher" ? !firstVoucher : !kindReady(item)}>{rewardCategoryLabels[item]}</button>)}
        </div>
        <small className={css.help}>{categoryHelp[category]}{waitingFor ? ` ${waitingFor}` : ""}</small>
      </div>
      {category === "voucher" && <div className={css.field}>
        <span id="reward-voucher-label">Isi voucher</span>
        <div className={css.statusTabs} role="group" aria-labelledby="reward-voucher-label">
          {VOUCHER_KINDS.map(item => <button key={item} type="button" className={css.statusTab} aria-pressed={draft.kind === item} onClick={() => pickVoucher(item)} disabled={!kindReady(item)}>{voucherKindLabels[item]}</button>)}
        </div>
        {isReroll(draft.kind) && <small className={css.help}>{rerollHelp[draft.kind as "reroll" | "reroll_legendary"]}</small>}
      </div>}
      {codeVoucher && <>
        <fieldset className={css.choices}>
          <legend>Kode atau link</legend>
          {CODE_MODES.map(mode => <label key={mode} className={cx(css.choice, css.choiceCompact)} data-on={draft.codeMode === mode}>
            <input type="radio" name="reward-code-mode" checked={draft.codeMode === mode} onChange={() => pickCodeMode(mode)} />
            <span><strong>{codeModeLabels[mode]}</strong><small>{codeModeHelp[mode]}</small></span>
          </label>)}
        </fieldset>
        {draft.codeMode === "shared" && <label className={css.field}><span>Kode atau link untuk semua</span>
          <input className={cx(css.input, css.mono)} value={draft.sharedCode} maxLength={500} onChange={event => set("sharedCode", event.target.value)} placeholder="mis. WLM2026 atau https://…" aria-describedby="reward-shared-help" />
          <small className={css.help} id="reward-shared-help">Link (diawali https://) tampil sebagai tombol Buka link.</small></label>}
        {pool && <div className={css.field}>
          {!isNew && reward && <CodeList rewardId={reward.id} removing={draft.removeCodes}
            onToggle={id => set("removeCodes", draft.removeCodes.includes(id) ? draft.removeCodes.filter(item => item !== id) : [...draft.removeCodes, id])} />}
          <label className={css.field}><span>Tambah kode atau link (satu per baris)</span>
            <textarea className={cx(css.input, css.mono)} rows={5} value={draft.newCodes} onChange={event => set("newCodes", event.target.value)} placeholder={"KOPI-8H2K\nKOPI-3M9Q\nhttps://…"} aria-describedby="reward-codes-help" />
            <small className={css.help} id="reward-codes-help">{newCodes ? `${points(newCodes)} kode baru. ` : ""}Bisa ditempel dari spreadsheet. Kode yang sama dilewati.</small></label>
        </div>}
        <div className={css.fieldRow}>
          <label className={css.field}><span>Berlaku sampai <span className={css.help}>(opsional)</span></span>
            <input className={css.input} type="date" value={draft.validUntil} onChange={event => set("validUntil", event.target.value)} aria-describedby="reward-until-help" />
            <small className={css.help} id="reward-until-help">Setelah tanggal ini voucher tidak tampil dan tidak bisa diklaim.</small></label>
        </div>
        <label className={css.field}><span>Cara pakai <span className={css.help}>(tampil bersama kode)</span></span>
          <textarea className={css.input} rows={3} value={draft.howTo} maxLength={1000} onChange={event => set("howTo", event.target.value)} placeholder="mis. Tunjukkan kode di kasir, atau masukkan saat checkout" /></label>
      </>}
      {!isReroll(draft.kind) && <fieldset className={css.choices}>
        <legend>Penyerahan</legend>
        {DELIVERIES.map(mode => {
          const allowed = mode !== "auto" || autoAllowed(draft.kind, codeVoucher ? draft.codeMode : null);
          return <label key={mode} className={cx(css.choice, css.choiceCompact)} data-on={draft.delivery === mode} data-off={!allowed || undefined}>
            <input type="radio" name="reward-delivery" checked={draft.delivery === mode} disabled={!allowed} onChange={() => set("delivery", mode)} />
            <span><strong>{deliveryLabels[mode]}</strong><small>{allowed ? deliveryHelp[mode] : "Hanya untuk voucher dengan daftar kode unik atau satu kode untuk semua."}</small></span>
          </label>;
        })}
      </fieldset>}
      <div className={css.field}>
        <span>Foto ({draft.photos.length}/{MAX_REWARD_PHOTOS})</span>
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
        <small className={css.help}>Foto pertama (bergaris biru) tampil di daftar. Foto produk berlatar putih tampil paling rapi.</small>
      </div>
      <label className={css.field}><span>Keterangan (dibaca karyawan)</span>
        <textarea className={css.input} rows={4} value={draft.description} maxLength={2000} onChange={event => set("description", event.target.value)}
          placeholder={category === "uang" ? "Berapa nilainya, dan cara penyerahan (mis. transfer e-wallet dalam 3 hari kerja)" : "Apa hadiahnya, cara dan waktu penyerahan, masa berlaku"} /></label>
      <div className={css.fieldRow}>
        <label className={css.field}><span>Harga (poin)</span><input className={css.input} inputMode="numeric" value={draft.cost} onChange={event => set("cost", digits(event.target.value, 8))} /></label>
        {pool
          ? <div className={css.field}><span>Stok</span><span className={css.stockNote}>Mengikuti jumlah kode yang belum diberikan.</span></div>
          : <label className={css.field}><span>Stok</span><input className={css.input} inputMode="numeric" value={draft.stock} placeholder="Tanpa batas" aria-describedby="reward-stock-help" onChange={event => set("stock", digits(event.target.value, 6))} />
              <small className={css.help} id="reward-stock-help">Kosongkan bila tanpa batas.</small></label>}
      </div>
      <label className={css.field}><span>Batas per orang</span><input className={css.input} inputMode="numeric" value={draft.perPerson} onChange={event => set("perPerson", digits(event.target.value, 3))} /></label>
      <label className={css.switchRow}><input type="checkbox" checked={draft.active} onChange={event => set("active", event.target.checked)} />
        <span><strong>Aktif</strong><small>Tampil di aplikasi karyawan dan bisa diklaim. Matikan untuk menyembunyikan; klaim yang ada tetap.</small></span></label>
      {problem && <p className={css.problem} role="alert">{problem}</p>}
    </form>
  </Panel>;
}

/** A voucher's unique codes: how many are left, each one and who got it; a free one can be taken off (on Simpan). */
function CodeList({ rewardId, removing, onToggle }: { rewardId: string; removing: string[]; onToggle: (id: string) => void }) {
  const codes = useResource(wb.rewardCodes(rewardId).key, wb.rewardCodes(rewardId).fetch);
  if (!codes.data) return codes.error ? <LoadError message={codes.error} onRetry={() => void codes.reload()} /> : <SkeletonRows rows={2} />;
  const list = codes.data.codes, free = list.filter(item => !item.claimId && !removing.includes(item.id)).length;
  return <div className={css.codeBox}>
    <div className={css.codeHead}><strong>{points(free)} kode belum diberikan</strong><span className={css.help}>dari {points(list.length)} kode</span></div>
    {list.length > 0 && <ul className={css.codeList} aria-label="Kode voucher">
      {list.map(item => {
        const gone = removing.includes(item.id);
        return <li key={item.id} data-gone={gone || undefined} data-given={!!item.claimId || undefined}>
          <code>{item.code}</code>
          <span className={css.help}>{item.claimId ? `Diberikan ke ${item.employeeName ?? "karyawan"}${item.givenAt ? ` · ${when(item.givenAt)}` : ""}` : gone ? "Dihapus saat Simpan" : "Belum diberikan"}</span>
          {!item.claimId && <button type="button" className={css.codeTool} onClick={() => onToggle(item.id)} aria-label={gone ? `Batal hapus ${item.code}` : `Hapus ${item.code}`}>
            {gone ? <Undo2 size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}</button>}
        </li>;
      })}
    </ul>}
  </div>;
}
