import { managesApp } from "@/lib/pra-wam/roles";
import { seesQuestionnaire } from "@/lib/pra-wam/questionnaire";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { cardsWaiting, ensureCard, myCard } from "@/lib/server/pra-wam/cards";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { myAnswers } from "@/lib/server/pra-wam/questionnaire-answers";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** The form someone may have a card of: an open or closed one, or a draft for Admin WAM trying it. */
async function formFor(member: Awaited<ReturnType<typeof requireApiMember>>) {
  const form = await currentForm();
  if (!form || !seesQuestionnaire(form, member.id, managesApp(member))) throw new ServiceError(404, "Kuesioner belum dibuka.");
  return form;
}

/** GET: my character card, or null when it is not drawn yet. Never draws. */
export async function GET() {
  return handle(async () => {
    const member = await requireApiMember();
    return success({ card: await myCard(await formFor(member), member.id) }, "Kartu dimuat.");
  });
}

/**
 * POST: my card, drawn now if I have finished and have none. The level, look and number are
 * drawn once and kept; asking again returns the same card.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const form = await formFor(member);
    const mine = await myAnswers(form, member.id);
    if (!mine.completedAt) throw new ServiceError(409, "Selesaikan dulu semua bagian wajib, lalu kartumu dibuka.");
    const card = await ensureCard(form, member.id, mine.answers);
    if (!card) throw cardsWaiting();
    return success({ card }, "Kartu siap.");
  });
}
