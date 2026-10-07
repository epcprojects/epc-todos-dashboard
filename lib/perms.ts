import type { Role, Task } from './constants';

type T = Pick<Task, 'team' | 'archived'>;

/** Admin reads everything; a team member reads only their own team's active tasks. */
export const canRead = (role: Role, t: T) => role === 'admin' || (t.team === role && !t.archived);

/** Status, blocked reason and production notes: any task for admin, own team only otherwise. */
export const canTouch = (role: Role, t: T) => canRead(role, t);

/** Excel content fields: admin, or own team when the admin allowed it in Settings. */
export const canEditContent = (role: Role, t: T, allowTeamEdit: boolean) => role === 'admin' || (allowTeamEdit && canRead(role, t));

/** Assign, admin note, archive/restore, bulk actions, delete, imports, settings, PINs, reports. */
export const isAdminRole = (role: Role) => role === 'admin';
