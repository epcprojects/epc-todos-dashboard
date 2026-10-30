'use client';
import { useState } from 'react';
import { Eye, Pencil, Trash2, UserPlus } from 'lucide-react';
import { ROLES, type Role } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useApp } from '../store';
import { UsersSection } from './UsersSection';

/** Settings layout: the section title and explanation on the left, the controls on the right. */
function Section({ title, desc, children }: { title: string; desc: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b py-7 first:pt-0 last:border-b-0 lg:grid-cols-[280px_1fr] lg:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{desc}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function SettingsView() {
  const { settings, saveSettings, confirmBox, toast, setViewAs, nav, customRoles, createRole, renameRole, deleteRole } = useApp();
  const tgt = +settings.targetBuffer || 7;
  const [custom, setCustom] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<Record<string, string>>({});

  const commitCustom = () => {
    if (custom === null) return;
    const n = Math.round(+custom);
    setCustom(null);
    if (n >= 1 && n <= 60 && n !== tgt) void saveSettings({ targetBuffer: n });
  };

  const add = async () => {
    const name = newName.trim();
    if (name.length < 2) return toast('Give the role a name (at least 2 characters).', 'bad');
    if (await createRole(name)) setNewName('');
  };

  const remove = async (key: string) => {
    const ok = await confirmBox({
      title: `Delete the ${ROLES[key]} role?`,
      body: 'Users with this role can no longer log in until you give them another role. A role can only be deleted when no task is assigned to it.',
      ok: 'Delete role',
      danger: true,
    });
    if (ok) await deleteRole(key);
  };

  const preview = (r: Role) => {
    setViewAs(r);
    nav('team');
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Production targets, who can log in, and what each team may change.</p>
      </div>

      <div className="max-w-5xl">
        <Section title="Production buffer" desc="How many days ahead of the posting calendar finished content should be. Health, alerts and the dashboard compare actual coverage against this target.">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2" role="group" aria-label="Target buffer">
              {[3, 5, 7, 10, 14].map((n) => (
                <Button key={n} variant={tgt === n ? 'default' : 'outline'} size="lg" aria-pressed={tgt === n} onClick={() => void saveSettings({ targetBuffer: n })}>
                  {n} days
                </Button>
              ))}
              <div className="ml-1 flex items-center gap-2 text-sm text-muted-foreground">
                <Label htmlFor="tgt-custom">Custom</Label>
                <Input
                  id="tgt-custom"
                  type="number"
                  min={1}
                  max={60}
                  value={custom ?? tgt}
                  onChange={(e) => setCustom(e.target.value)}
                  onBlur={commitCustom}
                  onKeyDown={(e) => e.key === 'Enter' && commitCustom()}
                  className="h-9 w-20 text-sm"
                />
                days
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="Users" desc="Everyone logs in with their own username and password. You choose each person's role: Admin sees everything, other roles see only their own tasks. A new password logs that person out everywhere.">
          <UsersSection />
        </Section>

        <Section title="Team roles" desc="Add roles such as a Front-end Developer, then give them to users above. A role works like Graphic Designer or Video Editor: assign sheets or tasks to it and its members see only those tasks.">
          <Card className="gap-0 divide-y py-0">
            {customRoles.length ? (
              customRoles.map((r) => (
                <div key={r.key}>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                    <span className="font-semibold">{r.name}</span>
                    <Button variant="destructive" size="lg" onClick={() => void remove(r.key)}>
                      <Trash2 /> Delete
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-dashed px-4 py-3">
                    <Label htmlFor={`rname-${r.key}`} className="text-[13px] text-muted-foreground">
                      Rename
                    </Label>
                    <Input id={`rname-${r.key}`} maxLength={40} value={renaming[r.key] ?? r.name} onChange={(e) => setRenaming((x) => ({ ...x, [r.key]: e.target.value }))} className="h-9 w-56 text-sm" />
                    <Button
                      variant="outline"
                      size="lg"
                      disabled={(renaming[r.key] ?? r.name).trim() === r.name || (renaming[r.key] ?? '').trim().length < 2}
                      onClick={async () => {
                        if (await renameRole(r.key, (renaming[r.key] ?? r.name).trim())) setRenaming((x) => ({ ...x, [r.key]: '' }));
                      }}
                    >
                      <Pencil /> Save name
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="px-4 py-4 text-sm text-muted-foreground">No extra roles yet.</p>
            )}
            <div className="flex flex-wrap items-end gap-3 bg-muted/40 px-4 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="new-role-name" className="text-[13px] text-muted-foreground">
                  New role name
                </Label>
                <Input id="new-role-name" maxLength={40} placeholder="e.g. Front-end Developer" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9 w-60 text-sm" />
              </div>
              <Button size="lg" onClick={() => void add()}>
                <UserPlus /> Create role
              </Button>
            </div>
          </Card>
        </Section>

        <Section title="Editing imported content" desc="Team members can always change status and add production notes. Only the admin can delete.">
          <Card>
            <CardContent className="flex items-center justify-between gap-6">
              <Label htmlFor="allow-edit" className="cursor-pointer text-sm leading-snug font-medium">
                Let every team role edit imported content
                <span className="mt-0.5 block text-[13px] font-normal text-muted-foreground">Copy, direction and captions from the Excel file.</span>
              </Label>
              <Switch id="allow-edit" checked={settings.allowTeamEdit} onCheckedChange={(v) => void saveSettings({ allowTeamEdit: !!v })} />
            </CardContent>
          </Card>
        </Section>

        <Section title="Preview team views" desc="See exactly what each team member sees, with admin and delete controls hidden.">
          <Card>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" size="lg" onClick={() => preview('designer')}>
                <Eye /> Graphic Designer
              </Button>
              <Button variant="outline" size="lg" onClick={() => preview('editor')}>
                <Eye /> Video Editor
              </Button>
              {customRoles.map((r) => (
                <Button variant="outline" size="lg" key={r.key} onClick={() => preview(r.key)}>
                  <Eye /> {r.name}
                </Button>
              ))}
            </CardContent>
          </Card>
        </Section>
      </div>
    </>
  );
}

