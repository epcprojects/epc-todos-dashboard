'use client';
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Trash2, UserPlus } from 'lucide-react';
import { ROLES, type Role } from '@/lib/constants';
import { api } from '@/lib/client/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApp } from '../store';

interface UserRow {
  id: number;
  username: string;
  role: string;
  createdAt: string;
}

/** Admin-only: create accounts (username, password, role), change a role, reset a password, delete. */
export function UsersSection() {
  const { customRoles, confirmBox, toast, session } = useApp();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('designer');
  const [reset, setReset] = useState<Record<number, string>>({});
  const roleKeys: Role[] = ['admin', 'designer', 'editor', ...customRoles.map((c) => c.key)];
  const nameOf = (r: string) => ROLES[r] || r;

  const load = useCallback(async () => {
    try {
      setUsers((await api<{ users: UserRow[] }>('/api/users')).users);
    } catch (e) {
      setUsers([]);
      toast(e instanceof Error ? e.message : 'Could not load users.', 'bad');
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const call = async (fn: () => Promise<{ users: UserRow[] }>, ok: string) => {
    try {
      setUsers((await fn()).users);
      toast(ok);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong.', 'bad');
      return false;
    }
  };

  const create = async () => {
    if (await call(() => api('/api/users', { body: { username: username.trim(), password, role } }), 'User created')) {
      setUsername('');
      setPassword('');
    }
  };
  const setNewPassword = async (u: UserRow) => {
    const pw = reset[u.id] || '';
    if (pw.length < 6) return toast('The password needs at least 6 characters.', 'bad');
    const ok = await confirmBox({
      title: `Change the password of ${u.username}?`,
      body: u.username === session?.name ? 'You will stay logged in on this browser.' : `${u.username} is logged out everywhere and must use the new password.`,
      ok: 'Change password',
    });
    if (ok && (await call(() => api(`/api/users/${u.id}`, { method: 'PATCH', body: { password: pw } }), 'Password changed'))) setReset((r) => ({ ...r, [u.id]: '' }));
  };
  const remove = async (u: UserRow) => {
    const ok = await confirmBox({ title: `Delete ${u.username}?`, body: 'This account can no longer log in. Their past activity stays in the history.', ok: 'Delete user', danger: true });
    if (ok) await call(() => api(`/api/users/${u.id}`, { method: 'DELETE' }), 'User deleted');
  };

  return (
    <Card className="gap-0 divide-y py-0">
      {users === null ? <p className="px-4 py-4 text-sm text-muted-foreground">Loading…</p> : null}
      {users?.map((u) => (
        <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
          <div className="min-w-[140px] flex-1">
            <div className="flex items-center gap-2 font-semibold">
              {u.username}
              {u.username === session?.name ? <Badge variant="secondary">You</Badge> : null}
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            Role
            <select
              className="inp h-9 text-sm"
              value={u.role}
              aria-label={`Role of ${u.username}`}
              onChange={(e) => void call(() => api(`/api/users/${u.id}`, { method: 'PATCH', body: { role: e.target.value } }), 'Role changed')}
            >
              {roleKeys.map((r) => (
                <option key={r} value={r}>
                  {nameOf(r)}
                </option>
              ))}
            </select>
          </label>
          <Input type="password" autoComplete="new-password" placeholder="New password" aria-label={`New password for ${u.username}`} value={reset[u.id] || ''} onChange={(e) => setReset((r) => ({ ...r, [u.id]: e.target.value }))} className="h-9 w-44 text-sm" />
          <Button variant="outline" size="lg" onClick={() => void setNewPassword(u)}>
            <KeyRound /> Set password
          </Button>
          {u.username === session?.name ? null : (
            <Button variant="destructive" size="lg" onClick={() => void remove(u)}>
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-3 bg-muted/40 px-4 py-4">
        <div className="grid gap-1.5">
          <Label htmlFor="nu-name" className="text-[13px] text-muted-foreground">
            Username
          </Label>
          <Input id="nu-name" maxLength={30} autoCapitalize="none" placeholder="e.g. sara" value={username} onChange={(e) => setUsername(e.target.value)} className="h-9 w-44 text-sm" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nu-pass" className="text-[13px] text-muted-foreground">
            Password (6+ characters)
          </Label>
          <Input id="nu-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-9 w-48 text-sm" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nu-role" className="text-[13px] text-muted-foreground">
            Role
          </Label>
          <select id="nu-role" className="inp h-9 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
            {roleKeys.map((r) => (
              <option key={r} value={r}>
                {nameOf(r)}
              </option>
            ))}
          </select>
        </div>
        <Button size="lg" onClick={() => void create()} disabled={!username.trim() || password.length < 6}>
          <UserPlus /> Create user
        </Button>
      </div>
    </Card>
  );
}
