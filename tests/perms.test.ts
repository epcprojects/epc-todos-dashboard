import { describe, expect, it } from 'vitest';
import { canEditContent, canRead, canTouch, isAdminRole } from '@/lib/perms';

const task = (team: 'designer' | 'editor' | 'admin' | 'unassigned', archived = false) => ({ team, archived });

describe('role permissions (shared by the UI and the API)', () => {
  it('admin reads everything, including archived', () => {
    expect(canRead('admin', task('editor', true))).toBe(true);
    expect(canRead('admin', task('unassigned'))).toBe(true);
  });
  it('a team reads only its own active tasks', () => {
    expect(canRead('designer', task('designer'))).toBe(true);
    expect(canRead('designer', task('editor'))).toBe(false);
    expect(canRead('editor', task('designer'))).toBe(false);
    expect(canRead('designer', task('designer', true))).toBe(false);
    expect(canRead('designer', task('unassigned'))).toBe(false);
  });
  it('status/notes follow read access', () => {
    expect(canTouch('editor', task('editor'))).toBe(true);
    expect(canTouch('editor', task('designer'))).toBe(false);
  });
  it('content editing needs the admin switch for teams', () => {
    expect(canEditContent('designer', task('designer'), false)).toBe(false);
    expect(canEditContent('designer', task('designer'), true)).toBe(true);
    expect(canEditContent('designer', task('editor'), true)).toBe(false);
    expect(canEditContent('admin', task('editor'), false)).toBe(true);
  });
  it('only admin is an admin role', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('designer')).toBe(false);
    expect(isAdminRole('editor')).toBe(false);
  });
});
