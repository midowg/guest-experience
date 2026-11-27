import { AdminApiError } from "@/components/admin/shared/api";
import { firstName } from "@/lib/coffee/access";
import { claim, item, meeting, person } from "@/lib/coffee/fixtures";
import { DEFAULT_OPTIONS, DRINKS, LEGACY_OPTIONS, MACHINE_MENU, MONTHLY_QUOTA, OTHER_DRINK, drinkIn, drinkLabel, placesWords, type CoffeeOptions, type Drink } from "@/lib/coffee/menu";
import { claimNumbers, countsForQuota, previousMonth, wibDay, wibMonth } from "@/lib/coffee/quota";
import { expandRows, filterRows, recapTitle, summarize } from "@/lib/coffee/recap";
import { roomSpot } from "@/lib/coffee/rooms";
import { drinkSchema, isDrinkIssue, manualAt, settleLine, slugOf } from "@/lib/coffee/schemas";
import { KIND_LABEL, orderNo, type AdminDrink, type CoffeePerson, type CoffeeSettings, type MenuData, type QueueOrder, type QueueState } from "@/lib/coffee/types";
import { coffeeAdminClient, type CoffeeAdminApi, type CoffeeHolder } from "./api";
import { UNDO_MS } from "./format";

/*
 * A make-believe server for the pengelola's screens: the same answers and refusals as the F0 APIs
 * (409 when someone else processed the order, 409 when the quota is full, the Urungkan window; a
 * drink that was ordered cannot be deleted, a photo must be a JPEG, PNG or WebP of 5 MB at most),
 * kept in memory. Used by the preview (/dev-preview/coffee/nyata/admin) and by the tests, so the
 * real components can be looked at and exercised before the migration runs. Every name is made up
 * and says so ("Rina Putri (contoh)": the first name stays in front, as the short lines show it).
 */

const P = (id: string, name: string, group: "karyawan" | "ga" | "intern", position: string, bu: string) => person(id, `${name} (contoh)`, group, bu, position);
export const SAMPLE_PEOPLE = [
  P("p-rina", "Rina Putri", "karyawan", "Communications Specialist", "WNS"),
  P("p-maya", "Maya Lestari", "karyawan", "Account Executive", "TEE"),
  P("p-arief", "Arief Hidayat", "karyawan", "Finance Staff", "WNS"),
  P("p-dimas", "Dimas Pratama", "karyawan", "Business Development", "TEE"),
  P("p-sari", "Sari Wulandari", "karyawan", "Project Manager", "WNS"),
  P("p-yoga", "Yoga Firmansyah", "karyawan", "Creative Lead", "CoE"),
  P("p-dewi", "Dewi Lestari", "karyawan", "HR Officer", "Holding"),
  P("p-raka", "Raka Aditya", "karyawan", "IT Support", "Holding"),
  P("p-bagas", "Bagas Saputra", "ga", "General Affair", "WNS"),
  P("p-fajar", "Fajar Nugroho", "intern", "Design Intern", "CoE"),
];
const HOLDERS: CoffeeHolder[] = [{ id: "p-dewi", name: "Dewi Lestari (contoh)", position: "HR Officer" }, { id: "p-raka", name: "Raka Aditya (contoh)", position: "IT Support" }];
/** Who the viewer is in the make-believe: the label and id of "diproses oleh". */
export const SAMPLE_ACTOR = { employeeId: "p-dewi", label: "Dewi", name: "Dewi Lestari (contoh)" };
const OTHER_ACTOR = { employeeId: "p-raka", label: "Raka" };

const refusal = (status: number, message: string, fieldErrors?: Record<string, string[]>) => new AdminApiError(message, fieldErrors, status);
/** A meeting order sent by the make-believe GA. */
const meet: typeof meeting = (id, number, pic, items, more = {}) => meeting(id, number, pic, items, { sentBy: "Bagas (contoh)", guest: "", guestCount: null, ...more });
const byId = new Map(SAMPLE_PEOPLE.map(who => [who.id, who]));

export type SampleServer = ReturnType<typeof createSampleServer>;

const MENU_WAITS = "Fitur ini menunggu migrasi 202612020001_coffee_menu.sql.";
const PLACES_WAIT = "Pilihan Buku tamu dan Menu biasa menunggu migrasi 202612030003_coffee_menu_audience.sql.";
export type SampleMenu = "ready" | "waiting" | "empty" | "places-waiting" | "many";
const PHOTO_KINDS = ["image/jpeg", "image/png", "image/webp"];

/**
 * `clock`: the make-believe server's time (the tests hold it still). `menu`: "waiting" plays the
 * database before migration 202612020001 (the code's menu, read only, every option asked);
 * "empty" a menu with no drinks yet; "places-waiting" the database before migration 202612030001
 * (every drink in both menus, the two ticks cannot be saved); "many" a long menu (the 15 and 48
 * made-up drinks without photos) to try the search and the filters on.
 * With the menu ready, the drinks carry the owner's starting ticks (MACHINE_MENU).
 */
export function createSampleServer(clock: () => number = Date.now, { menu: menuState = "ready" }: { menu?: SampleMenu } = {}) {
  const menuReady = menuState !== "waiting";
  const placesReady = menuReady && menuState !== "places-waiting";
  const iso = (msAgo: number) => new Date(clock() - msAgo).toISOString();
  const minute = 60_000, day = 86_400_000;
  let settings: CoffeeSettings = { ...MONTHLY_QUOTA };
  /** What each audience is asked with a drink, at the real defaults, and the menu (the code's 15 drinks). */
  let options: CoffeeOptions = menuReady ? { klaim: { ...DEFAULT_OPTIONS.klaim }, tim: { ...DEFAULT_OPTIONS.tim }, tamu: { ...DEFAULT_OPTIONS.tamu } } : { klaim: { ...LEGACY_OPTIONS.klaim }, tim: { ...LEGACY_OPTIONS.tim }, tamu: { ...LEGACY_OPTIONS.tamu } };
  const menu: Drink[] = menuState === "empty" ? [] : (placesReady ? MACHINE_MENU : DRINKS).map(drink => ({ ...drink }));
  if (menuState === "many") for (let n = 1; n <= 48; n++) menu.push({ slug: `contoh-minuman-${n}`, name: `Contoh Minuman ${n}`, description: "", group: n % 3 ? "kopi" : "non-kopi", temperatures: ["panas", "es"], photo: null, active: true, guestBook: n % 4 === 0, regular: true });
  /** Which drinks carry an uploaded photo, and who changed a drink last. */
  const uploaded = new Set<string>();
  const changed = new Map<string, { at: string; label: string }>();
  /** An order's drinks as the server sends them: the name kept with the order, the photo of today's menu. */
  const dressed = (order: QueueOrder): QueueOrder => ({ ...order, items: order.items.map(line => line.slug === OTHER_DRINK ? line : { ...line, name: line.name ?? drinkIn(menu, line.slug)?.name ?? line.slug, photo: drinkIn(menu, line.slug)?.photo ?? null }) });
  const drinkSettings = () => ({ options, optionsReady: menuReady, menu: menu.map(drink => ({ ...drink })) });
  /** Whether a PIN GA is set (the make-believe keeps no PIN at all). */
  let gaPin = false;
  let claimSeq = 418, meetingSeq = 113, idSeq = 1;
  const nextId = () => `s-${idSeq++}`;
  const done = (order: QueueOrder, actor: { employeeId: string; label: string }, msAgo: number, status: "selesai" | "ditolak" = "selesai", note = ""): QueueOrder =>
    ({ ...order, status, rejectNote: note, processed: { employeeId: actor.employeeId, label: actor.label, at: iso(msAgo) } });
  const [rina, maya, arief, dimas, sari, yoga, dewi, , bagas, fajar] = SAMPLE_PEOPLE;

  // What waits now, what was processed today, and a made-up history for this month and the last.
  const orders: QueueOrder[] = [
    claim(nextId(), claimSeq++, rina, "cafe-latte", { orderedAt: iso(14 * minute) }),
    meet(nextId(), meetingSeq++, sari, [
      item("a", "tamu", "kopi-susu", { qty: 3, temperature: "es" }),
      item("b", "tamu", "classic-tea", { qty: 2, guestName: "Budi (contoh)" }),
      item("c", "tim", "americano", { person: sari }),
    ], { orderedAt: iso(9 * minute), guest: "PT Sinar Jaya (contoh)", guestCount: 5 }),
    claim(nextId(), claimSeq++, fajar, "matcha-latte", { orderedAt: iso(3 * minute), items: [item("a", "klaim", "matcha-latte", { temperature: "es", sugar: "Sedikit" })] }),
    done(claim(nextId(), claimSeq++, maya, "cappuccino", { orderedAt: iso(50 * minute) }), SAMPLE_ACTOR, 2 * minute),
    done(claim(nextId(), claimSeq++, dimas, "espresso", { orderedAt: iso(80 * minute) }), OTHER_ACTOR, 60 * minute, "ditolak", "Minuman sedang habis di mesin."),
    done(meet(nextId(), meetingSeq++, yoga, [item("a", "tamu", "cafe-mocha", { qty: 4 })], { orderedAt: iso(3 * 60 * minute), room: "Vasuki Room", spot: "vasuki", guest: "Bank Nusantara (contoh)", guestCount: 4 }), OTHER_ACTOR, 170 * minute),
  ];
  const history: [typeof rina, string, number][] = [
    [rina, "kopi-susu", 2], [rina, "americano", 5], [maya, "cafe-latte", 3], [maya, "cafe-mocha", 6], [maya, "kopi-hitam", 8], [arief, "classic-tea", 4],
    [dimas, "cappuccino", 7], [sari, "piccolo-latte", 2], [yoga, "dark-chocolate", 9], [dewi, "matcha-espresso", 3], [bagas, "kopi-susu", 4], [bagas, "milk-chocolate", 10],
    [fajar, "cucumber-ice", 6], [rina, "cafe-latte", 33], [maya, "kopi-susu", 35], [arief, "americano", 38], [sari, "cappuccino", 40], [bagas, "classic-tea", 41],
  ];
  for (const [who, slug, daysAgo] of history) {
    const drink = DRINKS.find(entry => entry.slug === slug)!;
    const at = iso(daysAgo * day + 90 * minute);
    orders.push(done(claim(nextId(), claimSeq++, who, slug, { orderedAt: at, items: [item("a", "klaim", slug, { temperature: drink.temperatures[0] })] }), daysAgo % 2 ? SAMPLE_ACTOR : OTHER_ACTOR, daysAgo * day + 80 * minute));
  }
  orders.push(done(meet(nextId(), meetingSeq++, rina, [item("a", "tamu", "kopi-susu", { qty: 6 }), item("b", "tim", "cafe-latte", { person: rina })], { orderedAt: iso(5 * day), guest: "PT Arunika Media (contoh)", guestCount: 6 }), SAMPLE_ACTOR, 5 * day - 10 * minute));
  orders.push(done(meet(nextId(), meetingSeq++, sari, [item("a", "tamu", "classic-tea", { qty: 3 })], { orderedAt: iso(36 * day), room: "CFC Ananta Room", spot: "ananta", guest: "Yayasan Cipta Karsa (contoh)", guestCount: 3 }), OTHER_ACTOR, 36 * day - 10 * minute));

  const counted = () => orders.filter(order => order.kind === "klaim").map(order => ({ id: order.id, kind: order.kind, status: order.status, employeeId: order.person.id, orderedAt: order.orderedAt }));
  const usedOf = (employeeId: string | null, month: string) => orders.filter(order => order.kind === "klaim" && order.person.id === employeeId && countsForQuota(order.status) && wibMonth(order.orderedAt) === month).length;
  const shown = (raw: QueueOrder): QueueOrder => {
    const order = dressed(raw);
    const undoable = !order.manual && !!order.processed && order.processed.employeeId === SAMPLE_ACTOR.employeeId && clock() - Date.parse(order.processed.at) < UNDO_MS;
    if (order.kind !== "klaim") return { ...order, undoable };
    const claimNo = claimNumbers(counted()).get(order.id);
    return { ...order, undoable, ...(claimNo ? { claimNo } : {}), quota: settings[order.person.group ?? "karyawan"], used: usedOf(order.person.id, wibMonth(order.orderedAt)) };
  };
  // The menu as the pengelola's Menu shows it, and the rules of changing it.
  const usedBy = (slug: string) => orders.filter(order => order.items.some(line => line.slug === slug)).length;
  const adminDrink = (drink: Drink, index: number): AdminDrink => ({ ...drink, sort: (index + 1) * 10, orders: usedBy(drink.slug), uploaded: uploaded.has(drink.slug), updatedAt: changed.get(drink.slug)?.at ?? null, updatedLabel: changed.get(drink.slug)?.label ?? "" });
  const at = (slug: string): Drink => {
    const drink = menu.find(entry => entry.slug === slug);
    if (!drink) throw refusal(404, "Minuman tidak ditemukan. Muat ulang halaman.");
    return drink;
  };
  const found = (slug: string): AdminDrink => adminDrink(at(slug), menu.findIndex(entry => entry.slug === slug));
  const touch = (slug: string) => changed.set(slug, { at: iso(0), label: SAMPLE_ACTOR.label });
  /** A drink's fields as the real schema reads them, refused the same way. */
  const checked = (body: unknown) => {
    if (!menuReady) throw refusal(503, MENU_WAITS);
    const read = drinkSchema.safeParse(body);
    if (!read.success) throw refusal(422, "Periksa kembali isian formulir.", Object.fromEntries(read.error.issues.map(issue => [String(issue.path[0] ?? "form"), [issue.message]])));
    return read.data;
  };
  const keys = new Map<string, { order: QueueOrder; message: string }>();
  const find = (id: string) => {
    const index = orders.findIndex(order => order.id === id);
    if (index < 0) throw refusal(404, "Pesanan tidak ditemukan. Muat ulang halaman.");
    return index;
  };
  const decide = (id: string, actor: { employeeId: string; label: string }, status: "selesai" | "ditolak", note = "") => {
    const index = find(id);
    if (orders[index].status !== "diproses") throw refusal(409, "Pesanan ini sudah diproses orang lain. Antrean diperbarui.");
    orders[index] = done(orders[index], actor, 0, status, note);
    return shown(orders[index]);
  };

  const api: CoffeeAdminApi = {
    async queue(): Promise<QueueState> {
      const today = wibDay(new Date(clock()).toISOString());
      const processed = orders.filter(order => order.processed && (order.status === "selesai" || order.status === "ditolak"));
      const todays = processed.filter(order => wibDay(order.processed!.at) === today);
      return {
        waiting: orders.filter(order => order.status === "diproses").sort((a, b) => Date.parse(a.orderedAt) - Date.parse(b.orderedAt)).map(shown),
        recent: [...processed].sort((a, b) => Date.parse(b.processed!.at) - Date.parse(a.processed!.at)).slice(0, 6).map(shown),
        today: { diproses: orders.filter(order => order.status === "diproses").length, selesai: todays.filter(order => order.status === "selesai").length, ditolak: todays.filter(order => order.status === "ditolak").length },
        now: new Date(clock()).toISOString(),
      };
    },
    async finish(id) { return { order: decide(id, SAMPLE_ACTOR, "selesai"), message: "Selesai diproses." }; },
    async reject(id, note) {
      if (note.trim().length < 3) throw refusal(422, "Periksa kembali isian formulir.", { note: ["Tulis catatan untuk pemesan, minimal 3 huruf."] });
      return { order: decide(id, SAMPLE_ACTOR, "ditolak", note.trim()), message: "Ditolak. Pemesan diberi tahu beserta catatannya." };
    },
    async reopen(id) {
      const index = find(id);
      const order = orders[index];
      if (!shown(order).undoable) throw refusal(409, "Sudah lewat batas waktu untuk mengurungkan.");
      if (order.kind === "klaim" && order.status === "ditolak" && usedOf(order.person.id, wibMonth(order.orderedAt)) >= settings[order.person.group ?? "karyawan"]) throw refusal(409, "Jatah bulan ini sudah habis.");
      orders[index] = { ...order, status: "diproses", rejectNote: "", processed: null };
      return { order: shown(orders[index]), message: "Dikembalikan ke antrean." };
    },
    async cancelManual(id) {
      const index = find(id);
      const order = orders[index];
      if (!order.manual) throw refusal(409, "Hanya catatan manual yang bisa dibatalkan.");
      if (order.status !== "selesai") throw refusal(409, "Catatan ini sudah dibatalkan.");
      orders[index] = { ...order, status: "batal", processed: { employeeId: SAMPLE_ACTOR.employeeId, label: SAMPLE_ACTOR.label, at: iso(0) } };
      return { order: shown(orders[index]), message: order.kind === "klaim" ? `Catatan dibatalkan. Jatah ${firstName(order.person.name)} dikembalikan.` : "Catatan dibatalkan." };
    },
    async manual(body) {
      // The same key again is the same record, as on the server.
      const again = keys.get(body.key);
      if (again) return again;
      const who = byId.get(body.employeeId);
      if (!who) throw refusal(422, "Periksa kembali isian formulir.", { employeeId: [body.kind === "tamu" ? "Pilih PIC tamu." : "Pilih nama karyawan."] });
      const at = manualAt(body.date, body.time);
      // As the server: the options of the kind recorded, as Pengaturan has them; a drink off the menu only as "lainnya".
      const onMenu = drinkIn(menu, body.slug);
      if (body.slug !== OTHER_DRINK && !onMenu) throw refusal(409, "Minuman ini sudah tidak ada di menu. Muat ulang halaman, lalu pilih yang lain.");
      const choice = settleLine(body, onMenu, options[body.kind]);
      if (isDrinkIssue(choice)) throw refusal(422, "Pilihan minuman berubah. Tutup lalu buka lagi minumannya, kemudian pilih ulang.", { [choice.field]: [choice.message] });
      const drink = { slug: body.slug, other: body.other, ...(onMenu ? { name: onMenu.name } : {}), ...choice };
      let order: QueueOrder;
      if (body.kind === "klaim") {
        if (usedOf(who.id, wibMonth(at)) >= settings[who.group]) throw refusal(409, "Jatah bulan ini sudah habis.");
        order = claim(nextId(), claimSeq++, who, body.slug, { orderedAt: at, manual: true, sentBy: SAMPLE_ACTOR.label, items: [item("a", "klaim", body.slug, drink)] });
      } else {
        const number = meetingSeq++;
        order = meet(nextId(), number, who, [item("a", body.kind, body.slug, { ...drink, qty: body.qty ?? 1, person: body.kind === "tim" ? who : null })], {
          no: orderNo("rapat", number), orderedAt: at, manual: true, sentBy: SAMPLE_ACTOR.label, room: body.room ?? "", spot: body.room ? roomSpot(body.room) : null,
          guest: body.guest ?? "", guestCount: body.guestCount ?? null,
        });
      }
      orders.push(done(order, SAMPLE_ACTOR, 0));
      const saved = shown(orders[orders.length - 1]);
      const name = drinkLabel(body.slug, body.other, onMenu?.name);
      const answer = {
        order: saved,
        message: body.kind === "klaim"
          ? `${firstName(who.name)} · ${name} · klaim ke-${saved.claimNo ?? 1} dari ${saved.quota ?? 0}.`
          : `${KIND_LABEL[body.kind]} · ${body.qty ?? 1}× ${name} · ${body.kind === "tamu" ? "PIC " : ""}${firstName(who.name)}.`,
      };
      keys.set(body.key, answer);
      return answer;
    },
    async people(month) {
      const asked = month ?? wibMonth(new Date(clock()).toISOString());
      const people: CoffeePerson[] = SAMPLE_PEOPLE.map(who => ({ id: who.id, name: who.name, nickname: firstName(who.name), position: who.position, bu: who.bu, group: who.group, used: usedOf(who.id, asked) }));
      return { people, month: asked };
    },
    async recap(query) {
      const numbers = claimNumbers(counted());
      const inSpan = orders.filter(order => { const at = wibDay(order.orderedAt); return at >= query.dari && at <= query.sampai; })
        .sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt));
      const rows = filterRows(expandRows(inSpan.map(dressed), numbers), { jenis: query.jenis, status: query.status, q: query.q });
      return { rows, summary: summarize(rows, SAMPLE_PEOPLE, settings), title: recapTitle(query.dari, query.sampai) };
    },
    async settings() { return { settings, holders: HOLDERS, gaPin, ...drinkSettings() }; },
    async saveSettings(input) { settings = { ...input }; return { settings, holders: HOLDERS, gaPin, ...drinkSettings(), message: "Jatah disimpan." }; },
    async menu(): Promise<MenuData> { return { ready: menuReady, places: placesReady, drinks: menu.map(adminDrink) }; },
    async createDrink(body) {
      const input = checked(body);
      const taken = new Set(menu.map(drink => drink.slug));
      const base = slugOf(input.name);
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, 40 - String(n).length - 1)}-${n}`;
      if (!placesReady && (!input.guestBook || !input.regular)) throw refusal(503, PLACES_WAIT);
      menu.push({ slug, name: input.name, description: input.description, group: input.group, temperatures: input.temperatures, photo: null, active: input.active, guestBook: input.guestBook, regular: input.regular });
      touch(slug);
      return { drink: found(slug), message: `${input.name} ditambahkan ke menu.` };
    },
    async updateDrink(slug, body) {
      const input = checked(body);
      if (!placesReady && (!input.guestBook || !input.regular)) throw refusal(503, PLACES_WAIT);
      Object.assign(at(slug), { name: input.name, description: input.description, group: input.group, temperatures: input.temperatures, active: input.active, guestBook: input.guestBook, regular: input.regular });
      touch(slug);
      return { drink: found(slug), message: `${input.name} disimpan.` };
    },
    async showDrink(slug, active) {
      if (!menuReady) throw refusal(503, MENU_WAITS);
      const drink = at(slug);
      drink.active = active;
      touch(slug);
      return { drink: found(slug), message: active ? `${drink.name} tampil lagi di menu.` : `${drink.name} disembunyikan. Tidak bisa dipesan, riwayatnya tetap ada.` };
    },
    async placeDrink(slug, place, on) {
      if (!menuReady) throw refusal(503, MENU_WAITS);
      if (!placesReady) throw refusal(503, PLACES_WAIT);
      const drink = at(slug);
      drink[place] = on;
      touch(slug);
      return { drink: found(slug), message: `${drink.name} kini ${placesWords(drink)}.` };
    },
    async deleteDrink(slug) {
      if (!menuReady) throw refusal(503, MENU_WAITS);
      at(slug);
      if (usedBy(slug)) throw refusal(409, "Minuman ini sudah pernah dipesan, jadi tidak bisa dihapus. Sembunyikan saja supaya tidak bisa dipesan lagi.");
      menu.splice(menu.findIndex(drink => drink.slug === slug), 1);
      uploaded.delete(slug);
      return { message: "Minuman dihapus dari menu." };
    },
    async sortDrinks(slugs) {
      if (!menuReady) throw refusal(503, MENU_WAITS);
      const placed = slugs.map(slug => menu.find(drink => drink.slug === slug)).filter((drink): drink is Drink => !!drink);
      const rest = menu.filter(drink => !placed.includes(drink));
      menu.splice(0, menu.length, ...placed, ...rest);
      return { ready: true, places: placesReady, drinks: menu.map(adminDrink) };
    },
    async uploadDrinkPhoto(slug, file) {
      if (!menuReady) throw refusal(503, MENU_WAITS);
      const drink = at(slug);
      if (!PHOTO_KINDS.includes(file.type)) throw refusal(415, "Format foto tidak dikenali. Pakai JPG, PNG, atau WebP.", { photo: ["Format foto tidak dikenali. Pakai JPG, PNG, atau WebP."] });
      if (file.size > 5 * 1024 * 1024) throw refusal(413, "Ukuran foto paling besar 5 MB.", { photo: ["Ukuran foto paling besar 5 MB."] });
      // The make-believe keeps the file in the browser only: a local address stands in for the stored photo.
      drink.photo = typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : `blob:contoh/${file.name}`;
      uploaded.add(slug);
      touch(slug);
      return { drink: found(slug), message: `Foto ${drink.name} diganti.` };
    },
    async saveOptions(input) {
      if (!menuReady) throw refusal(503, MENU_WAITS);
      options = { klaim: { ...input.klaim, es: input.klaim.es && input.klaim.suhu }, tim: { ...input.tim, es: input.tim.es && input.tim.suhu }, tamu: { ...input.tamu, es: input.tamu.es && input.tamu.suhu } };
      return { options, message: "Opsi minuman disimpan. Berlaku mulai pesanan berikutnya." };
    },
    async saveGaPin(pin) {
      if (!/^\d{4}$/.test(pin)) throw refusal(422, "Periksa kembali isian formulir.", { pin: ["PIN berupa 4 angka."] });
      gaPin = true;
      return { message: "PIN GA disimpan. Beri tahu petugas GA." };
    },
    exportHref: coffeeAdminClient.exportHref,
  };

  return {
    api,
    orders,
    menu,
    /** A new claim comes in (as if an employee just asked), from whoever still has quota left. */
    addClaim(): QueueOrder | null {
      const month = wibMonth(new Date(clock()).toISOString());
      const who = SAMPLE_PEOPLE.find(entry => usedOf(entry.id, month) < settings[entry.group]);
      if (!who) return null;
      const drink = menu[claimSeq % menu.length] ?? DRINKS[0];
      // As the app sends it: a claim carries only what Pengaturan asks of one (by default nothing).
      const choice = settleLine({ slug: drink.slug, temperature: drink.temperatures[0], sugar: "Normal", ice: "Normal" }, drink, options.klaim);
      const order = claim(nextId(), claimSeq++, who, drink.slug, { orderedAt: iso(0), items: [item("a", "klaim", drink.slug, { name: drink.name, ...(isDrinkIssue(choice) ? {} : choice) })] });
      orders.push(order);
      return order;
    },
    /** Another pengelola processes the oldest waiting order in their own window. */
    processElsewhere(): QueueOrder | null {
      const first = orders.filter(order => order.status === "diproses").sort((a, b) => Date.parse(a.orderedAt) - Date.parse(b.orderedAt))[0];
      return first ? decide(first.id, OTHER_ACTOR, "selesai") : null;
    },
    lastMonth: () => previousMonth(wibMonth(new Date(clock()).toISOString())),
    /** A claim recorded by hand a few minutes ago (the preview shows "Batalkan catatan" on it). */
    seedManual(): QueueOrder {
      const order = done(claim(nextId(), claimSeq++, arief, "kopi-susu", { orderedAt: iso(40 * minute), manual: true, sentBy: SAMPLE_ACTOR.label }), SAMPLE_ACTOR, 8 * minute);
      orders.push(order);
      return order;
    },
  };
}
