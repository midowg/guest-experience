import type { CoffeePushState } from "@/lib/coffee/notify";
import type { PushPort } from "./usePush";

/*
 * A make-believe device and push server, for the previews (/dev-preview/coffee/nyata/*) and the
 * tests: the three places that offer "Nyalakan notifikasi" run their real components on it, in
 * whichever state is asked for. Nothing is registered and nothing is sent.
 *   start    the state the device is found in (see CoffeePushState)
 *   answer   what the browser's permission question is answered with when it is asked
 *   fail     the server refuses to save the device (as before the push migration)
 */
export function samplePush(start: CoffeePushState = "off", options: { answer?: NotificationPermission; fail?: boolean } = {}): PushPort & { calls: string[]; saved: () => boolean } {
  const calls: string[] = [];
  let subscribed = start === "on";
  let permission: NotificationPermission = start === "on" ? "granted" : start === "denied" ? "denied" : "default";
  const subscription = {
    endpoint: "https://push.example/contoh",
    toJSON: () => ({ endpoint: "https://push.example/contoh", keys: { p256dh: "contoh-p256dh-key", auth: "contoh-auth" } }),
    unsubscribe: async () => { calls.push("unsubscribe"); subscribed = false; return true; },
  };
  const refused = (status: number, message: string) => Object.assign(new Error(message), { status });
  return {
    calls,
    saved: () => subscribed,
    device: {
      support: () => start === "ios-install" || start === "unsupported" ? start : "ok",
      permission: () => permission,
      ask: async () => { calls.push("ask"); permission = options.answer ?? "granted"; return permission; },
      current: async () => subscribed ? subscription : null,
      subscribe: async () => { calls.push("subscribe"); subscribed = true; return subscription; },
      label: () => "Contoh · Chrome",
    },
    api: {
      async info() {
        calls.push("info");
        if (start === "account") throw refused(409, "Masuk dengan akun karyawan untuk menerima notifikasi.");
        return start === "not-ready" ? { publicKey: null, waiting: "kunci" } : { publicKey: "BContohKunciPublik", waiting: null };
      },
      async save() {
        calls.push("save");
        if (options.fail) { subscribed = false; throw refused(503, "Notifikasi menunggu migrasi 202612010002_coffee_push.sql."); }
      },
      async remove(endpoint) { calls.push(`remove:${endpoint}`); },
      async test() { calls.push("test"); return "Notifikasi tes dikirim."; },
    },
  };
}

const STATES: readonly CoffeePushState[] = ["off", "on", "denied", "ios-install", "unsupported", "not-ready", "account"];
/** The state a preview address asks for (?notif=…); "off" for anything else. */
export const sampleState = (value: string | undefined): CoffeePushState => STATES.find(state => state === value) ?? "off";
