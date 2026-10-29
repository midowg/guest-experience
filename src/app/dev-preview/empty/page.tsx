import { notFound } from "next/navigation";
import { EmptyHome } from "../../EmptyHome";

export const dynamic = "force-dynamic";

/**
 * Development-only: shows the front page as it looks with no event selected, so the empty
 * state can be reviewed without taking the live event down. Not reachable in production.
 */
export default function DevEmptyPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EmptyHome placeGuide fridaySharing />;
}
