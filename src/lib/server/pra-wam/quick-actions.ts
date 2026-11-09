import "server-only";
import { cache } from "react";
import { agendaItems } from "./agenda";

/**
 * The person's agenda, read once per request. (Aksi cepat, the blue + that also read it, was
 * removed on 9 Nov 2026: check-in lives on Beranda, Book has its own tab.)
 */
export const myAgenda = cache(agendaItems);
