'use client';
import { TriangleAlert } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Toaster } from '@/components/ui/sonner';
import { useApp } from './store';

/** Confirmation before anything destructive (delete, archive, reassign …). Escape or Cancel keeps everything as it was. */
export function ConfirmDialog() {
  const { confirmState: c, closeConfirm } = useApp();
  return (
    <AlertDialog open={!!c} onOpenChange={(o) => !o && closeConfirm(false)}>
      {c ? (
        <AlertDialogContent className="data-[size=default]:sm:max-w-md">
          <AlertDialogHeader className="items-start text-left sm:place-items-start">
            {c.danger ? (
              <div className="mb-1 grid size-10 place-items-center rounded-full bg-danger-soft text-danger">
                <TriangleAlert className="size-5" />
              </div>
            ) : null}
            <AlertDialogTitle className="text-base font-bold">{c.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">{c.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
            <AlertDialogAction variant={c.danger ? 'destructive' : 'default'} className={c.danger ? 'bg-destructive text-white hover:bg-destructive/90' : ''} onClick={() => closeConfirm(true)}>
              {c.ok}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
}

export function Toasts() {
  return <Toaster position="bottom-right" richColors closeButton />;
}
