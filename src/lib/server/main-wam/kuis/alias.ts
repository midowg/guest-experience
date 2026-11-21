import "server-only";
import { createPrivilegedClient } from "../../supabase/admin";
import { catalogOf, columnsFor, viewOf, withFigures, type PersonCardRow } from "../../pra-wam/cards";
import { currentForm } from "../../pra-wam/questionnaire";

/*
 * A player's alias (rancangan §3): the tokoh of their questionnaire card (Cerita Kita: one person per
 * tokoh, "1 dari 1"), with its persona and colours. No card (not filled in, no tokoh left, or before the
 * cards' migrations): null, and the game gives "Tokoh misterius #NN" (mw_quiz_join). Read once, when the
 * person joins; never fails the join.
 */

export type FigureAlias = { figure: string; alias: string; persona: string; colors: [string, string] };

export async function figureAlias(employeeId: string): Promise<FigureAlias | null> {
  try {
    const form = await currentForm();
    if (!form) return null;
    const catalog = await catalogOf(form.id);
    if (!catalog?.figuresReady) return null;
    const { data, error } = await createPrivilegedClient().from("cq_person_cards").select(columnsFor(catalog))
      .eq("form_id", form.id).eq("employee_id", employeeId).eq("trial", false).maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as PersonCardRow;
    // A card from before the tokoh gets its tokoh now, as on every page that shows cards.
    const [shown] = await withFigures(form, [row], catalog).catch(() => [row]);
    const view = viewOf(shown, catalog);
    if (!view?.figure || !/^[a-z0-9-]{1,60}$/.test(view.figure.key)) return null;
    return { figure: view.figure.key, alias: view.figure.name.slice(0, 80), persona: view.character.class.slice(0, 60), colors: view.colors };
  } catch {
    return null;
  }
}
