'use client';
import { useState } from 'react';
import { useApp } from '../store';

const A = '/login';

/** The glowing app tile, built exactly as in the Figma "Login" frame (node 53:9605). */
function GlowTile() {
  const glow2 = { maskImage: `url("${A}/d3718.svg")` };
  return (
    <div className="relative h-[204.29px] w-[145.427px] shrink-0" aria-hidden="true">
      <div className="absolute contents inset-[0_-35.02%_-0.03%_-33.79%]">
        <div className="absolute contents inset-[59.97%_-35.02%_-0.03%_-33.79%]">
          {/* Figma masks the glow first and blurs the result, so the blur sits on a wrapper around the masked layer */}
          <div className="absolute inset-[57.86%_7.34%_-17.61%_8.57%] blur-[22.731px]">
            <div
              className="absolute inset-0 rounded-[18.184px] bg-[#a168ff] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[-84.339px_-18.412px] mask-size-[290.951px_127.291px]"
              style={glow2}
            />
          </div>
          <div className="absolute inset-[59.64%_15.98%_-7.15%_17.12%] opacity-60 blur-[11.365px] mix-blend-plus-lighter">
            <div
              className="absolute inset-0 rounded-[18.184px] bg-[#a168ff] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[-96.773px_-22.048px] mask-size-[290.951px_127.291px]"
              style={glow2}
            />
          </div>
        </div>
        <div className="absolute inset-[0_7.52%_40.36%_8.7%] overflow-clip rounded-[18.184px]">
          <div className="pointer-events-none absolute inset-0 rounded-[18.184px]">
            <div className="absolute inset-0 rounded-[18.184px] bg-[#070707]" />
            <div
              className="absolute inset-0 rounded-[18.184px] mix-blend-plus-lighter"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 121.84 121.84' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(5.1349e-7 7.7398 -7.7398 5.1349e-7 60.918 121.84)'><stop stop-color='rgba(161,104,255,1)' offset='0'/><stop stop-color='rgba(161,104,255,0)' offset='1'/></radialGradient></defs></svg>\")",
              }}
            />
            <div
              className="absolute inset-0 rounded-[18.184px] mix-blend-plus-lighter"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 121.84 121.84' xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none'><rect x='0' y='0' height='100%' width='100%' fill='url(%23grad)' opacity='1'/><defs><radialGradient id='grad' gradientUnits='userSpaceOnUse' cx='0' cy='0' r='10' gradientTransform='matrix(9.0512e-16 7.7398 -13.623 1.9151e-13 60.918 121.84)'><stop stop-color='rgba(161,104,255,1)' offset='0'/><stop stop-color='rgba(161,104,255,0)' offset='1'/></radialGradient></defs></svg>\")",
              }}
            />
          </div>
          <div className="absolute contents top-[53.42px] left-[-8.18px]">
            <div className="absolute contents top-[53.42px] left-[calc(50%-0.11px)] -translate-x-1/2">
              <div className="absolute top-[115.02px] left-[18.41px] h-[34.096px] w-[84.785px] mix-blend-plus-lighter">
                <div className="absolute inset-[-133.33%_-53.62%]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" className="block size-full max-w-none" src={`${A}/cfbe7.svg`} />
                </div>
              </div>
              <div className="absolute top-[78.65px] left-[-0.23px] h-[74.329px] w-[121.836px]">
                <div className="absolute inset-[-91.74%_-55.97%]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" className="block size-full max-w-none" src={`${A}/a08f0.svg`} />
                </div>
              </div>
              <div className="absolute top-[53.42px] left-[calc(50%-0.11px)] h-[99.56px] w-[137.974px] -translate-x-1/2">
                <div className="absolute inset-[-68.49%_-49.42%]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" className="block size-full max-w-none" src={`${A}/77546.svg`} />
                </div>
              </div>
              <div className="absolute top-[120.7px] left-[37.05px] h-[28.413px] w-[47.734px] mix-blend-plus-lighter">
                <div className="absolute inset-[-112%_-66.67%]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" className="block size-full max-w-none" src={`${A}/27062.svg`} />
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute top-[125.25px] left-1/2 h-[3.182px] w-[15.911px] -translate-x-1/2 rounded-[227.078px] shadow-[0px_0.909px_4.546px_0px_white,0px_-0.909px_9.092px_0px_rgba(255,255,255,0.3),0px_-0.909px_4.546px_0px_white] blur-[0.455px]">
              <div className="pointer-events-none absolute inset-0 rounded-[227.078px] bg-[#a168ff]" />
              <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_0px_9.092px_0px_white]" />
            </div>
          </div>
          <div className="absolute top-[-32.93px] left-[-9.45px] size-[195.838px] mix-blend-plus-lighter">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" className="absolute inset-0 block size-full max-w-none" src={`${A}/d376d.svg`} />
          </div>
          <div className="absolute top-[1.36px] left-[3.64px] flex h-[15.075px] w-[14.382px] items-center justify-center mix-blend-soft-light">
            <div className="flex-none rotate-[42.69deg]">
              <div className="relative h-[16.507px] w-[4.339px]">
                <div className="absolute inset-[-8.26%_-31.43%]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" className="block size-full max-w-none" src={`${A}/44cca.svg`} />
                </div>
              </div>
            </div>
          </div>
          <div className="absolute top-[10.91px] left-[117.52px] h-[112.744px] w-[3.41px] rounded-[227.078px] bg-gradient-to-b from-white to-[rgba(255,255,255,0)] blur-[1.705px] mix-blend-soft-light" />
          <div className="absolute top-[calc(50%+0.06px)] left-[calc(50%+0.03px)] size-[83.731px] -translate-x-1/2 -translate-y-1/2 overflow-clip">
            <div className="absolute inset-[4.7%_19.8%]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="absolute inset-0 block size-full max-w-none" height="75.857" width="50.573" src={`${A}/ae6e6.png`} />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0px_0.682px_0.909px_0px_white,inset_0px_-2.273px_6.819px_0px_rgba(0,0,0,0.3)]" />
        </div>
      </div>
      <div className="absolute inset-[0_7.5%_40.36%_8.72%] rounded-[18.184px] border-[1.364px] border-solid border-[#a168ff]" />
      <div className="absolute inset-[58.97%_17.81%_41.03%_16.46%] mix-blend-screen">
        <div className="absolute inset-[-1.7px_-1.19%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="block size-full max-w-none" src={`${A}/9f04e.svg`} />
        </div>
      </div>
    </div>
  );
}

/** Sign-in, built from the Figma "Login" frame. Identical in light and dark mode. */
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
    if (!username.trim() || !password) {
      setErr('Enter your username and password.');
      return;
    }
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
    <div className="login-page relative flex min-h-screen w-full flex-col items-center gap-[30px] overflow-clip px-[24px] py-[60px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" className="pointer-events-none absolute inset-0 size-full max-w-none object-cover" src={`${A}/bc111.webp`} />
      <GlowTile />
      <form
        className="relative flex w-full max-w-[450px] shrink-0 flex-col items-start rounded-[40px] border border-solid border-[rgba(255,255,255,0.5)] p-[40px]"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[40px] bg-[rgba(255,255,255,0.08)] backdrop-blur-[15px]" />
        <div className="relative flex w-full shrink-0 flex-col items-center justify-center gap-[12px]">
          <h1 className="login-t m-0 shrink-0 text-center text-[24px] leading-[30px] font-semibold whitespace-nowrap text-white">
            Welcome back <span aria-hidden="true">👋</span>
          </h1>
          <div className="flex w-full shrink-0 flex-col items-start gap-[12px]">
            <div className="flex w-full shrink-0 flex-col items-start gap-[4px]">
              <label htmlFor="login-user" className="text-[14px] leading-[20px] font-normal text-white">
                Username <span className="text-[#dc2626]" aria-hidden="true">*</span>
              </label>
              <input id="login-user" className="login-in" autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus placeholder="Enter username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="flex w-full shrink-0 flex-col items-start gap-[4px]">
              <label htmlFor="login-pass" className="text-[14px] leading-[20px] font-normal text-white">
                Password <span className="text-[#dc2626]" aria-hidden="true">*</span>
              </label>
              <div className="login-in flex items-center gap-[8px]">
                <input id="login-pass" className="login-bare min-w-px flex-[1_0_0]" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="relative size-[20px] shrink-0 overflow-visible">
                  <span className="absolute inset-[17.71%_5.21%]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" className="absolute inset-0 block size-full max-w-none" src={`${A}/cae6c.svg`} style={{ opacity: show ? 0.6 : 1 }} />
                  </span>
                  {/* the whole 44px area around the 20px icon is tappable */}
                  <span className="absolute -inset-3" />
                </button>
              </div>
            </div>
          </div>
          {err ? (
            <div role="alert" className="w-full rounded-[8px] bg-[rgba(220,38,38,0.2)] px-[14px] py-[10px] text-[14px] leading-[20px] text-white ring-1 ring-[rgba(255,255,255,0.35)]">
              {err}
            </div>
          ) : null}
          <div className="flex w-full shrink-0 flex-col items-center gap-[16px]">
            <button type="submit" disabled={busy} className="flex w-full shrink-0 items-center justify-center overflow-clip rounded-[8px] bg-white px-[20px] py-[12px] text-[16px] leading-none font-semibold whitespace-nowrap text-[#673de6] transition active:scale-[0.98] disabled:opacity-70">
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
            <button type="button" onClick={() => setForgot((v) => !v)} aria-expanded={forgot} className="shrink-0 text-[14px] leading-none font-normal whitespace-nowrap text-white">
              Forgot password?
            </button>
            {forgot ? <p className="text-center text-[13px] leading-snug text-white/90">Ask your admin to reset it. They can set a new password for you in Settings.</p> : null}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0px_5px_20px_0px_rgba(255,255,255,0.2)]" />
      </form>
    </div>
  );
}
