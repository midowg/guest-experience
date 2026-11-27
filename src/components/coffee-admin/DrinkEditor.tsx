"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Check, Coffee, ImagePlus, Trash2, X } from "lucide-react";
import { errorMessage } from "@/components/admin/shared/api";
import { DRINK_GROUPS, DRINK_GROUP_LABEL, MENU_PLACES, PLACE_LABEL, type DrinkGroup, type MenuPlace, type Temperature } from "@/lib/coffee/menu";
import { priceText, readPrice, typedPrice } from "@/lib/coffee/money";
import type { AdminDrink } from "@/lib/coffee/types";
import { fieldErrorsOf, type CoffeeAdminApi, type DrinkBody } from "./api";
import { Layer } from "./Layer";
import { COFFEE_PRICE_MIGRATION_NAME } from "./sections";
import css from "./coffee-admin.module.css";

/**
 * The drink's photo in the list and the editor: square. A drink without one (or whose file does
 * not load) gets a cup on its kind's tint instead, never a broken image. Decorative either way:
 * the name is always written next to it.
 */
export function DrinkThumb({ src, size, group }: { src: string | null; size: number; group?: DrinkGroup }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return <span className={css.menuThumb} data-empty data-group={group} style={{ width: size, height: size }} aria-hidden><Coffee size={Math.round(size / 2.4)} /></span>;
  // eslint-disable-next-line @next/next/no-img-element -- a small square photo of the menu (a static file, the pengelola's upload, or a local preview)
  return <img className={css.menuThumb} style={{ width: size, height: size }} src={src} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(src)} />;
}

/** What the photo field takes; the server checks the file's first bytes, the size and crops it. */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_HELP = "JPG, PNG, atau WebP, paling besar 5 MB. Dipotong persegi di tengah.";

/**
 * Tambah / Ubah minuman: a panel from the side (a sheet from the bottom on a phone). The name,
 * what the drink is, Kopi or Non-kopi, whether it comes hot, iced or both, whether it shows in the
 * menu, and its photo (previewed here at once, sent after the drink itself is saved). Every field
 * says what is wrong under itself; closing with something typed asks first.
 * Hapus is only offered for a drink no order ever used; one that was ordered can only be hidden,
 * and the panel says so. Both ask before they act.
 * F7: "Masuk menu mana" holds the two ticks, Buku tamu and Menu biasa (a new drink starts in both).
 * `places` false: migration 202612030001 has not run, so both stay on and rest.
 * F9: "Harga satuan (Rp)" holds the drink's price, the base of the expense recap. It is typed with
 * thousand separators ("8000" becomes "8.000" as the digits come in), empty means "belum diisi",
 * and a negative or a decimal is refused under the field. `prices` false: migration 202612050001
 * has not run, so the field rests (and the price is not sent).
 */
export function DrinkEditor({ api, drink, places = true, prices = true, onClose, onSaved, onRemoved }: {
  api: CoffeeAdminApi; drink: AdminDrink | null; places?: boolean; prices?: boolean; onClose: () => void; onSaved: (drink: AdminDrink, message: string) => void; onRemoved: (drink: AdminDrink, message: string) => void;
}) {
  const titleId = useId(), uid = useId();
  const [name, setName] = useState(drink?.name ?? "");
  const [description, setDescription] = useState(drink?.description ?? "");
  const [group, setGroup] = useState<DrinkGroup>(drink?.group ?? "kopi");
  const [temperatures, setTemperatures] = useState<Temperature[]>(drink?.temperatures ?? ["panas", "es"]);
  const [active, setActive] = useState(drink?.active ?? true);
  const [shows, setShows] = useState<Record<MenuPlace, boolean>>({ guestBook: drink?.guestBook ?? true, regular: drink?.regular ?? true });
  const [price, setPrice] = useState(() => priceText(drink?.price));
  const priceInput = useRef<HTMLInputElement>(null);
  /** How many digits stood left of the caret when a key was pressed: the caret goes back after the digits are regrouped. */
  const caret = useRef<number | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "photo" | "delete">("");
  const [failure, setFailure] = useState("");
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({});
  const [asking, setAsking] = useState<"" | "discard" | "delete">("");
  /** The drink as the server has it by now: after a save whose photo then failed, the next try only sends what is still missing. */
  const [kept, setKept] = useState<AdminDrink | null>(drink);
  const file = useRef<HTMLInputElement>(null);

  // The preview is a local address of the chosen file; it is let go when another is chosen or the panel closes.
  useEffect(() => {
    if (!photo || typeof URL.createObjectURL !== "function") return;
    const address = URL.createObjectURL(photo);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address exists only once the browser has made it
    setPreview(address);
    return () => { URL.revokeObjectURL?.(address); };
  }, [photo]);

  useLayoutEffect(() => {
    const input = priceInput.current;
    if (caret.current === null || !input) return;
    let digits = caret.current, at = 0;
    while (at < input.value.length && digits > 0) { if (/\d/.test(input.value[at])) digits--; at++; }
    caret.current = null;
    input.setSelectionRange?.(at, at);
  }, [price]);
  const typePrice = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    caret.current = raw.slice(0, event.target.selectionStart ?? raw.length).replace(/\D/g, "").length;
    setServerErrors(current => ({ ...current, price: [] }));
    setPrice(typedPrice(raw, price));
  };

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!chosen) return;
    setServerErrors(current => ({ ...current, photo: [] }));
    if (!PHOTO_TYPES.includes(chosen.type)) { setPhotoError("Format foto tidak dikenali. Pakai JPG, PNG, atau WebP."); return; }
    if (chosen.size > PHOTO_MAX_BYTES) { setPhotoError("Ukuran foto paling besar 5 MB. Pilih yang lebih kecil."); return; }
    setPhotoError("");
    setPhoto(chosen);
  };

  const priceRead = readPrice(price);
  const errors = {
    name: !name.trim() ? "Tulis nama minumannya." : name.trim().length > 60 ? "Nama paling panjang 60 huruf." : "",
    description: description.trim().length > 200 ? "Keterangan paling panjang 200 huruf." : "",
    temperatures: temperatures.length === 0 ? "Pilih Panas, Es, atau keduanya." : "",
    price: prices && !priceRead.ok ? priceRead.message : "",
  };
  // A refused price is said at once (it is a typing mistake, not a missing answer); the others wait for the first Simpan.
  const shown = (key: keyof typeof errors) => (tried || (key === "price" && price !== priceText(base?.price)) ? errors[key] : "") || serverErrors[key]?.[0] || "";
  const invalid = Object.values(errors).some(Boolean);
  const base = kept ?? drink;
  const wantedPrice = priceRead.ok ? priceRead.value : undefined;
  const touched = !!photo || (prices && price !== priceText(base?.price)) || name !== (base?.name ?? "") || description !== (base?.description ?? "") || group !== (base?.group ?? "kopi")
    || active !== (base?.active ?? true) || shows.guestBook !== (base?.guestBook ?? true) || shows.regular !== (base?.regular ?? true) || temperatures.join() !== (base?.temperatures ?? ["panas", "es"]).join();
  const requestClose = () => {
    if (busy) return;
    if (touched) setAsking("discard");
    else onClose();
  };
  const toggle = (item: Temperature) => setTemperatures(current => (["panas", "es"] as Temperature[]).filter(value => value === item ? !current.includes(item) : current.includes(value)));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true); setFailure("");
    if (invalid || busy) return;
    setServerErrors({});
    const body: DrinkBody = { name: name.trim(), description: description.trim(), group, temperatures, active, guestBook: shows.guestBook, regular: shows.regular, ...(prices && wantedPrice !== undefined && wantedPrice !== (kept?.price ?? null) ? { price: wantedPrice } : {}) };
    let saved = kept;
    let message = "";
    try {
      // The drink first (a new one needs its slug before a photo can belong to it), then the photo.
      const changed = !saved || saved.name !== body.name || saved.description !== body.description || saved.group !== group || saved.active !== active || (saved.guestBook ?? true) !== shows.guestBook || (saved.regular ?? true) !== shows.regular || saved.temperatures.join() !== temperatures.join()
        || (prices && wantedPrice !== undefined && (saved.price ?? null) !== wantedPrice);
      if (changed) {
        setBusy("save");
        const done = saved ? await api.updateDrink(saved.slug, body) : await api.createDrink(body);
        saved = done.drink; message = done.message;
        setKept(saved);
      }
      if (photo && saved) {
        setBusy("photo");
        const done = await api.uploadDrinkPhoto(saved.slug, photo);
        saved = done.drink; message = message || done.message;
        setPhoto(null);
      }
      if (saved) onSaved(saved, message || `${saved.name} disimpan.`);
    } catch (problem) {
      const fields = fieldErrorsOf(problem);
      setServerErrors(fields);
      // The drink itself is saved by now when only the photo failed: say so, and keep the panel for another try.
      setFailure(saved && saved !== drink && photo ? `${saved.name} sudah tersimpan, tetapi fotonya belum. ${fields.photo?.[0] ?? errorMessage(problem)}` : errorMessage(problem));
      setBusy("");
    }
  };

  const remove = async () => {
    const target = kept ?? drink;
    if (!target || busy) return;
    setAsking(""); setBusy("delete"); setFailure("");
    try {
      const done = await api.deleteDrink(target.slug);
      onRemoved(target, done.message);
    } catch (problem) {
      setFailure(errorMessage(problem));
      setBusy("");
    }
  };

  const existing = kept ?? drink;
  const used = existing?.orders ?? 0;
  const picture = preview ?? existing?.photo ?? null;
  const pictureError = photoError || serverErrors.photo?.[0] || "";
  return (
    <Layer onClose={requestClose} labelledBy={titleId} side>
      <form className={css.sheetForm} onSubmit={event => void save(event)} noValidate>
        <div className={css.sheetHead}>
          <div>
            <h2 id={titleId}>{existing ? `Ubah ${existing.name}` : "Tambah minuman"}</h2>
            <p className={css.muted}>{existing ? "Pesanan yang sudah ada tetap memakai nama saat dipesan." : "Langsung tampil di menu setelah disimpan, kecuali disembunyikan."}</p>
          </div>
          <button type="button" className={css.iconButton} aria-label="Tutup" onClick={requestClose}><X size={20} aria-hidden /></button>
        </div>
        <div className={css.sheetBody}>
          <div className={css.photoField}>
            <DrinkThumb src={picture} size={96} group={group} />
            <div className={css.photoText}>
              <span className={css.photoLabel} id={`${uid}-photo-label`}>Foto</span>
              <input ref={file} id={`${uid}-photo`} className={css.srOnly} type="file" accept={PHOTO_TYPES.join(",")} onChange={pick} tabIndex={-1} aria-hidden />
              <button type="button" className={css.secondary} disabled={!!busy} aria-describedby={`${uid}-photo-help`} onClick={() => file.current?.click()}>
                <ImagePlus size={18} aria-hidden />{picture ? "Ganti foto" : "Pilih foto"}
              </button>
              <p id={`${uid}-photo-help`} className={pictureError ? css.error : css.small} role={pictureError ? "alert" : undefined}>
                {pictureError || (photo ? `${photo.name} dipilih. Tersimpan bersama minumannya.` : PHOTO_HELP)}
              </p>
            </div>
          </div>

          <div className={css.field}>
            <label htmlFor={`${uid}-name`}>Nama</label>
            <input id={`${uid}-name`} value={name} maxLength={60} placeholder="mis. Teh Tarik" autoComplete="off" data-autofocus onChange={event => setName(event.target.value)}
              aria-invalid={!!shown("name")} aria-describedby={shown("name") ? `${uid}-name-error` : undefined} />
            {shown("name") && <p id={`${uid}-name-error`} className={css.error}>{shown("name")}</p>}
          </div>
          <div className={css.field}>
            <label htmlFor={`${uid}-description`}>Keterangan <span className={css.optional}>(opsional)</span></label>
            <textarea id={`${uid}-description`} rows={2} value={description} maxLength={200} placeholder="Satu kalimat tentang rasanya" onChange={event => setDescription(event.target.value)}
              aria-invalid={!!shown("description")} aria-describedby={shown("description") ? `${uid}-description-error` : undefined} />
            {shown("description") && <p id={`${uid}-description-error`} className={css.error}>{shown("description")}</p>}
          </div>

          <fieldset className={css.fieldset}>
            <legend>Kelompok</legend>
            <div className={css.segmented}>
              {DRINK_GROUPS.map(item => (
                <label key={item} data-checked={group === item ? "true" : undefined}>
                  <input type="radio" name={`${uid}-group`} checked={group === item} onChange={() => setGroup(item)} />
                  {DRINK_GROUP_LABEL[item]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className={css.fieldset} aria-describedby={shown("temperatures") ? `${uid}-temp-error` : `${uid}-temp-help`}>
            <legend>Tersedia</legend>
            <div className={css.chips}>
              {(["panas", "es"] as Temperature[]).map(item => (
                <label key={item} data-checked={temperatures.includes(item) ? "true" : undefined}>
                  <input type="checkbox" checked={temperatures.includes(item)} onChange={() => toggle(item)} />{item === "panas" ? "Panas" : "Es"}
                </label>
              ))}
            </div>
            {shown("temperatures")
              ? <p id={`${uid}-temp-error`} className={css.error}>{shown("temperatures")}</p>
              : <p id={`${uid}-temp-help`} className={css.small}>Suhu yang bisa dipilih bila opsi Suhu ditanyakan.</p>}
          </fieldset>

          <div className={css.field}>
            <label htmlFor={`${uid}-price`}>Harga satuan (Rp)</label>
            <div className={css.priceBox} data-rests={prices ? undefined : "true"}>
              <span className={css.pricePrefix} aria-hidden>Rp</span>
              <input ref={priceInput} id={`${uid}-price`} value={prices ? price : ""} inputMode="numeric" autoComplete="off" placeholder="mis. 8.000" disabled={!prices} maxLength={14}
                onChange={typePrice} onBlur={() => { if (priceRead.ok) setPrice(priceText(priceRead.value)); }}
                aria-invalid={!!shown("price")} aria-describedby={`${uid}-price-help`} />
            </div>
            {shown("price")
              ? <p id={`${uid}-price-help`} className={css.error} role="alert">{shown("price")}</p>
              : <p id={`${uid}-price-help`} className={css.small}>{prices ? "Dipakai untuk rekap pengeluaran. Harga pesanan yang sudah masuk tidak berubah. Kosongkan bila belum tahu." : `Menunggu migrasi ${COFFEE_PRICE_MIGRATION_NAME}. Sampai dijalankan, harga belum bisa diisi.`}</p>}
          </div>

          <fieldset className={css.fieldset} disabled={!places} aria-describedby={`${uid}-places-help`}>
            <legend>Masuk menu mana</legend>
            <div className={css.placeRows}>
              {MENU_PLACES.map(place => (
                <label key={place} className={css.placeRow} data-rests={places ? undefined : "true"}>
                  <input type="checkbox" checked={shows[place]} onChange={() => setShows(current => ({ ...current, [place]: !current[place] }))} />
                  <span><strong>{PLACE_LABEL[place]}</strong><small>{place === "guestBook" ? "Buku menu tamu di tablet GA, dan pesanan untuk Tamu." : "Aplikasi karyawan, dan pesanan untuk Tim · rapat."}</small></span>
                </label>
              ))}
            </div>
            <p id={`${uid}-places-help`} className={css.small}>
              {!places ? "Menunggu migrasi: sampai dijalankan, semua minuman tampil di keduanya."
                : !shows.guestBook && !shows.regular ? "Tanpa centang, minuman ini tidak tampil di mana pun. Riwayatnya tetap ada."
                : "Minuman hanya bisa dipesan dari tempat yang dicentang. Sembunyikan (di bawah) mematikannya di semua tempat."}
            </p>
          </fieldset>

          <label className={`${css.switchRow} ${css.switchRowTop}`}>
            <span>Tampil di menu<small>{active ? "Bisa dipesan." : "Tersembunyi: tidak bisa dipesan, riwayatnya tetap ada."}</small></span>
            <input type="checkbox" role="switch" checked={active} onChange={() => setActive(value => !value)} />
            <span className={css.switch} aria-hidden />
          </label>

          {existing && (
            <div className={css.dangerZone}>
              {used > 0
                ? <p className={css.small}>Sudah dipesan {used} kali, jadi tidak bisa dihapus (riwayat dan rekap memakainya). Sembunyikan saja supaya tidak bisa dipesan lagi.</p>
                : <>
                  <p className={css.small}>Belum pernah dipesan, jadi boleh dihapus.</p>
                  <button type="button" className={css.dangerText} disabled={!!busy} onClick={() => setAsking("delete")}><Trash2 size={18} aria-hidden />{busy === "delete" ? "Menghapus…" : "Hapus minuman"}</button>
                </>}
            </div>
          )}
          {failure && <div className={css.banner} data-tone="no" role="alert"><span>{failure}</span></div>}
        </div>
        <div className={css.sheetFoot}>
          <p className={css.small} role="status">{busy === "save" ? "Menyimpan minuman…" : busy === "photo" ? "Mengunggah foto…" : busy === "delete" ? "Menghapus…" : existing?.updatedLabel ? `Terakhir diubah ${existing.updatedLabel}` : ""}</p>
          <button type="button" className={css.secondary} disabled={!!busy} onClick={requestClose}>Batal</button>
          <button type="submit" className={css.primary} disabled={!!busy} aria-disabled={tried && invalid ? true : undefined}>
            <Check size={18} aria-hidden />{busy === "save" || busy === "photo" ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </form>
      {asking === "discard" && (
        <Layer onClose={() => setAsking("")} labelledBy={`${uid}-discard`}>
          <div className={css.dialogHead}><h2 id={`${uid}-discard`}>Buang perubahan?</h2></div>
          <p className={css.muted}>Yang sudah diisi belum tersimpan dan akan hilang.</p>
          <div className={css.dialogActions}>
            <button type="button" className={css.secondary} data-autofocus onClick={() => setAsking("")}>Lanjut mengisi</button>
            <button type="button" className={css.danger} onClick={onClose}>Buang perubahan</button>
          </div>
        </Layer>
      )}
      {asking === "delete" && existing && (
        <Layer onClose={() => setAsking("")} labelledBy={`${uid}-delete`}>
          <div className={css.dialogHead}><h2 id={`${uid}-delete`}>Hapus {existing.name}?</h2></div>
          <p className={css.muted}>Minuman ini hilang dari menu dan tidak bisa dikembalikan. Fotonya ikut dihapus.</p>
          <div className={css.dialogActions}>
            <button type="button" className={css.secondary} data-autofocus onClick={() => setAsking("")}>Kembali</button>
            <button type="button" className={css.danger} onClick={() => void remove()}>Hapus minuman</button>
          </div>
        </Layer>
      )}
    </Layer>
  );
}
