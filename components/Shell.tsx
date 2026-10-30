'use client';
import { BarChart3, CalendarDays, ChevronsUpDown, Clapperboard, FileUp, FolderOpen, History, LayoutDashboard, ListChecks, ListTodo, LogOut, Monitor, Moon, PenTool, Settings, Sun, Users, type LucideIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { ROLES } from '@/lib/constants';
import { isOverdue } from '@/lib/metrics';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ManageView } from './views/Manage';

interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: { n: number; bad?: boolean } | null;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

function useNavGroups(): NavGroup[] {
  const { role, act, today, imports, customRoles } = useApp();
  if (!role) return [];
  const teamOf = (team: string) => act.filter((t) => t.team === team);
  const open = (team: string) => teamOf(team).filter((t) => t.status !== 'completed').length;
  if (role === 'admin') {
    const od = act.filter((t) => isOverdue(t, today)).length;
    return [
      { label: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: od ? { n: od, bad: true } : null }] },
      {
        label: 'Production',
        items: [
          { key: 'import', label: 'Import Content', icon: FileUp },
          { key: 'distribution', label: 'All Tasks', icon: ListChecks, badge: { n: act.length } },
          { key: 'designer', label: 'Graphic Design', icon: PenTool, badge: { n: open('designer') } },
          { key: 'editor', label: 'Video Editing', icon: Clapperboard, badge: { n: open('editor') } },
          ...customRoles.map((c): NavItem => ({ key: 'team:' + c.key, label: c.name, icon: Users, badge: { n: open(c.key) } })),
        ],
      },
      {
        label: 'Planning',
        items: [
          { key: 'calendar', label: 'Calendar', icon: CalendarDays },
          { key: 'reports', label: 'Reports', icon: BarChart3 },
        ],
      },
      {
        label: 'Workspace',
        items: [
          { key: 'imports', label: 'Import History', icon: History, badge: { n: imports.length } },
          { key: 'manage', label: 'Content Manage', icon: FolderOpen },
          { key: 'settings', label: 'Settings', icon: Settings },
        ],
      },
    ];
  }
  const mine = teamOf(role);
  const od = mine.filter((t) => isOverdue(t, today)).length;
  return [
    {
      label: 'Workspace',
      items: [
        { key: 'team', label: 'My Tasks', icon: ListTodo, badge: od ? { n: od, bad: true } : { n: open(role) } },
        { key: 'calendar', label: 'Calendar', icon: CalendarDays },
        { key: 'manage', label: 'Content Manage', icon: FolderOpen },
      ],
    },
  ];
}

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '·';
}

import { EpcMark } from './EpcMark';

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5 px-1.5 py-1">
      <EpcMark className="size-9" />
      <div className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
        <div className="truncate text-[15px] font-extrabold tracking-tight">
          Endpoint <span className="text-primary">Clients</span>
        </div>
        <div className="truncate text-xs text-muted-foreground">Production Dashboard</div>
      </div>
    </div>
  );
}

function UserMenu() {
  const { session, baseRole, viewAs, logout } = useApp();
  const { theme, setTheme } = useTheme();
  if (!session) return null;
  const roleName = ROLES[baseRole!] || '';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="h-12" />}>
        <Avatar className="size-8 rounded-lg">
          <AvatarFallback className="rounded-lg bg-accent text-xs font-bold text-accent-foreground">{initials(session.name || roleName)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 text-left leading-tight">
          <span className="truncate text-sm font-semibold">{session.name || roleName}</span>
          <span className="truncate text-xs text-muted-foreground">
            {roleName}
            {viewAs ? ' · previewing' : ''}
          </span>
        </div>
        <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme || 'system'} onValueChange={(v) => setTheme(String(v))}>
            <DropdownMenuRadioItem value="light">
              <Sun className="size-4" /> Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon className="size-4" /> Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor className="size-4" /> System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void logout()}>
          <LogOut className="size-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppSidebar({ groups, cur }: { groups: NavGroup[]; cur: string }) {
  const { nav } = useApp();
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="px-3 pt-4 pb-2">
        <BrandMark />
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel className="text-[11px] font-bold tracking-[0.1em] uppercase">{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((it) => (
                  <SidebarMenuItem key={it.key}>
                    <SidebarMenuButton
                      isActive={it.key === cur}
                      tooltip={it.label}
                      className="h-9 text-[14px] font-semibold data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground"
                      onClick={() => {
                        nav(it.key);
                        setOpenMobile(false);
                      }}
                    >
                      <it.icon className="size-[18px]" />
                      <span>{it.label}</span>
                    </SidebarMenuButton>
                    {it.badge ? (
                      <SidebarMenuBadge className={it.badge.bad ? 'rounded-full bg-danger-soft px-1.5 text-danger' : 'rounded-full bg-muted px-1.5 text-muted-foreground'}>{it.badge.n}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <Skeleton className="size-12 rounded-2xl" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

export function Shell() {
  const { boot, bootError, role, session, viewAs, setViewAs, view, loaded, setView, nav } = useApp();
  const groups = useNavGroups();
  const items = groups.flatMap((g) => g.items);
  const cur = items.map((x) => x.key).includes(view) ? view : items[0]?.key || '';
  const curLabel = items.find((i) => i.key === cur)?.label || '';

  if (boot === 'loading') return <Splash />;
  if (boot === 'error')
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="empty max-w-md">
          <h2>The dashboard could not start</h2>
          <p className="muted">{bootError}</p>
          <Button onClick={() => location.reload()}>Try again</Button>
        </div>
      </div>
    );
  if (!role || !session) return <LoginView />;

  let main: React.ReactNode;
  if (!loaded) {
    main = (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  } else if (role === 'admin') {
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
      case 'manage':
        main = <ManageView />;
        break;
      case 'imports':
        main = <ImportsView />;
        break;
      case 'settings':
        main = <SettingsView />;
        break;
      default:
        main = cur.startsWith('team:') ? <TeamView team={cur.slice(5)} admin /> : <Dashboard />;
    }
  } else if (cur === 'manage') main = <ManageView />;
  else if (cur === 'calendar') main = <CalendarView />;
  else main = <TeamView team={role} admin={false} />;

  return (
    <SidebarProvider>
      <AppSidebar groups={groups} cur={cur} />
      <SidebarInset className="min-w-0 bg-background">
        <header data-app-header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden sm:block">
                <span className="text-sm text-muted-foreground">Endpoint Clients</span>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:block" />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-sm font-semibold">{curLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1500px] min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          {viewAs && (
            <div className="preview-bar">
              <span>Previewing the {ROLES[viewAs]} view. Admin controls are hidden here, exactly as the team sees it.</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setViewAs(null);
                  setView('settings');
                  nav('settings');
                }}
              >
                Exit preview
              </Button>
            </div>
          )}
          {main}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
