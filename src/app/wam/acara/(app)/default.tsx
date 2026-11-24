import { notFound } from "next/navigation";

/** The frame's own page when Next cannot recover it next to the @sheet slot: an address that is no screen is a 404, as before. */
export default function Default(): never {
  notFound();
}
