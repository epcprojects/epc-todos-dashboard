import { z } from 'zod';
import { requireSession } from '@/lib/server/auth';
import { q, type Row } from '@/lib/server/db';
import { ApiError, body, handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

const schema = z.object({ errors: z.number().int().min(0).default(0) });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSession(req, ['admin']);
  const { id } = await ctx.params;
  const { errors } = await body(req, schema);
  const rows = (await q(
    `UPDATE imports SET status = CASE WHEN $2::int > 0 THEN 'incomplete' ELSE 'complete' END, errors = $2::int, finished_at = now() WHERE id = $1 RETURNING id`,
    [id, errors],
  )) as Row[];
  if (!rows.length) throw new ApiError(404, 'Import not found.');
  return json({ ok: true });
});
