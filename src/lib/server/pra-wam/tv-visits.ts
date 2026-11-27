import "server-only";
import { createHash } from "node:crypto";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { praWamSecret } from "@/lib/pra-wam/session-token";
import { TV_VISIT_DAYS, TV_VISIT_EVERY_MS, TV_VISIT_KEEP_DAYS, tvDevice, type TvDeviceKind, type TvVisit, type TvVisitVersion } from "@/lib/pra-wam/tv-visits";
import { createPrivilegedClient } from "../supabase/admin";

/** Who opens the TV addresses is kept with this one; before it nothing is noted and Pantauan says so. */
export const TV_VISITS_MIGRATION = "202612030002_pw_tv_visits.sql";
const missing = (error: { code?: string }) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "");

/** When each device's line was last written by this server, so a board that asks every ten seconds writes once in a few minutes. */
const written = new Map<string, number>();
const mark = (secret: string, value: string, length: number) => createHash("sha256").update(`${secret}:${value}`).digest("hex").slice(0, length);

/**
 * A device asked for a TV address: its line for today is written, or its "last seen" moved on.
 * Never in the way of the board: anything that goes wrong here is passed over. The network
 * address is not kept, only marks made from it with the server's own secret.
 */
export async function noteVisit(request: Request, visit: { address: string; version: TvVisitVersion; width?: number | null; height?: number | null }, now = new Date()): Promise<void> {
  try {
    const secret = praWamSecret();
    const agent = request.headers.get("user-agent");
    const device = tvDevice(agent);
    if (!secret || !device) return;
    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "";
    const id = mark(secret, `${ip}|${agent}`, 16), day = wibDate(now.toISOString());
    const key = `${id}|${visit.address}|${visit.version}|${day}`;
    const last = written.get(key);
    if (last && now.getTime() - last < TV_VISIT_EVERY_MS) return;
    if (written.size > 2_000) written.clear();
    written.set(key, now.getTime());
    const sized = visit.width && visit.height ? { width: visit.width, height: visit.height } : {};
    const client = createPrivilegedClient();
    const { error } = await client.from("pw_tv_visits").upsert(
      { device: id, net: mark(secret, ip, 8), address: visit.address.slice(0, 80), version: visit.version, day, kind: device.kind, name: device.name.slice(0, 80), last_seen_at: now.toISOString(), ...sized },
      { onConflict: "device,address,day" });
    if (error) return;
    // Old lines go as new ones come: once in a while, not with every write.
    if (Math.random() < 0.02) await client.from("pw_tv_visits").delete().lt("day", wibDate(new Date(now.getTime() - TV_VISIT_KEEP_DAYS * 86_400_000).toISOString()));
  } catch { /* the board never waits on this */ }
}

type Row = { id: string; device: string; net: string; address: string; version: TvVisitVersion; day: string; kind: TvDeviceKind; name: string; width: number | null; height: number | null; first_seen_at: string; last_seen_at: string };

/** The last days' lines, latest first; `ready` is false before the migration. */
export async function readVisits(now = new Date()): Promise<{ ready: boolean; visits: TvVisit[] }> {
  try {
    const from = wibDate(new Date(now.getTime() - (TV_VISIT_DAYS - 1) * 86_400_000).toISOString());
    const { data, error } = await createPrivilegedClient().from("pw_tv_visits")
      .select("id,device,net,address,version,day,kind,name,width,height,first_seen_at,last_seen_at").gte("day", from).order("last_seen_at", { ascending: false }).limit(400);
    if (error) return { ready: !missing(error), visits: [] };
    return { ready: true, visits: ((data ?? []) as Row[]).map(row => ({ id: row.id, device: row.device, net: row.net, address: row.address, version: row.version, day: row.day, kind: row.kind, name: row.name, width: row.width, height: row.height, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at })) };
  } catch { return { ready: false, visits: [] }; }
}
