import { safePraWamNext } from "@/lib/pra-wam/next-path";
import { mainWamPath, praWamPath } from "@/lib/routes";

/*
 * Masuk (O02) and Izin notifikasi (O03, revisi 16 Nov): after the first sign-in on a phone, O03
 * once, then Beranda. Notifications are allowed per phone, so "once" is remembered on the phone
 * (an installed iPhone app keeps its own storage, so it asks again there, where push works). Someone
 * who signed in to go somewhere (a QR, a notification) goes there straight. The shared first
 * password still leads to WAM's own "Buat password baru" first. Pure.
 */

/** localStorage key: O03 was seen on this phone. */
export const ONBOARDED_KEY = "mw-mulai-v1";

/** Where to go after signing in. `next` was already checked (safePraWamNext). */
export function afterSignIn(next: string | null | undefined, opts: { askNewPassword: boolean; onboarded: boolean }): string {
  const asked = safePraWamNext(next) ?? mainWamPath.home;
  const target = !opts.onboarded && asked === mainWamPath.home ? mainWamPath.onboarding : asked;
  return opts.askNewPassword ? praWamPath.newPassword(target) : target;
}
