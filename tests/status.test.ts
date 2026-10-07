import { describe, expect, it } from 'vitest';
import { statusPatch } from '@/lib/status';

const base = { status: 'not_started' as const, startedAt: null, completedAt: null, blockedReason: '' };

describe('statusPatch (server-side timestamps)', () => {
  it('completing stamps completed_at and uses the "Completed (was …)" wording', () => {
    const { patch, msg } = statusPatch({ ...base, status: 'in_progress', startedAt: '2026-10-01T00:00:00Z' }, 'completed');
    expect(patch.completedAt).toBe('now');
    expect(patch.startedAt).toBeUndefined();
    expect(msg).toBe('Completed (was In Progress)');
  });
  it('the first move to in progress sets started_at, later moves do not', () => {
    expect(statusPatch(base, 'in_progress').patch.startedAt).toBe('now');
    expect(statusPatch({ ...base, startedAt: '2026-10-01T00:00:00Z' }, 'in_progress').patch.startedAt).toBeUndefined();
  });
  it('leaving completed keeps the old value in last_completed_at and clears completed_at', () => {
    const { patch, msg } = statusPatch({ ...base, status: 'completed', completedAt: '2026-10-02T09:30:00Z' }, 'in_progress', undefined, 'UTC');
    expect(patch.completedAt).toBeNull();
    expect(patch.lastCompletedAt).toBe('2026-10-02T09:30:00Z');
    expect(msg).toBe('Status changed: Completed → In Progress · previously completed October 2, 2026 – 9:30 AM');
  });
  it('blocked keeps its reason only while blocked', () => {
    const b = statusPatch({ ...base, blockedReason: 'old' }, 'blocked', 'Waiting for logo');
    expect(b.patch.blockedReason).toBe('Waiting for logo');
    expect(b.msg).toBe('Status changed: Not Started → Blocked · Waiting for logo');
    expect(statusPatch({ ...base, status: 'blocked', blockedReason: 'x' }, 'not_started').patch.blockedReason).toBe('');
    expect(statusPatch({ ...base, status: 'in_progress', blockedReason: 'kept' }, 'blocked').patch.blockedReason).toBe('kept');
  });
});
