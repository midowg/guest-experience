import { markInvitationOpened } from "@/lib/server/invitations";
import { checkOrigin, handle, success } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * The guest's browser reports that the personal page was shown. Link-preview crawlers do not
 * run scripts, so a WhatsApp preview does not count. The answer never says whether the token exists.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  return handle(async () => {
    checkOrigin(request);
    const { slug, token } = await params;
    await markInvitationOpened(slug, token);
    return success(null, "Tercatat.");
  });
}
