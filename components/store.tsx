'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { registerRoles, type BaseRole, type CustomRole, type HistoryEntry, type ImportRec, type Role, type SessionInfo, type Settings, type Status, type Task, type Team } from '@/lib/constants';
import { fmtDT, todayISO } from '@/lib/dates';
import { canTouch as canTouchPerm } from '@/lib/perms';
import { statusPatch } from '@/lib/status';
import { emptyFilters, ingest, type CTask, type TableFilters } from '@/lib/tasks';
import { api, ApiFail, lsGet, lsSet, readLocation, setUnauthorizedHandler, withRetry, writeLocation } from '@/lib/client/api';
import type { PeriodKind } from '@/lib/metrics';
import { toast as sonner } from 'sonner';

export interface TableState {
  q: string;
  f: TableFilters;
  sort: string;
  page: number;
  size: number;
  sel: Set<string>;
  hidden: string[];
}

export interface ToastItem {
  id: number;
  msg: string;
  tone?: 'bad';
}
export interface ToastHandle {
  set: (msg: string, tone?: 'bad') => void;
  close: (afterMs?: number) => void;
}

export interface ConfirmOpts {
  title: string;
  body: ReactNode;
  ok?: string;
  danger?: boolean;
}
interface ConfirmState extends ConfirmOpts {
  res: (v: boolean) => void;
}

export type BulkPayload =
  | { action: 'assign'; team: Team; sheet?: { importId: string; sheetIdx: number } }
  | { action: 'status'; status: Status }
  | { action: 'archive'; message?: string }
  | { action: 'restore' }
  | { action: 'delete' };

interface Ctx {
  boot: 'loading' | 'ready' | 'error';
  bootError: string;
  info: SessionInfo;
  session: { role: Role; name: string } | null;
  baseRole: Role | null;
  role: Role | null;
  isAdmin: boolean;
  viewAs: Role | null;
  setViewAs: (r: Role | null) => void;
  settings: Settings;
  loaded: boolean;
  tasks: CTask[];
  act: CTask[];
  taskById: (id: string) => CTask | undefined;
  imports: ImportRec[];
  activity: HistoryEntry[];
  today: string;
  view: string;
  setView: (v: string) => void;
  nav: (v: string) => void;
  tables: Record<string, TableState>;
  tstate: (key: string) => TableState;
  updTable: (key: string, fn: (s: TableState) => void) => void;
  teamTab: Record<string, 'queue' | 'table'>;
  setTeamTab: (team: string, tab: 'queue' | 'table') => void;
  /** Per team page: true while the Founder content view is on (queue and table then show only founder content). */
  teamFounder: Record<string, boolean>;
  setTeamFounder: (team: string, on: boolean) => void;
  qExpand: Record<string, boolean>;
  setQExpand: (k: string) => void;
  cal: { month: string | null; sel: string | null };
  setCal: (c: { month: string | null; sel: string | null }) => void;
  rep: { kind: PeriodKind; off: number };
  setRep: (r: { kind: PeriodKind; off: number }) => void;
  drawerId: string | null;
  openDrawer: (id: string, focusBlock?: boolean) => void;
  closeDrawer: () => void;
  drafts: Record<string, Record<string, string>>;
  setDraft: (id: string, k: string, v: string | null) => void;
  toast: (msg: string, tone?: 'bad', sticky?: boolean) => ToastHandle;
  confirmState: ConfirmState | null;
  confirmBox: (o: ConfirmOpts) => Promise<boolean>;
  closeConfirm: (v: boolean) => void;
  // auth
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  // data
  reloadAll: () => Promise<void>;
  pollNow: () => void;
  refreshImports: () => Promise<void>;
  refreshActivity: () => Promise<void>;
  loadHistory: (id: string) => Promise<HistoryEntry[]>;
  canTouch: (t: Task) => boolean;
  setStatus: (id: string, st: Status) => void;
  writeTask: (id: string, body: Record<string, unknown>, local: Partial<Task>, okMsg?: string) => Promise<boolean>;
  deleteTask: (id: string) => Promise<boolean>;
  bulk: (ids: string[], payload: BulkPayload, label: string, local?: (t: CTask) => Partial<Task> | null) => Promise<void>;
  saveSettings: (patch: { targetBuffer?: number; allowTeamEdit?: boolean }) => Promise<void>;
  customRoles: CustomRole[];
  createRole: (name: string) => Promise<boolean>;
  renameRole: (key: string, name: string) => Promise<boolean>;
  deleteRole: (key: string) => Promise<boolean>;
  gotoTasks: (q: string) => void;
  gotoReport: (kind: PeriodKind) => void;
  teamQuick: (team: string, q: string) => void;
}

const AppContext = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppContext);
  if (!c) throw new Error('useApp outside provider');
  return c;
};

const defaultInfo: SessionInfo = { authenticated: false, setupNeeded: false, pins: { admin: false, designer: false, editor: false }, roles: [] };
const defaultSettings: Settings = { targetBuffer: 7, allowTeamEdit: false, pins: { admin: false, designer: false, editor: false }, roles: [] };
const POLL_MS = 15000;
const OVERLAP_MS = 5000;
const STATUS_QUICK = ['completed', 'in_progress', 'not_started', 'blocked'];

export function AppProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootError, setBootError] = useState('');
  const [info, setInfo] = useState<SessionInfo>(defaultInfo);
  const [session, setSession] = useState<{ role: Role; name: string } | null>(null);
  const [viewAs, setViewAs] = useState<Role | null>(null);
  const [settings, setSettingsRaw] = useState<Settings>(defaultSettings);
  const [rolesVer, setRolesVer] = useState(0);
  const applyRoles = useCallback((roles: CustomRole[]) => {
    registerRoles(roles);
    setRolesVer((v) => v + 1);
  }, []);
  const setSettings = useCallback(
    (u: Settings | ((s: Settings) => Settings)) => {
      setSettingsRaw((prev) => {
        const next = typeof u === 'function' ? u(prev) : u;
        if (next.roles !== prev.roles) queueMicrotask(() => applyRoles(next.roles || []));
        return next;
      });
    },
    [applyRoles],
  );
  const [loaded, setLoaded] = useState(false);
  const [imports, setImports] = useState<ImportRec[]>([]);
  const [activity, setActivity] = useState<HistoryEntry[]>([]);
  const [view, setViewState] = useState('dashboard');
  const [tables, setTables] = useState<Record<string, TableState>>({});
  const [teamTab, setTeamTabState] = useState<Record<string, 'queue' | 'table'>>({});
  const [teamFounder, setTeamFounderState] = useState<Record<string, boolean>>({});
  const [qExpand, setQExpandState] = useState<Record<string, boolean>>({});
  const [cal, setCal] = useState<{ month: string | null; sel: string | null }>({ month: null, sel: null });
  const [rep, setRep] = useState<{ kind: PeriodKind; off: number }>({ kind: 'week', off: 0 });
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [ver, setVer] = useState(0);
  const [, setTick] = useState(0);

  const tasksRef = useRef<Map<string, CTask>>(new Map());
  const sinceRef = useRef<string | null>(null);
  const pendingRef = useRef<Map<string, number>>(new Map());
  const queuesRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const pollBusy = useRef(false);
  const viewRef = useRef(view);
  const roleRef = useRef<Role | null>(null);
  viewRef.current = view;
  roleRef.current = session ? session.role : null;

  const bump = useCallback(() => setVer((v) => v + 1), []);

  /* ---------- toasts & confirm ---------- */
  const toast = useCallback((msg: string, tone?: 'bad', sticky?: boolean): ToastHandle => {
    const dur = (t?: 'bad') => (sticky ? Infinity : t === 'bad' ? 6000 : 3200);
    const show = (m: string, t: 'bad' | undefined, id?: string | number) => (t === 'bad' ? sonner.error(m, { id, duration: dur(t) }) : sonner.success(m, { id, duration: dur(t) }));
    const id = show(msg, tone);
    return {
      set: (m, t) => void show(m, t ?? tone, id),
      close: (after = 0) => void setTimeout(() => sonner.dismiss(id), after),
    };
  }, []);

  const confirmBox = useCallback(
    (o: ConfirmOpts) => new Promise<boolean>((res) => setConfirmState({ ok: 'Confirm', ...o, res })),
    [],
  );
  const closeConfirm = useCallback((v: boolean) => {
    setConfirmState((c) => {
      if (c) c.res(v);
      return null;
    });
  }, []);

  /* ---------- tasks ---------- */
  const tasks = useMemo(() => [...tasksRef.current.values()], [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = useMemo(() => tasks.filter((t) => !t.archived), [tasks]);
  const taskById = useCallback((id: string) => tasksRef.current.get(id), []);

  const loadAll = useCallback(async () => {
    const m = new Map<string, CTask>();
    let cursor: string | null = null;
    let first: string | null = null;
    do {
      const r: { tasks: Task[]; nextCursor: string | null; serverTime: string } = await api(`/api/tasks${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (first === null) first = r.serverTime;
      r.tasks.forEach((t) => m.set(t.id, ingest(t)));
      cursor = r.nextCursor;
    } while (cursor);
    tasksRef.current = m;
    sinceRef.current = new Date(new Date(first as string).getTime() - OVERLAP_MS).toISOString();
    bump();
  }, [bump]);

  const refreshImports = useCallback(async () => {
    if (roleRef.current !== 'admin') return;
    const r = await api<{ imports: ImportRec[] }>('/api/imports');
    setImports(r.imports);
  }, []);
  const refreshActivity = useCallback(async () => {
    if (roleRef.current !== 'admin') return;
    const r = await api<{ activity: HistoryEntry[] }>('/api/activity?limit=12');
    setActivity(r.activity);
  }, []);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadAll(), refreshImports(), refreshActivity()]);
  }, [loadAll, refreshImports, refreshActivity]);

  /** Poll for changes. Skips tasks that have a save in flight so optimistic edits are not flickered back. */
  const poll = useCallback(async () => {
    if (pollBusy.current || !sinceRef.current || !roleRef.current) return;
    pollBusy.current = true;
    try {
      const r = await api<{ reload?: boolean; tasks?: Task[]; removed?: string[]; serverTime: string }>(`/api/tasks?since=${encodeURIComponent(sinceRef.current)}`);
      if (r.reload) {
        await loadAll();
      } else {
        const m = tasksRef.current;
        (r.tasks || []).forEach((t) => {
          if (!pendingRef.current.has(t.id)) m.set(t.id, ingest(t));
        });
        (r.removed || []).forEach((id) => m.delete(id));
        sinceRef.current = new Date(new Date(r.serverTime).getTime() - OVERLAP_MS).toISOString();
        if ((r.tasks && r.tasks.length) || (r.removed && r.removed.length)) bump();
      }
      if (roleRef.current === 'admin') {
        await refreshImports();
        if (viewRef.current === 'dashboard') await refreshActivity();
      }
    } catch {
      /* network blip: the next poll will catch up */
    } finally {
      pollBusy.current = false;
    }
  }, [bump, loadAll, refreshImports, refreshActivity]);

  const pollNow = useCallback(() => {
    void poll();
  }, [poll]);

  /* ---------- boot & auth ---------- */
  const bootstrap = useCallback(
    async (role: Role, name: string) => {
      setSession({ role, name });
      roleRef.current = role;
      const [s] = await Promise.all([api<Settings>('/api/settings'), loadAll()]);
      setSettings(s);
      if (role === 'admin') await Promise.all([refreshImports(), refreshActivity()]);
      setLoaded(true);
    },
    [loadAll, refreshImports, refreshActivity],
  );

  const resetData = useCallback(() => {
    tasksRef.current = new Map();
    sinceRef.current = null;
    pendingRef.current.clear();
    queuesRef.current.clear();
    roleRef.current = null;
    setSession(null);
    setViewAs(null);
    setLoaded(false);
    setImports([]);
    setActivity([]);
    setDrawerId(null);
    setTables({});
    setDrafts({});
    bump();
  }, [bump]);

  const refreshInfo = useCallback(async () => {
    const i = await api<SessionInfo>('/api/auth/session', { quiet401: true });
    registerRoles(i.roles || []);
    setRolesVer((v) => v + 1);
    setInfo(i);
    return i;
  }, []);

  useEffect(() => {
    const start = readLocation();
    const v0 = start[0] || lsGet<string>('epc.view', 'dashboard');
    setViewState(v0);
    writeLocation(start[0] ? start : [v0], true); // also turns an old "#/page" link into a clean path
    // browser Back / Forward
    const onPop = () => setViewState(readLocation()[0] || 'dashboard');
    window.addEventListener('popstate', onPop);
    (async () => {
      try {
        const i = await refreshInfo();
        if (i.authenticated && i.role) await bootstrap(i.role, i.name || '');
        setBoot('ready');
      } catch (e) {
        if (e instanceof ApiFail && e.status === 401) {
          // the saved login is no longer valid (PIN changed, role removed): show the login screen
          resetData();
          await refreshInfo().catch(() => {});
          setBoot('ready');
          return;
        }
        setBootError(e instanceof Error ? e.message : 'Could not load the dashboard.');
        setBoot('error');
      }
    })();
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 401 anywhere (cookie gone, or the PIN for this role was changed): back to the login screen.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setBoot((b) => (b === 'loading' ? 'ready' : b));
      if (!roleRef.current) return;
      resetData();
      void refreshInfo().catch(() => {});
      toast('Your session has ended. Please log in again.', 'bad');
    });
    return () => setUnauthorizedHandler(null);
  }, [resetData, refreshInfo, toast]);

  // Poll every 15 s while the tab is visible; catch up as soon as it becomes visible again.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      if (!document.hidden) void poll();
    }, POLL_MS);
    const onVis = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [session, poll]);

  // "Today" moves on at midnight without a reload.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const r = await api<{ role: Role; name: string }>('/api/auth/login', { body: { username, password }, quiet401: true });
        await bootstrap(r.role, r.name);
        setViewAs(null);
        const v = r.role === 'admin' ? 'dashboard' : 'team';
        setViewState(v);
        lsSet('epc.view', v);
        writeLocation([v], true);
        return null;
      } catch (e) {
        resetData();
        return e instanceof Error ? e.message : 'Could not log in.';
      }
    },
    [bootstrap, resetData],
  );

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST', body: {}, quiet401: true });
    } catch {
      /* cookie is cleared by the server; ignore network errors */
    }
    resetData();
    await refreshInfo().catch(() => {});
  }, [resetData, refreshInfo]);

  /* ---------- role ---------- */
  const baseRole = session ? session.role : null;
  const role: Role | null = baseRole === 'admin' && viewAs ? viewAs : baseRole;
  const isAdmin = role === 'admin';
  const canTouch = useCallback((t: Task) => (role ? role === 'admin' || canTouchPerm(role, { team: t.team, archived: false }) : false), [role]);

  /* ---------- navigation ---------- */
  const setView = useCallback((v: string) => {
    setViewState(v);
    lsSet('epc.view', v);
    if (readLocation()[0] !== v) writeLocation([v]);
  }, []);
  const nav = useCallback(
    (v: string) => {
      setView(v);
      window.scrollTo(0, 0);
    },
    [setView],
  );

  /* ---------- table state ---------- */
  const tstate = useCallback(
    (key: string): TableState =>
      tables[key] || { q: '', f: emptyFilters(), sort: 'prio', page: 1, size: 25, sel: new Set<string>(), hidden: lsGet<string[]>('epc.cols.' + key, []) },
    [tables],
  );
  const updTable = useCallback((key: string, fn: (s: TableState) => void) => {
    setTables((prev) => {
      const cur = prev[key] || { q: '', f: emptyFilters(), sort: 'prio', page: 1, size: 25, sel: new Set<string>(), hidden: lsGet<string[]>('epc.cols.' + key, []) };
      const next: TableState = { ...cur, f: { ...cur.f }, sel: new Set(cur.sel), hidden: [...cur.hidden] };
      fn(next);
      return { ...prev, [key]: next };
    });
  }, []);

  const gotoTasks = useCallback(
    (qk: string) => {
      updTable('all', (st) => {
        st.f.status = '';
        st.f.quick = '';
        st.f.team = '';
        if (STATUS_QUICK.includes(qk)) st.f.status = qk;
        else st.f.quick = qk;
        st.page = 1;
      });
      nav('distribution');
    },
    [updTable, nav],
  );
  const gotoReport = useCallback(
    (kind: PeriodKind) => {
      setRep({ kind, off: 0 });
      nav('reports');
    },
    [nav],
  );
  const teamQuick = useCallback(
    (team: string, qk: string) => {
      updTable('team-' + team + (teamFounder[team] ? '-founder' : ''), (st) => {
        st.f.status = '';
        st.f.quick = '';
        if (STATUS_QUICK.includes(qk)) st.f.status = qk;
        else st.f.quick = qk;
        st.page = 1;
      });
      setTeamTabState((t) => ({ ...t, [team]: 'table' }));
    },
    [updTable, teamFounder],
  );

  /* ---------- drawer ---------- */
  const openDrawer = useCallback((id: string, focusBlock?: boolean) => {
    setDrawerId(id);
    if (focusBlock)
      setTimeout(() => {
        const el = document.getElementById('d-block');
        if (el) el.focus();
      }, 80);
  }, []);
  const closeDrawer = useCallback(() => setDrawerId(null), []);
  const setDraft = useCallback((id: string, k: string, v: string | null) => {
    setDrafts((d) => {
      const cur = { ...(d[id] || {}) };
      if (v === null) delete cur[k];
      else cur[k] = v;
      return { ...d, [id]: cur };
    });
  }, []);

  const loadHistory = useCallback(async (id: string) => (await api<{ history: HistoryEntry[] }>(`/api/tasks/${encodeURIComponent(id)}/history`)).history, []);

  /* ---------- writes ---------- */
  const writeTask = useCallback(
    (id: string, body: Record<string, unknown>, local: Partial<Task>, okMsg?: string): Promise<boolean> => {
      const before = tasksRef.current.get(id);
      if (!before) return Promise.resolve(false);
      tasksRef.current.set(id, ingest({ ...before, ...local, updatedAt: new Date().toISOString() } as Task));
      pendingRef.current.set(id, (pendingRef.current.get(id) || 0) + 1);
      bump();
      const prev = queuesRef.current.get(id) || Promise.resolve();
      const p = prev
        .then(async () => {
          try {
            const r = await withRetry(() => api<{ task: Task }>(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body }), 2);
            tasksRef.current.set(id, ingest(r.task));
            if (okMsg) toast(okMsg);
            return true;
          } catch (e) {
            tasksRef.current.set(id, before);
            if (!(e instanceof ApiFail && e.status === 401)) toast('Could not save: ' + (e instanceof Error ? e.message : 'unknown error'), 'bad');
            return false;
          } finally {
            const n = (pendingRef.current.get(id) || 1) - 1;
            if (n <= 0) pendingRef.current.delete(id);
            else pendingRef.current.set(id, n);
            bump();
            void poll();
          }
        })
        .catch(() => false);
      queuesRef.current.set(id, p);
      return p as Promise<boolean>;
    },
    [bump, poll, toast],
  );

  const setStatus = useCallback(
    (id: string, st: Status) => {
      const t = tasksRef.current.get(id);
      if (!t || !canTouch(t) || t.status === st) return;
      const { patch } = statusPatch(t, st);
      const nowIso = new Date().toISOString();
      const local: Partial<Task> = { status: st, blockedReason: patch.blockedReason };
      if (patch.completedAt === 'now') local.completedAt = nowIso;
      if (patch.completedAt === null) {
        local.completedAt = null;
        local.lastCompletedAt = patch.lastCompletedAt ?? null;
      }
      if (patch.startedAt === 'now') local.startedAt = nowIso;
      void writeTask(id, { status: st }, local);
      if (st === 'blocked') openDrawer(id, true);
      if (st === 'completed') toast(`Marked completed · ${fmtDT(nowIso)}`);
    },
    [canTouch, writeTask, openDrawer, toast],
  );

  const deleteTask = useCallback(
    async (id: string) => {
      try {
        await api(`/api/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
        tasksRef.current.delete(id);
        bump();
        void poll();
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not delete.', 'bad');
        return false;
      }
    },
    [bump, poll, toast],
  );

  const bulk = useCallback(
    async (ids: string[], payload: BulkPayload, label: string, local?: (t: CTask) => Partial<Task> | null) => {
      const list = ids.filter((id) => tasksRef.current.has(id));
      if (!list.length) return;
      const h = toast(`${label}: 0 / ${list.length}`, undefined, true);
      let done = 0;
      let failed = '';
      // optimistic: show the change straight away, reconcile with the server afterwards
      const snapshot = new Map<string, CTask>();
      if (payload.action === 'delete') {
        list.forEach((id) => {
          snapshot.set(id, tasksRef.current.get(id) as CTask);
          tasksRef.current.delete(id);
        });
      } else if (local) {
        list.forEach((id) => {
          const t = tasksRef.current.get(id) as CTask;
          const l = local(t);
          if (l) {
            snapshot.set(id, t);
            tasksRef.current.set(id, ingest({ ...t, ...l, updatedAt: new Date().toISOString() } as Task));
          }
        });
      }
      bump();
      for (let i = 0; i < list.length; i += 1000) {
        const slice = list.slice(i, i + 1000);
        try {
          await withRetry(() => api('/api/tasks/bulk', { body: { ...payload, ids: slice } }), 2);
          done += slice.length;
          h.set(`${label}: ${done} / ${list.length}`);
        } catch (e) {
          failed = e instanceof Error ? e.message : 'failed';
          slice.forEach((id) => {
            const old = snapshot.get(id);
            if (old) tasksRef.current.set(id, old);
          });
          break;
        }
      }
      bump();
      if (failed) h.set(`${label}: ${done} done, ${list.length - done} failed. ${failed}`, 'bad');
      else h.set(`${label}: done (${list.length})`);
      h.close(4500);
      void poll();
    },
    [bump, poll, toast],
  );

  const saveSettings = useCallback(
    async (patch: { targetBuffer?: number; allowTeamEdit?: boolean }) => {
      try {
        const s = await api<Settings>('/api/settings', { method: 'PATCH', body: patch });
        setSettings(s);
        toast('Settings saved');
      } catch (e) {
        toast('Could not save settings: ' + (e instanceof Error ? e.message : ''), 'bad');
      }
    },
    [toast],
  );

  const customRoles = settings.roles || [];
  const roleCall = useCallback(
    async (fn: () => Promise<{ roles: CustomRole[] }>, okMsg: string) => {
      try {
        const r = await fn();
        setSettings((s) => ({ ...s, roles: r.roles }));
        toast(okMsg);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Something went wrong.', 'bad');
        return false;
      }
    },
    [toast, setSettings],
  );
  const createRole = useCallback((name: string) => roleCall(() => api('/api/roles', { body: { name } }), 'Role created'), [roleCall]);
  const renameRole = useCallback((key: string, name: string) => roleCall(() => api(`/api/roles/${encodeURIComponent(key)}`, { method: 'PATCH', body: { name } }), 'Role renamed'), [roleCall]);
  const deleteRole = useCallback((key: string) => roleCall(() => api(`/api/roles/${encodeURIComponent(key)}`, { method: 'DELETE' }), 'Role deleted'), [roleCall]);
  void rolesVer;

  const value: Ctx = {
    boot,
    bootError,
    info,
    session,
    baseRole,
    role,
    isAdmin,
    viewAs,
    setViewAs,
    settings,
    loaded,
    tasks,
    act,
    taskById,
    imports,
    activity,
    today: todayISO(),
    view,
    setView,
    nav,
    tables,
    tstate,
    updTable,
    teamTab,
    setTeamTab: (team, tab) => setTeamTabState((t) => ({ ...t, [team]: tab })),
    teamFounder,
    setTeamFounder: (team, on) => setTeamFounderState((t) => ({ ...t, [team]: on })),
    qExpand,
    setQExpand: (k) => setQExpandState((x) => ({ ...x, [k]: true })),
    cal,
    setCal,
    rep,
    setRep,
    drawerId,
    openDrawer,
    closeDrawer,
    drafts,
    setDraft,
    toast,
    confirmState,
    confirmBox,
    closeConfirm,
    login,
    logout,
    reloadAll,
    pollNow,
    refreshImports,
    refreshActivity,
    loadHistory,
    canTouch,
    setStatus,
    writeTask,
    deleteTask,
    bulk,
    saveSettings,
    customRoles,
    createRole,
    renameRole,
    deleteRole,
    gotoTasks,
    gotoReport,
    teamQuick,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

