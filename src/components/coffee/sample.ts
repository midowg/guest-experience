import { DRINKS, MONTHLY_QUOTA, drinkBySlug, type QuotaGroup } from "@/lib/coffee/menu";
import { claimNumbers, countsForQuota, wibMonth } from "@/lib/coffee/quota";
import type { CoffeeMe, MyOrder, MyState } from "@/lib/coffee/types";
import { CoffeeApiError, type ClaimDone, type CoffeeApi } from "./api";

/*
 * A make-believe server for the employee app: the same answers and refusals as the F0 APIs (409
 * when the quota is full, 409 when a claim was processed before it could be cancelled, one claim
 * per key), kept in memory. Used by the preview (/dev-preview/coffee/nyata) and by the tests, so
 * the real components can be looked at and exercised before the migration runs. Every name is made
 * up and says so.
 */

export const SAMPLE_ME: Record<QuotaGroup, { id: string; name: string }> = {
  karyawan: { id: "p-rina", name: "Rina (contoh)" },
  ga: { id: "p-bagas", name: "Bagas (contoh)" },
  intern: { id: "p-fajar", name: "Fajar (contoh)" },
};
/** Who processes in the make-believe: the name the claimant sees. */
export const SAMPLE_PROCESSOR = "Dewi";
export const SAMPLE_REFUSAL = "Susu segar sedang habis. Coba Americano atau Kopi Hitam dulu, ya.";

type Options = {
  group?: QuotaGroup;
  /** Claims already made (and done) earlier this month. */
  used?: number;
  ga?: boolean;
  pengelola?: boolean;
  /** The make-believe server's time (the tests hold it still). */
  clock?: () => number;
  /** How long every answer takes (the tests use it to press twice before the first answer). */
  delay?: number;
};

export type SampleCoffee = ReturnType<typeof createSampleCoffee>;

export function createSampleCoffee({ group = "karyawan", used = 0, ga = false, pengelola = false, clock = Date.now, delay = 0 }: Options = {}) {
  const who = SAMPLE_ME[group];
  const quota = MONTHLY_QUOTA[group];
  const iso = (msAgo = 0) => new Date(clock() - msAgo).toISOString();
  let seq = 418, idSeq = 1;
  const orders: MyOrder[] = [];
  const keys = new Map<string, string>();
  const calls = { state: 0, claim: 0, cancel: 0 };
  let offline = false;

  const add = (slug: string, more: Partial<MyOrder> = {}): MyOrder => {
    const drink = drinkBySlug(slug) ?? DRINKS[0];
    const order: MyOrder = {
      id: `00000000-0000-4000-8000-${String(idSeq++).padStart(12, "0")}`, no: `K-${seq++}`, status: "diproses", orderedAt: iso(), rejectNote: "",
      processedLabel: "", processedAt: null, manual: false, slug: drink.slug, temperature: drink.temperatures[0], sugar: "Normal", ice: "Normal", ...more,
    };
    orders.unshift(order);
    return order;
  };
  // Earlier this month: done claims, the oldest first in time.
  const earlier = ["kopi-susu", "americano", "cafe-latte", "classic-tea", "cappuccino", "kopi-hitam"];
  for (let index = 0; index < Math.min(used, 60); index++) {
    const minutesAgo = (used - index) * 90;
    add(earlier[index % earlier.length], { status: "selesai", orderedAt: iso(minutesAgo * 60_000), processedLabel: SAMPLE_PROCESSOR, processedAt: iso((minutesAgo - 6) * 60_000) });
  }

  const month = () => wibMonth(iso());
  const usedNow = () => orders.filter(order => countsForQuota(order.status) && wibMonth(order.orderedAt) === month()).length;
  const me = (): CoffeeMe => { const taken = usedNow(); return { id: who.id, name: who.name, group, quota, used: taken, left: Math.max(quota - taken, 0), month: month() }; };
  const shown = (): MyOrder[] => {
    const numbers = claimNumbers(orders.map(order => ({ id: order.id, kind: "klaim" as const, status: order.status, employeeId: who.id, orderedAt: order.orderedAt })));
    return orders.map(order => { const claimNo = numbers.get(order.id); return { ...order, ...(claimNo ? { claimNo } : {}) }; });
  };
  const answer = (id: string, message: string): ClaimDone => ({ order: shown().find(order => order.id === id)!, me: me(), message });
  const wait = async () => {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (offline) throw new CoffeeApiError("Tidak dapat terhubung. Periksa jaringan lalu coba lagi.");
  };

  const api: CoffeeApi = {
    async state(): Promise<MyState> {
      calls.state += 1;
      await wait();
      return { me: me(), orders: shown(), ga, pengelola };
    },
    async claim(body) {
      calls.claim += 1;
      await wait();
      // The same key again is the same claim, as on the server.
      const again = keys.get(body.key);
      if (again) return answer(again, "Pengajuan terkirim.");
      const drink = drinkBySlug(body.slug);
      if (!drink || !drink.temperatures.includes(body.temperature)) throw new CoffeeApiError("Periksa kembali isian formulir.", 422, { slug: ["Pilih minuman."] });
      if (usedNow() >= quota) throw new CoffeeApiError("Jatah bulan ini sudah habis.", 409);
      const order = add(body.slug, { temperature: body.temperature, sugar: body.sugar, ice: body.temperature === "es" ? body.ice : "Normal" });
      keys.set(body.key, order.id);
      return answer(order.id, "Pengajuan terkirim.");
    },
    async cancel(id) {
      calls.cancel += 1;
      await wait();
      const order = orders.find(item => item.id === id);
      if (!order || order.status !== "diproses") throw new CoffeeApiError("Pengajuan ini sudah diproses, tidak bisa dibatalkan.", 409);
      order.status = "batal";
      return answer(id, "Pengajuan dibatalkan. Jatah kamu dikembalikan.");
    },
    async signOut() { /* nothing to sign out of */ },
  };

  return {
    api,
    calls,
    orders,
    initial: (): MyState => ({ me: me(), orders: shown(), ga, pengelola }),
    /** A pengelola processes the oldest waiting claim (Selesai, or Tolak with a note). */
    settle(status: "selesai" | "ditolak", note = SAMPLE_REFUSAL): MyOrder | null {
      const order = [...orders].reverse().find(item => item.status === "diproses");
      if (!order) return null;
      Object.assign(order, { status, rejectNote: status === "ditolak" ? note : "", processedLabel: SAMPLE_PROCESSOR, processedAt: iso() });
      return order;
    },
    /** A pengelola records a claim by hand (Catat manual): it arrives already done. */
    recordManual(slug = "kopi-susu"): MyOrder {
      return add(slug, { status: "selesai", manual: true, processedLabel: SAMPLE_PROCESSOR, processedAt: iso() });
    },
    /** The network goes away, or comes back. */
    setOffline(value: boolean) { offline = value; },
  };
}
