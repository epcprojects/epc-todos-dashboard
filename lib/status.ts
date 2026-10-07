import { STATUS, type Status } from './constants';
import { fmtDT } from './dates';

export interface StatusInput {
  status: Status;
  startedAt: string | null;
  completedAt: string | null;
  blockedReason: string;
}

/** What a status change does to the tracking columns. 'now' means "the database clock". */
export interface StatusPatch {
  status: Status;
  completedAt: 'now' | null | undefined;
  /** When leaving "completed": the old completed_at value moves here. */
  lastCompletedAt: string | null | undefined;
  startedAt: 'now' | undefined;
  blockedReason: string;
}

/**
 * Port of the prototype's statusPatch. Runs on the server so the browser cannot fake timestamps.
 * `tz` only affects the wording of the "previously completed" history note.
 */
export function statusPatch(t: StatusInput, st: Status, reason?: string | null, tz?: string): { patch: StatusPatch; msg: string } {
  const old = t.status;
  const patch: StatusPatch = {
    status: st,
    completedAt: undefined,
    lastCompletedAt: undefined,
    startedAt: undefined,
    blockedReason: '',
  };
  if (st === 'completed' && old !== 'completed') patch.completedAt = 'now';
  if (st !== 'completed' && old === 'completed') {
    patch.completedAt = null;
    patch.lastCompletedAt = t.completedAt || null;
  }
  if (st === 'in_progress' && !t.startedAt) patch.startedAt = 'now';
  patch.blockedReason = st === 'blocked' ? (reason != null ? reason : t.blockedReason || '') : '';
  let msg = `Status changed: ${STATUS[old] || old} → ${STATUS[st]}`;
  if (st === 'completed' && old !== 'completed') msg = `Completed (was ${STATUS[old] || old})`;
  if (old === 'completed' && st !== 'completed') msg += ` · previously completed ${fmtDT(t.completedAt, tz)}`;
  if (st === 'blocked' && patch.blockedReason) msg += ` · ${patch.blockedReason}`;
  return { patch, msg };
}
