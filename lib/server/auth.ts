import { jwtVerify, SignJWT } from 'jose';
import type { NextResponse } from 'next/server';
import { registerRoles, type BaseRole, type CustomRole, type Role } from '@/lib/constants';
import { q, type Row } from './db';
import { ApiError } from './http';
import { isBaseRole, readCustomRoles, type CustomRoleRow } from './roles';

export const COOKIE = 'epc_session';
const MAX_AGE = 60 * 60 * 24 * 30;

export interface Session {
  role: Role;
  name: string;
  pinVersion: number;
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters');
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ role: s.role, name: s.name, pinVersion: s.pinVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret());
}

export async function setSessionCookie(res: NextResponse, s: Session) {
  res.cookies.set(COOKIE, await signSession(s), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}

export interface SettingsRow {
  targetBuffer: number;
  allowTeamEdit: boolean;
  hasPin: Record<BaseRole, boolean>;
  versions: Record<BaseRole, number>;
  custom: CustomRoleRow[];
}

/** The part of the custom roles the browser may see (never versions or hashes). */
export const publicRoles = (s: SettingsRow): CustomRole[] => s.custom.map((r) => ({ key: r.key, name: r.name, hasPin: r.hasPin }));

/** Reads settings. Never returns the hashes themselves. */
export async function readSettings(): Promise<SettingsRow> {
  const [rows, custom] = await Promise.all([q(
    `SELECT target_buffer_days, allow_team_edit,
            (admin_pin_hash IS NOT NULL) AS admin_set, (designer_pin_hash IS NOT NULL) AS designer_set, (editor_pin_hash IS NOT NULL) AS editor_set,
            admin_pin_version, designer_pin_version, editor_pin_version
       FROM settings WHERE id = 1`,
  ) as Promise<Row[]>, readCustomRoles()]);
  const r = rows[0];
  if (!r) throw new Error('settings row missing: run neon_schema.sql in the Neon SQL Editor');
  return {
    targetBuffer: Number(r.target_buffer_days),
    allowTeamEdit: !!r.allow_team_edit,
    hasPin: { admin: !!r.admin_set, designer: !!r.designer_set, editor: !!r.editor_set },
    versions: { admin: Number(r.admin_pin_version), designer: Number(r.designer_pin_version), editor: Number(r.editor_pin_version) },
    custom,
  };
}

/** Reads and verifies the session cookie, then checks the PIN version is still current. */
export async function getSession(req: Request): Promise<{ session: Session; settings: SettingsRow } | null> {
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return null;
  let payload;
  try {
    ({ payload } = await jwtVerify(decodeURIComponent(m[1]), secret(), { algorithms: ['HS256'] }));
  } catch {
    return null;
  }
  const role = String(payload.role || '');
  if (!role) return null;
  const settings = await readSettings();
  if (isBaseRole(role)) {
    if (!settings.hasPin[role] || settings.versions[role] !== payload.pinVersion) return null;
  } else {
    // admin-created role: it must still exist, still have a PIN, and the PIN must not have changed
    const c = settings.custom.find((x) => x.key === role);
    if (!c || !c.hasPin || c.version !== payload.pinVersion) return null;
  }
  registerRoles(settings.custom);
  return { session: { role, name: String(payload.name || ''), pinVersion: Number(payload.pinVersion) }, settings };
}

/** Every API route calls this. Returns 401 when the cookie is missing, invalid or its PIN was changed. */
export async function requireSession(req: Request, roles?: Role[]) {
  const s = await getSession(req);
  if (!s) throw new ApiError(401, 'Your session has ended. Please log in again.');
  if (roles && !roles.includes(s.session.role)) throw new ApiError(403, 'You do not have permission to do that.');
  return s;
}
