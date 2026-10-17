import { z } from 'zod';
import { queryOne, exec } from '../../../../../lib/db';
import { resolvePortalToken } from '../../../../../lib/portal';
import { parseBody, type RouteCtx } from '../../../../../lib/validate';

type Ctx = RouteCtx<{ token: string }>;

const guestSchema = z.object({
  guest_name: z.string().trim().min(2).max(120),
  guest_phone: z.string().trim().max(40).default(''),
  guest_email: z.string().trim().max(120).default(''),
  guest_address: z.string().trim().max(255).default(''),
  guest_id_type: z.string().trim().max(40).default(''),
  guest_id_number: z.string().trim().max(80).default(''),
});

/**
 * Guest self-registration from the portal (public, token-authenticated).
 * Optional for the guest — but once submitted, the details attach to the stay
 * and show on the folio, stays list and checkout. Guests may update their
 * details by submitting again.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const resolved = await resolvePortalToken(token ?? '');
  if (!resolved) {
    return Response.json({ error: 'This link is invalid or has expired.' }, { status: 404 });
  }

  const stay = await queryOne<{ id: number; status: string }>(
    `SELECT id, status FROM stays WHERE id = ?`,
    [resolved.stay_id],
  );
  if (!stay) return Response.json({ error: 'Stay not found.' }, { status: 404 });
  if (stay.status !== 'ACTIVE') {
    return Response.json({ error: 'This stay is no longer active.' }, { status: 409 });
  }

  const parsed = parseBody(guestSchema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const g = parsed.data;

  if (g.guest_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g.guest_email)) {
    return Response.json({ error: 'Please enter a valid email address.' }, { status: 422 });
  }

  try {
    await exec(
      `UPDATE stays
       SET guest_name = ?, guest_phone = NULLIF(?, ''), guest_email = NULLIF(?, ''),
           guest_address = NULLIF(?, ''), guest_id_type = NULLIF(?, ''), guest_id_number = NULLIF(?, ''),
           guest_registered_at = NOW()
       WHERE id = ?`,
      [g.guest_name, g.guest_phone ?? '', g.guest_email ?? '', g.guest_address ?? '', g.guest_id_type ?? '', g.guest_id_number ?? '', stay.id],
    );
  } catch (e: unknown) {
    // Columns not migrated yet — tell the guest to try again later instead of 500ing.
    const msg = e instanceof Error ? e.message : String(e);
    if (/unknown column|doesn't exist/i.test(msg)) {
      return Response.json({ error: 'Registration is being set up. Please try again in a few minutes.' }, { status: 503 });
    }
    throw e;
  }

  return Response.json({ ok: true, guest_name: g.guest_name });
}
