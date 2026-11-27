"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Coffee, Eye, EyeOff, Plus, Search, X } from "lucide-react";
import { errorMessage } from "@/components/admin/shared/api";
import { ConsoleButton, PageHeader } from "@/components/console";
import { DRINK_GROUP_LABEL, MENU_PLACES, PLACE_LABEL, placesWords, showsIn, type DrinkGroup, type MenuPlace } from "@/lib/coffee/menu";
import type { AdminDrink, MenuData } from "@/lib/coffee/types";
import type { CoffeeAdminApi } from "./api";
import { DrinkEditor, DrinkThumb } from "./DrinkEditor";
import { COFFEE_AUDIENCE_MIGRATION_NAME, COFFEE_MENU_MIGRATION_NAME, coffeeAdminSection } from "./sections";
import css from "./coffee-admin.module.css";

type Filter = "semua" | DrinkGroup | MenuPlace | "tanpa-foto" | "tersembunyi";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "semua", label: "Semua" }, { key: "kopi", label: "Kopi" }, { key: "non-kopi", label: "Non-kopi" },
  { key: "guestBook", label: PLACE_LABEL.guestBook }, { key: "regular", label: PLACE_LABEL.regular }, { key: "tanpa-foto", label: "Tanpa foto" }, { key: "tersembunyi", label: "Tersembunyi" },
];
const GROUP = DRINK_GROUP_LABEL;
const fits = (drink: AdminDrink, filter: Filter): boolean =>
  filter === "semua" ? true : filter === "tersembunyi" ? !drink.active : filter === "tanpa-foto" ? !drink.photo : filter === "guestBook" || filter === "regular" ? showsIn(drink, filter) : drink.group === filter;
/** What an empty list says, per filter: [title, advice]. */
const EMPTY: Record<Exclude<Filter, "semua">, [string, string]> = {
  kopi: ["Belum ada minuman Kopi", "Tambah minuman, atau pilih saringan lain."],
  "non-kopi": ["Belum ada minuman Non-kopi", "Tambah minuman, atau pilih saringan lain."],
  guestBook: ["Belum ada minuman di Buku tamu", "Centang Buku tamu pada minuman yang boleh dipilih tamu."],
  regular: ["Belum ada minuman di Menu biasa", "Centang Menu biasa pada minuman yang boleh diklaim karyawan."],
  "tanpa-foto": ["Semua minuman sudah punya foto", "Tidak ada yang perlu dilengkapi."],
  tersembunyi: ["Tidak ada yang disembunyikan", "Semua minuman tampil di menu."],
};
export const temperatureWords = (drink: Pick<AdminDrink, "temperatures">) => drink.temperatures.map(item => item === "es" ? "Es" : "Panas").join(" dan ");

/**
 * Menu (F6): every drink in the order the apps show them, to add, change, order, hide and delete.
 * A row opens its editor in a panel from the side (a sheet on a phone). Order and hide/show are
 * done on the row and show at once; the server is told behind it and the row goes back, with a
 * message, when it refuses. Moving a drink swaps it with its neighbour in the list as it is shown
 * (with a filter on: the next drink of that kind). What is read here is always fresh; the kept
 * copy stays on screen while it is read again, each time the section is opened.
 * `ready` false (migration 202612020001 has not run): the code's menu, to look at only.
 *
 * F7 (27 Nov 2026): every row carries two ticks, "Buku tamu" (the guest menu book on the GA tablet
 * and Tamu lines) and "Menu biasa" (the employee app, Tim · rapat lines and claims). They are
 * changed on the row, show at once, and go back with a message when the server refuses. Sembunyikan
 * stays the switch above both (hidden: nowhere, whatever is ticked). The list is found in by name
 * and by chip (kind, place, without a photo, hidden); the bar with both stays in view while the
 * list scrolls. `places` false (migration 202612030001 has not run): every drink shows in both
 * and the ticks rest.
 */
export function MenuView({ api, initial, active, onSaid }: {
  api: CoffeeAdminApi; initial?: MenuData; active: boolean;
  /** A message for the screen's toast (saved, hidden, deleted, refused). */
  onSaid: (tone: "success" | "error", title: string, body?: string) => void;
}) {
  const section = coffeeAdminSection("menu");
  const titleId = useId();
  const [data, setData] = useState<MenuData | null>(initial ?? null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<Filter>("semua");
  const [query, setQuery] = useState("");
  /** A tick being sent, as "slug:place": a second press waits for the first. */
  const [ticking, setTicking] = useState<ReadonlySet<string>>(() => new Set());
  const [editing, setEditing] = useState<AdminDrink | "new" | null>(null);
  /** Hide/show being sent, by slug: a second press waits for the first. */
  const [flipping, setFlipping] = useState<ReadonlySet<string>>(() => new Set());
  const said = useRef(onSaid);
  useEffect(() => { said.current = onSaid; }, [onSaid]);

  // Read each time the section comes on screen (another pengelola may have changed the menu); the page's own first data is not asked for twice.
  const fresh = useRef(!!initial);
  /** Raised by every change made here: a read that started before it is thrown away (it would undo what the screen shows). */
  const epoch = useRef(0);
  useEffect(() => {
    if (!active) return;
    if (fresh.current) { fresh.current = false; return; }
    let live = true;
    const started = epoch.current;
    api.menu()
      .then(next => { if (live && started === epoch.current) { setData(next); setError(""); } })
      .catch((problem: unknown) => { if (live) setError(errorMessage(problem)); });
    return () => { live = false; };
  }, [api, active, attempt]);

  const drinks = data?.drinks ?? [];
  const count = (key: Filter) => drinks.filter(drink => fits(drink, key)).length;
  const words = query.trim().toLowerCase();
  const shown = drinks.filter(drink => fits(drink, filter) && (!words || drink.name.toLowerCase().includes(words)));
  // Another word or chip while far down the list: the list starts again right under its bar, not somewhere above the screen.
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = panel.current;
    if (element && element.getBoundingClientRect().top < 0) element.scrollIntoView?.({ block: "start" });
  }, [filter, words]);
  const ready = data?.ready ?? false;
  const places = ready && (data?.places ?? false);

  // Order: the list changes at once; the newest order is sent when the one before it has been answered.
  const order = useRef<{ sending: boolean; next: string[] | null; before: AdminDrink[] | null }>({ sending: false, next: null, before: null });
  const sendOrder = async (slugs: string[]) => {
    const state = order.current;
    if (state.sending) { state.next = slugs; return; }
    state.sending = true;
    let wanted: string[] | null = slugs;
    while (wanted) {
      state.next = null;
      try {
        const saved = await api.sortDrinks(wanted);
        // Nothing newer waits: the server's menu is the truth (it also carries what others changed).
        if (!state.next) { state.before = null; setData(saved); }
      } catch (problem) {
        const back = state.before;
        state.next = null; state.before = null;
        if (back) setData(current => current ? { ...current, drinks: back } : current);
        said.current("error", "Urutan belum tersimpan", errorMessage(problem));
      }
      wanted = state.next;
    }
    state.sending = false;
  };
  const move = (drink: AdminDrink, by: -1 | 1) => {
    if (!data || !ready) return;
    const at = shown.findIndex(item => item.slug === drink.slug);
    const other = shown[at + by];
    if (!other) return;
    epoch.current += 1;
    order.current.before ??= data.drinks;
    const next = [...data.drinks];
    const a = next.findIndex(item => item.slug === drink.slug), b = next.findIndex(item => item.slug === other.slug);
    [next[a], next[b]] = [next[b], next[a]];
    setData({ ...data, drinks: next });
    void sendOrder(next.map(item => item.slug));
  };

  const put = (drink: AdminDrink) => setData(current => current ? { ...current, drinks: current.drinks.some(item => item.slug === drink.slug) ? current.drinks.map(item => item.slug === drink.slug ? drink : item) : [...current.drinks, drink] } : current);
  const flip = async (drink: AdminDrink) => {
    if (!ready || flipping.has(drink.slug)) return;
    epoch.current += 1;
    setFlipping(current => new Set(current).add(drink.slug));
    put({ ...drink, active: !drink.active });
    try {
      const saved = await api.showDrink(drink.slug, !drink.active);
      put(saved.drink);
      said.current("success", saved.drink.active ? "Ditampilkan lagi" : "Disembunyikan", saved.drink.active ? `${saved.drink.name} bisa dipesan lagi.` : `${saved.drink.name} tidak bisa dipesan; riwayatnya tetap ada.`);
    } catch (problem) {
      put(drink);
      said.current("error", drink.active ? "Belum bisa disembunyikan" : "Belum bisa ditampilkan", errorMessage(problem));
    }
    setFlipping(current => { const next = new Set(current); next.delete(drink.slug); return next; });
  };

  // A tick: the row changes at once; the server is told behind it, and the row goes back with a message when it refuses.
  const tick = async (drink: AdminDrink, place: MenuPlace) => {
    const mark = `${drink.slug}:${place}`;
    if (!places || ticking.has(mark)) return;
    const on = !showsIn(drink, place);
    epoch.current += 1;
    setTicking(current => new Set(current).add(mark));
    // Only this tick changes on the row: the other one may be on its own way.
    const set = (value: boolean) => setData(current => current ? { ...current, drinks: current.drinks.map(item => item.slug === drink.slug ? { ...item, [place]: value } : item) } : current);
    set(on);
    try {
      const done = await api.placeDrink(drink.slug, place, on);
      set(showsIn(done.drink, place));
      said.current("success", on ? `Masuk ${PLACE_LABEL[place]}` : `Keluar dari ${PLACE_LABEL[place]}`, `${done.drink.name} kini ${placesWords({ ...drink, ...done.drink })}.`);
    } catch (problem) {
      set(!on);
      said.current("error", `${PLACE_LABEL[place]} belum berubah`, errorMessage(problem));
    }
    setTicking(current => { const next = new Set(current); next.delete(mark); return next; });
  };

  const saved = (drink: AdminDrink, message: string) => { epoch.current += 1; put(drink); setEditing(null); said.current("success", message); };
  const removed = (drink: AdminDrink, message: string) => {
    epoch.current += 1;
    setData(current => current ? { ...current, drinks: current.drinks.filter(item => item.slug !== drink.slug) } : current);
    setEditing(null);
    said.current("success", message, `${drink.name} tidak lagi ada di menu.`);
  };

  return (
    <>
      <PageHeader
        title={section.label} subtitle={section.summary}
        actions={ready ? <ConsoleButton variant="primary" className={`${css.tall} ${css.onPrimary}`} icon={<Plus size={18} aria-hidden />} onClick={() => setEditing("new")}>Tambah minuman</ConsoleButton> : undefined}
      />
      {error && (
        <div className={css.banner} data-tone={data ? undefined : "no"} role={data ? "status" : "alert"}>
          <span>{data ? "Menu belum bisa diperbarui. Yang tampil mungkin sudah berubah." : `Menu belum bisa dimuat. ${error}`}</span>
          <button type="button" className={css.textButton} onClick={() => { setError(""); setAttempt(value => value + 1); }}>Coba lagi</button>
        </div>
      )}
      {data && !ready && (
        <div className={css.banner} role="status">
          <span>Menunggu migrasi {COFFEE_MENU_MIGRATION_NAME}. Sampai dijalankan, menu memakai 15 minuman bawaan dan belum bisa diubah.</span>
        </div>
      )}

      {data && ready && !data.places && (
        <div className={css.banner} role="status">
          <span>Menunggu migrasi {COFFEE_AUDIENCE_MIGRATION_NAME}. Sampai dijalankan, semua minuman tampil di Buku tamu dan Menu biasa, dan centangnya belum bisa diubah.</span>
        </div>
      )}

      <section ref={panel} className={`${css.panel} ${css.menuPanel}`} aria-labelledby={titleId} aria-busy={!data && !error}>
        <div className={css.menuHead}>
          <div className={css.menuTitle}>
            <h2 id={titleId}>Daftar minuman</h2>
            <p className={css.small} aria-live="polite">{!data ? "" : shown.length === drinks.length ? `${drinks.length} minuman` : `${shown.length} dari ${drinks.length} minuman`}</p>
          </div>
          <div className={css.menuSearch}>
            <label className={css.srOnly} htmlFor={`${titleId}-cari`}>Cari minuman</label>
            <Search size={18} aria-hidden />
            <input id={`${titleId}-cari`} type="search" value={query} maxLength={60} placeholder="Cari nama minuman" autoComplete="off" spellCheck={false} enterKeyHint="search" onChange={event => setQuery(event.target.value)} />
            {query && <button type="button" className={css.iconButton} aria-label="Hapus pencarian" onClick={() => setQuery("")}><X size={18} aria-hidden /></button>}
          </div>
          <div className={`${css.chips} ${css.menuChips}`} role="group" aria-label="Saring minuman">
            {FILTERS.map(item => (
              <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
                {item.label}<span className={css.chipCount}>{data ? count(item.key) : "–"}</span>
              </button>
            ))}
          </div>
        </div>

        {!data && !error && <span className={css.skeleton} style={{ height: 320 }} />}
        {data && shown.length === 0 && (
          <div className={css.empty}>
            <Coffee size={32} aria-hidden />
            <h2>{drinks.length === 0 ? "Menu masih kosong" : words ? `Tidak ada minuman bernama “${query.trim()}”` : filter === "semua" ? "Menu masih kosong" : EMPTY[filter][0]}</h2>
            <p>{drinks.length === 0 ? "Tambah minuman pertama supaya bisa dipesan." : words ? (filter === "semua" ? "Periksa ejaannya, atau hapus pencarian." : "Periksa ejaannya, atau pilih saringan Semua.") : filter === "semua" ? "" : EMPTY[filter][1]}</p>
            {words
              ? <button type="button" className={css.secondary} onClick={() => { setQuery(""); setFilter("semua"); }}>Tampilkan semua minuman</button>
              : ready && (filter === "semua" || filter === "kopi" || filter === "non-kopi") && <button type="button" className={css.secondary} onClick={() => setEditing("new")}><Plus size={18} aria-hidden />Tambah minuman</button>}
          </div>
        )}
        {shown.length > 0 && (
          <ol className={css.menuList}>
            {shown.map((drink, index) => (
              <li key={drink.slug} data-hidden={drink.active ? undefined : "true"}>
                <button type="button" className={css.menuMain} onClick={() => setEditing(drink)} disabled={!ready} aria-label={`Ubah ${drink.name}`}>
                  <DrinkThumb src={drink.photo} size={56} group={drink.group} />
                  <span className={css.menuText}>
                    <strong>{drink.name}</strong>
                    {drink.description && <span>{drink.description}</span>}
                    <span className={css.menuMeta}>{GROUP[drink.group]} · {temperatureWords(drink)}{drink.orders ? ` · ${drink.orders} pesanan` : ""}</span>
                  </span>
                </button>
                <span className={css.menuSide}>
                  <span className={css.ticks} role="group" aria-label={`Tampil di mana: ${drink.name}`}>
                    {MENU_PLACES.map(place => (
                      <label key={place} className={css.tick} data-rests={places ? undefined : "true"}>
                        <input type="checkbox" checked={showsIn(drink, place)} disabled={!places} aria-label={`${PLACE_LABEL[place]}: ${drink.name}`}
                          aria-busy={ticking.has(`${drink.slug}:${place}`) || undefined} onChange={() => void tick(drink, place)} />
                        <span aria-hidden>{PLACE_LABEL[place]}</span>
                      </label>
                    ))}
                  </span>
                  <span className={css.pill} data-tone={!drink.active ? "off" : showsIn(drink, "guestBook") || showsIn(drink, "regular") ? "ok" : "wait"}>
                    {!drink.active ? "Tersembunyi" : showsIn(drink, "guestBook") || showsIn(drink, "regular") ? "Tampil" : "Tanpa menu"}
                  </span>
                  {ready && (
                    <span className={css.menuActions}>
                      <button type="button" className={css.iconButton} aria-label={`Naikkan ${drink.name}`} disabled={index === 0} onClick={() => move(drink, -1)}><ArrowUp size={18} aria-hidden /></button>
                      <button type="button" className={css.iconButton} aria-label={`Turunkan ${drink.name}`} disabled={index === shown.length - 1} onClick={() => move(drink, 1)}><ArrowDown size={18} aria-hidden /></button>
                      <button type="button" className={css.iconButton} aria-label={drink.active ? `Sembunyikan ${drink.name}` : `Tampilkan ${drink.name}`} aria-disabled={flipping.has(drink.slug) || undefined} onClick={() => void flip(drink)}>
                        {drink.active ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                      </button>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
        {data && drinks.length > 0 && (
          <div className={css.menuNotes}>
            <p className={css.small}><strong>Buku tamu</strong>: tampil di buku menu tamu (tablet GA) dan bisa dipesankan untuk Tamu. <strong>Menu biasa</strong>: tampil di aplikasi karyawan dan bisa dipesankan untuk Tim · rapat.</p>
            <p className={css.small}><strong>Sembunyikan</strong> mematikan minuman di semua tempat tanpa mengubah centangnya (untuk yang sedang habis). Minuman tanpa centang juga tidak tampil di mana pun. Keduanya tetap ada di riwayat dan rekap.</p>
            <p className={css.small}>Urutan di sini adalah urutan di aplikasi karyawan, tablet GA, dan buku menu tamu.</p>
          </div>
        )}
      </section>

      {editing && <DrinkEditor api={api} places={places} drink={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={saved} onRemoved={removed} />}
    </>
  );
}
