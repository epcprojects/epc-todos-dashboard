import type { ColumnMap, HistoryEntry, ImportRec, Role, SheetMeta, Task, Team } from '@/lib/constants';
import { TEAMS } from '@/lib/constants';
import { statusPatch } from '@/lib/status';
import { iso, q, tx, type Row } from './db';

/** post_date is always selected as text so it stays 'YYYY-MM-DD' and never becomes a JS Date. */
export const TASK_COLS = `id, import_id, sheet_idx, sheet, workbook, excel_row, headers, vals, urls, column_map, date_order,
  post_date::text AS post_date, post_time, post_day, platform, title, content_type, pillar, dup_key,
  team, status, blocked_reason, notes, admin_note, archived,
  created_at, imported_at, updated_at, started_at, completed_at, last_completed_at, source_updated_from, source_updated_at`;

export function mapTask(r: Row): Task {
  return {
    id: String(r.id),
    importId: String(r.import_id),
    sheetIdx: Number(r.sheet_idx),
    sheet: String(r.sheet),
    workbook: String(r.workbook),
    row: Number(r.excel_row),
    h: (r.headers as string[]) || [],
    v: (r.vals as string[]) || [],
    u: (r.urls as Record<string, string>) || {},
    m: (r.column_map as ColumnMap) || ({} as ColumnMap),
    dateOrder: r.date_order === 'mdy' ? 'mdy' : 'dmy',
    postDate: r.post_date ? String(r.post_date) : null,
    time: String(r.post_time ?? ''),
    day: String(r.post_day ?? ''),
    platform: String(r.platform ?? ''),
    title: String(r.title ?? ''),
    type: String(r.content_type ?? ''),
    pillar: String(r.pillar ?? ''),
    dupKey: String(r.dup_key ?? ''),
    team: r.team as Team,
    status: r.status as Task['status'],
    blockedReason: String(r.blocked_reason ?? ''),
    notes: String(r.notes ?? ''),
    adminNote: String(r.admin_note ?? ''),
    archived: !!r.archived,
    createdAt: iso(r.created_at) as string,
    importedAt: iso(r.imported_at) as string,
    updatedAt: iso(r.updated_at) as string,
    startedAt: iso(r.started_at),
    completedAt: iso(r.completed_at),
    lastCompletedAt: iso(r.last_completed_at),
    sourceUpdatedFrom: r.source_updated_from == null ? null : String(r.source_updated_from),
    sourceUpdatedAt: iso(r.source_updated_at),
  };
}

export function mapHistory(r: Row): HistoryEntry {
  return {
    at: iso(r.at) as string,
    name: String(r.actor_name ?? ''),
    role: r.actor_role as Role,
    msg: String(r.message),
    ...(r.task_id != null ? { taskId: String(r.task_id), title: String(r.title ?? '') } : {}),
  };
}

export function mapImports(imports: Row[], sheets: Row[]): ImportRec[] {
  const by = new Map<string, SheetMeta[]>();
  for (const s of sheets) {
    const id = String(s.import_id);
    const list = by.get(id) || [];
    list.push({
      idx: Number(s.sheet_idx),
      name: String(s.name),
      team: s.team as Team,
      rows: Number(s.row_count),
      added: Number(s.added),
      updated: Number(s.updated),
      skipped: Number(s.skipped),
      headers: (s.headers as string[]) || [],
      map: (s.column_map as ColumnMap) || ({} as ColumnMap),
      dateOrder: s.date_order === 'mdy' ? 'mdy' : 'dmy',
    });
    by.set(id, list);
  }
  return imports.map((i) => ({
    id: String(i.id),
    workbook: String(i.workbook),
    mode: i.mode as ImportRec['mode'],
    status: i.status as ImportRec['status'],
    errors: Number(i.errors),
    totalTasks: Number(i.total_tasks),
    uploadedBy: i.uploaded_by == null ? null : String(i.uploaded_by),
    uploadedAt: iso(i.uploaded_at) as string,
    finishedAt: iso(i.finished_at),
    sheets: by.get(String(i.id)) || [],
  }));
}

export const jsonIds = (ids: string[]) => JSON.stringify(ids);

/** Tasks that should drop out of a deleted-tasks log entry are pruned after a week. */
export const PRUNE_DELETED = `DELETE FROM deleted_tasks WHERE deleted_at < now() - interval '7 days'`;

export async function fetchTasks(ids: string[]): Promise<Task[]> {
  if (!ids.length) return [];
  const rows = (await q(`SELECT ${TASK_COLS} FROM tasks WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))`, [jsonIds(ids)])) as Row[];
  return rows.map(mapTask);
}

/** The few columns bulk operations need, so large selections stay cheap. */
export type TaskLite = Pick<Task, 'id' | 'team' | 'status' | 'archived' | 'startedAt' | 'completedAt' | 'blockedReason'>;

export async function fetchLite(ids: string[]): Promise<TaskLite[]> {
  if (!ids.length) return [];
  const rows = (await q(
    `SELECT id, team, status, archived, started_at, completed_at, blocked_reason FROM tasks WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))`,
    [jsonIds(ids)],
  )) as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    team: r.team as Team,
    status: r.status as Task['status'],
    archived: !!r.archived,
    startedAt: iso(r.started_at),
    completedAt: iso(r.completed_at),
    blockedReason: String(r.blocked_reason ?? ''),
  }));
}

interface Actor {
  role: Role;
  name: string;
}

const HISTORY_FROM_RECORDSET = `INSERT INTO task_history (task_id, actor_name, actor_role, message)
  SELECT x.id, $2, $3, x.msg FROM jsonb_to_recordset($1::jsonb) AS x(id text, msg text)`;

export const historyQuery = (entries: { id: string; msg: string }[], actor: Actor) =>
  q(HISTORY_FROM_RECORDSET, [JSON.stringify(entries), actor.name, actor.role]);

/** Change the status of several tasks at once. Timestamps come from the database clock. */
export async function changeStatuses(taskRows: TaskLite[], status: Task['status'], actor: Actor, tz?: string, reason?: string | null) {
  const todo = taskRows.filter((t) => t.status !== status);
  if (!todo.length) return;
  const items = todo.map((t) => {
    const { patch, msg } = statusPatch(t, status, reason, tz);
    return {
      id: t.id,
      status,
      set_completed: patch.completedAt === 'now',
      clear_completed: patch.completedAt === null,
      last_completed: patch.lastCompletedAt ?? null,
      set_started: patch.startedAt === 'now',
      blocked_reason: patch.blockedReason,
      msg,
    };
  });
  const payload = JSON.stringify(items);
  await tx([
    q(
      `UPDATE tasks t SET
         status = x.status,
         completed_at = CASE WHEN x.set_completed THEN now() WHEN x.clear_completed THEN NULL ELSE t.completed_at END,
         last_completed_at = CASE WHEN x.clear_completed THEN x.last_completed::timestamptz ELSE t.last_completed_at END,
         started_at = CASE WHEN x.set_started THEN now() ELSE t.started_at END,
         blocked_reason = x.blocked_reason,
         updated_at = now()
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, status text, set_completed boolean, clear_completed boolean, last_completed text, set_started boolean, blocked_reason text)
       WHERE t.id = x.id`,
      [payload],
    ),
    historyQuery(items.map((i) => ({ id: i.id, msg: i.msg })), actor),
  ]);
}

export async function assignTeam(taskRows: TaskLite[], team: Team, actor: Actor, label = 'Reassigned') {
  const todo = taskRows.filter((t) => t.team !== team);
  if (!todo.length) return;
  await tx([
    q(`UPDATE tasks SET team = $2, updated_at = now() WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))`, [jsonIds(todo.map((t) => t.id)), team]),
    historyQuery(todo.map((t) => ({ id: t.id, msg: `${label}: ${TEAMS[t.team]} → ${TEAMS[team]}` })), actor),
  ]);
}

export async function setArchived(taskRows: TaskLite[], archived: boolean, actor: Actor, msg?: string) {
  const todo = taskRows.filter((t) => t.archived !== archived);
  if (!todo.length) return;
  const text = msg || (archived ? 'Archived' : 'Restored from archive');
  await tx([
    q(`UPDATE tasks SET archived = $2, updated_at = now() WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))`, [jsonIds(todo.map((t) => t.id)), archived]),
    historyQuery(todo.map((t) => ({ id: t.id, msg: text })), actor),
  ]);
}

/** Permanent delete. IDs go into deleted_tasks in the same transaction so polling browsers can drop them. */
export async function deleteTasks(ids: string[]) {
  if (!ids.length) return 0;
  const j = jsonIds(ids);
  const res = await tx([
    q(
      `INSERT INTO deleted_tasks (task_id, team) SELECT id, team FROM tasks WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb))
       ON CONFLICT (task_id) DO UPDATE SET deleted_at = now(), team = EXCLUDED.team`,
      [j],
    ),
    q(`DELETE FROM tasks WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)) RETURNING id`, [j]),
    q(PRUNE_DELETED),
  ]);
  return res[1].length;
}

