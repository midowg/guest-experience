/*
 * A small in-memory stand-in for Supabase, for the Coffee server tests: the query builder the
 * modules use, and the three database functions of migration 202612010001 written out in
 * JavaScript with the same rules (quota under one count, the same key twice is one row, Urungkan
 * by the processor within the window). `migrated = false` answers like a database without the
 * migration. Made-up people only.
 */
type Row = Record<string, unknown>;
type Failure = { code?: string; message: string };
type Result = { data: unknown; error: Failure | null };

const COFFEE_TABLES = ["coffee_orders", "coffee_order_items", "coffee_settings"];
const groupOf = (category: unknown) => category === "intern" ? "intern" : category === "dw" || category === "ga" ? "ga" : "karyawan";
const wibMonth = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 7);

export function fakeDb() {
  const state = {
    migrated: true,
    now: new Date("2026-11-25T03:00:00Z"),
    tables: {} as Record<string, Row[]>,
    seq: { claim: 418, meeting: 113, id: 0 },
    calls: [] as string[],
  };
  const rows = (table: string) => (state.tables[table] ??= []);
  const uuid = () => `00000000-0000-4000-8000-${String(++state.seq.id).padStart(12, "0")}`;
  const absent = (what: string): Result => ({ data: null, error: { code: what.startsWith("coffee_") && !COFFEE_TABLES.includes(what) ? "PGRST202" : "PGRST205", message: `Could not find '${what}' in the schema cache` } });
  const fail = (message: string): Result => ({ data: null, error: { code: "P0001", message } });
  const withItems = (row: Row): Row => ({ ...row, coffee_order_items: rows("coffee_order_items").filter(item => item.order_id === row.id) });

  function from(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    const orders: [string, boolean][] = [];
    let mode: { kind: "select" } | { kind: "update"; patch: Row } | { kind: "upsert"; row: Row; key: string } = { kind: "select" };
    let single = false;
    let window: [number, number] | null = null;
    let limit = Infinity;
    const run = (): Result => {
      state.calls.push(`${mode.kind}:${table}`);
      if (!state.migrated && COFFEE_TABLES.includes(table)) return absent(table);
      if (mode.kind === "upsert") {
        const { row, key } = mode;
        const same = rows(table).find(item => item[key] === row[key]);
        if (same) Object.assign(same, row); else rows(table).push({ ...row });
        const saved = same ?? rows(table)[rows(table).length - 1];
        return { data: single ? saved : [saved], error: null };
      }
      let found = rows(table).filter(row => filters.every(test => test(row)));
      if (mode.kind === "update") { const { patch } = mode; found.forEach(row => Object.assign(row, patch)); return { data: single ? found[0] ?? null : found.map(row => ({ ...row })), error: null }; }
      for (const [column, ascending] of [...orders].reverse()) {
        found = [...found].sort((a, b) => (String(a[column] ?? "") < String(b[column] ?? "") ? -1 : String(a[column] ?? "") > String(b[column] ?? "") ? 1 : 0) * (ascending ? 1 : -1));
      }
      if (window) found = found.slice(window[0], window[1] + 1);
      found = found.slice(0, limit);
      const shaped = table === "coffee_orders" ? found.map(withItems) : found.map(row => ({ ...row }));
      return { data: single ? shaped[0] ?? null : shaped, error: null };
    };
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder; },
      gte: (key: string, value: string) => { filters.push(row => row[key] != null && String(row[key]) >= value); return builder; },
      lte: (key: string, value: string) => { filters.push(row => row[key] != null && String(row[key]) <= value); return builder; },
      lt: (key: string, value: string) => { filters.push(row => row[key] != null && String(row[key]) < value); return builder; },
      contains: (key: string, values: unknown[]) => { filters.push(row => values.every(value => ((row[key] as unknown[]) ?? []).includes(value))); return builder; },
      order: (column: string, options?: { ascending?: boolean }) => { orders.push([column, options?.ascending !== false]); return builder; },
      limit: (value: number) => { limit = value; return builder; },
      range: (start: number, end: number) => { window = [start, end]; return builder; },
      single: () => { single = true; return builder; },
      maybeSingle: () => { single = true; return builder; },
      update: (patch: Row) => { mode = { kind: "update", patch }; return builder; },
      upsert: (row: Row, options?: { onConflict?: string }) => { mode = { kind: "upsert", row, key: options?.onConflict ?? "id" }; return builder; },
      then: (resolve: (result: Result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
    };
    return builder;
  }

  const employee = (id: unknown) => rows("employees").find(row => row.id === id && row.active);
  const byKey = (key: unknown) => key ? rows("coffee_orders").find(row => row.idempotency_key === key) : undefined;
  const quotaOf = (group: unknown) => {
    const settings = rows("coffee_settings")[0] ?? {};
    return Number(group === "intern" ? settings.quota_intern ?? 2 : group === "ga" ? settings.quota_ga ?? 2 : settings.quota_karyawan ?? 4);
  };
  const usedBy = (person: unknown, month: unknown) => rows("coffee_orders")
    .filter(row => row.employee_id === person && row.kind === "klaim" && row.quota_month === month && ["diproses", "selesai"].includes(row.status as string)).length;
  const itemRow = (orderId: string, item: Row, more: Row, sort: number): Row => ({
    id: uuid(), order_id: orderId, employee_id: null, person_name: null, person_group: null, person_position: null, person_bu: null,
    drink_slug: item.slug, drink_other: item.other ?? null, temperature: item.temperature, sugar: item.sugar, ice: item.ice ?? "Normal", qty: item.qty ?? 1, sort, ...more,
  });
  const processed = (manual: boolean, actor: unknown, label: unknown) => manual
    ? { status: "selesai", processed_by: actor ?? null, processed_label: label ?? null, processed_at: state.now.toISOString() }
    : { status: "diproses", processed_by: null, processed_label: null, processed_at: null };

  const functions: Record<string, (args: Record<string, unknown>) => Result> = {
    consume_rate_limit: () => ({ data: true, error: null }),
    coffee_submit_claim(args) {
      const again = byKey(args.p_key);
      if (again) return { data: again.id, error: null };
      const person = employee(args.p_employee);
      if (!person) return fail("COFFEE_NOT_EMPLOYEE");
      const group = groupOf(person.category);
      const at = String(args.p_at ?? state.now.toISOString());
      const month = wibMonth(at);
      if (usedBy(person.id, month) >= quotaOf(group)) return fail("COFFEE_QUOTA_FULL");
      const id = uuid();
      const manual = args.p_manual === true;
      rows("coffee_orders").push({
        id, kind: "klaim", number: state.seq.claim++, round: 1, parent_id: null, employee_id: person.id, person_name: person.full_name, person_group: group,
        person_position: person.position, person_bu: person.business_unit, room: null, room_spot: null, guest: null, guest_count: null, reject_note: null,
        ...processed(manual, args.p_actor, args.p_actor_label), created_by: args.p_actor ?? null, created_label: args.p_actor_label ?? null, manual,
        ordered_at: at, quota_month: month, idempotency_key: args.p_key ?? null,
      });
      rows("coffee_order_items").push(itemRow(id, args.p_item as Row, { for_whom: "klaim", employee_id: person.id }, 0));
      return { data: id, error: null };
    },
    coffee_submit_meeting(args) {
      const again = byKey(args.p_key);
      if (again) return { data: again.id, error: null };
      const order = args.p_order as Row;
      const items = args.p_items as Row[];
      if (!Array.isArray(items) || !items.length || items.length > 40) return fail("COFFEE_INVALID");
      const pic = employee(order.pic_id);
      if (!pic) return fail("COFFEE_NOT_EMPLOYEE");
      let number: number; let round = 1; let root: unknown = null;
      if (order.parent_id) {
        const parent = rows("coffee_orders").find(row => row.id === order.parent_id && row.kind === "rapat");
        if (!parent) return fail("COFFEE_NOT_FOUND");
        root = parent.parent_id ?? parent.id;
        number = parent.number as number;
        round = Math.max(...rows("coffee_orders").filter(row => row.kind === "rapat" && row.number === number).map(row => row.round as number)) + 1;
      } else number = state.seq.meeting++;
      const team = items.map(item => item.for === "tim" ? employee(item.person_id) : null);
      if (items.some((item, index) => item.for === "tim" && !team[index])) return fail("COFFEE_NOT_EMPLOYEE");
      if (items.some(item => item.for !== "tim" && item.for !== "tamu")) return fail("COFFEE_INVALID");
      const id = uuid();
      const at = String(order.ordered_at ?? state.now.toISOString());
      const manual = order.manual === true;
      rows("coffee_orders").push({
        id, kind: "rapat", number, round, parent_id: root, employee_id: pic.id, person_name: pic.full_name, person_group: groupOf(pic.category), person_position: pic.position,
        person_bu: pic.business_unit, room: order.room || null, room_spot: order.room_spot || null, guest: order.guest || null, guest_count: order.guest_count ?? null, reject_note: null,
        ...processed(manual, order.actor_id, order.actor_label), created_by: order.actor_id ?? null, created_label: order.actor_label ?? null, manual,
        ordered_at: at, quota_month: wibMonth(at), idempotency_key: args.p_key ?? null,
      });
      items.forEach((item, index) => {
        const who = team[index];
        rows("coffee_order_items").push(itemRow(id, item, who
          ? { for_whom: "tim", employee_id: who.id, person_name: who.full_name, person_group: groupOf(who.category), person_position: who.position, person_bu: who.business_unit }
          : { for_whom: "tamu" }, index + 1));
      });
      return { data: id, error: null };
    },
    coffee_reopen(args) {
      const order = rows("coffee_orders").find(row => row.id === args.p_order);
      if (!order) return fail("COFFEE_NOT_FOUND");
      const fresh = order.processed_at && Date.parse(order.processed_at as string) > state.now.getTime() - Number(args.p_window_seconds) * 1000;
      if (!["selesai", "ditolak"].includes(order.status as string) || order.manual || (order.processed_by ?? null) !== (args.p_actor ?? null) || order.processed_label !== args.p_actor_label || !fresh) return fail("COFFEE_UNDO_EXPIRED");
      if (order.kind === "klaim" && order.status === "ditolak" && usedBy(order.employee_id, order.quota_month) >= quotaOf(order.person_group)) return fail("COFFEE_QUOTA_FULL");
      Object.assign(order, { status: "diproses", processed_by: null, processed_label: null, processed_at: null, reject_note: null });
      return { data: null, error: null };
    },
  };
  const rpc = async (name: string, args: Record<string, unknown>): Promise<Result> => {
    state.calls.push(`rpc:${name}`);
    if (!state.migrated && name.startsWith("coffee_")) return absent(name);
    return functions[name] ? functions[name](args) : absent(name);
  };

  return { state, rows, client: { from, rpc } };
}

export const PEOPLE = {
  rina: "11111111-1111-4111-8111-111111111111",
  bagas: "22222222-2222-4222-8222-222222222222",
  fajar: "33333333-3333-4333-8333-333333333333",
  dewi: "44444444-4444-4444-8444-444444444444",
  keluar: "55555555-5555-4555-8555-555555555555",
} as const;

/** Five made-up employees: a karyawan, a DW (the GA group), an intern, a pengelola, and one who left. */
export function seedPeople(db: ReturnType<typeof fakeDb>) {
  const person = (id: string, full_name: string, nickname: string, category: string, business_unit: string, active = true) =>
    ({ id, full_name, nickname, category, business_unit, position: `Contoh ${category}`, active });
  db.state.tables.employees = [
    person(PEOPLE.rina, "Contoh Rina Putri", "Rina", "karyawan", "WNS"),
    person(PEOPLE.bagas, "Contoh Bagas Saputra", "Bagas", "dw", "WNS"),
    person(PEOPLE.fajar, "Contoh Fajar Nugroho", "Fajar", "intern", "CoE"),
    person(PEOPLE.dewi, "Contoh Dewi Lestari", "Dewi", "karyawan", "TEE"),
    person(PEOPLE.keluar, "Contoh Sudah Keluar", "Keluar", "karyawan", "WNS", false),
  ];
  db.state.tables.coffee_settings = [{ id: 1, quota_karyawan: 4, quota_ga: 2, quota_intern: 2 }];
  db.state.tables.admin_grants = [{ employee_id: PEOPLE.dewi, apps: ["coffee", "hr"] }];
  db.state.tables.coffee_orders = [];
  db.state.tables.coffee_order_items = [];
}
