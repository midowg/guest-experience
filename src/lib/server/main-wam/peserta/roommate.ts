import "server-only";
import { roommateAnswers, type RoommateView } from "@/lib/main-wam/peserta/roommate";
import { sampleRoommate } from "@/lib/main-wam/sample-roommate";
import { cardName } from "@/lib/pra-wam/figures";
import { colleagueOf } from "../../pra-wam/colleagues";
import { currentForm } from "../../pra-wam/questionnaire";
import type { MainWamContext } from "../gate";
import { demoOn, demoPlaceFor } from "../demo";
import { mainWamPeople } from "../people";
import { viewerRoom } from "../viewer";

/*
 * A roommate's profile (Kamar, L01). Only someone in the SAME room as the viewer (HR's pairing, the room
 * Kamar already shows) can be opened, and only while they are active: anyone else is null (the route
 * answers 404, so nothing tells whether the person exists). What is shown is colleagueOf's profile: answers
 * marked `rekan` and nothing else (never panitia, HR, anonymous or secret answers), minus the name and
 * department the head already has, at most ROOMMATE_ANSWER_LIMIT. Without a card or questionnaire: the
 * person alone with `filled: false`.
 */
export async function loadRoommate(context: MainWamContext, targetId: string): Promise<RoommateView | null> {
  const { viewer } = context;
  if (targetId === viewer.id) return null;
  const real = await viewerRoom(viewer.id);
  const room = real ?? ((await demoOn()) ? demoPlaceFor(viewer).room : null);
  const index = room?.people.filter(person => !person.me).findIndex(person => person.id === targetId) ?? -1;
  if (!room || index < 0) return null;
  // Mode demo with no real room: the made-up profile of the made-up roommate.
  if (!real) return sampleRoommate(room.people.filter(person => !person.me)[index], index);

  const people = await mainWamPeople();
  const known = people.get(targetId);
  if (!known?.active) return null;
  const person = { id: known.id, name: known.name, department: known.department, photo: known.photo ?? null };
  const empty: RoommateView = { person, card: null, answers: [], filled: false };
  try {
    const form = await currentForm();
    const profile = form ? await colleagueOf(form, targetId) : null;
    if (!profile) return empty;
    const { card } = profile;
    return {
      person,
      card: { name: cardName(card), kind: card.figure ? card.character.class : [card.character.figure, card.character.class].filter(Boolean).join(" · "), tier: card.tier.name },
      answers: roommateAnswers(profile.answers),
      filled: true,
    };
  } catch { return empty; }
}
