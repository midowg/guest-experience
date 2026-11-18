"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Dices, ImageUp, MoreVertical, Pencil, Plus, ScrollText, Trash2, Upload } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { SectionToolbar } from "@/components/console";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { AdminApiError, adminRequest, errorMessage } from "@/components/admin/shared/api";
import {
  artKindLabels, ODDS_TOTAL, oddsLabel, partKinds, serialLabel, slotOfFile,
  type ArtKind, type Character, type CharacterInput, type Tier,
} from "@/lib/pra-wam/cards";
import { colorsOf, figureOfFile, legendClasses } from "@/lib/pra-wam/figures";
import { fromZoneInput, toZoneInput } from "@/lib/format";
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
  const real = data.drawn.filter(card => !card.trial);
  // The tokoh card (13 Nov 2026): the characters are the personas behind the figures.
  const tokoh = catalog.figures.length > 0;
  const oldArt = catalog.characters.filter(character => character.stored).length + catalog.parts.filter(part => part.stored).length;
  async function removeOldArt() {
    if (!(await confirm({ title: `Hapus ${oldArt} gambar kartu lama?`, body: "Gambar karakter anime, latar, aksen sudut, dan stiker dihapus permanen. Kartu tokoh tidak memakainya.", confirmLabel: "Hapus gambar", danger: true }))) return;
    await run("gambar-lama", async () => {
      const result = await adminRequest<{ cards: AdminCards }>(praWamCardsApi.characterArt, { method: "DELETE" });
      return { message: result.message ?? "Dihapus.", cards: result.data?.cards };
    });
  }
  const trials = data.drawn.length - real.length;
  /** Whose draw record is open below their row. */
  const [record, setRecord] = useState<string | null>(null);

  /** One person may re-roll again (their figure, rarity and number stay). */
  async function giveReroll(employeeId: string, name: string) {
    if (!(await confirm({ title: `Beri ${name} re-roll lagi?`, body: "Tokohnya sekarang tetap sampai dia re-roll lagi. Tokoh sebelumnya tidak dikembalikan. Re-roll berikutnya mengundi tokoh dan rarity lagi; nomor kartu tetap. Re-roll hanya bisa dipakai selama waktu re-roll dibuka.", confirmLabel: "Beri re-roll lagi" }))) return;
    await run(`reroll:${employeeId}`, async () => {
      const result = await adminRequest<{ cards: AdminCards }>(praWamCardsApi.catalog, { method: "PATCH", body: JSON.stringify({ resetReroll: employeeId }) });
      return { message: result.message ?? "Tersimpan.", cards: result.data?.cards };
    });
  }

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
    <div>
      <SectionToolbar title={tokoh ? "Kartu tokoh" : "Kartu karakter"} count={`${real.length} kartu keluar`} />
      <div>
        <p className={styles.muted}>{tokoh
          ? `Tokoh dicocokkan dari jawaban (peran di tim, hobi, aktivitas, energi, genre musik), satu orang per tokoh, jadi setiap kartu edisi 1 dari 1. Rarity diundi sekali di server, lalu kartu dikunci. ${real.length} kartu sudah keluar.`
          : `Karakter dipilih dari jawaban lewat aturan skor. Level dan tampilan diundi sekali di server, lalu dikunci. ${real.length} kartu sudah keluar.`}</p>
      </div>
    </div>
    <div aria-live="polite">{message && <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice>}</div>
    {data.willChange > 0 && <Notice tone="warning">{data.willChange} orang akan berganti karakter saat jawabannya berikutnya tersimpan atau kartunya dibuka, karena aturan skor sekarang tidak lagi memilih karakter mereka. Level, tampilan, dan nomornya tetap.</Notice>}

    {tokoh && oldArt > 0 && <Notice tone="info">
      {oldArt} gambar kartu lama (karakter anime, latar, aksen sudut, stiker) masih tersimpan. Kartu tokoh tidak memakainya. <Button type="button" variant="secondary" disabled={!!busy} onClick={() => void removeOldArt()}><Trash2 size={18} aria-hidden /> Hapus gambar kartu lama</Button>
    </Notice>}
    {tokoh && <Reroll data={data} busy={busy} run={run} confirm={confirm} />}
    <Pictures data={data} busy={busy} setBusy={setBusy} setMessage={setMessage} reload={reload} />

    {/* The personas work behind the tokoh card (which group of figures, the colour, "Tipemu"); with figures they are not edited here (13 Nov 2026). */}
    {!tokoh && <section className={styles.card} aria-labelledby="cc-characters">
      <div className={styles.head}>
        <h3 id="cc-characters">{tokoh ? `Persona (${catalog.characters.filter(character => !character.hidden).length})` : `Karakter (${catalog.characters.filter(character => !character.hidden).length} tampil)`}</h3>
        {!tokoh && <Button type="button" variant="secondary" disabled={!!busy || editing === "baru"} onClick={() => { setEditing("baru"); setErrors({}); }}><Plus size={18} aria-hidden /> Tambah karakter</Button>}
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
              onSave={input => void saveCharacter(character, input)} onCancel={() => setEditing(null)} onRemove={tokoh ? undefined : () => void removeCharacter(character)} />}
          </li>;
        })}
      </ul>
    </section>}

    <Tiers tiers={catalog.tiers} taken={real} busy={busy} run={run} errors={errors} />

    <section className={styles.card} aria-labelledby="cc-drawn">
      <div className={styles.head}>
        <h3 id="cc-drawn">Kartu yang sudah keluar</h3>
        {trials > 0 && <Button type="button" variant="secondary" disabled={!!busy} onClick={() => void removeTrials()}><Trash2 size={18} aria-hidden /> Hapus {trials} kartu uji</Button>}
      </div>
      {!data.following && real.length > 0 && <p className={styles.muted}>Karakter sudah terkunci: kuesioner tidak dibuka atau tenggatnya lewat.</p>}
      {data.drawn.length ? <ul className={styles.drawnList}>
        {data.drawn.map(card => <DrawnRow key={card.employeeId} card={card} catalog={catalog} busy={busy} open={record === card.employeeId}
          onRecord={() => setRecord(current => current === card.employeeId ? null : card.employeeId)} onReroll={() => void giveReroll(card.employeeId, card.name)} />)}
      </ul> : <p className={styles.muted}>Belum ada kartu. Kartu diundi saat seseorang selesai mengisi semua bagian wajib.</p>}
    </section>
    {confirmElement}
  </div>;
}

type Run = (key: string, work: () => Promise<{ message: string; cards?: AdminCards | null }>) => Promise<boolean>;
type DrawnCard = AdminCards["drawn"][number];

/** A figure's small picture for the list: its RPG form when the card is Legendary, its persona's colour behind. */
function Thumb({ catalog, figureKey, figureId, tierKey, characterId, label, faded }: {
  catalog: AdminCards["catalog"]; figureKey?: string; figureId?: string | null; tierKey: string; characterId: string; label: string; faded?: boolean;
}) {
  const figure = catalog.figures.find(item => (figureKey ? item.key === figureKey : item.id === figureId));
  const persona = catalog.characters.find(item => item.id === (figure?.personaId ?? characterId));
  const [light, deep] = colorsOf(persona?.key ?? "");
  const image = tierKey === "legendary" && figure?.legendImage ? figure.legendImage : figure?.image ?? null;
  const tier = catalog.tiers.find(item => item.key === tierKey);
  return <figure className={`${styles.thumbCard} ${faded ? styles.thumbFaded : ""}`} style={{ background: `linear-gradient(160deg, ${light}, ${deep})`, borderColor: tier?.color }}>
    {/* eslint-disable-next-line @next/next/no-img-element -- card art served by this site; next/image cannot help in this list */}
    {image ? <img src={image} alt="" loading="lazy" /> : <span aria-hidden>?</span>}
    <figcaption className="sr-only">{label}</figcaption>
  </figure>;
}

/**
 * One card drawn (18 Nov 2026, the owner's request): the card, before and after when it was
 * re-rolled (figure and rarity), who has it, and its actions behind a three-dot menu: the draw's
 * record, and giving the re-roll back.
 */
function DrawnRow({ card, catalog, busy, open, onRecord, onReroll }: {
  card: DrawnCard; catalog: AdminCards["catalog"]; busy: string; open: boolean; onRecord: () => void; onReroll: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const roll = card.roll;
  const tierOf = (key: string | undefined) => catalog.tiers.find(tier => tier.key === key);
  const figureName = (key: string) => catalog.figures.find(figure => figure.key === key)?.name ?? key;
  const named = (key: string) => catalog.characters.find(character => character.key === key)?.name ?? key;
  const figure = catalog.figures.find(item => item.id === card.figureId);
  const persona = catalog.characters.find(item => item.id === card.characterId);
  const tier = tierOf(card.tierKey);
  const reroll = roll.reroll;
  const before = reroll ? tierOf(reroll.tierFrom ?? card.tierKey) : undefined;
  // Close the menu on a click elsewhere or Escape.
  useEffect(() => {
    const close = (event: Event) => {
      const details = menu.current;
      if (!details?.open) return;
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !(event.target instanceof Node && details.contains(event.target))) details.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  const act = (work: () => void) => () => { if (menu.current) menu.current.open = false; work(); };
  return <li className={`${styles.drawn} ${card.trial ? styles.drawnTrial : ""}`}>
    <div className={styles.drawnRow}>
      <div className={styles.thumbs}>
        {reroll && <>
          <Thumb catalog={catalog} figureKey={reroll.from} tierKey={reroll.tierFrom ?? card.tierKey} characterId={card.characterId} label={`Sebelum: ${figureName(reroll.from)}`} faded />
          <ArrowRight className={styles.thumbArrow} size={18} aria-hidden />
        </>}
        <Thumb catalog={catalog} figureId={card.figureId} tierKey={card.tierKey} characterId={card.characterId} label={reroll ? `Sesudah: ${figure?.name ?? ""}` : figure?.name ?? ""} />
      </div>
      <div className={styles.drawnText}>
        <strong>{card.name}</strong>
        <span className={styles.muted}>{card.department}</span>
        <span className={styles.drawnFacts}>
          <span>{serialLabel(card.serial)}</span>
          <span>{figure?.name ?? persona?.name ?? "?"}</span>
          {figure && persona && <span className={styles.muted}>{persona.class}</span>}
        </span>
        <span className={styles.drawnFacts}>
          {reroll && before && before.key !== card.tierKey
            ? <><span className={styles.tier} style={{ background: before.color }}>{before.name}</span><ArrowRight size={14} aria-hidden /><span className={styles.tier} style={{ background: tier?.color }}>{tier?.name ?? card.tierKey}</span></>
            : <span className={styles.tier} style={{ background: tier?.color }}>{tier?.name ?? card.tierKey}</span>}
          {reroll && <span className={styles.rerolled}><Dices size={14} aria-hidden /> Re-roll</span>}
          {card.trial && <span className={styles.rerolled}>Uji</span>}
        </span>
      </div>
      <span className={styles.drawnWhen}>{when(card.drawnAt)}</span>
      <details ref={menu} className={styles.rowMenu}>
        <summary aria-label={`Aksi untuk kartu ${card.name}`}><MoreVertical size={18} aria-hidden /></summary>
        <div className={styles.rowMenuList} role="group" aria-label={`Aksi untuk kartu ${card.name}`}>
          <button type="button" onClick={act(onRecord)}><ScrollText size={16} aria-hidden /> {open ? "Tutup catatan undian" : "Lihat catatan undian"}</button>
          {reroll && <button type="button" disabled={!!busy} onClick={act(onReroll)}><Dices size={16} aria-hidden /> Beri re-roll lagi</button>}
        </div>
      </details>
    </div>
    {open && <div className={styles.drawnRecord}>
      <p>Angka undian {roll.number} dari 0–{ODDS_TOTAL - 1}, jatuh di {tierOf(roll.landed)?.name ?? roll.landed}{roll.passed?.length ? `, turun karena batas penuh: ${roll.passed.map(key => tierOf(key)?.name ?? key).join(", ")}` : ""}.</p>
      <p>Karakter saat diundi: {named(roll.character)}{roll.tied?.length > 1 ? `, diundi di antara yang seri: ${roll.tied.map(named).join(", ")}` : ""}.</p>
      {roll.figure ? <p>Tokoh: {figureName(roll.figure.key)}, skor {roll.figure.score}{roll.figure.tied.length > 1 ? `, diundi di antara yang seri: ${roll.figure.tied.map(figureName).join(", ")}` : ""}.{roll.figure.gender ? ` Jenis kelamin: ${roll.figure.gender}.` : ""}{card.reason ? ` ${card.reason}` : ""}</p> : null}
      {roll.rerolls?.map(done => <p key={done.at}>Re-roll {when(done.at)}: {figureName(done.from)} → {figureName(done.to)}{done.tierTo ? `, ${tierOf(done.tierFrom)?.name ?? done.tierFrom} → ${tierOf(done.tierTo)?.name ?? done.tierTo}` : ""} (diberikan lagi {when(done.resetAt)}).</p>)}
      {reroll ? <p>Re-roll {when(reroll.at)}: {figureName(reroll.from)} → {figureName(reroll.to)}{reroll.tierTo ? `, ${tierOf(reroll.tierFrom)?.name ?? reroll.tierFrom} → ${tierOf(reroll.tierTo)?.name ?? reroll.tierTo}` : ""}.</p> : null}
      {roll.changes?.length ? <p>Berganti karakter: {roll.changes.map(change => `${named(change.from)} → ${named(change.to)}${change.kept ? " (dibatalkan, kombinasi sudah dipakai)" : ""}`).join("; ")}.</p> : null}
      <p className={styles.muted}>DNA {card.dna}</p>
    </div>}
  </li>;
}

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
  const slots: { kind: ArtKind; ref: string; number: number; name: string; image: string | null; stored: boolean; key?: string }[] = [
    ...(catalog.figures.length ? [] : catalog.characters).map(character => ({ kind: "karakter" as const, ref: character.id, number: character.number, name: character.name, image: character.image, stored: character.stored })),
    ...catalog.figures.map(figure => ({ kind: "tokoh" as const, ref: figure.id, number: figure.number, name: figure.name, image: figure.image, stored: figure.stored, key: figure.key })),
    ...(catalog.figures.length ? [] : partKinds).flatMap(kind => catalog.parts.filter(part => part.kind === kind).map(part => ({ kind, ref: String(part.number), number: part.number, name: part.name, image: part.image, stored: part.stored }))),
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
      // A figure by its key as exported from Figma (ki-hajar-dewantara.png) or tokoh-01.png; the rest by karakter-01.webp …
      const figure = figureOfFile(file.name, catalog.figures);
      const match = figure ? { kind: "tokoh" as const, number: figure.number } : slotOfFile(file.name);
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
    {catalog.figures.length > 0 && <p className={styles.muted}>Tokoh: ekspor PNG 1x dari Figma, beri nama sesuai kunci tokoh seperti <code>ki-hajar-dewantara.png</code> (sama dengan <code>gambar</code> di tokoh.json), lalu unggah sekaligus. Sebelum diunggah, kartu memakai gambar pratinjau dari handoff yang ikut di aplikasi; gambar yang diunggah di sini menggantikannya.</p>}
    <p className={styles.muted}>Unggah sekaligus: pilih semua berkas dengan nama <code>karakter-01.webp</code>, <code>latar-01.png</code>, <code>aksen-01.png</code>, <code>stiker-01.png</code> (nomor sesuai daftar di bawah). WebP, PNG, atau JPG, paling besar 3 MB per gambar. Karakter sebaiknya potret 4:5 atau lebih tinggi.</p>
    <p className={styles.muted} aria-live="polite">{progress}</p>
    {((catalog.figures.length ? ["tokoh"] : ["karakter", ...partKinds]) as ArtKind[]).map(kind => <div key={kind} className={styles.slotGroup}>
      <h4>{artKindLabels[kind]}</h4>
      <ul className={styles.slots}>
        {slots.filter(slot => slot.kind === kind).map(slot => <li key={`${slot.kind}-${slot.ref}`} className={`${styles.slot} ${slot.stored ? "" : styles.empty}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- card art drawn on canvas or served privately by this site; next/image cannot help */}
          <span className={`${styles.slotArt} ${kind === "karakter" || kind === "tokoh" ? styles.tall : ""}`}>{slot.image ? <img src={slot.image} alt="" loading="lazy" /> : <ImageUp size={20} aria-hidden />}</span>
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
    {catalog.figures.some(figure => figure.legendImage) && <div className={styles.slotGroup}>
      <h4>Wujud Legendary</h4>
      <p className={styles.muted}>Kartu Legendary otomatis memakai wujud kelas RPG tokohnya (handoff 16 Nov 2026). Gambarnya ikut di aplikasi, jadi tidak perlu diunggah.</p>
      <ul className={styles.slots}>
        {catalog.figures.filter(figure => figure.legendImage).map(figure => <li key={`leg-${figure.id}`} className={styles.slot}>
          {/* eslint-disable-next-line @next/next/no-img-element -- shipped with the app in public/figur/leg; next/image cannot help in this grid */}
          <span className={`${styles.slotArt} ${styles.tall}`}><img src={figure.legendImage!} alt="" loading="lazy" /></span>
          <span className={styles.slotName}>{String(figure.number).padStart(2, "0")} · {figure.name}<br />{legendClasses[catalog.characters.find(character => character.id === figure.personaId)?.key ?? ""] ?? "Legendary"}</span>
        </li>)}
      </ul>
    </div>}
  </section>;
}

const ZONE = "Asia/Jakarta";
/** Seven days from now, at 21:00 WIB: a first suggestion for when the re-roll closes. */
function weekFromNow() {
  const day = new Date(Date.now() + 7 * 86_400_000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(day);
  return `${date}T21:00`;
}

/**
 * Re-roll tokoh (v3, Hanung 16 Nov 2026): every person may re-roll their figure once, while it is
 * open. HR opens it a few days after the cards are out, until a moment, and may close it earlier.
 */
function Reroll({ data, busy, run, confirm }: {
  data: AdminCards; busy: string;
  run: (key: string, work: () => Promise<{ message: string; cards?: AdminCards | null }>) => Promise<boolean>;
  confirm: ReturnType<typeof useConfirm>[0];
}) {
  // The moment this opened, to tell whether the saved time has passed (kept pure across renders).
  const [now] = useState(() => Date.now());
  const until = data.rerollUntil && new Date(data.rerollUntil).getTime() > now ? data.rerollUntil : null;
  const [value, setValue] = useState(() => until ? toZoneInput(until, ZONE) : weekFromNow());
  const real = data.drawn.filter(card => !card.trial);
  const used = real.filter(card => card.roll.reroll).length;
  const save = (rerollUntil: string | null) => run("reroll", async () => {
    const result = await adminRequest<{ cards: AdminCards }>(praWamCardsApi.catalog, { method: "PATCH", body: JSON.stringify({ rerollUntil }) });
    return { message: result.message ?? "Tersimpan.", cards: result.data?.cards };
  });
  async function close() {
    if (!(await confirm({ title: "Tutup re-roll sekarang?", body: "Yang belum memakai jatah re-roll tidak bisa lagi mengganti tokohnya.", confirmLabel: "Tutup re-roll", danger: true }))) return;
    await save(null);
  }
  const iso = fromZoneInput(value, ZONE);
  return <section className={styles.card} aria-labelledby="cc-reroll">
    <div className={styles.head}><h3 id="cc-reroll">Re-roll tokoh</h3></div>
    <p className={styles.muted}>Setiap orang boleh mengganti tokohnya satu kali. Tokoh baru diundi dari tokoh yang belum dipakai di tipe yang sama, dan rarity ikut diundi ulang dengan peluang yang sama. Hasilnya wajib diterima; nomor kartu tetap. {used} dari {real.length} orang sudah memakai re-roll.</p>
    <p><strong>{until ? `Dibuka sampai ${when(until)} WIB.` : "Sedang ditutup."}</strong></p>
    <div className={styles.head}>
      <label>Tutup pada (WIB) <input className="input" type="datetime-local" value={value} onChange={event => setValue(event.target.value)} /></label>
      <Button type="button" disabled={!!busy || !iso} onClick={() => void save(iso || null)}>{until ? "Simpan waktu tutup" : "Buka re-roll"}</Button>
      {until && <Button type="button" variant="secondary" disabled={!!busy} onClick={() => void close()}>Tutup sekarang</Button>}
    </div>
  </section>;
}
