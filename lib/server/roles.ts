import { BASE_TEAMS, registerRoles, type BaseRole } from '@/lib/constants';
import { q, type Row } from './db';
import { ApiError } from './http';

export interface CustomRoleRow {
  key: string;
  name: string;
  hasPin: boolean;
  version: number;
}

export const BASE_ROLES: BaseRole[] = ['admin', 'designer', 'editor'];
export const isBaseRole = (r: string): r is BaseRole => (BASE_ROLES as string[]).includes(r);

/**
 * Admin-created roles live in the custom_roles table (see migrations/001_custom_roles.sql).
 * Until that migration has been run the table does not exist; then there simply are no custom roles.
 */
export async function readCustomRoles(): Promise<CustomRoleRow[]> {
  try {
    const rows = (await q(`SELECT key, name, (pin_hash IS NOT NULL) AS has_pin, pin_version FROM custom_roles ORDER BY created_at, key`)) as Row[];
    return rows.map((r) => ({ key: String(r.key), name: String(r.name), hasPin: !!r.has_pin, version: Number(r.pin_version) }));
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return [];
    throw e;
  }
}

/** Loads the role names into the shared registry so history messages say "Front-end Developer", not an id. */
export async function syncRoleNames(): Promise<CustomRoleRow[]> {
  const list = await readCustomRoles();
  registerRoles(list);
  return list;
}

/** Throws 400 unless every team is a built-in team or an existing custom role. */
export async function assertTeams(teams: string[]) {
  const need = [...new Set(teams)].filter((t) => !(t in BASE_TEAMS));
  if (!need.length) return;
  const have = new Set((await readCustomRoles()).map((r) => r.key));
  const bad = need.find((t) => !have.has(t));
  if (bad) throw new ApiError(400, `Invalid request: unknown team "${bad}"`);
}
