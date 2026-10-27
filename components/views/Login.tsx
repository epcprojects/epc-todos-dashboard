'use client';
import { useEffect, useState } from 'react';
import { CalendarCheck, FolderOpen, KeyRound, LineChart, ShieldCheck } from 'lucide-react';
import { ROLES, type Role } from '@/lib/constants';
import { lsGet } from '@/lib/client/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApp } from '../store';

const POINTS = [
  { icon: CalendarCheck, title: 'Always know where you stand', text: 'Coverage, overdue work and today’s progress in one view.' },
  { icon: LineChart, title: 'Built for two teams, ready for more', text: 'Designers, editors and any role you add see only their own queue.' },
  { icon: FolderOpen, title: 'Every asset in one place', text: 'Browse and upload to the shared media library.' },
];

import { EpcMark } from '../EpcMark';

function Brand({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <EpcMark className="size-10" white={light} />
      <div className="leading-tight">
        <div className={`text-lg font-extrabold tracking-tight ${light ? 'text-white' : ''}`}>
          Endpoint <span className={light ? 'text-white/70' : 'text-primary'}>Clients</span>
        </div>
        <div className={`text-xs ${light ? 'text-white/70' : 'text-muted-foreground'}`}>Social Media Production Dashboard</div>
      </div>
    </div>
  );
}

export function LoginView() {
  const { info, login, setup, toast } = useApp();
  const [role, setRole] = useState<Role>('designer');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(lsGet('epc.name', '')), []);

  const isSetup = info.setupNeeded;
  const has = role === 'admin' || role === 'designer' || role === 'editor' ? info.pins[role] : !!info.roles.find((c) => c.key === role)?.hasPin;

  const saveSetup = async () => {
    const a = pin.trim();
    if (!/^\d{4,8}$/.test(a)) return toast('Use 4 to 8 digits for the PIN.', 'bad');
    if (a !== pin2.trim()) return toast('The two PINs do not match.', 'bad');
    setBusy(true);
    const e = await setup(a, name.trim().slice(0, 40));
    setBusy(false);
    if (e) toast(e, 'bad');
  };
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
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* brand panel */}
      <div className="relative hidden overflow-hidden bg-[#3a31b8] p-12 text-white lg:flex lg:flex-col lg:justify-between" style={{ backgroundImage: 'radial-gradient(1200px 600px at 0% 0%, #5a50e0 0%, transparent 60%), radial-gradient(900px 500px at 100% 100%, #1f1a6e 0%, transparent 60%)' }}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-24 size-[420px] rounded-[3rem] border border-white/10 bg-white/[0.04] rotate-12" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -bottom-8 size-[320px] rounded-[2.5rem] border border-white/10 bg-white/[0.05] rotate-12" />
        <div aria-hidden="true" className="pointer-events-none absolute right-10 bottom-10 size-[220px] rounded-[2rem] border border-white/10 bg-white/[0.07] rotate-12" />
        <Brand light />
        <div className="relative max-w-md">
          <h1 className="text-4xl leading-tight font-extrabold tracking-tight text-balance">Production that stays ahead of the calendar.</h1>
          <p className="mt-4 text-base leading-relaxed text-white/75">Plan, assign and track every post and video from one place, so the content is ready before it needs to go live.</p>
          <ul className="mt-8 space-y-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <p.icon className="size-[18px]" />
                </span>
                <span>
                  <span className="block text-[15px] font-bold">{p.title}</span>
                  <span className="block text-sm text-white/70">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/55">Endpoint Clients · Global UI/UX Design Agency</p>
      </div>

      {/* form panel */}
      <div className="flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="mb-8 lg:hidden">
          <Brand />
        </div>
        <Card className="w-full max-w-[440px] shadow-lg ring-1 ring-border">
          <CardHeader className="gap-1.5 pb-2">
            <div className="mb-1 grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">{isSetup ? <ShieldCheck className="size-5" /> : <KeyRound className="size-5" />}</div>
            <CardTitle className="text-xl font-extrabold tracking-tight">{isSetup ? 'Set up dashboard access' : 'Welcome back'}</CardTitle>
            <CardDescription className="text-sm">
              {isSetup ? 'Choose an Admin PIN. You will set the Designer and Editor PINs afterwards in Settings.' : 'Choose your role and enter its PIN to continue.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSetup ? (
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveSetup();
                }}
              >
                <div className="grid gap-1.5">
                  <Label htmlFor="setup-pin">Admin PIN (4 to 8 digits)</Label>
                  <Input id="setup-pin" type="password" inputMode="numeric" maxLength={8} autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} className="h-10 text-base" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="setup-pin2">Repeat Admin PIN</Label>
                  <Input id="setup-pin2" type="password" inputMode="numeric" maxLength={8} autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value)} className="h-10 text-base" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="login-name">Your name</Label>
                  <Input id="login-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown in activity history" className="h-10 text-base" />
                </div>
                <Button type="submit" size="lg" className="h-10 w-full text-sm font-bold" disabled={busy}>
                  Save Admin PIN and log in
                </Button>
              </form>
            ) : (
              <form
                id="login-form"
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (has) void submit();
                }}
              >
                <div className="grid gap-1.5">
                  <Label>I am the</Label>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Role">
                    {(['designer', 'editor', ...info.roles.map((c) => c.key), 'admin'] as Role[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={role === r}
                        onClick={() => {
                          setRole(r);
                          setErr('');
                          setPin('');
                        }}
                        className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${role === r ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-input bg-card hover:bg-muted'}`}
                      >
                        {ROLES[r]}
                      </button>
                    ))}
                  </div>
                </div>
                {has ? (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="login-pin">{ROLES[role]} PIN</Label>
                      <Input id="login-pin" type="password" inputMode="numeric" maxLength={8} autoComplete="current-password" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} className="h-10 text-base tracking-widest" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="login-name">Your name</Label>
                      <Input id="login-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown in activity history" className="h-10 text-base" />
                    </div>
                    <Button type="submit" size="lg" className="h-10 w-full text-sm font-bold" disabled={busy}>
                      Log in
                    </Button>
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
            )}
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">Everyone uses the same link. Your PIN decides what you can see and do.</p>
      </div>
    </div>
  );
}
