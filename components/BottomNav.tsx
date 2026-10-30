'use client';
import { CalendarDays, FolderOpen, LayoutDashboard, ListTodo, Menu } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { useApp } from './store';

/** Phone navigation: four big tabs along the bottom, the fourth opens the full menu. */
export function BottomNav({ cur }: { cur: string }) {
  const { role, nav } = useApp();
  const { setOpenMobile } = useSidebar();
  const admin = role === 'admin';
  const tabs = admin
    ? [
        { key: 'dashboard', label: 'Today', icon: LayoutDashboard, on: cur === 'dashboard' },
        { key: 'designer', label: 'Queue', icon: ListTodo, on: cur === 'designer' || cur === 'editor' || cur.startsWith('team:') },
        { key: 'manage', label: 'Library', icon: FolderOpen, on: cur === 'manage' },
      ]
    : [
        { key: 'team', label: 'Queue', icon: ListTodo, on: cur === 'team' },
        { key: 'calendar', label: 'Calendar', icon: CalendarDays, on: cur === 'calendar' },
        { key: 'manage', label: 'Library', icon: FolderOpen, on: cur === 'manage' },
      ];
  const base = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold transition-colors';
  return (
    <nav aria-label="Main" data-app-header className="fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t bg-background/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      {tabs.map((t) => (
        <button key={t.key} type="button" aria-current={t.on ? 'page' : undefined} onClick={() => nav(t.key)} className={`${base} ${t.on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
          <t.icon className="size-5" strokeWidth={1.9} />
          {t.label}
        </button>
      ))}
      <button type="button" onClick={() => setOpenMobile(true)} className={`${base} text-muted-foreground`}>
        <Menu className="size-5" strokeWidth={1.9} />
        More
      </button>
    </nav>
  );
}
