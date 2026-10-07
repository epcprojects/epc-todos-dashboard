'use client';
import { useState } from 'react';
import { ROLES, type Role } from '@/lib/constants';
import { useApp } from '../store';
import { PageHeader } from '../ui';

export function SettingsView() {
  const { settings, saveSettings, savePin, confirmBox, toast, setViewAs, nav } = useApp();
  const tgt = +settings.targetBuffer || 7;
  const [custom, setCustom] = useState<string | null>(null);
  const [pins, setPins] = useState<Record<Role, string>>({ admin: '', designer: '', editor: '' });

  const commitCustom = () => {
    if (custom === null) return;
    const n = Math.round(+custom);
    setCustom(null);
    if (n >= 1 && n <= 60 && n !== tgt) void saveSettings({ targetBuffer: n });
  };

  const save = async (r: Role) => {
    const v = pins[r].trim();
    if (!/^\d{4,8}$/.test(v)) return toast('Use 4 to 8 digits for the PIN.', 'bad');
    const had = settings.pins[r];
    if (had) {
      const ok = await confirmBox({
        title: `Change the ${ROLES[r]} PIN?`,
        body: `Everyone logged in as ${ROLES[r]} will be logged out and must use the new PIN.${r === 'admin' ? ' You will stay logged in on this browser.' : ''}`,
        ok: 'Change PIN',
      });
      if (!ok) return;
    }
    if (await savePin(r, v)) setPins((p) => ({ ...p, [r]: '' }));
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
            {(['admin', 'designer', 'editor'] as Role[]).map((r) => (
              <div className="row" style={{ alignItems: 'end', borderTop: '1px solid var(--line)', paddingTop: 12 }} key={r}>
                <div style={{ minWidth: 190 }}>
                  <b>{ROLES[r]}</b>
                  <div className="muted small">{settings.pins[r] ? 'PIN is set' : 'No PIN yet: this role cannot log in'}</div>
                </div>
                <label className="field">
                  <span>New PIN (4 to 8 digits)</span>
                  <input
                    className="inp"
                    style={{ width: 170 }}
                    id={`pin-${r}`}
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    autoComplete="new-password"
                    value={pins[r]}
                    onChange={(e) => setPins((p) => ({ ...p, [r]: e.target.value }))}
                  />
                </label>
                <button className={`btn ${settings.pins[r] ? '' : 'primary'}`} onClick={() => void save(r)}>
                  {settings.pins[r] ? 'Change PIN' : 'Set PIN'}
                </button>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ margin: '12px 0 0' }}>
            This is simple access separation for an internal tool, not strong security. Share PINs only with the right person.
          </p>
        </section>
        <section className="panel">
          <h2>Source content editing</h2>
          <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" id="allow-edit" style={{ width: 22, height: 22 }} checked={settings.allowTeamEdit} onChange={(e) => void saveSettings({ allowTeamEdit: e.target.checked })} />{' '}
            <span>Allow Designer and Video Editor to edit imported content (copy, direction, captions)</span>
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
          </div>
        </section>
      </div>
    </>
  );
}
