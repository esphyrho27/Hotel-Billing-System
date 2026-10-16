import { z } from 'zod';

export function parseBody<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { ok: true; data: T } | { ok: false; response: Response } {
  const r = schema.safeParse(data);
  if (!r.success) {
    return {
      ok: false,
      response: Response.json({ error: 'Invalid input', details: r.error.flatten().fieldErrors }, { status: 400 }),
    };
  }
  return { ok: true, data: r.data };
}

/** Next.js 16 dynamic route context (params is a promise). */
export type RouteCtx<T extends Record<string, string> = { id: string }> = {
  params: Promise<T>;
};

export async function routeId(ctx: RouteCtx): Promise<number> {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw Response.json({ error: 'Invalid id' }, { status: 400 });
  return n;
}
