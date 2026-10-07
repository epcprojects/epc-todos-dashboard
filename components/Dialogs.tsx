'use client';
import { useEffect, useRef } from 'react';
import { useApp } from './store';

export function ConfirmDialog() {
  const { confirmState: c, closeConfirm } = useApp();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (c) setTimeout(() => cancel.current?.focus(), 30);
  }, [c]);
  if (!c) return null;
  return (
    <div className="modal-wrap" style={{ zIndex: 70 }} role="alertdialog" aria-modal="true" aria-label={c.title}>
      <div className="modal narrow">
        <div className="mh">
          <h2>{c.title}</h2>
        </div>
        <div className="mb">
          <p style={{ margin: 0 }}>{c.body}</p>
        </div>
        <div className="mf">
          <button className="btn" ref={cancel} onClick={() => closeConfirm(false)}>
            Cancel
          </button>
          <button className={`btn ${c.danger ? 'danger' : 'primary'}`} onClick={() => closeConfirm(true)}>
            {c.ok}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div id="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.tone === 'bad' ? ' bad' : ''}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
