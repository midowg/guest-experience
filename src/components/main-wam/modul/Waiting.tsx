import type { ReactNode } from "react";
import { Hourglass } from "lucide-react";
import { ScreenContent } from "@/components/main-wam/shell";
import { EmptyState } from "@/components/main-wam/ui";

/** Before the module's migration has run: a calm "menunggu pembaruan sistem", never an error. */
export function Waiting({ children }: { children?: ReactNode }) {
  return <ScreenContent>
    <EmptyState icon={<Hourglass />} title="Menunggu pembaruan sistem">{children ?? "Fitur ini aktif setelah pembaruan sistem selesai."}</EmptyState>
  </ScreenContent>;
}
