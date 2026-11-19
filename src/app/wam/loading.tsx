import pw from "@/components/pra-wam/pra-wam.module.css";
import { AppLoading } from "@/components/ui/AppLoading";

/*
 * WAM's own loading screen (19 Nov 2026): opening WAM, the sign-in and the questionnaire, in WAM's look and
 * the person's light or dark (the wrapper in layout.tsx), not Journey's white page. Inside the app each
 * screen keeps its skeleton (the loading.tsx files under (app)).
 */
export default function WamLoading() {
  return <div className={pw.app}><AppLoading tone="wam" name="WAM" /></div>;
}
