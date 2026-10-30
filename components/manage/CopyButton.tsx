'use client';
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';

/** One-click copy of a text (a caption). Falls back to a hidden textarea where the Clipboard API is blocked. */
export function CopyButton({ text, label = 'Copy caption', className = 'btn sm', showLabel = false }: { text: string; label?: string; className?: string; showLabel?: boolean }) {
  const { toast } = useApp();
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        toast('Could not copy. Select the text and copy it manually.', 'bad');
        ta.remove();
        return;
      }
      ta.remove();
    }
    setDone(true);
    toast('Caption copied');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1600);
  };

  return (
    <button type="button" className={className} onClick={(e) => void copy(e)} aria-label={label} title={label}>
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {showLabel ? <span>{done ? 'Copied' : label}</span> : null}
    </button>
  );
}
