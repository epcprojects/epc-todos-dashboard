'use client';
import { ROLES } from '@/lib/constants';
import { isOverdue } from '@/lib/metrics';
import { useApp } from './store';
import { LoginView } from './views/Login';
import { Dashboard } from './views/Dashboard';
import { TeamView } from './views/TeamView';
import { Distribution } from './views/Distribution';
import { CalendarView } from './views/Calendar';
import { Reports } from './views/Reports';
import { ImportsView } from './views/Imports';
import { SettingsView } from './views/Settings';
import { ImportPage } from './views/ImportPage';

type NavItem = [string, string, { n: number; bad?: boolean } | null];

function useNavItems(): NavItem[] {
  const { role, act, today, imports } = useApp();
  if (!role) return [];
  const teamOf = (team: string) => act.filter((t) => t.team === team);
  if (role === 'admin') {
    const od = act.filter((t) => isOverdue(t, today)).length;
    return [
      ['dashboard', 'Dashboard', od ? { n: od, bad: true } : null],
      ['import', 'Content Import', null],
      ['distribution', 'Task Distribution', { n: act.length }],
      ['designer', 'Designer', { n: teamOf('designer').filter((t) => t.status !== 'completed').length }],
      ['editor', 'Video Editor', { n: teamOf('editor').filter((t) => t.status !== 'completed').length }],
      ['calendar', 'Calendar / Schedule', null],
      ['reports', 'Reports', null],
      ['imports', 'Imports', { n: imports.length }],
      ['settings', 'Settings', null],
    ];
  }
  const mine = teamOf(role);
  const od = mine.filter((t) => isOverdue(t, today)).length;
  return [
    ['team', 'My Tasks', od ? { n: od, bad: true } : { n: mine.filter((t) => t.status !== 'completed').length }],
    ['calendar', 'Calendar', null],
  ];
}

export function Shell() {
  const { boot, bootError, role, baseRole, session, viewAs, setViewAs, view, nav, logout, loaded, setView } = useApp();
  const items = useNavItems();
  const cur = items.map((x) => x[0]).includes(view) ? view : items[0]?.[0] || '';

  let main: React.ReactNode;
  if (boot === 'loading') main = <div className="loading">Loading production data…</div>;
  else if (boot === 'error')
    main = (
      <div className="empty">
        <h2>The dashboard could not start</h2>
        <p className="muted">{bootError}</p>
        <button className="btn primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  else if (!role || !session) main = <LoginView />;
  else if (!loaded) main = <div className="loading">Loading production data…</div>;
  else if (role === 'admin') {
    switch (cur) {
      case 'import':
        main = <ImportPage />;
        break;
      case 'distribution':
        main = <Distribution />;
        break;
      case 'designer':
        main = <TeamView team="designer" admin />;
        break;
      case 'editor':
        main = <TeamView team="editor" admin />;
        break;
      case 'calendar':
        main = <CalendarView />;
        break;
      case 'reports':
        main = <Reports />;
        break;
      case 'imports':
        main = <ImportsView />;
        break;
      case 'settings':
        main = <SettingsView />;
        break;
      default:
        main = <Dashboard />;
    }
  } else if (cur === 'calendar') main = <CalendarView />;
  else main = <TeamView team={role} admin={false} />;

  return (
    <div id="app">
      <aside className="side" id="side">
        <div className="brand">
          <div className="wm">
            ENDPOINT <i>CLIENTS</i>
          </div>
          <div className="sub">Social Media Production Dashboard</div>
        </div>
        <nav className="nav" aria-label="Main">
          {items.map(([k, l, c]) => (
            <button key={k} aria-current={k === cur ? 'page' : undefined} onClick={() => nav(k)}>
              <span>{l}</span>
              {c ? <span className={`cnt ${c.bad ? 'bad' : ''} num`}>{c.n}</span> : null}
            </button>
          ))}
        </nav>
        {role && session ? (
          <div className="who">
            <div style={{ flex: 1 }}>
              <b>{session.name || ROLES[baseRole!]}</b>
              {ROLES[baseRole!] || ''}
              {viewAs ? ' · previewing' : ''}
            </div>
            <button className="btn sm" style={{ background: 'transparent', color: 'var(--nav-fg)', borderColor: '#3A3A50' }} onClick={() => void logout()}>
              Log out
            </button>
          </div>
        ) : null}
      </aside>
      <main className="main" id="main">
        {viewAs && (
          <div className="preview-bar">
            <span>Previewing the {ROLES[viewAs]} view. Delete and admin controls are hidden here, exactly as the team sees it.</span>
            <button
              className="btn sm"
              onClick={() => {
                setViewAs(null);
                setView('settings');
              }}
            >
              Exit preview
            </button>
          </div>
        )}
        {main}
      </main>
    </div>
  );
}
