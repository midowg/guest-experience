import { AppLoading } from "@/components/ui/AppLoading";

/** Main WAM's own loading screen (19 Nov 2026), in its theme: opening it and its sign-in, not Journey's white page. */
export default function MainWamLoading() {
  return <AppLoading tone="main-wam" name="WAM" />;
}
