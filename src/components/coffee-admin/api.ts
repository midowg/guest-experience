import { AdminApiError, adminRequest } from "@/components/admin/shared/api";
import type { Ice, Sugar, Temperature } from "@/lib/coffee/menu";
import type { RecapSummary } from "@/lib/coffee/recap";
import type { CoffeePerson, CoffeeSettings, ItemFor, QueueOrder, QueueState, RecapRow, Status } from "@/lib/coffee/types";
import { coffeeAdminApi } from "@/lib/routes";

/*
 * What the pengelola's screens ask the server (the F0 APIs under /api/admin/coffee). The screens
 * take this as a prop, so the preview (/dev-preview/coffee/nyata/admin) and the tests run the real
 * components on a make-believe one.
 */

export type RecapQuery = { dari: string; sampai: string; jenis?: ItemFor; status?: Status; q?: string };
export type RecapData = { rows: RecapRow[]; summary: RecapSummary; title: string };
export type CoffeeHolder = { id: string; name: string; position: string };
export type SettingsData = { settings: CoffeeSettings; holders: CoffeeHolder[] };
export type ManualBody = {
  kind: ItemFor; employeeId: string; date: string; time: string; slug: string; other?: string;
  temperature: Temperature; sugar: Sugar; ice: Ice; qty?: number; room?: string; guest?: string; guestCount?: number; key: string;
};
export type Done = { order: QueueOrder; message: string };
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
  exportHref: (format, query) => coffeeAdminApi.recapExport(format, filterOf(query)),
};

/** Someone else got there first (409), or the order is gone (404): the queue on screen is out of date. */
export const outOfDate = (error: unknown): boolean => error instanceof AdminApiError && (error.status === 409 || error.status === 404);
export const fieldErrorsOf = (error: unknown): Record<string, string[]> => error instanceof AdminApiError ? error.fieldErrors ?? {} : {};
