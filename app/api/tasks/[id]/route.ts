import { z } from 'zod';
import { TEAMS, type Task } from '@/lib/constants';
import { parseDateText } from '@/lib/dates';
import { canEditContent, canTouch } from '@/lib/perms';
import { statusPatch } from '@/lib/status';
import { dupKey, deriveFields } from '@/lib/text';
import { requireSession } from '@/lib/server/auth';
import { q, tx } from '@/lib/server/db';
import { ApiError, body, clientTz, handle, json } from '@/lib/server/http';
import { deleteTasks, fetchTasks, historyQuery } from '@/lib/server/tasks';

export const dynamic = 'force-dynamic';

const schema = z
  .object({
    status: z.enum(['not_started', 'in_progress', 'completed', 'blocked']).optional(),
    blockedReason: z.string().max(200).optional(),
    notes: z.string().max(20000).optional(),
    content: z.array(z.string().max(40000)).max(200).optional(),
    team: z.enum(['designer', 'editor', 'admin', 'unassigned']).optional(),
    adminNote: z.string().max(20000).optional(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

/**
 * One request may change several fields; every field is permission-checked on the server.
 * Timestamps are set from the database clock, never from the browser.
 */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { session, settings } = await requireSession(req);
  const { id } = await ctx.params;
  const p = await body(req, schema);
  const role = session.role;
  const actor = { role, name: session.name };

  const [task] = await fetchTasks([id]);
  if (!task || (role !== 'admin' && !canTouch(role, task))) {
    // A team member asking about the other team's task gets the same answer as for a task that does not exist.
    throw new ApiError(role === 'admin' ? 404 : 403, role === 'admin' ? 'Task not found.' : 'You can only change tasks assigned to your team.');
  }

  const adminOnly = p.team !== undefined || p.adminNote !== undefined || p.archived !== undefined;
  if (adminOnly && role !== 'admin') throw new ApiError(403, 'Only the admin can assign, archive or leave notes for the team.');
  if (p.content !== undefined && !canEditContent(role, task, settings.allowTeamEdit)) {
    throw new ApiError(403, 'Editing imported content is turned off for your team. Ask the admin to allow it in Settings.');
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, val: unknown, cast = '') => {
    params.push(val);
    sets.push(`${col} = $${params.length}${cast}`);
  };
  const history: { id: string; msg: string }[] = [];
  const log = (msg: string) => history.push({ id, msg });
  const tz = clientTz(req);

  // Status first so a blocked reason in the same request applies to the new status.
  let status = task.status;
  let blockedReason = task.blockedReason;
  if (p.status !== undefined && p.status !== task.status) {
    const { patch, msg } = statusPatch(task, p.status, p.blockedReason, tz);
    status = p.status;
    blockedReason = patch.blockedReason;
    set('status', p.status);
    set('blocked_reason', patch.blockedReason);
    if (patch.completedAt === 'now') sets.push('completed_at = now()');
    if (patch.completedAt === null) {
      sets.push('completed_at = NULL');
      set('last_completed_at', patch.lastCompletedAt ?? null, '::timestamptz');
    }
    if (patch.startedAt === 'now') sets.push('started_at = now()');
    log(msg);
  } else if (p.blockedReason !== undefined && status === 'blocked' && p.blockedReason.trim() !== blockedReason) {
    blockedReason = p.blockedReason.trim();
    set('blocked_reason', blockedReason);
    log('Blocked reason: ' + (blockedReason || 'cleared'));
  }

  if (p.notes !== undefined && p.notes !== task.notes) {
    set('notes', p.notes);
    log(p.notes ? 'Production notes updated' : 'Production notes cleared');
  }

  if (p.adminNote !== undefined && p.adminNote !== task.adminNote) {
    set('admin_note', p.adminNote);
    log(p.adminNote ? 'Admin left a note: ' + p.adminNote.slice(0, 80) : 'Admin note cleared');
  }

  if (p.team !== undefined && p.team !== task.team) {
    set('team', p.team);
    log(`Reassigned: ${TEAMS[task.team]} → ${TEAMS[p.team]}`);
  }

  if (p.archived !== undefined && p.archived !== task.archived) {
    set('archived', p.archived);
    log(p.archived ? 'Archived' : 'Restored from archive');
  }

  if (p.content !== undefined) {
    const v = [...task.v];
    p.content.forEach((x, i) => {
      if (i < v.length) v[i] = x;
    });
    const changed = v.map((x, i) => (x !== task.v[i] ? task.h[i] : null)).filter((x): x is string => x !== null);
    if (changed.length) {
      const d = deriveFields(v, task.m);
      let postDate: string | null = task.postDate;
      if (task.m.date >= 0) postDate = parseDateText(v[task.m.date], task.dateOrder) || (v[task.m.date] === task.v[task.m.date] ? task.postDate : null);
      set('vals', JSON.stringify(v), '::jsonb');
      set('post_date', postDate, '::date');
      set('post_time', d.time);
      set('post_day', d.day);
      set('platform', d.platform);
      set('title', d.title);
      set('content_type', d.type);
      set('pillar', d.pillar);
      set('dup_key', dupKey(task.sheet, postDate, d.platform, d.title, v));
      log(`Content edited: ${changed.join(', ')}`);
    }
  }

  if (sets.length) {
    params.push(id);
    await tx([
      q(`UPDATE tasks SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params),
      historyQuery(history, actor),
    ]);
  }
  const [updated] = await fetchTasks([id]);
  return json({ task: updated as Task });
});

export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireSession(req, ['admin']);
  const { id } = await ctx.params;
  const n = await deleteTasks([id]);
  if (!n) throw new ApiError(404, 'Task not found.');
  return json({ ok: true });
});
