import { SearchX } from "lucide-react";
import { ScreenContent } from "@/components/main-wam/shell";
import { Button, EmptyState } from "@/components/main-wam/ui";
import { praWamPath } from "@/lib/routes";

/**
 * Not found inside Main WAM: an unknown address, or Main WAM (or one of its modules) is not on for
 * this person (docs/main-wam/KONTRAK.md §3). Says nothing about why, and leads back to WAM.
 */
export default function MainWamNotFound() {
  return <ScreenContent>
    <EmptyState icon={<SearchX />} title="Halaman tidak ditemukan" action={<Button href={praWamPath.home} variant="secondary">Kembali ke WAM</Button>}>
      Periksa lagi tautannya, atau buka WAM dari ikon di HP.
    </EmptyState>
  </ScreenContent>;
}
