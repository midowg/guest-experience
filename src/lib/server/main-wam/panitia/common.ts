import "server-only";
import { createHmac } from "node:crypto";
import { cache } from "react";
import { notFound } from "next/navigation";
import { moduleAllows, type MainWamAction } from "@/lib/main-wam/access";
import type { MainWamModule } from "@/lib/main-wam/types";
import { rateLimitSecret, ServiceError } from "../../config";
import { databaseError } from "../../http";
import { createPrivilegedClient } from "../../supabase/admin";
import type { MainWamContext } from "../gate";

/*
 * What every panitia and BOD screen of area C shares on the server: who may (a tool that is not for
 * the person does not exist: 404, also in the API, KONTRAK §9 #4), a rate limit per person, and the
 * people of the event.
 */

export const db = () => createPrivilegedClient();

/** A tool's API after requireMainWamApi(): 404 when the role may not, or its module is off. */
export function apiOnlyFor(context: MainWamContext, action: MainWamAction, module?: MainWamModule): MainWamContext {
  if (!moduleAllows(context.viewer, action, context.settings.modules) || (module && !context.settings.modules[module])) throw new ServiceError(404, "Halaman tidak ditemukan.");
  return context;
}

/** A tool's page after requireActionPage(): not found while its module is off. */
export function pageNeedsModule(context: MainWamContext, module: MainWamModule): MainWamContext {
  if (!context.settings.modules[module]) notFound();
  return context;
}

/** At most `limit` in 10 minutes for one person (a panitia sending, a BOD reading): 429 past it. */
export async function limitPerPerson(scope: string, employeeId: string, limit: number): Promise<void> {
  const key = createHmac("sha256", rateLimitSecret()).update(`main-wam-${scope}\0${employeeId}`).digest("hex");
  const { data, error } = await db().rpc("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: 600 });
  if (error) databaseError(error);
  if (!data) throw new ServiceError(429, "Terlalu sering dalam waktu singkat. Tunggu beberapa menit lalu coba lagi.");
}

/**
 * The people of the event: everyone with an active WAM account (and an active Data karyawan row),
 * the same people "Semua" reaches in mode semua; `bod` apart, as BOD do not check in.
 */
async function eventPeopleUncached(): Promise<{ ids: string[]; bod: Set<string>; panitia: Set<string> }> {
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from("pw_accounts").select("employee_id,employees!inner(active)").eq("active", true).eq("employees.active", true).order("employee_id").range(from, from + 999);
    if (error) databaseError(error);
    ids.push(...(data ?? []).map(row => row.employee_id as string));
    if ((data?.length ?? 0) < 1000) break;
  }
  const { data: roles, error } = await db().from("pw_roles").select("employee_id,role").in("role", ["bod", "panitia"]);
  if (error) databaseError(error);
  const of = (role: string) => new Set((roles ?? []).filter(row => row.role === role).map(row => row.employee_id as string));
  return { ids, bod: of("bod"), panitia: of("panitia") };
}
export const eventPeople = cache(eventPeopleUncached);

/** Who checks in: the event's people minus BOD. */
export async function expectedAttendees(): Promise<string[]> {
  const { ids, bod } = await eventPeople();
  return ids.filter(id => !bod.has(id));
}

/** "Kelompok 4" per person, from fondasi's kelompok (empty before they are set). */
export function groupLabels(groups: readonly { number: number; members: readonly { employeeId: string }[] }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const group of groups) for (const member of group.members) out.set(member.employeeId, `Kelompok ${group.number}`);
  return out;
}
