'use client';
import { useEffect, useMemo } from 'react';
import {
  Activity as ActivityIcon, AlertCircle, Archive, ArrowRightLeft, ArrowUpRight, BarChart3, CalendarCheck, CalendarClock, CheckCircle2, ChevronRight, CircleDot, FileUp, ListTodo, OctagonAlert, Pencil, Shield,
  ShieldAlert, ShieldCheck, StickyNote, TrendingUp, Upload, UserRoundPlus, Users, type LucideIcon,
} from 'lucide-react';
import { TEAMS, workTeams, type Status } from '@/lib/constants';
import { addDays, fmtDate, localDay } from '@/lib/dates';
import { coverage, health, isOverdue, periodRange, pm, type Coverage } from '@/lib/metrics';
import { displayTitle } from '@/lib/tasks';
import { genericHeads, pctOf, plural } from '@/lib/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApp } from '../store';
import { PlatformIcon } from '../PlatformIcon';
import { EmptyImport } from '../ui';

const TONE = {
  danger: 'bg-danger-soft text-danger',
  warn: 'bg-warning-soft text-warning',
  ok: 'bg-success-soft text-success',
  info: 'bg-accent text-accent-foreground',
  neutral: 'bg-muted text-muted-foreground',
} as const;
type Tone = keyof typeof TONE;

function IconTile({ icon: Icon, tone = 'neutral', className = '' }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${TONE[tone]} ${className}`}>
      <Icon className="size-4" strokeWidth={2.1} />
    </span>
  );
}

function SectionHeader({ icon, tone, title, desc, right }: { icon?: LucideIcon; tone?: Tone; title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-(--card-spacing)">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <IconTile icon={icon} tone={tone} /> : null}
        <div className="min-w-0">
          <h3 className="text-[15px] leading-tight font-semibold tracking-normal">{title}</h3>
          {desc ? <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{desc}</p> : null}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const first = name.trim().split(/\s+/)[0];
  return (
    <>
      {first ? `${part}, ${first}` : part}{' '}
      <span aria-hidden="true">👋</span>
    </>
  );
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'Yesterday' : d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function Sparkline({ values }: { values: number[] }) {
  const W = 120;
  const H = 36;
  const max = Math.max(1, ...values);
  const step = W / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, H - 3 - (v / max) * (H - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-[120px] shrink-0 text-primary" role="img" aria-label="Completed per day, last 14 days">
      <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="currentColor" opacity=".1" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill="currentColor" />
    </svg>
  );
}

function RingStat({ pct, size = 88 }: { pct: number; size?: number }) {
  const r = 36;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 88 88" width={size} height={size} className="shrink-0" role="img" aria-label={`${pct}% complete`}>
      <circle cx="44" cy="44" r={r} fill="none" strokeWidth="9" className="stroke-muted" />
      <circle cx="44" cy="44" r={r} fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-success" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 44 44)" style={pct === 0 ? { display: 'none' } : undefined} />
      <text x="44" y="49" textAnchor="middle" className="fill-foreground text-[19px] font-semibold tabular-nums">
        {pct}%
      </text>
    </svg>
  );
}

function Bar({ pct, tone = 'primary', className = '' }: { pct: number; tone?: 'primary' | 'ok' | 'warn' | 'danger'; className?: string }) {
  const color = { primary: 'bg-primary', ok: 'bg-success', warn: 'bg-[#d9a400]', danger: 'bg-danger' }[tone];
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-muted ${className}`}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function covTone(c: Coverage, tgt: number): 'ok' | 'warn' | 'danger' {
  return c.days >= tgt ? 'ok' : c.days < Math.ceil(tgt / 2) ? 'danger' : 'warn';
}

function CoverageRow({ label, c, tgt, max, strong }: { label: string; c: Coverage; tgt: number; max: number; strong?: boolean }) {
  const tone = c.none ? 'primary' : covTone(c, tgt);
  return (
    <div className="grid grid-cols-[110px_1fr_auto] items-center gap-3 sm:grid-cols-[130px_1fr_auto]">
      <div className={`truncate text-sm ${strong ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</div>
      <div className="relative">
        <Bar pct={c.none ? 0 : (c.days / max) * 100} tone={tone} className="h-2" />
        <div className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/70" style={{ left: `${(tgt / max) * 100}%` }} title={`Target ${tgt} days`} />
      </div>
      <div className="w-24 text-right text-sm tabular-nums">
        {c.none ? <span className="text-muted-foreground">No content</span> : <><b className="font-semibold">{c.days}</b> <span className="text-muted-foreground">{c.days === 1 ? 'day' : 'days'}</span></>}
      </div>
    </div>
  );
}

function activityIcon(msg: string): { icon: LucideIcon; tone: Tone } {
  if (/^Completed/.test(msg)) return { icon: CheckCircle2, tone: 'ok' };
  if (/→ Blocked/.test(msg)) return { icon: OctagonAlert, tone: 'danger' };
  if (/Status changed|Blocked reason/.test(msg)) return { icon: CircleDot, tone: 'warn' };
  if (/^Imported|Source content/.test(msg)) return { icon: FileUp, tone: 'info' };
  if (/^Assigned|^Reassigned/.test(msg)) return { icon: ArrowRightLeft, tone: 'info' };
  if (/Archived|Restored/.test(msg)) return { icon: Archive, tone: 'neutral' };
  if (/notes|note/i.test(msg)) return { icon: StickyNote, tone: 'neutral' };
  if (/Content edited/.test(msg)) return { icon: Pencil, tone: 'neutral' };
  return { icon: UserRoundPlus, tone: 'neutral' };
}

interface Attention {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  detail?: string;
  go: () => void;
}

export function Dashboard() {
  const { act, today, settings, imports, nav, gotoTasks, gotoReport, refreshActivity, activity, taskById, openDrawer, session, customRoles } = useApp();

  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

  const header = (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{greeting(session?.name || '')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{fmtDate(today, { weekday: 'long', month: 'long' })} · Here is where production stands.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={() => gotoReport('today')}>
          <CalendarCheck /> Today
        </Button>
        <Button variant="outline" size="lg" onClick={() => gotoTasks('overdue')}>
          <AlertCircle /> Overdue
        </Button>
        <Button variant="outline" size="lg" onClick={() => nav('reports')}>
          <BarChart3 /> Reports
        </Button>
        <Button size="lg" onClick={() => nav('imports')}>
          <Upload /> Upload Excel
        </Button>
      </div>
    </div>
  );

  const d = useMemo(() => {
    const H = health(act, today, settings.targetBuffer);
    const counts: Record<Status, number> = { not_started: 0, in_progress: 0, completed: 0, blocked: 0 };
    act.forEach((t) => counts[t.status]++);
    const od = act.filter((t) => isOverdue(t, today));
    const T = pm(act, today, today, today);
    const wk = periodRange('week', 0, today);
    const W = pm(act, wk.from, wk.to, today);
    const spark = Array.from({ length: 14 }, (_, i) => {
      const day = addDays(today, i - 13);
      return act.filter((t) => localDay(t.completedAt) === day).length;
    });
    const up = [3, 7, 14].map((n) => {
      const to = addDays(today, n);
      const l = act.filter((t) => t.postDate && t.postDate > today && t.postDate <= to);
      const u = l.filter((t) => t.status !== 'completed');
      return { n, total: l.length, un: u.length, d: u.filter((t) => t.team === 'designer').length, e: u.filter((t) => t.team === 'editor').length };
    });
    const teams = workTeams().map((team) => {
      const l = act.filter((t) => t.team === team);
      const done = l.filter((t) => t.status === 'completed').length;
      const due = l.filter((t) => t.postDate && t.postDate <= today);
      const f7 = l.filter((t) => {
        const x = localDay(t.completedAt);
        return x && x > addDays(today, -7) && x <= today;
      }).length;
      return {
        team,
        n: l.length,
        done,
        pct: pctOf(done, l.length),
        dueP: pctOf(due.filter((t) => t.status === 'completed').length, due.length),
        ip: l.filter((t) => t.status === 'in_progress').length,
        blk: l.filter((t) => t.status === 'blocked').length,
        od: l.filter((t) => isOverdue(t, today)).length,
        avg: (f7 / 7).toFixed(1),
        c: coverage(l, today),
      };
    });
    return { H, counts, od, T, W, spark, up, teams };
  }, [act, today, settings.targetBuffer]);

  if (!act.length)
    return (
      <>
        {header}
        <EmptyImport />
      </>
    );

  const { H, counts, od, T, W, spark, up, teams } = d;
  const tgt = H.tgt;
  const coverTeams = [
    { key: 'designer', label: 'Graphic Designer', c: H.c.d },
    { key: 'editor', label: 'Video Editor', c: H.c.e },
    ...H.c.extra.map((x) => ({ key: x.key, label: TEAMS[x.key] || x.key, c: x.c })),
  ];
  const maxCov = Math.max(tgt * 1.25, ...coverTeams.map((x) => x.c.days + 1), 7);

  // what needs attention, most urgent first
  const att: Attention[] = [];
  if (od.length) {
    const split = [...new Set(od.map((t) => t.team))].map((k) => `${TEAMS[k] || k} ${od.filter((t) => t.team === k).length}`).join(' · ');
    att.push({ icon: AlertCircle, tone: 'danger', title: `${plural(od.length, 'overdue task')}`, detail: split, go: () => gotoTasks('overdue') });
  }
  const blk = counts.blocked;
  if (blk) att.push({ icon: OctagonAlert, tone: 'danger', title: `${plural(blk, 'blocked task')}`, detail: 'Waiting on something', go: () => gotoTasks('blocked') });
  const short = coverTeams.filter((x) => !x.c.none && x.c.days < tgt);
  if (short.length) att.push({ icon: TrendingUp, tone: short.some((x) => x.c.days < Math.ceil(tgt / 2)) ? 'danger' : 'warn', title: 'Ready content is below target', detail: short.map((x) => `${x.label} ${x.c.days}d`).join(' · ') + ` (target ${tgt}d)`, go: () => nav('reports') });
  const tdy = act.filter((t) => t.postDate === today && t.status !== 'completed').length;
  if (tdy) att.push({ icon: CalendarClock, tone: 'warn', title: `${plural(tdy, 'task')} still open today`, detail: 'Scheduled to post today', go: () => gotoTasks('today') });
  const tm = act.filter((t) => t.postDate === addDays(today, 1) && t.status !== 'completed').length;
  if (tm) att.push({ icon: CalendarClock, tone: 'info', title: `${plural(tm, 'task')} due tomorrow`, detail: 'Not finished yet', go: () => gotoTasks('next3') });
  const un = act.filter((t) => t.team === 'unassigned').length;
  if (un) att.push({ icon: Users, tone: 'info', title: `${plural(un, 'task')} not assigned`, detail: 'Nobody will see them yet', go: () => gotoTasks('unassigned') });
  const nd = act.filter((t) => !t.postDate && workTeams().includes(t.team)).length;
  if (nd) att.push({ icon: CalendarClock, tone: 'neutral', title: `${plural(nd, 'task')} without a readable date`, detail: 'Left out of coverage', go: () => gotoTasks('nodate') });
  for (const imp of imports) for (const sh of imp.sheets) if (genericHeads(sh.headers)) att.push({ icon: FileUp, tone: 'warn', title: `${sh.name} has no column names`, detail: 'Fix it in Imports with one click', go: () => nav('imports') });

  const healthMeta = {
    ahead: { icon: ShieldCheck, tone: 'ok' as Tone, line: 'Content is ready ahead of the calendar.' },
    ontrack: { icon: ShieldCheck, tone: 'ok' as Tone, line: 'Exactly on target.' },
    risk: { icon: ShieldAlert, tone: 'warn' as Tone, line: `${plural(Math.max(0, H.gap), 'day')} short of the target buffer.` },
    behind: { icon: ShieldAlert, tone: 'danger' as Tone, line: `${plural(H.od, 'task')} ${H.od === 1 ? 'is' : 'are'} past the posting date and not finished.` },
    none: { icon: Shield, tone: 'neutral' as Tone, line: 'No upcoming scheduled content.' },
  }[H.k];

  const seg = [
    { n: counts.completed, c: 'bg-success', l: 'Completed' },
    { n: counts.in_progress, c: 'bg-[#d9a400]', l: 'In progress' },
    { n: counts.blocked, c: 'bg-danger', l: 'Blocked' },
    { n: counts.not_started, c: 'bg-border', l: 'Not started' },
  ];
  const doneToday = spark[spark.length - 1];

  /* ---------- Today (Runway design) ---------- */
  const first = (session?.name || '').trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const need = att.filter((a) => a.tone === 'danger' || a.tone === 'warn').length;
  const label = (k: string) => (k === 'designer' ? 'Design' : k === 'editor' ? 'Video' : TEAMS[k] || k);
  const daysTone = (x: { c: Coverage }) => (x.c.none ? 'text-muted-foreground' : x.c.days >= tgt ? 'text-success' : x.c.days >= Math.ceil(tgt / 2) ? 'text-warning' : 'text-attention-ink');
  const lede = coverTeams.filter((x) => x.key === 'designer' || x.key === 'editor');
  const runway = coverTeams.map((x) => {
    const list = act.filter((t) => t.team === x.key);
    const late = list.filter((t) => isOverdue(t, today)).length;
    const cells = Array.from({ length: 14 }, (_, n) => {
      const day = addDays(today, n);
      const l = list.filter((t) => t.postDate === day);
      const open = l.filter((t) => t.status !== 'completed');
      let k = '';
      if (l.length) k = !open.length ? 'done' : n === 0 && late ? 'late' : l.some((t) => t.status !== 'not_started') ? 'part' : 'todo';
      return { d: String(Number(day.slice(8, 10))), k };
    });
    return { ...x, late, cells };
  });
  const todays = act
    .filter((t) => t.postDate === today)
    .sort((a, b) => Number(b.status === 'completed') - Number(a.status === 'completed') || (a.time || '').localeCompare(b.time || ''))
    .slice(0, 8);
  const todayDone = act.filter((t) => t.postDate === today && t.status === 'completed').length;
  const todayAll = act.filter((t) => t.postDate === today).length;
  const statusBadge = (t: (typeof act)[number]) =>
    t.status === 'completed' ? ['Ready', 'bg-success-soft text-success'] : isOverdue(t, today) ? ['Late', 'bg-attention-soft text-attention-ink'] : t.status === 'in_progress' ? ['In progress', 'bg-warning-soft text-warning'] : t.status === 'blocked' ? ['Blocked', 'bg-attention-soft text-attention-ink'] : ['Not started', 'bg-muted text-muted-foreground'];

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div className="flex max-w-3xl flex-col gap-2.5">
          <span className="eyebrow">{fmtDate(today, { weekday: 'long', month: 'long' })}</span>
          <h1 className="font-heading text-[34px] leading-[1.05] font-extrabold sm:text-[46px]">
            {part}
            {first ? `, ${first}` : ''}.
          </h1>
          <p className="text-lg leading-snug text-muted-foreground sm:text-xl [text-wrap:pretty]">
            {lede.map((x, n) => (
              <span key={x.key}>
                {n ? ' and ' : ''}
                {label(x.key)} is{' '}
                <b className={daysTone(x)}>
                  {x.c.none ? 'not scheduled' : plural(x.c.days, 'day')}
                  {x.c.none ? '' : ' ahead'}
                </b>
              </span>
            ))}
            {lede.length ? ' of the calendar. ' : ''}
            {need ? `${need === 1 ? 'One thing needs' : `${need} things need`} you before tomorrow’s posts go out.` : 'Nothing needs you right now.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="outline" size="lg" onClick={() => nav('designer')}>
            Open queue
          </Button>
          <Button size="lg" onClick={() => nav('imports')}>
            <Upload /> Import calendar
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[2_1_640px] flex-col gap-6">
          <section className="rounded-2xl border bg-card shadow-(--shadow-card)" aria-labelledby="rw">
            <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
              <div>
                <h2 id="rw" className="font-heading text-xl font-bold">
                  Content runway
                </h2>
                <p className="mt-0.5 text-[13.5px] text-muted-foreground">Finished content ahead of the posting calendar, day by day</p>
              </div>
              <div className="mono flex flex-wrap items-center gap-3.5 text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded bg-ok-fill" />READY</span>
                <span className="inline-flex items-center gap-1.5"><i className="rc-swatch size-3 rounded" />IN PROGRESS</span>
                <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded bg-attention" />LATE</span>
              </div>
            </div>
            <div className="flex flex-col gap-8 p-6">
              {runway.map((x) => (
                <div key={x.key} className="flex flex-wrap items-center gap-x-7 gap-y-4">
                  <div className="w-full sm:w-[170px] sm:flex-none">
                    <div className="eyebrow">{label(x.key)}</div>
                    <div className="flex items-baseline gap-2">
                      <span className={`font-heading text-[58px] leading-none font-extrabold tabular-nums ${daysTone(x)}`}>{x.c.none ? '—' : x.c.days}</span>
                      <span className="text-[15px] text-muted-foreground">days ahead</span>
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      Target {tgt} days{x.late ? ` · ${x.late} late` : ''}
                    </div>
                  </div>
                  <div className="relative min-w-0 flex-[1_1_420px] pt-6">
                    <span className="mono absolute top-0 text-muted-foreground" style={tgt / 14 > 0.7 ? { right: `calc(${100 - Math.min(100, (tgt / 14) * 100)}% + 6px)` } : { left: `calc(${(tgt / 14) * 100}% + 6px)` }}>
                      {tgt}-DAY TARGET
                    </span>
                    <div className="absolute top-5 h-[74px] border-l-2 border-dashed border-ink-3" style={{ left: `${Math.min(100, (tgt / 14) * 100)}%`, transform: 'translateX(-2px)' }} />
                    <div className="runway">
                      {x.cells.map((c, n) => (
                        <div key={n} className={`rc ${c.k}`}>
                          <i />
                          <span>{c.d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-card shadow-(--shadow-card)" aria-labelledby="tp">
            <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4">
              <div>
                <h2 id="tp" className="font-heading text-xl font-bold">
                  Today’s posts
                </h2>
                <p className="mt-0.5 text-[13.5px] text-muted-foreground">{todayAll ? `${todayDone} of ${todayAll} ready to go live` : 'Nothing is scheduled today'}</p>
              </div>
              {todayAll ? (
                <div className="hidden h-2 w-44 overflow-hidden rounded-full bg-border sm:flex">
                  <i className="block h-full bg-ok-fill" style={{ width: `${pctOf(todayDone, todayAll)}%` }} />
                </div>
              ) : null}
            </div>
            {todays.length ? (
              <ul className="border-t">
                {todays.map((t) => {
                  const b = statusBadge(t);
                  return (
                    <li key={t.id} className="border-t first:border-t-0">
                      <button type="button" onClick={() => openDrawer(t.id)} className="flex w-full items-center gap-3.5 px-6 py-3.5 text-left transition-colors hover:bg-muted/60">
                        <span className={`grid size-6 shrink-0 place-items-center rounded-lg border-2 ${t.status === 'completed' ? 'border-ok-fill bg-ok-fill text-white' : t.status === 'in_progress' ? 'border-warn-fill bg-warning-soft' : 'border-input bg-card'}`} aria-hidden="true">
                          {t.status === 'completed' ? <CheckCircle2 className="size-3.5" strokeWidth={3} /> : null}
                        </span>
                        <PlatformIcon name={t.platform} className="size-[22px]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{displayTitle(t)}</span>
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {t.platform || 'No platform'} · {label(t.team)}
                            {t.time ? ` · ${t.time}` : ''}
                          </span>
                        </span>
                        <span className={`inline-flex h-6 min-w-24 items-center justify-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap ${b[1]}`}>{b[0]}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-6">
          <section className="rounded-2xl border bg-card shadow-(--shadow-card)" aria-labelledby="ny">
            <div className="flex items-center justify-between px-6 pt-5">
              <h2 id="ny" className="font-heading text-xl font-bold">
                Needs you
              </h2>
              {att.length ? <span className="inline-flex h-6 items-center rounded-full bg-attention-soft px-2.5 text-xs font-semibold text-attention-ink">{plural(att.length, 'item')}</span> : null}
            </div>
            {att.length ? (
              <ul className="pt-2.5 pb-2">
                {att.slice(0, 6).map((a, n) => (
                  <li key={n} className="border-t first:border-t-0">
                    <button type="button" onClick={a.go} className="group flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-muted/60">
                      <IconTile icon={a.icon} tone={a.tone} className="size-[38px] rounded-xl" />
                      <span className="min-w-0 flex-1">
                        <b className="block text-[14.5px]">{a.title}</b>
                        {a.detail ? <span className="block truncate text-[13px] text-muted-foreground">{a.detail}</span> : null}
                      </span>
                      <ChevronRight className="size-[18px] shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-3 px-6 py-5">
                <IconTile icon={CheckCircle2} tone="ok" className="size-[38px] rounded-xl" />
                <div>
                  <b className="block text-[14.5px]">All clear</b>
                  <span className="text-[13px] text-muted-foreground">Nothing is overdue, blocked or waiting.</span>
                </div>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-(--shadow-card)" aria-labelledby="ld">
            <h2 id="ld" className="font-heading text-xl font-bold">
              Team load
            </h2>
            {teams.map((x) => (
              <div key={x.team} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <b>{label(x.team)}</b>
                  <span className="text-[13px] text-muted-foreground tabular-nums">{plural(x.n, 'task')}</span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-border">
                  <i className="block h-full bg-ok-fill" style={{ width: `${pctOf(x.done, x.n)}%` }} />
                  <i className="block h-full bg-warn-fill" style={{ width: `${pctOf(x.ip, x.n)}%` }} />
                  <i className="block h-full bg-attention" style={{ width: `${pctOf(x.blk, x.n)}%` }} />
                </div>
                <div className="text-[13px] text-muted-foreground tabular-nums">
                  {x.done} done · {x.ip} in progress{x.blk ? ` · ${x.blk} blocked` : ''} · {Math.max(0, x.n - x.done - x.ip - x.blk)} to start
                </div>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border bg-card shadow-(--shadow-card)" aria-labelledby="ac">
            <div className="px-6 pt-5">
              <h2 id="ac" className="font-heading text-xl font-bold">
                Latest activity
              </h2>
            </div>
            {activity.length ? (
              <ul className="pt-2 pb-3">
                {activity.slice(0, 6).map((h, n) => {
                  const t = h.taskId ? taskById(h.taskId) : undefined;
                  const title = t ? displayTitle(t) : h.title || 'Task';
                  const ini = (h.name || '·').split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <li key={n} className="flex items-start gap-3 px-6 py-2.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full border bg-muted text-[11px] font-bold text-muted-foreground">{ini}</span>
                      <span className="min-w-0 flex-1 text-sm leading-snug [overflow-wrap:anywhere]">
                        <b>{h.name}</b> · {h.msg}
                        <span className="block text-[13px] text-muted-foreground">{title}</span>
                      </span>
                      <span className="mono shrink-0 text-muted-foreground">{timeAgo(h.at)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-6 py-4 text-sm text-muted-foreground">No activity yet.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
