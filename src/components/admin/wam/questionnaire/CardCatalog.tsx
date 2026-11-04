"use client";

import { useRef, useState } from "react";
import { ChevronDown, ImageUp, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import {
  artKindLabels, ODDS_TOTAL, oddsLabel, partKinds, serialLabel, slotOfFile,
  type ArtKind, type Character, type CharacterInput, type Tier,
} from "@/lib/pra-wam/cards";
import { praWamCardsApi } from "@/lib/routes";
import type { AdminCards } from "@/lib/server/pra-wam/cards-admin";
import { uploadArt } from "./cardArtUpload";
import { CharacterEditor } from "./CharacterEditor";
import styles from "./cards.module.css";

type Message = { tone: "success" | "error" | "warning"; text: string } | null;
const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/**
 * Admin WAM → Kuesioner → Kartu: the pictures (one folder at once, or one by one), the characters
 * with their score rules, the levels with their odds and caps, and the cards drawn so far with
 * each draw's record, so "why did I get Common" has an answer. Trial cards from trying the draft
 * can be removed.
 */
export function CardCatalog({ initial }: { initial: AdminCards }) {
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, confirmElement] = useConfirm();
  const { catalog } = data;
  const nameOf = new Map(catalog.characters.map(character => [character.id, character]));
  const tierOf = new Map(catalog.tiers.map(tier => [tier.key, tier]));
  /** The draw record names characters by their fixed key; show their names. */
  const named = (key: string) => catalog.characters.find(character => character.key === key)?.name ?? key;
  const real = data.drawn.filter(card => !card.trial);
  const trials = data.drawn.length - real.length;

  async function reload() {
    const result = await adminRequest<AdminCards>(praWamCardsApi.catalog);
    if (result.data) setData(result.data);
  }

  async function run(key: string, work: () => Promise<{ message: string; cards?: AdminCards | null }>) {
    setBusy(key); setMessage(null); setErrors({});
    try {
      const { message: text, cards } = await work();
      if (cards) setData(cards); else await reload();
      setMessage({ tone: "success", text });
      return true;
    } catch (problem) {
      if (problem instanceof AdminApiError && problem.fieldErrors) setErrors(Object.fromEntries(Object.entries(problem.fieldErrors).map(([path, list]) => [path, list[0]])));
      setMessage({ tone: "error", text: errorMessage(problem) });
      return false;
    } finally { setBusy(""); }
  }

  const saveCharacter = (character: Character | undefined, input: CharacterInput) => run(`karakter:${character?.id ?? "baru"}`, async () => {
    const result = character
      ? await adminRequest<{ cards: AdminCards }>(praWamCardsApi.character(character.id), { method: "PATCH", body: JSON.stringify(input) })
      : await adminRequest<{ cards: AdminCards }>(praWamCardsApi.catalog, { method: "POST", body: JSON.stringify(input) });
    return { message: result.message ?? "Tersimpan.", cards: result.data?.cards };
  }).then(ok => { if (ok) setEditing(null); });

  async function removeCharacter(character: Character) {
    const owned = real.filter(card => card.characterId === character.id).length;
    const ok = await confirm({
      title: owned ? `Sembunyikan ${character.name}?` : `Hapus ${character.name}?`,
      body: owned ? `${owned} orang sudah punya kartu ini, jadi karakternya disembunyikan, bukan dihapus. Kartu mereka tetap.` : "Karakter, aturan skornya, dan gambarnya dihapus.",
      confirmLabel: owned ? "Sembunyikan" : "Hapus", danger: !owned,
    });
    if (!ok) return;
    const done = await run(`hapus:${character.id}`, async () => {
      const result = await adminRequest<{ cards: AdminCards }>(praWamCardsApi.character(character.id), { method: "DELETE" });
      return { message: result.message ?? "Dihapus.", cards: result.data?.cards };
    });
    if (done) setEditing(null);
  }

  async function removeTrials() {
    if (!(await confirm({ title: `Hapus ${trials} kartu uji?`, body: "Kartu yang diundi saat mencoba draf dihapus. Kartu sungguhan tidak tersentuh.", confirmLabel: "Hapus kartu uji", danger: true }))) return;
    await run("uji", async () => {
      const result = await adminRequest<{ cards: AdminCards }>(praWamCardsApi.trials, { method: "DELETE" });
      return { message: result.message ?? "Dihapus.", cards: result.data?.cards };
    });
  }

  return <div className="stack">
    <div className={styles.head}>
      <div>
        <h2>Kartu karakter</h2>
        <p className={styles.muted}>Karakter dipilih dari jawaban lewat aturan skor. Level dan tampilan diundi sekali di server, lalu dikunci. {real.length} kartu sudah keluar.</p>
      </div>
    </div>
    <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>
    {data.willChange > 0 && <Notice tone="warning">{data.willChange} orang akan berganti karakter saat jawabannya berikutnya tersimpan atau kartunya dibuka, karena aturan skor sekarang tidak lagi memilih karakter mereka. Level, tampilan, dan nomornya tetap.</Notice>}

    <Pictures data={data} busy={busy} setBusy={setBusy} setMessage={setMessage} reload={reload} />

    <section className={styles.card} aria-labelledby="cc-characters">
      <div className={styles.head}>
        <h3 id="cc-characters">Karakter ({catalog.characters.filter(character => !character.hidden).length} tampil)</h3>
        <Button type="button" variant="secondary" disabled={!!busy || editing === "baru"} onClick={() => { setEditing("baru"); setErrors({}); }}><Plus size={18} aria-hidden /> Tambah karakter</Button>
      </div>
      {editing === "baru" && <CharacterEditor characters={catalog.characters} questions={data.questions} busy={busy === "karakter:baru"} errors={errors}
        onSave={input => void saveCharacter(undefined, input)} onCancel={() => setEditing(null)} />}
      <ul className={styles.characters}>
        {catalog.characters.map(character => {
          const owned = real.filter(card => card.characterId === character.id).length;
          const open = editing === character.id;
          return <li key={character.id} className={`${styles.character} ${character.hidden ? styles.hidden : ""}`}>
            <div className={styles.characterRow}>
              {/* eslint-disable-next-line @next/next/no-img-element -- card art drawn on canvas or served privately by this site; next/image cannot help */}
              <span className={styles.thumb}>{character.image ? <img src={character.image} alt="" loading="lazy" /> : <ImageUp size={20} aria-hidden />}</span>
              <span className={styles.characterText}>
                <strong>{character.name}</strong>
                <span className={styles.muted}>{character.class}{character.figure ? ` · ${character.figure}` : ""} · {character.rules.length} aturan · dimiliki {owned} orang{character.hidden ? " · disembunyikan" : ""}{character.stored ? "" : " · belum ada gambar"}</span>
              </span>
              <button type="button" className={styles.iconButton} aria-expanded={open} aria-label={`${open ? "Tutup" : "Ubah"} ${character.name}`} disabled={!!busy} onClick={() => { setEditing(open ? null : character.id); setErrors({}); }}>
                {open ? <ChevronDown size={18} aria-hidden /> : <Pencil size={18} aria-hidden />}
              </button>
            </div>
            {open && <CharacterEditor character={character} characters={catalog.characters} questions={data.questions} busy={busy === `karakter:${character.id}` || busy === `hapus:${character.id}`} errors={errors}
              onSave={input => void saveCharacter(character, input)} onCancel={() => setEditing(null)} onRemove={() => void removeCharacter(character)} />}
          </li>;
        })}
      </ul>
    </section>

    <Tiers tiers={catalog.tiers} taken={real} busy={busy} run={run} errors={errors} />

    <section className={styles.card} aria-labelledby="cc-drawn">
      <div className={styles.head}>
        <h3 id="cc-drawn">Kartu yang sudah keluar</h3>
        {trials > 0 && <Button type="button" variant="secondary" disabled={!!busy} onClick={() => void removeTrials()}><Trash2 size={18} aria-hidden /> Hapus {trials} kartu uji</Button>}
      </div>
      {!data.following && real.length > 0 && <p className={styles.muted}>Karakter sudah terkunci: kuesioner tidak dibuka atau tenggatnya lewat.</p>}
      {data.drawn.length ? <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th scope="col">Nomor</th><th scope="col">Nama</th><th scope="col">Karakter</th><th scope="col">Level</th><th scope="col">Diundi</th><th scope="col">Catatan undian</th></tr></thead>
        <tbody>{data.drawn.map(card => {
          const tier = tierOf.get(card.tierKey);
          const roll = card.roll;
          return <tr key={card.employeeId}>
            <td>{serialLabel(card.serial)}</td>
            <td><strong>{card.name}</strong><br /><span className={styles.muted}>{card.department}</span></td>
            <td>{nameOf.get(card.characterId)?.name ?? "?"}</td>
            <td><span className={styles.tier} style={{ background: tier?.color }}>{tier?.name ?? card.tierKey}</span></td>
            <td>{when(card.drawnAt)}</td>
            <td><details><summary>Lihat</summary>
              <p>Angka undian {roll.number} dari 0–{ODDS_TOTAL - 1}, jatuh di {tierOf.get(roll.landed)?.name ?? roll.landed}{roll.passed?.length ? `, turun karena batas penuh: ${roll.passed.map(key => tierOf.get(key)?.name ?? key).join(", ")}` : ""}.</p>
              <p>Karakter saat diundi: {named(roll.character)}{roll.tied?.length > 1 ? `, diundi di antara yang seri: ${roll.tied.map(named).join(", ")}` : ""}.</p>
              {roll.changes?.length ? <p>Berganti karakter: {roll.changes.map(change => `${named(change.from)} → ${named(change.to)}${change.kept ? " (dibatalkan, kombinasi sudah dipakai)" : ""}`).join("; ")}.</p> : null}
              <p className={styles.muted}>DNA {card.dna}</p>
            </details></td>
          </tr>;
        })}</tbody>
      </table></div> : <p className={styles.muted}>Belum ada kartu. Kartu diundi saat seseorang selesai mengisi semua bagian wajib.</p>}
    </section>
    {confirmElement}
  </div>;
}

type Run = (key: string, work: () => Promise<{ message: string; cards?: AdminCards | null }>) => Promise<boolean>;

/** The levels: name, colour, odds in percent (adding up to 100), an optional cap, and the line under the banner. */
function Tiers({ tiers, taken, busy, run, errors }: { tiers: Tier[]; taken: AdminCards["drawn"]; busy: string; run: Run; errors: Record<string, string> }) {
  const [rows, setRows] = useState(() => tiers.map(tier => ({ ...tier, percent: String(tier.odds / 100), cap: tier.maxCards === null ? "" : String(tier.maxCards) })));
  const total = rows.reduce((sum, row) => sum + Math.round(Number(row.percent.replace(",", ".")) * 100 || 0), 0);
  const set = (key: string, patch: Partial<(typeof rows)[number]>) => setRows(current => current.map(row => row.key === key ? { ...row, ...patch } : row));
  const save = () => run("level", async () => {
    const body = { tiers: rows.map(row => ({ key: row.key, name: row.name, color: row.color, odds: Math.round(Number(row.percent.replace(",", ".")) * 100), maxCards: row.cap.trim() === "" ? null : Number(row.cap), line: row.line })) };
    const result = await adminRequest<{ cards: AdminCards }>(praWamCardsApi.tiers, { method: "PUT", body: JSON.stringify(body) });
    return { message: result.message ?? "Tersimpan.", cards: result.data?.cards };
  });
  return <section className={styles.card} aria-labelledby="cc-tiers">
    <h3 id="cc-tiers">Level dan peluang</h3>
    <p className={styles.muted}>Peluang dalam persen, jumlahnya harus 100. Batas jumlah seperti edisi terbatas: kalau penuh, undian turun ke level di bawahnya. Kartu yang sudah keluar tidak berubah.</p>
    <div className={styles.tableWrap}><table className={styles.table}>
      <thead><tr><th scope="col">Level</th><th scope="col">Warna</th><th scope="col">Peluang (%)</th><th scope="col">Batas jumlah</th><th scope="col">Sudah keluar</th><th scope="col">Kalimat di kartu</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.key}>
        <td><input className="input" aria-label={`Nama level ${row.key}`} value={row.name} maxLength={30} disabled={!!busy} onChange={event => set(row.key, { name: event.target.value })} /></td>
        <td><input type="color" className={styles.color} aria-label={`Warna ${row.name}`} value={row.color} disabled={!!busy} onChange={event => set(row.key, { color: event.target.value.toUpperCase() })} /></td>
        <td><input className={`input ${styles.narrow}`} inputMode="decimal" aria-label={`Peluang ${row.name} dalam persen`} value={row.percent} disabled={!!busy} onChange={event => set(row.key, { percent: event.target.value })} /></td>
        <td><input className={`input ${styles.narrow}`} inputMode="numeric" aria-label={`Batas jumlah ${row.name}, kosong berarti tanpa batas`} placeholder="Tanpa batas" value={row.cap} disabled={!!busy} onChange={event => set(row.key, { cap: event.target.value.replace(/\D/g, "") })} /></td>
        <td>{taken.filter(card => card.tierKey === row.key).length}</td>
        <td><input className="input" aria-label={`Kalimat untuk ${row.name}`} value={row.line} maxLength={120} disabled={!!busy} onChange={event => set(row.key, { line: event.target.value })} /></td>
      </tr>)}</tbody>
    </table></div>
    <p className={total === ODDS_TOTAL ? styles.muted : "field-error"} aria-live="polite">Jumlah peluang: {oddsLabel(total)}{total === ODDS_TOTAL ? "" : ", harus 100 %"}.</p>
    {errors.tiers && <p className="field-error">{errors.tiers}</p>}
    <div><Button type="button" disabled={!!busy || total !== ODDS_TOTAL} onClick={() => void save()}>{busy === "level" ? "Menyimpan…" : "Simpan level"}</Button></div>
  </section>;
}

/** Every picture slot: characters by number, then backgrounds, accents and stickers. Upload one, or a whole folder named karakter-01.webp, latar-01.png … */
function Pictures({ data, busy, setBusy, setMessage, reload }: { data: AdminCards; busy: string; setBusy: (key: string) => void; setMessage: (message: Message) => void; reload: () => Promise<void> }) {
  const folder = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState("");
  const { catalog } = data;
  const slots: { kind: ArtKind; ref: string; number: number; name: string; image: string | null; stored: boolean }[] = [
    ...catalog.characters.map(character => ({ kind: "karakter" as const, ref: character.id, number: character.number, name: character.name, image: character.image, stored: character.stored })),
    ...partKinds.flatMap(kind => catalog.parts.filter(part => part.kind === kind).map(part => ({ kind, ref: String(part.number), number: part.number, name: part.name, image: part.image, stored: part.stored }))),
  ];
  const missing = slots.filter(slot => !slot.stored).length;

  async function send(files: { slot: (typeof slots)[number]; file: File }[], unknown: string[] = []) {
    if (!files.length) { setMessage({ tone: "error", text: unknown.length ? `Tidak ada nama berkas yang cocok: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "…" : ""}. Pakai nama seperti karakter-01.webp atau latar-01.png.` : "Tidak ada berkas dipilih." }); return; }
    setBusy("gambar"); setMessage(null);
    const failed: string[] = [];
    let done = 0;
    for (const { slot, file } of files) {
      setProgress(`Mengunggah ${done + 1} dari ${files.length}: ${file.name}`);
      try { await uploadArt(slot.kind, slot.ref, file); done++; } catch (problem) { failed.push(errorMessage(problem)); }
    }
    setProgress("");
    try { await reload(); } catch { /* the message below still says what happened */ }
    setBusy("");
    const parts = [`${done} gambar tersimpan.`];
    if (failed.length) parts.push(`${failed.length} gagal: ${failed.slice(0, 3).join(" ")}`);
    if (unknown.length) parts.push(`${unknown.length} berkas dilewati karena namanya tidak dikenal.`);
    setMessage({ tone: failed.length ? "error" : unknown.length ? "warning" : "success", text: parts.join(" ") });
  }

  function pickFolder(list: FileList | null) {
    // Copy the files first: the FileList is live, and clearing the input (so the same files can
    // be picked again) empties it.
    const picked = Array.from(list ?? []);
    if (folder.current) folder.current.value = "";
    if (!picked.length) return;
    const files: { slot: (typeof slots)[number]; file: File }[] = [], unknown: string[] = [];
    for (const file of picked) {
      const match = slotOfFile(file.name);
      const slot = match && slots.find(item => item.kind === match.kind && item.number === match.number);
      if (slot) files.push({ slot, file }); else unknown.push(file.name);
    }
    void send(files, unknown);
  }

  return <section className={styles.card} aria-labelledby="cc-pictures">
    <div className={styles.head}>
      <div>
        <h3 id="cc-pictures">Gambar</h3>
        <p className={styles.muted}>{missing ? `${missing} dari ${slots.length} belum ada gambar. Tanpa gambar, kartu tetap jalan dengan warna polos.` : `Semua ${slots.length} gambar sudah ada.`} Disimpan di penyimpanan privat, tidak di repo.</p>
      </div>
      <Button type="button" variant="secondary" disabled={!!busy} onClick={() => folder.current?.click()}><Upload size={18} aria-hidden /> Unggah sekaligus</Button>
      <input ref={folder} type="file" multiple accept="image/webp,image/png,image/jpeg,.webp,.png,.jpg,.jpeg" hidden onChange={event => pickFolder(event.target.files)} />
    </div>
    <p className={styles.muted}>Unggah sekaligus: pilih semua berkas dengan nama <code>karakter-01.webp</code>, <code>latar-01.png</code>, <code>aksen-01.png</code>, <code>stiker-01.png</code> (nomor sesuai daftar di bawah). WebP, PNG, atau JPG, paling besar 3 MB per gambar. Karakter sebaiknya potret 4:5 atau lebih tinggi.</p>
    <p className={styles.muted} aria-live="polite">{progress}</p>
    {(["karakter", ...partKinds] as ArtKind[]).map(kind => <div key={kind} className={styles.slotGroup}>
      <h4>{artKindLabels[kind]}</h4>
      <ul className={styles.slots}>
        {slots.filter(slot => slot.kind === kind).map(slot => <li key={`${slot.kind}-${slot.ref}`} className={`${styles.slot} ${slot.stored ? "" : styles.empty}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- card art drawn on canvas or served privately by this site; next/image cannot help */}
          <span className={`${styles.slotArt} ${kind === "karakter" ? styles.tall : ""}`}>{slot.image ? <img src={slot.image} alt="" loading="lazy" /> : <ImageUp size={20} aria-hidden />}</span>
          <span className={styles.slotName}>{String(slot.number).padStart(2, "0")} · {slot.name}</span>
          <label className={styles.slotPick}>
            {slot.stored ? "Ganti" : "Unggah"}
            <input type="file" accept="image/webp,image/png,image/jpeg,.webp,.png,.jpg,.jpeg" className="sr-only" disabled={!!busy}
              aria-label={`${slot.stored ? "Ganti" : "Unggah"} gambar ${artKindLabels[kind]} ${slot.number}, ${slot.name}`}
              onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void send([{ slot, file }]); }} />
          </label>
        </li>)}
      </ul>
    </div>)}
  </section>;
}
