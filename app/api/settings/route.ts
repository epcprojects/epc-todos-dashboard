import { z } from 'zod';
import { publicRoles, readSettings, requireSession } from '@/lib/server/auth';
import { q } from '@/lib/server/db';
import { body, handle, json } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

/** Only these fields ever reach the browser: no PIN hashes. */
export const GET = handle(async (req: Request) => {
  const { settings } = await requireSession(req);
  return json({ targetBuffer: settings.targetBuffer, allowTeamEdit: settings.allowTeamEdit, pins: settings.hasPin, roles: publicRoles(settings) });
});

const patch = z
  .object({
    targetBuffer: z.number().int().min(1).max(60).optional(),
    allowTeamEdit: z.boolean().optional(),
  })
  .refine((v) => v.targetBuffer !== undefined || v.allowTeamEdit !== undefined, 'Nothing to change');

export const PATCH = handle(async (req: Request) => {
  await requireSession(req, ['admin']);
  const p = await body(req, patch);
  await q(
    `UPDATE settings SET target_buffer_days = COALESCE($1::int, target_buffer_days), allow_team_edit = COALESCE($2::boolean, allow_team_edit), updated_at = now() WHERE id = 1`,
    [p.targetBuffer ?? null, p.allowTeamEdit ?? null],
  );
  const s = await readSettings();
  return json({ targetBuffer: s.targetBuffer, allowTeamEdit: s.allowTeamEdit, pins: s.hasPin, roles: publicRoles(s) });
});
