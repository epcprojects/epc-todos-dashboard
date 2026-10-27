'use client';
import { AppProvider } from './store';
import { Shell } from './Shell';
import { Drawer } from './Drawer';
import { ConfirmDialog, Toasts } from './Dialogs';

export function App() {
  return (
    <AppProvider>
      <Shell />
      <Drawer />
      <ConfirmDialog />
      <Toasts />
    </AppProvider>
  );
}
