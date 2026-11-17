"use client";

import { adminRequest } from "@/components/admin/shared/api";
import { wellbeingAdminApi } from "@/lib/routes";
import type { WbActivityPage, WbCatalog, WbOverview, WbPeople, WbPersonDetail, WbSettingsView, WbStravaAdmin } from "@/lib/wellbeing/types";

/** Admin Wellbeing's data keys (resource.ts) and how each is fetched. All start with "wb:" so one revalidate refreshes them. */
export type ActivityQuery = { filter: "unchecked" | "all" | "adjusted" | "rejected"; kind: "all" | "daily" | "sport" | "strava"; q: string };

const get = async <T,>(url: string): Promise<T> => (await adminRequest<T>(url)).data as T;

export const wb = {
  overview: { key: "wb:overview", fetch: () => get<WbOverview>(wellbeingAdminApi.overview) },
  activities: (query: ActivityQuery, before?: string) => ({
    key: `wb:activities:${query.filter}:${query.kind}:${query.q.trim().toLowerCase()}`,
    fetch: () => get<WbActivityPage>(wellbeingAdminApi.activities({ filter: query.filter, kind: query.kind, q: query.q.trim() || undefined, before })),
  }),
  people: (period: "month" | "all") => ({ key: `wb:people:${period}`, fetch: () => get<WbPeople>(wellbeingAdminApi.people(period)) }),
  person: (id: string) => ({ key: `wb:person:${id}`, fetch: () => get<WbPersonDetail>(wellbeingAdminApi.person(id)) }),
  catalog: { key: "wb:catalog", fetch: () => get<WbCatalog>(wellbeingAdminApi.catalog) },
  settings: { key: "wb:settings", fetch: () => get<WbSettingsView>(wellbeingAdminApi.settings) },
  strava: { key: "wb:strava", fetch: () => get<WbStravaAdmin>(wellbeingAdminApi.strava) },
};

/** A write: JSON in, the API's `{ data, message }` out (throws AdminApiError with the message). */
export async function send<T>(url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown) {
  const result = await adminRequest<T>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return { data: result.data as T, message: result.message };
}

const number = new Intl.NumberFormat("id-ID");
export const points = (value: number) => number.format(value);
export const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${number.format(Math.abs(value))}`;
export const dayLabel = (date: string, today: string) => {
  if (date === today) return "Hari ini";
  const yesterday = new Date(`${today}T12:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (date === yesterday.toISOString().slice(0, 10)) return "Kemarin";
  return new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
};
export const monthName = (date: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
export const longDate = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
