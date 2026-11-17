import { vi } from "vitest";

/*
 * A stand-in for the Supabase client in fondasi's server tests: every query is recorded (table,
 * calls, and its round: one more than the deepest query answered before it was made), and answered
 * from `answer` after a timer hop, as a network would. React's cache() becomes a per-"request"
 * memo, cleared by newRequest(), so a test counts what one request costs: as in a page (React
 * memoizes during a server render), or with `fake.memo = false` as in a route handler (React's
 * cache() does not memoize outside a render). Not a test file itself.
 */

export type Query = { table: string; calls: [string, ...unknown[]][]; round: number; single: boolean };
export type Answer = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };

export const fake = {
  queries: [] as Query[],
  answer: ((): Answer => ({ data: [], error: null })) as (query: Query) => Answer,
  deepest: 0,
  /** false: cache() does not memoize (a route handler). */
  memo: true,
  /** Who currentMember() finds (the mocked Pra WAM session reads pw_accounts, then pw_roles). */
  member: null as null | { id: string; name: string; nickname: string; department: string; position: string; mustChangePassword: boolean; roles: string[]; photo: string | null },
};

/** One query through the stand-in (for mocked Pra WAM helpers that cost a query in real life). */
export const query = (table: string) => fakeClient().from(table) as unknown as PromiseLike<{ data: unknown; error: unknown }>;

/** Every query's call with this name (eq, order, …), as [table, ...args]. */
export const callsOf = (query: Query, name: string) => query.calls.filter(call => call[0] === name).map(call => call.slice(1));

/** A new request: nothing counted, nothing memoized; `pageRender: false` for a route handler. */
export function newRequest(pageRender = true) {
  fake.memo = pageRender;
  fake.queries = [];
  fake.deepest = 0;
  memo.clear();
}

function builder(table: string) {
  const query: Query = { table, calls: [], round: fake.deepest + 1, single: false };
  fake.queries.push(query);
  const proxy: object = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => new Promise(done => setTimeout(done, 1)).then(() => {
          fake.deepest = Math.max(fake.deepest, query.round);
          const answer = fake.answer(query);
          const data = query.single && Array.isArray(answer.data) ? answer.data[0] ?? null : answer.data ?? null;
          return { data, error: answer.error ?? null, count: answer.count ?? (Array.isArray(answer.data) ? answer.data.length : null) };
        }).then(resolve, reject);
      }
      return (...args: unknown[]) => {
        query.calls.push([String(prop), ...args]);
        if (prop === "maybeSingle" || prop === "single") query.single = true;
        return proxy;
      };
    },
  });
  return proxy;
}

export const fakeClient = () => ({ from: (table: string) => builder(table), rpc: (name: string) => builder(`rpc:${name}`) });

const memo = new Map<unknown, Map<string, unknown>>();
/** React's cache() for tests: one answer per arguments until newRequest(). */
export function fakeCache<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return (...args: A) => {
    if (!fake.memo) return fn(...args);
    const forFn = memo.get(fn) ?? new Map<string, unknown>();
    memo.set(fn, forFn);
    const key = JSON.stringify(args);
    if (!forFn.has(key)) forFn.set(key, fn(...args));
    return forFn.get(key) as R;
  };
}

/** The mocks every fondasi server test needs; call at the top of the test file (vi.mock is hoisted there). */
export const supabaseMock = () => ({ createPrivilegedClient: () => fakeClient(), createPublicClient: () => fakeClient() });
export const reactMock = async (original: () => Promise<typeof import("react")>) => ({ ...(await original()), cache: fakeCache });
export const spyWarn = () => vi.spyOn(console, "warn").mockImplementation(() => undefined);
