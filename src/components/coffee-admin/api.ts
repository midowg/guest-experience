import { AdminApiError, adminRequest } from "@/components/admin/shared/api";
import { browserDevice, type PushApi, type PushPort } from "@/components/coffee/usePush";
import type { CoffeeOptions, Drink, DrinkGroup, Ice, MenuPlace, Sugar, Temperature } from "@/lib/coffee/menu";
import type { CoffeePushInfo } from "@/lib/coffee/notify";
import type { RecapSummary } from "@/lib/coffee/recap";
import type { AdminDrink, CoffeePerson, CoffeeSettings, ItemFor, MenuData, QueueOrder, QueueState, RecapRow, Status } from "@/lib/coffee/types";
import { coffeeAdminApi } from "@/lib/routes";

/*
 * What the pengelola's screens ask the server (the F0 APIs under /api/admin/coffee). The screens
 * take this as a prop, so the preview (/dev-preview/coffee/nyata/admin) and the tests run the real
 * components on a make-believe one.
 */

export type RecapQuery = { dari: string; sampai: string; jenis?: ItemFor; status?: Status; q?: string };
export type RecapData = { rows: RecapRow[]; summary: RecapSummary; title: string };
export type CoffeeHolder = { id: string; name: string; position: string };
/**
 * `gaPin`: a PIN GA is set (the PIN itself never reaches the browser). `options`: what each
 * audience is asked with a drink; `optionsReady` false while migration 202612020001 has not run
 * (everyone is then asked everything and the switches cannot be saved). `menu`: the drinks, for
 * Catat manual.
 */
export type SettingsData = { settings: CoffeeSettings; holders: CoffeeHolder[]; gaPin: boolean; options: CoffeeOptions; optionsReady: boolean; menu: Drink[] };
export type ManualBody = {
  kind: ItemFor; employeeId: string; date: string; time: string; slug: string; other?: string;
  temperature?: Temperature; sugar?: Sugar; ice?: Ice; qty?: number; room?: string; guest?: string; guestCount?: number; key: string;
};
export type Done = { order: QueueOrder; message: string };
/** Tambah / Ubah minuman: what the editor sends. */
export type DrinkBody = { name: string; description: string; group: DrinkGroup; temperatures: Temperature[]; active: boolean; guestBook: boolean; regular: boolean };
export type DrinkDone = { drink: AdminDrink; message: string };
/** A record made by hand that the pengelola is about to cancel: its order, and the words the question shows. */
export type CancelTarget = { id: string; title: string; claim: boolean };

export type CoffeeAdminApi = {
  queue(): Promise<QueueState>;
  finish(id: string): Promise<Done>;
  reject(id: string, note: string): Promise<Done>;
  reopen(id: string): Promise<Done>;
  /** Batalkan catatan: a record made by hand only. */
  cancelManual(id: string): Promise<Done>;
  manual(body: ManualBody): Promise<Done>;
  people(month?: string): Promise<{ people: CoffeePerson[]; month: string }>;
  recap(query: RecapQuery): Promise<RecapData>;
  settings(): Promise<SettingsData>;
  saveSettings(input: CoffeeSettings): Promise<SettingsData & { message: string }>;
  /** Menu (F6): every drink, hidden ones included, with how often each was ordered. Always read fresh. */
  menu(): Promise<MenuData>;
  createDrink(body: DrinkBody): Promise<DrinkDone>;
  updateDrink(slug: string, body: DrinkBody): Promise<DrinkDone>;
  /** Sembunyikan / Tampilkan. */
  showDrink(slug: string, active: boolean): Promise<DrinkDone>;
  /** Where the drink shows (F7): tick or untick "Buku tamu" or "Menu biasa", from the list. */
  placeDrink(slug: string, place: MenuPlace, on: boolean): Promise<DrinkDone>;
  /** Only a drink no order ever used; 409 otherwise. */
  deleteDrink(slug: string): Promise<{ message: string }>;
  /** The whole menu in its new order; answers the menu as it is afterwards. */
  sortDrinks(slugs: string[]): Promise<MenuData>;
  /** The drink's photo (JPEG, PNG or WebP, 5 MB at most); the server crops it square. */
  uploadDrinkPhoto(slug: string, file: File): Promise<DrinkDone>;
  /** Pengaturan → Opsi minuman: which options each audience is asked from the next order on. */
  saveOptions(input: CoffeeOptions): Promise<{ options: CoffeeOptions; message: string }>;
  /** Sets or replaces the PIN GA (four digits) the tablet asks for when the guest menu book is left. */
  saveGaPin(pin: string): Promise<{ message: string }>;
  /** The address of the file with the same filter (a plain download, no fetch). */
  exportHref(format: "csv" | "xlsx", query: RecapQuery): string;
};

const filterOf = (query: RecapQuery): Record<string, string | undefined> =>
  ({ dari: query.dari, sampai: query.sampai, jenis: query.jenis, status: query.status, q: query.q?.trim() || undefined });

async function read<T>(url: string): Promise<T> {
  return (await adminRequest<T>(url)).data as T;
}
async function act(url: string, body?: unknown): Promise<Done> {
  const result = await adminRequest<{ order: QueueOrder }>(url, { method: "POST", body: JSON.stringify(body ?? {}) });
  return { order: result.data!.order, message: result.message };
}

async function drinkCall(url: string, method: string, body: BodyInit): Promise<DrinkDone> {
  const result = await adminRequest<{ drink: AdminDrink }>(url, { method, body });
  return { drink: result.data!.drink, message: result.message };
}

export const coffeeAdminClient: CoffeeAdminApi = {
  queue: () => read<QueueState>(coffeeAdminApi.queue),
  finish: id => act(coffeeAdminApi.finish(id)),
  reject: (id, note) => act(coffeeAdminApi.reject(id), { note }),
  reopen: id => act(coffeeAdminApi.reopen(id)),
  cancelManual: id => act(coffeeAdminApi.cancelManual(id)),
  manual: body => act(coffeeAdminApi.manual, body),
  people: month => read(coffeeAdminApi.people(month)),
  recap: query => read<RecapData>(coffeeAdminApi.recap(filterOf(query))),
  settings: () => read<SettingsData>(coffeeAdminApi.settings),
  async saveSettings(input) {
    const result = await adminRequest<SettingsData>(coffeeAdminApi.settings, { method: "PUT", body: JSON.stringify(input) });
    return { ...result.data!, message: result.message };
  },
  menu: () => read<MenuData>(coffeeAdminApi.menu),
  createDrink: body => drinkCall(coffeeAdminApi.menu, "POST", JSON.stringify(body)),
  updateDrink: (slug, body) => drinkCall(coffeeAdminApi.drink(slug), "PUT", JSON.stringify(body)),
  showDrink: (slug, active) => drinkCall(coffeeAdminApi.drink(slug), "PATCH", JSON.stringify({ active })),
  placeDrink: (slug, place, on) => drinkCall(coffeeAdminApi.drink(slug), "PATCH", JSON.stringify({ [place]: on })),
  async deleteDrink(slug) { return { message: (await adminRequest(coffeeAdminApi.drink(slug), { method: "DELETE" })).message }; },
  async sortDrinks(slugs) { return (await adminRequest<MenuData>(coffeeAdminApi.menuOrder, { method: "PUT", body: JSON.stringify({ slugs }) })).data as MenuData; },
  uploadDrinkPhoto(slug, file) {
    const form = new FormData();
    form.append("file", file);
    return drinkCall(coffeeAdminApi.drinkPhoto(slug), "POST", form);
  },
  async saveOptions(input) {
    const result = await adminRequest<{ options: CoffeeOptions }>(coffeeAdminApi.options, { method: "PUT", body: JSON.stringify(input) });
    return { options: result.data!.options, message: result.message };
  },
  async saveGaPin(pin) {
    const result = await adminRequest<{ gaPin: boolean }>(coffeeAdminApi.gaPin, { method: "PUT", body: JSON.stringify({ pin }) });
    return { message: result.message };
  },
  exportHref: (format, query) => coffeeAdminApi.recapExport(format, filterOf(query)),
};

/**
 * Web push for the pengelola (F4): this device is told about new claims and meeting orders. Only
 * with an employee account: the super admin's sign-in answers 409, which the screen shows as a note.
 */
export const coffeeAdminPushApi: PushApi = {
  info: () => read<CoffeePushInfo>(coffeeAdminApi.push),
  async save(subscription, device) { await adminRequest(coffeeAdminApi.push, { method: "POST", body: JSON.stringify({ subscription, device }) }); },
  async remove(endpoint) { await adminRequest(coffeeAdminApi.push, { method: "DELETE", body: JSON.stringify({ endpoint }) }); },
};
/** The real thing: the admin's push API and this browser, on Coffee's own service worker. */
export const coffeeAdminPush: PushPort = { api: coffeeAdminPushApi, device: browserDevice };

/** Someone else got there first (409), or the order is gone (404): the queue on screen is out of date. */
export const outOfDate = (error: unknown): boolean => error instanceof AdminApiError && (error.status === 409 || error.status === 404);
export const fieldErrorsOf = (error: unknown): Record<string, string[]> => error instanceof AdminApiError ? error.fieldErrors ?? {} : {};
