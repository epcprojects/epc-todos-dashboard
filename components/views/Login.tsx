'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { EpcMark } from '../EpcMark';
import { useApp } from '../store';

/** One look for both themes: a glass card over a violet gradient, so the sign-in screen never changes with light/dark mode. */
export function LoginView() {
  const { login } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    const e = await login(username.trim(), password);
    setBusy(false);
    if (e) {
      setErr(e);
      setPassword('');
    }
  };

  return (
    <div className="login-bg relative grid min-h-screen place-items-center overflow-hidden px-5 py-10 text-white">
      <div className="relative z-10 flex w-full max-w-[460px] flex-col items-center">
        <div className="login-tile mb-12 grid size-[84px] place-items-center rounded-[22px]">
          <EpcMark className="size-12" white />
        </div>
        <form
          className="login-card w-full rounded-[32px] p-7 sm:p-9"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h1 className="mb-6 text-center text-[26px] font-medium tracking-tight">
            Welcome back <span aria-hidden="true">👋</span>
          </h1>
          <label htmlFor="login-user" className="mb-2 block text-[15px] text-white/90">
            Username <span className="text-[#ff6b6b]" aria-hidden="true">*</span>
          </label>
          <input id="login-user" className="login-input mb-5" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus placeholder="Enter username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <label htmlFor="login-pass" className="mb-2 block text-[15px] text-white/90">
            Password <span className="text-[#ff6b6b]" aria-hidden="true">*</span>
          </label>
          <div className="relative mb-4">
            <input id="login-pass" className="login-input pr-12" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-white/80 hover:text-white">
              {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
          {err ? (
            <div role="alert" className="mb-3 rounded-xl bg-[#ff6b6b]/15 px-3.5 py-2.5 text-sm font-medium text-[#ffd0d0] ring-1 ring-[#ff6b6b]/40">
              {err}
            </div>
          ) : null}
          <button type="submit" disabled={busy || !username.trim() || !password} className="h-[52px] w-full rounded-xl bg-white text-[17px] font-semibold text-[#5b34d6] transition active:scale-[0.98] disabled:opacity-60">
            {busy ? 'Signing in…' : 'Sign In'}
          </button>
          <div className="mt-4 text-center">
            <button type="button" onClick={() => setForgot((v) => !v)} aria-expanded={forgot} className="min-h-10 px-3 text-[15px] text-white/90 underline-offset-4 hover:underline">
              Forgot password?
            </button>
            {forgot ? <p className="mt-1 text-sm text-white/80">Ask your admin to reset it. They can set a new password for you in Settings.</p> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
