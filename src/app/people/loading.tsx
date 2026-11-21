import { SplashWait } from "@/components/hr/Splash";

/**
 * WG People's own loading screen (21 Nov 2026): its splash, not Journey's page loader. Shown while
 * the server makes the first screen (opening the app, the sign-in, the app right after signing in).
 */
export default function HrLoading() {
  return <SplashWait />;
}
