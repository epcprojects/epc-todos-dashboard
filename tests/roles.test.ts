import { afterEach, describe, expect, it } from 'vitest';
import { ROLES, TEAMS, TEAM_SHORT, registerRoles, teamKeys, workTeams } from '@/lib/constants';
import { canRead } from '@/lib/perms';
import { covAll } from '@/lib/metrics';

afterEach(() => registerRoles([]));

describe('admin-created roles', () => {
  it('register as teams and login roles, between Video Editor and Admin Only', () => {
    registerRoles([{ key: 'front-end-developer', name: 'Front-end Developer' }]);
    expect(teamKeys()).toEqual(['designer', 'editor', 'front-end-developer', 'admin', 'unassigned']);
    expect(TEAMS['front-end-developer']).toBe('Front-end Developer');
    expect(ROLES['front-end-developer']).toBe('Front-end Developer');
    expect(TEAM_SHORT['front-end-developer']).toBe('Front-end Developer');
    expect(workTeams()).toEqual(['designer', 'editor', 'front-end-developer']);
  });
  it('removing a role removes its names again', () => {
    registerRoles([{ key: 'qa', name: 'QA' }]);
    registerRoles([]);
    expect(TEAMS.qa).toBeUndefined();
    expect(ROLES.qa).toBeUndefined();
    expect(teamKeys()).toEqual(['designer', 'editor', 'admin', 'unassigned']);
  });
  it('a custom role reads only tasks assigned to it', () => {
    expect(canRead('qa', { team: 'qa', archived: false })).toBe(true);
    expect(canRead('qa', { team: 'designer', archived: false })).toBe(false);
    expect(canRead('qa', { team: 'qa', archived: true })).toBe(false);
  });
  it('overall coverage uses the slowest team, including custom roles', () => {
    const t = (d: string, status: 'completed' | 'not_started', team: string) => ({ postDate: d, status, team });
    const list = [t('2026-10-06', 'completed', 'designer'), t('2026-10-07', 'completed', 'designer'), t('2026-10-06', 'completed', 'editor'), t('2026-10-07', 'completed', 'editor'), t('2026-10-06', 'completed', 'qa'), t('2026-10-07', 'not_started', 'qa')];
    const c = covAll(list, '2026-10-05');
    expect(c.d.days).toBe(2);
    expect(c.extra[0].key).toBe('qa');
    expect(c.extra[0].c.days).toBe(1);
    expect(c.o.days).toBe(1);
  });
});
