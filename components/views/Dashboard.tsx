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
        <Button size="lg" onClick={() => nav('import')}>
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
  if (short.length) att.push({ icon: TrendingUp, tone: short.some((x) => x.c.days < Math.ceil(tgt / 2)) ? 'danger' : 'warn', title: 'Content buffer below target', detail: short.map((x) => `${x.label} ${x.c.days}d`).join(' · ') + ` (target ${tgt}d)`, go: () => nav('reports') });
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
    behind: { icon: ShieldAlert, tone: 'danger' as Tone, line: `${plural(H.od, 'task')} past their posting date ${H.od === 1 ? 'is' : 'are'} still unfinished.` },
    none: { icon: Shield, tone: 'neutral' as Tone, line: 'No upcoming scheduled content.' },
  }[H.k];

  const seg = [
    { n: counts.completed, c: 'bg-success', l: 'Completed' },
    { n: counts.in_progress, c: 'bg-[#d9a400]', l: 'In progress' },
    { n: counts.blocked, c: 'bg-danger', l: 'Blocked' },
    { n: counts.not_started, c: 'bg-border', l: 'Not started' },
  ];
  const doneToday = spark[spark.length - 1];

  return (
    <>
      {header}
      <div className="grid gap-4">
        {/* health + attention */}
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-7 [--card-spacing:--spacing(5)] gap-4">
            <SectionHeader icon={healthMeta.icon} tone={healthMeta.tone} title="Production health" desc={healthMeta.line} right={<Badge className={`h-6 px-2.5 text-[13px] font-semibold ${TONE[healthMeta.tone]}`}>{H.label}</Badge>} />
            <CardContent className="grid gap-6 border-t pt-5 md:grid-cols-[170px_1fr] md:items-center">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-heading text-5xl leading-none font-semibold tracking-tight tabular-nums">{H.c.o.none ? '—' : H.c.o.days}</span>
                  <span className="text-sm text-muted-foreground">{H.c.o.none ? '' : H.c.o.days === 1 ? 'day ahead' : 'days ahead'}</span>
                </div>
                <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
                  Target {tgt} days{H.c.o.through ? <> · ready through <span className="text-foreground">{fmtDate(H.c.o.through, { weekday: 'short' })}</span></> : null}
                </p>
              </div>
              <div className="grid gap-3.5">
                <CoverageRow label="Overall" c={H.c.o} tgt={tgt} max={maxCov} strong />
                <div className="h-px bg-border" />
                {coverTeams.map((x) => (
                  <CoverageRow key={x.key} label={x.label} c={x.c} tgt={tgt} max={maxCov} />
                ))}
              </div>
            </CardContent>
            <div className="mt-auto grid grid-cols-3 divide-x border-t text-center">
              {[
                { l: 'This week', v: `${W.pct}%`, s: `${W.done} of ${W.sch} posts` },
                { l: 'Finished today', v: String(doneToday), s: 'tasks completed' },
                { l: 'Avg per day', v: (spark.slice(-7).reduce((a, b) => a + b, 0) / 7).toFixed(1), s: 'last 7 days' },
              ].map((x) => (
                <div key={x.l} className="px-3 pt-4 pb-1">
                  <div className="text-[13px] text-muted-foreground">{x.l}</div>
                  <div className="font-heading mt-0.5 text-xl font-semibold tabular-nums">{x.v}</div>
                  <div className="text-[13px] text-muted-foreground">{x.s}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-5 [--card-spacing:--spacing(5)] gap-4">
            <SectionHeader icon={AlertCircle} tone={att.length ? 'warn' : 'ok'} title="Needs attention" desc={att.length ? 'Most urgent first' : undefined} right={att.length ? <Badge variant="secondary">{att.length}</Badge> : null} />
            <CardContent className="border-t px-2 pt-2">
              {att.length ? (
                <ul className="divide-y">
                  {att.slice(0, 6).map((a, i) => (
                    <li key={i}>
                      <button onClick={a.go} className="group flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60">
                        <IconTile icon={a.icon} tone={a.tone} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{a.title}</span>
                          {a.detail ? <span className="block truncate text-[13px] text-muted-foreground">{a.detail}</span> : null}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-3 px-2 py-4">
                  <IconTile icon={CheckCircle2} tone="ok" />
                  <div>
                    <div className="text-sm font-medium">All clear</div>
                    <div className="text-[13px] text-muted-foreground">Nothing is overdue, blocked or waiting.</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* KPI strip: one connected card, four numbers that matter */}
        <Card className="gap-0 py-0">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 [&>*]:border-b xl:[&>*]:border-b-0 sm:[&>*:nth-child(odd)]:border-r xl:[&>*:not(:last-child)]:border-r [&>*:last-child]:border-b-0 sm:[&>*:nth-last-child(2)]:border-b-0 xl:[&>*:nth-last-child(2)]:border-r">
            <button onClick={() => gotoTasks('')} className="group flex flex-col gap-3 p-5 text-left transition-colors hover:bg-muted/40">
              <div className="flex items-center justify-between text-[13px] font-medium text-muted-foreground">
                <span className="flex items-center gap-2"><ListTodo className="size-4" /> Active tasks</span>
                <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="font-heading text-3xl font-semibold tracking-tight tabular-nums">{act.length}</div>
              <div>
                <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  {seg.map((s) => (
                    <div key={s.l} className={s.c} style={{ width: `${pctOf(s.n, act.length)}%` }} title={`${s.l}: ${s.n}`} />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
                  <span>{counts.not_started} not started</span>
                  <span>{counts.in_progress} in progress</span>
                </div>
              </div>
            </button>
            <button onClick={() => gotoTasks('completed')} className="group flex flex-col gap-3 p-5 text-left transition-colors hover:bg-muted/40">
              <div className="flex items-center justify-between text-[13px] font-medium text-muted-foreground">
                <span className="flex items-center gap-2"><CheckCircle2 className="size-4" /> Completed</span>
                <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
                  {counts.completed} <span className="text-base font-medium text-muted-foreground">{pctOf(counts.completed, act.length)}%</span>
                </div>
                <Sparkline values={spark} />
              </div>
              <div className="text-[13px] text-muted-foreground">
                <span className="font-medium text-foreground">{doneToday}</span> finished today · last 14 days
              </div>
            </button>
            <button onClick={() => gotoTasks('overdue')} className="group flex flex-col gap-3 p-5 text-left transition-colors hover:bg-muted/40">
              <div className="flex items-center justify-between text-[13px] font-medium text-muted-foreground">
                <span className="flex items-center gap-2"><AlertCircle className={`size-4 ${od.length ? 'text-danger' : ''}`} /> Overdue</span>
                <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className={`font-heading text-3xl font-semibold tracking-tight tabular-nums ${od.length ? 'text-danger' : ''}`}>{od.length}</div>
              <div className="text-[13px] text-muted-foreground">
                {od.length ? [...new Set(od.map((t) => t.team))].map((k) => `${TEAMS[k] || k} ${od.filter((t) => t.team === k).length}`).join(' · ') : 'Nothing past its posting date'}
              </div>
            </button>
            <button onClick={() => gotoReport('today')} className="group flex flex-col gap-3 p-5 text-left transition-colors hover:bg-muted/40">
              <div className="flex items-center justify-between text-[13px] font-medium text-muted-foreground">
                <span className="flex items-center gap-2"><CalendarCheck className="size-4" /> Today</span>
                <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="font-heading text-3xl font-semibold tracking-tight tabular-nums">
                {T.done}<span className="text-xl font-medium text-muted-foreground"> / {T.sch}</span>
              </div>
              <div>
                <Bar pct={T.pct} tone="ok" />
                <div className="mt-2 text-[13px] text-muted-foreground">
                  {T.pct}% of today’s posts ready · week {W.pct}% ({W.done}/{W.sch})
                </div>
              </div>
            </button>
          </div>
        </Card>

        {/* today + upcoming */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="[--card-spacing:--spacing(5)] gap-4">
            <SectionHeader icon={CalendarCheck} title="Today" desc={fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long', year: undefined })} right={<Button variant="ghost" size="sm" onClick={() => gotoTasks('today')}>Open tasks <ChevronRight /></Button>} />
            <CardContent>
              {T.sch ? (
                <div className="flex items-center gap-6">
                  <RingStat pct={T.pct} />
                  <div className="grid flex-1 gap-3">
                    {workTeams().map((tm) => {
                      const l = T.schList.filter((t) => t.team === tm);
                      if (!l.length && tm !== 'designer' && tm !== 'editor') return null;
                      const dn = l.filter((t) => t.status === 'completed').length;
                      return (
                        <div key={tm}>
                          <div className="mb-1 flex justify-between text-sm">
                            <span className="text-muted-foreground">{TEAMS[tm]}</span>
                            <span className="tabular-nums">
                              <b className="font-semibold">{dn}</b>
                              <span className="text-muted-foreground"> / {l.length}</span>
                            </span>
                          </div>
                          <Bar pct={pctOf(dn, l.length)} tone="ok" />
                        </div>
                      );
                    })}
                    <div className="flex gap-4 text-[13px] text-muted-foreground">
                      <span>{T.ip} in progress</span>
                      <span>{T.ns} not started</span>
                      {T.blk ? <span className="text-danger">{T.blk} blocked</span> : null}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="py-6 text-sm text-muted-foreground">Nothing is scheduled to post today.</p>
              )}
            </CardContent>
          </Card>

          <Card className="[--card-spacing:--spacing(5)] gap-4">
            <SectionHeader icon={CalendarClock} title="Upcoming" desc="Scheduled posts and what is still unfinished" />
            <CardContent className="px-2">
              <ul className="divide-y">
                {up.map((u) => (
                  <li key={u.n}>
                    <button onClick={() => gotoTasks(`next${u.n}`)} className="group grid w-full grid-cols-[88px_1fr_auto] items-center gap-4 rounded-md px-2 py-3 text-left transition-colors hover:bg-muted/60">
                      <span className="text-sm font-medium">Next {u.n} days</span>
                      <span>
                        <Bar pct={pctOf(u.total - u.un, u.total)} tone="ok" />
                        <span className="mt-1.5 block text-[13px] text-muted-foreground">
                          {u.total} scheduled · <span className={u.un ? 'text-foreground' : ''}>{u.un} unfinished</span>
                          {u.un ? ` (Design ${u.d} · Video ${u.e})` : ''}
                        </span>
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* team pace + activity */}
        <div className="grid gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-7 [--card-spacing:--spacing(5)] gap-4 self-start">
            <SectionHeader icon={Users} title="Team pace" desc="The team with fewer days ahead is the current bottleneck." />
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Team</TableHead>
                    <TableHead className="min-w-36">Completion</TableHead>
                    <TableHead className="text-right">Due done</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead className="text-right">Avg/day</TableHead>
                    <TableHead className="pr-6 text-right">Ahead</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.map((r) => (
                    <TableRow key={r.team}>
                      <TableCell className="pl-6">
                        <div className="font-medium">{TEAMS[r.team]}</div>
                        <div className="text-[13px] text-muted-foreground">{r.n} assigned{r.blk ? ` · ${r.blk} blocked` : ''}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Bar pct={r.pct} tone="primary" className="w-20" />
                          <span className="text-sm tabular-nums">{r.pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.dueP}%</TableCell>
                      <TableCell className="text-right">{r.od ? <Badge className={`${TONE.danger} tabular-nums`}>{r.od}</Badge> : <span className="text-muted-foreground">0</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.avg}</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{r.c.none ? '—' : `${r.c.days}d`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="xl:col-span-5 [--card-spacing:--spacing(5)] gap-4 self-start">
            <SectionHeader icon={ActivityIcon} title="Recent activity" desc="Latest changes across all teams" />
            <CardContent>
              {activity.length ? (
                <ol className="relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
                  {activity.slice(0, 8).map((h, i) => {
                    const t = h.taskId ? taskById(h.taskId) : undefined;
                    const title = t ? displayTitle(t) : h.title || 'Task';
                    const a = activityIcon(h.msg);
                    return (
                      <li key={i} className="relative flex gap-3">
                        <IconTile icon={a.icon} tone={a.tone} className="relative z-10 size-8 ring-4 ring-card" />
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-sm leading-snug">
                            <span className="font-medium">{h.name || 'Someone'}</span> <span className="text-muted-foreground">· {h.msg}</span>
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-[13px] text-muted-foreground">
                            <button className="max-w-[16rem] truncate text-left hover:text-foreground hover:underline" onClick={() => h.taskId && openDrawer(h.taskId)}>
                              {title}
                            </button>
                            <span>· {timeAgo(h.at)}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">No activity yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
