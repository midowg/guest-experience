"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Coffee, Eye, EyeOff, Plus } from "lucide-react";
import { errorMessage } from "@/components/admin/shared/api";
import { ConsoleButton, PageHeader } from "@/components/console";
import type { DrinkGroup } from "@/lib/coffee/menu";
import type { AdminDrink, MenuData } from "@/lib/coffee/types";
import type { CoffeeAdminApi } from "./api";
import { DrinkEditor, DrinkThumb } from "./DrinkEditor";
import { COFFEE_MENU_MIGRATION_NAME, coffeeAdminSection } from "./sections";
import css from "./coffee-admin.module.css";

type Filter = "semua" | DrinkGroup | "tersembunyi";
const FILTERS: { key: Filter; label: string }[] = [{ key: "semua", label: "Semua" }, { key: "kopi", label: "Kopi" }, { key: "non-kopi", label: "Non-kopi" }, { key: "tersembunyi", label: "Tersembunyi" }];
const GROUP: Record<DrinkGroup, string> = { kopi: "Kopi", "non-kopi": "Non-kopi" };
export const temperatureWords = (drink: Pick<AdminDrink, "temperatures">) => drink.temperatures.map(item => item === "es" ? "Es" : "Panas").join(" dan ");

/**
 * Menu (F6): every drink in the order the apps show them, to add, change, order, hide and delete.
 * A row opens its editor in a panel from the side (a sheet on a phone). Order and hide/show are
 * done on the row and show at once; the server is told behind it and the row goes back, with a
 * message, when it refuses. Moving a drink swaps it with its neighbour in the list as it is shown
 * (with a filter on: the next drink of that kind). What is read here is always fresh; the kept
 * copy stays on screen while it is read again, each time the section is opened.
 * `ready` false (migration 202612020001 has not run): the code's menu, to look at only.
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
  const counts: Record<Filter, number> = {
    semua: drinks.length, kopi: drinks.filter(drink => drink.group === "kopi").length, "non-kopi": drinks.filter(drink => drink.group === "non-kopi").length,
    tersembunyi: drinks.filter(drink => !drink.active).length,
  };
  const shown = drinks.filter(drink => filter === "semua" ? true : filter === "tersembunyi" ? !drink.active : drink.group === filter);
  const ready = data?.ready ?? false;

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

      <section className={css.panel} aria-labelledby={titleId} aria-busy={!data && !error}>
        <div className={css.menuHead}>
          <h2 id={titleId}>Daftar minuman</h2>
          <div className={css.chips} role="group" aria-label="Saring minuman">
            {FILTERS.map(item => (
              <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
                {item.label}<span className={css.chipCount}>{data ? counts[item.key] : "–"}</span>
              </button>
            ))}
          </div>
        </div>

        {!data && !error && <span className={css.skeleton} style={{ height: 320 }} />}
        {data && shown.length === 0 && (
          <div className={css.empty}>
            <Coffee size={32} aria-hidden />
            <h2>{drinks.length === 0 ? "Menu masih kosong" : filter === "tersembunyi" ? "Tidak ada yang disembunyikan" : `Belum ada minuman ${GROUP[filter as DrinkGroup] ?? ""}`.trim()}</h2>
            <p>{drinks.length === 0 ? "Tambah minuman pertama supaya bisa dipesan." : filter === "tersembunyi" ? "Semua minuman tampil di menu." : "Tambah minuman, atau pilih saringan lain."}</p>
            {ready && filter !== "tersembunyi" && <button type="button" className={css.secondary} onClick={() => setEditing("new")}><Plus size={18} aria-hidden />Tambah minuman</button>}
          </div>
        )}
        {shown.length > 0 && (
          <ol className={css.menuList}>
            {shown.map((drink, index) => (
              <li key={drink.slug} data-hidden={drink.active ? undefined : "true"}>
                <button type="button" className={css.menuMain} onClick={() => setEditing(drink)} disabled={!ready} aria-label={`Ubah ${drink.name}`}>
                  <DrinkThumb src={drink.photo} size={56} />
                  <span className={css.menuText}>
                    <strong>{drink.name}</strong>
                    {drink.description && <span>{drink.description}</span>}
                    <span className={css.menuMeta}>{GROUP[drink.group]} · {temperatureWords(drink)}{drink.orders ? ` · ${drink.orders} pesanan` : ""}</span>
                  </span>
                </button>
                <span className={css.menuSide}>
                  <span className={css.pill} data-tone={drink.active ? "ok" : "off"}>{drink.active ? "Tampil" : "Tersembunyi"}</span>
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
          <p className={css.small} style={{ marginTop: 12 }}>
            Urutan di sini adalah urutan di aplikasi karyawan, tablet GA, dan buku menu tamu. Minuman tersembunyi tidak bisa dipesan, tetapi tetap ada di riwayat dan rekap.
          </p>
        )}
      </section>

      {editing && <DrinkEditor api={api} drink={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={saved} onRemoved={removed} />}
    </>
  );
}
