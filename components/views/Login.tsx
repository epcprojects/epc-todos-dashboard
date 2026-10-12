'use client';
import { useEffect, useState } from 'react';
import { ROLES, type Role } from '@/lib/constants';
import { lsGet } from '@/lib/client/api';
import { useApp } from '../store';
import { PageHeader } from '../ui';

export function LoginView() {
  const { info, login, setup, toast } = useApp();
  const [role, setRole] = useState<Role>('designer');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(lsGet('epc.name', '')), []);

  if (info.setupNeeded) {
    const save = async () => {
      const a = pin.trim();
      if (!/^\d{4,8}$/.test(a)) return toast('Use 4 to 8 digits for the PIN.', 'bad');
      if (a !== pin2.trim()) return toast('The two PINs do not match.', 'bad');
      setBusy(true);
      const e = await setup(a, name.trim().slice(0, 40));
      setBusy(false);
      if (e) toast(e, 'bad');
    };
    return (
      <>
        <PageHeader title="Set up dashboard access" sub="Endpoint Clients · Social Media Production" eyebrow="First-time setup" />
        <form
          className="panel stack"
          style={{ maxWidth: 560 }}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p style={{ margin: 0 }}>
            Choose an <b>Admin PIN</b>. The admin then sets separate PINs for the Graphic Designer and Video Editor in Settings. Everyone opens the same link and logs in with their role&apos;s PIN.
          </p>
          <label className="field">
            <span>Admin PIN (4 to 8 digits)</span>
            <input className="inp" id="setup-pin" type="password" inputMode="numeric" maxLength={8} autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} />
          </label>
          <label className="field">
            <span>Repeat Admin PIN</span>
            <input className="inp" id="setup-pin2" type="password" inputMode="numeric" maxLength={8} autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value)} />
          </label>
          <label className="field">
            <span>Your name (shown in activity history)</span>
            <input className="inp" id="login-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div>
            <button className="btn primary" type="submit" disabled={busy}>
              Save Admin PIN and log in
            </button>
          </div>
        </form>
      </>
    );
  }

  const has = role === 'admin' || role === 'designer' || role === 'editor' ? info.pins[role] : !!info.roles.find((c) => c.key === role)?.hasPin;
  const submit = async () => {
    setBusy(true);
    setErr('');
    const e = await login(role, pin, name.trim().slice(0, 40));
    setBusy(false);
    if (e) {
      setErr(e);
      setPin('');
    }
  };
  return (
    <>
      <PageHeader title="Log in" sub="Endpoint Clients · Social Media Production Dashboard" eyebrow="Welcome" />
      <form
        className="panel stack"
        style={{ maxWidth: 560 }}
        id="login-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (has) void submit();
        }}
      >
        <div className="field">
          <span>I am the</span>
          <div className="row" role="radiogroup" aria-label="Role">
            {(['designer', 'editor', ...info.roles.map((c) => c.key), 'admin'] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                className={`btn ${role === r ? 'primary' : ''}`}
                role="radio"
                aria-checked={role === r}
                onClick={() => {
                  setRole(r);
                  setErr('');
                  setPin('');
                }}
              >
                {ROLES[r]}
              </button>
            ))}
          </div>
        </div>
        {has ? (
          <>
            <label className="field">
              <span>{ROLES[role]} PIN</span>
              <input className="inp" id="login-pin" type="password" inputMode="numeric" maxLength={8} autoComplete="current-password" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} />
            </label>
            <label className="field">
              <span>Your name (shown in activity history)</span>
              <input className="inp" id="login-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div>
              <button className="btn primary" type="submit" disabled={busy}>
                Log in
              </button>
            </div>
          </>
        ) : (
          <div className="warnbox">No PIN has been set for {ROLES[role]} yet. Ask the admin to set one in Settings → Access PINs.</div>
        )}
        {err ? (
          <div className="err" role="alert">
            {err}
          </div>
        ) : null}
      </form>
    </>
  );
}
