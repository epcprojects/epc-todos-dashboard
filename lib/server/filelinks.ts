import { captionOf } from '@/lib/text';
import type { FileLink, TaskOption } from '@/lib/manage-config';
import { hasFounderColumn } from './tasks';
import { q, type Row } from './db';
import { ApiError } from './http';

const MIGRATION = 'Attaching tasks to files needs a one-time database update (migrations/003_file_tasks.sql). Run it in the Neon SQL Editor, then try again.';
const missing = (e: unknown) => (e as { code?: string })?.code === '42P01';

/** Links for the given keys (all when omitted). Until migration 003 has been run there are simply no links. */
export async function readLinks(): Promise<Record<string, FileLink>> {
  const founder = (await hasFounderColumn()) ? 't.is_founder' : 'false';
  try {
    const rows = (await q(
      `SELECT f.s3_key, t.id, t.title, t.platform, t.post_date::text AS post_date, t.team, t.status, ${founder} AS founder, t.headers, t.vals
         FROM file_tasks f JOIN tasks t ON t.id = f.task_id`,
    )) as Row[];
    const out: Record<string, FileLink> = {};
    for (const r of rows) {
      const vals = (r.vals as string[]) || [];
      out[String(r.s3_key)] = {
        taskId: String(r.id),
        title: String(r.title || '') || vals.find((x) => x && x.length > 3 && !/^https?:\/\//i.test(x))?.slice(0, 90) || 'Task',
        platform: String(r.platform ?? ''),
        postDate: r.post_date ? String(r.post_date) : null,
        team: String(r.team),
        status: String(r.status),
        founder: !!r.founder,
        caption: captionOf((r.headers as string[]) || [], vals),
      };
    }
    return out;
  } catch (e) {
    if (missing(e)) return {};
    throw e;
  }
}

/** Attaches (or, with taskId null, removes) the task of one file. The task must belong to the team the file kind needs. */
export async function setLink(key: string, taskId: string | null, team: string, by: string, platform: string | null = null) {
  try {
    if (taskId === null) {
      await q(`DELETE FROM file_tasks WHERE s3_key = $1`, [key]);
      return;
    }
    const t = (await q(`SELECT team, platform FROM tasks WHERE id = $1`, [taskId])) as Row[];
    if (!t.length) throw new ApiError(404, 'That task no longer exists.');
    if (String(t[0].team) !== team) throw new ApiError(400, `That task belongs to another team. Pick a ${team === 'designer' ? 'Graphic Designer' : 'Video Editor'} task.`);
    // a file in a platform folder (LinkedIn, TikTok …) only takes a task of that platform
    if (platform && !String(t[0].platform ?? '').toLowerCase().includes(platform)) {
      const name = { linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' }[platform] || platform;
      throw new ApiError(400, `This file is in the ${name} folder, but that task is for ${String(t[0].platform || 'another platform')}. Pick a ${name} task.`);
    }
    await q(
      `INSERT INTO file_tasks (s3_key, task_id, attached_by) VALUES ($1, $2, $3)
       ON CONFLICT (s3_key) DO UPDATE SET task_id = EXCLUDED.task_id, attached_by = EXCLUDED.attached_by, attached_at = now()`,
      [key, taskId, by],
    );
  } catch (e) {
    if (missing(e)) throw new ApiError(409, MIGRATION);
    throw e;
  }
}

/** Housekeeping after a delete or rename; never blocks the file operation itself. */
export async function dropLinks(keys: string[]) {
  if (!keys.length) return;
  try {
    await q(`DELETE FROM file_tasks WHERE s3_key IN (SELECT jsonb_array_elements_text($1::jsonb))`, [JSON.stringify(keys)]);
  } catch (e) {
    if (!missing(e)) throw e;
  }
}
export async function moveLink(from: string, to: string) {
  try {
    await q(`UPDATE file_tasks SET s3_key = $2 WHERE s3_key = $1`, [from, to]);
  } catch (e) {
    if (!missing(e)) throw e;
  }
}

/** Unfinished tasks of one team for the dropdown, earliest posting date first. */
export async function taskOptions(team: string): Promise<TaskOption[]> {
  const founder = (await hasFounderColumn()) ? 'is_founder' : 'false';
  const rows = (await q(
    `SELECT id, title, platform, post_date::text AS post_date, ${founder} AS founder, vals
       FROM tasks WHERE team = $1 AND status <> 'completed' AND NOT archived
      ORDER BY post_date NULLS LAST, title LIMIT 3000`,
    [team],
  )) as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title || '') || ((r.vals as string[]) || []).find((x) => x && x.length > 3 && !/^https?:\/\//i.test(x))?.slice(0, 90) || 'Task',
    platform: String(r.platform ?? ''),
    postDate: r.post_date ? String(r.post_date) : null,
    founder: !!r.founder,
  }));
}
