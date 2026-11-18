import { SearchX } from "lucide-react";
import { ScreenContent } from "@/components/main-wam/shell";
import { Button, EmptyState } from "@/components/main-wam/ui";
import { praWamPath } from "@/lib/routes";
import { mainWamShown } from "@/lib/server/main-wam/gate";
import { serverT } from "@/lib/server/main-wam/lang";
import NotFound from "@/app/not-found";

/**
 * Not found inside Main WAM: an unknown address, or Main WAM (or one of its modules) is not on for
 * this person (docs/main-wam/KONTRAK.md §3). Says nothing about why, and leads back to WAM. For
 * someone Main WAM is not shown to (mode pra/uji, not a penguji) it is the site's own "not found",
 * the same page as any unknown address under /wam (audit M6): nothing tells that Main WAM is here.
 */
export default async function MainWamNotFound() {
  if (!(await mainWamShown())) return <NotFound />;
  const t = await serverT();
  return <ScreenContent>
    <EmptyState icon={<SearchX />} title={t("shell.notFoundTitle")} action={<Button href={praWamPath.home} variant="secondary">{t("shell.notFoundBack")}</Button>}>
      {t("shell.notFoundBody")}
    </EmptyState>
  </ScreenContent>;
}
