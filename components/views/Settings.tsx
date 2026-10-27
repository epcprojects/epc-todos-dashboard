'use client';
import { useState } from 'react';
import { ROLES, type BaseRole, type Role } from '@/lib/constants';
import { useApp } from '../store';
import { PageHeader } from '../ui';

const BASE: BaseRole[] = ['admin', 'designer', 'editor'];

export function SettingsView() {
  const { settings, saveSettings, savePin, confirmBox, toast, setViewAs, nav, customRoles, createRole, renameRole, deleteRole } = useApp();
  const tgt = +settings.targetBuffer || 7;
  const [custom, setCustom] = useState<string | null>(null);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [newPin, setNewPin] = useState('');
  const [renaming, setRenaming] = useState<Record<string, string>>({});

  const commitCustom = () => {
    if (custom === null) return;
    const n = Math.round(+custom);
    setCustom(null);
    if (n >= 1 && n <= 60 && n !== tgt) void saveSettings({ targetBuffer: n });
  };

  const hasPin = (r: Role) => (r === 'admin' || r === 'designer' || r === 'editor' ? settings.pins[r] : !!customRoles.find((c) => c.key === r)?.hasPin);

  const save = async (r: Role) => {
    const v = (pins[r] || '').trim();
    if (!/^\d{4,8}$/.test(v)) return toast('Use 4 to 8 digits for the PIN.', 'bad');
    if (hasPin(r)) {
      const ok = await confirmBox({
        title: `Change the ${ROLES[r]} PIN?`,
        body: `Everyone logged in as ${ROLES[r]} will be logged out and must use the new PIN.${r === 'admin' ? ' You will stay logged in on this browser.' : ''}`,
        ok: 'Change PIN',
      });
      if (!ok) return;
    }
    if (await savePin(r, v)) setPins((p) => ({ ...p, [r]: '' }));
  };

  const add = async () => {
    const name = newName.trim();
    if (name.length < 2) return toast('Give the role a name (at least 2 characters).', 'bad');
    if (!/^\d{4,8}$/.test(newPin.trim())) return toast('Use 4 to 8 digits for the PIN.', 'bad');
    if (await createRole(name, newPin.trim())) {
      setNewName('');
      setNewPin('');
    }
  };

  const remove = async (key: string) => {
    const ok = await confirmBox({
      title: `Delete the ${ROLES[key]} role?`,
      body: 'Its PIN stops working and anyone logged in with it is logged out. A role can only be deleted when no task is assigned to it.',
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
      <PageHeader title="Settings" sub="Team access, production buffer target and editing permissions." eyebrow="Admin" />
      <div className="stack">
        <section className="panel">
          <h2>Target production buffer</h2>
          <p className="muted">How many days ahead of the posting calendar finished content should be. Health and alerts compare actual coverage against this.</p>
          <div className="row" role="group" aria-label="Target buffer">
            {[3, 5, 7, 10, 14].map((n) => (
              <button key={n} className={`btn ${tgt === n ? 'primary' : ''}`} aria-pressed={tgt === n} onClick={() => void saveSettings({ targetBuffer: n })}>
                {n} days
              </button>
            ))}
            <label className="row" style={{ gap: 6 }}>
              Custom{' '}
              <input
                className="inp"
                style={{ width: 90 }}
                type="number"
                min={1}
                max={60}
                id="tgt-custom"
                value={custom ?? tgt}
                onChange={(e) => setCustom(e.target.value)}
                onBlur={commitCustom}
                onKeyDown={(e) => e.key === 'Enter' && commitCustom()}
              />{' '}
              days
            </label>
          </div>
        </section>
        <section className="panel">
          <h2>Access PINs</h2>
          <p className="muted">
            Everyone opens the same dashboard link and logs in by choosing a role and entering its PIN. Each browser stays logged in until that person logs out. Changing a PIN logs out everyone using that role.
          </p>
          <div className="stack" style={{ gap: 14 }}>
            {BASE.map((r) => (
              <PinRow key={r} label={ROLES[r]} isSet={settings.pins[r]} value={pins[r] || ''} onChange={(v) => setPins((p) => ({ ...p, [r]: v }))} onSave={() => void save(r)} id={`pin-${r}`} />
            ))}
          </div>
          <p className="muted small" style={{ margin: '12px 0 0' }}>
            This is simple access separation for an internal tool, not strong security. Share PINs only with the right person.
          </p>
        </section>
        <section className="panel">
          <h2>Team roles</h2>
          <p className="muted">
            Create extra roles, for example a Front-end Developer, each with its own PIN. A role works like Graphic Designer or Video Editor: assign sheets or tasks to it in Task Distribution and its members see only those tasks.
          </p>
          <div className="stack" style={{ gap: 14 }}>
            {customRoles.length ? (
              customRoles.map((r) => (
                <div key={r.key} style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }} className="stack">
                  <div className="row" style={{ alignItems: 'end' }}>
                    <label className="field" style={{ minWidth: 190 }}>
                      <span>Role name</span>
                      <input className="inp" style={{ width: 240 }} id={`rname-${r.key}`} maxLength={40} value={renaming[r.key] ?? r.name} onChange={(e) => setRenaming((x) => ({ ...x, [r.key]: e.target.value }))} />
                    </label>
                    <button
                      className="btn"
                      disabled={(renaming[r.key] ?? r.name).trim() === r.name || (renaming[r.key] ?? '').trim().length < 2}
                      onClick={async () => {
                        if (await renameRole(r.key, (renaming[r.key] ?? r.name).trim())) setRenaming((x) => ({ ...x, [r.key]: '' }));
                      }}
                    >
                      Rename
                    </button>
                    <button className="btn danger" onClick={() => void remove(r.key)}>
                      Delete role
                    </button>
                  </div>
                  <PinRow label={r.name} isSet={r.hasPin} value={pins[r.key] || ''} onChange={(v) => setPins((p) => ({ ...p, [r.key]: v }))} onSave={() => void save(r.key)} id={`pin-${r.key}`} />
                </div>
              ))
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No extra roles yet.
              </p>
            )}
            <div className="row" style={{ alignItems: 'end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <label className="field">
                <span>New role name</span>
                <input className="inp" style={{ width: 240 }} id="new-role-name" maxLength={40} placeholder="e.g. Front-end Developer" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </label>
              <label className="field">
                <span>PIN (4 to 8 digits)</span>
                <input className="inp" style={{ width: 170 }} id="new-role-pin" type="password" inputMode="numeric" maxLength={8} autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(e.target.value)} />
              </label>
              <button className="btn primary" onClick={() => void add()}>
                Create role
              </button>
            </div>
          </div>
        </section>
        <section className="panel">
          <h2>Source content editing</h2>
          <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" id="allow-edit" style={{ width: 22, height: 22 }} checked={settings.allowTeamEdit} onChange={(e) => void saveSettings({ allowTeamEdit: e.target.checked })} />{' '}
            <span>Allow every team role to edit imported content (copy, direction, captions)</span>
          </label>
          <p className="muted small">Off by default. Team members can always change status and add production notes. Only the admin can delete.</p>
        </section>
        <section className="panel">
          <h2>Preview team views</h2>
          <p className="muted">See exactly what each team member sees, with admin and delete controls hidden.</p>
          <div className="row">
            <button className="btn" onClick={() => preview('designer')}>
              Preview as Graphic Designer
            </button>
            <button className="btn" onClick={() => preview('editor')}>
              Preview as Video Editor
            </button>
            {customRoles.map((r) => (
              <button className="btn" key={r.key} onClick={() => preview(r.key)}>
                Preview as {r.name}
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function PinRow({ label, isSet, value, onChange, onSave, id }: { label: string; isSet: boolean; value: string; onChange: (v: string) => void; onSave: () => void; id: string }) {
  return (
    <div className="row" style={{ alignItems: 'end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div style={{ minWidth: 190 }}>
        <b>{label}</b>
        <div className="muted small">{isSet ? 'PIN is set' : 'No PIN yet: this role cannot log in'}</div>
      </div>
      <label className="field">
        <span>New PIN (4 to 8 digits)</span>
        <input className="inp" style={{ width: 170 }} id={id} type="password" inputMode="numeric" maxLength={8} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      <button className={`btn ${isSet ? '' : 'primary'}`} onClick={onSave}>
        {isSet ? 'Change PIN' : 'Set PIN'}
      </button>
    </div>
  );
}
