'use client';
import { useEffect } from 'react';
import { AppProvider, useApp } from './store';
import { Shell } from './Shell';
import { Drawer } from './Drawer';
import { ConfirmDialog, Toasts } from './Dialogs';

export function App() {
  return (
    <AppProvider>
      <Frame />
    </AppProvider>
  );
}

function Frame() {
  const { confirmState, closeConfirm, drawerId, closeDrawer } = useApp();

  // Escape closes the top-most layer: confirm dialog, then the import wizard (handles itself), then the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmState) {
        closeConfirm(false);
        return;
      }
      if (document.getElementById('wizard-modal')) return;
      if (drawerId) closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmState, closeConfirm, drawerId, closeDrawer]);

  return (
    <>
      <Shell />
      <Drawer />
      <ConfirmDialog />
      <Toasts />
    </>
  );
}
