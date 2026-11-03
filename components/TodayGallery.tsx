'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clapperboard, Copy, Download, Image as ImageIcon, X } from 'lucide-react';
import { formatBytes, mediaKind, type ManageFile, type MediaKind } from '@/lib/manage-config';
import { groupRecent, uploadTime } from '@/lib/recent';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { LazyThumb } from './LazyThumb';

export interface TodayLink {
  title: string;
  platform: string;
  caption: string;
}

interface Props {
  files: ManageFile[];
  links: Record<string, TodayLink>;
  now: number;
  /** Signed thumbnail links for these keys. */
  loadUrls: (keys: string[]) => Promise<Record<string, string>>;
  /** Address that saves a file. */
  href: (key: string, mode: 'view' | 'download') => string;
  only?: '' | MediaKind;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function CopyButton({ text, label = false, className = '' }: { text: string; label?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`btn tg-btn ${className}`}
      aria-label="Copy caption"
      title="Copy caption"
      onClick={async (e) => {
        e.stopPropagation();
        await copyText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check className="size-[18px]" /> : <Copy className="size-[18px]" />}
      {label ? <span>{copied ? 'Copied' : 'Copy caption'}</span> : null}
    </button>
  );
}

function Card({ f, link, url, href, onOpen }: { f: ManageFile; link?: TodayLink; url?: string; href: Props['href']; onOpen: () => void }) {
  const kind = mediaKind(f.name);
  const cap = link?.caption?.trim() || '';
  return (
    <article className="flex min-w-0 flex-col gap-2.5 rounded-2xl border bg-card p-2 shadow-(--shadow-card) sm:gap-3 sm:p-2.5">
      <button type="button" onClick={onOpen} className="lazy-thumb relative block aspect-[16/10] w-full overflow-hidden rounded-xl bg-muted" aria-label={`Open ${f.name}`}>
        {url && kind === 'image' ? (
          <LazyThumb url={url} video={false} alt="" />
        ) : url && kind === 'video' ? (
          <LazyThumb url={url} video />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">{kind === 'video' ? <Clapperboard className="size-8" /> : <ImageIcon className="size-8" />}</span>
        )}
        <span className="absolute top-1.5 left-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-white sm:top-2 sm:left-2 sm:px-2 sm:text-[11px]">{f.name.split('.').pop()?.toUpperCase()}</span>
        {kind === 'video' ? <span className="absolute right-1.5 bottom-1.5 grid size-8 place-items-center rounded-full bg-black/70 text-white sm:right-2 sm:bottom-2">▶</span> : null}
      </button>
      <div className="flex min-w-0 flex-col gap-1 px-1">
        {/* on tablets and desktops every card keeps the same height: the task line and the caption always take their space */}
        <span className={`line-clamp-2 w-full rounded-lg px-2.5 py-1 text-[13px] leading-snug font-medium max-sm:hidden sm:min-h-[2.9rem] ${link?.title ? 'bg-muted' : 'text-muted-foreground italic'}`}>{link?.title || 'No task attached'}</span>
        <b className="font-heading truncate text-[15px] sm:text-[17px]" title={f.name}>
          {f.name}
        </b>
        <span className="truncate text-[12.5px] text-muted-foreground sm:text-[13px]">
          {formatBytes(f.size)} · {uploadTime(f.lastModified)}
          {link?.platform ? ` · ${link.platform}` : ''}
        </span>
        {cap ? (
          <p className="line-clamp-3 min-h-[4.5rem] text-sm leading-relaxed whitespace-pre-line text-muted-foreground max-sm:hidden">{cap}</p>
        ) : (
          <p className="min-h-[4.5rem] text-sm leading-relaxed text-muted-foreground italic max-sm:hidden">{link ? 'This task has no caption.' : 'No caption.'}</p>
        )}
        {cap ? (
          <button type="button" className="min-h-8 w-fit text-sm font-semibold text-foreground underline-offset-4 hover:underline max-sm:hidden" onClick={onOpen}>
            Show more
          </button>
        ) : (
          <span className="min-h-8 max-sm:hidden" aria-hidden="true" />
        )}
      </div>
      <div className="mt-auto flex gap-1.5 px-0.5 pb-0.5 sm:gap-2">
        <a className="btn primary tg-btn flex-1" href={href(f.key, 'download')} aria-label={`Download ${f.name}`} title="Download">
          <Download className="size-[18px]" />
        </a>
        {cap ? <CopyButton text={cap} className="flex-1" /> : null}
      </div>
    </article>
  );
}

/** The one view for a file: the picture or video, and below it the task and caption when there are any. Arrows and swipes move between files. */
function Lightbox({ files, index, links, urls, href, onIndex, onClose }: { files: ManageFile[]; index: number; links: Record<string, TodayLink>; urls: Record<string, string>; href: Props['href']; onIndex: (i: number) => void; onClose: () => void }) {
  const f = files[index];
  const kind = mediaKind(f.name);
  const link = links[f.key];
  const cap = link?.caption?.trim() || '';
  const url = urls[f.key];
  const total = files.length;
  const go = useCallback((d: number) => onIndex((index + d + total) % total), [index, total, onIndex]);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [go]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-dvh flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-h-[92vh] sm:max-w-3xl"
      >
        <div className="flex items-center gap-3 border-b px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[15px] font-semibold">{f.name}</DialogTitle>
            <DialogDescription className="truncate text-[12.5px]">
              {formatBytes(f.size)} · {uploadTime(f.lastModified)}
              {link?.platform ? ` · ${link.platform}` : ''}
              {total > 1 ? ` · ${index + 1} of ${total}` : ''}
            </DialogDescription>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-muted">
            <X className="size-5" />
          </button>
        </div>
        <div
          className="relative grid min-h-[200px] flex-1 place-items-center overflow-hidden bg-black/90 p-2"
          onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => {
            const s = touch.current;
            touch.current = null;
            if (!s || total < 2) return;
            const dx = e.changedTouches[0].clientX - s.x;
            const dy = e.changedTouches[0].clientY - s.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
          }}
        >
          {total > 1 ? (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Previous file" className="absolute top-1/2 left-2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white">
                <ChevronLeft className="size-6" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Next file" className="absolute top-1/2 right-2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white">
                <ChevronRight className="size-6" />
              </button>
            </>
          ) : null}
          {url && kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt={f.name} className="max-h-[56dvh] max-w-full rounded-md object-contain sm:max-h-[60vh]" />
          ) : url && kind === 'video' ? (
            <video key={url} src={url} controls playsInline className="max-h-[56dvh] max-w-full rounded-md bg-black sm:max-h-[60vh]" />
          ) : (
            <span className="text-sm text-white/80">Loading preview…</span>
          )}
        </div>
        {link?.title || cap ? (
          <div className="max-h-[28dvh] shrink-0 space-y-2 overflow-y-auto border-t px-4 py-3">
            {link?.title ? <div className="w-fit max-w-full rounded-lg bg-muted px-2.5 py-1 text-[13px] leading-snug font-medium">{link.title}</div> : null}
            {cap ? <p className="text-[15px] leading-relaxed whitespace-pre-line">{cap}</p> : null}
          </div>
        ) : null}
        <div className="flex gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <a className="btn primary tg-btn flex-1" href={href(f.key, 'download')}>
            <Download className="size-[18px]" /> Download
          </a>
          {cap ? <CopyButton text={cap} label className="flex-1" /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Today's posts: the images and videos of the last 24 hours, by day (Pakistan time), each day split into Images and Videos. Read-only. */
export function TodayGallery({ files, links, now, loadUrls, href, only = '' }: Props) {
  const days = useMemo(() => groupRecent(files, now, only), [files, now, only]);
  const order = useMemo(() => days.flatMap((d) => [...d.images, ...d.videos]), [days]);
  const keys = useMemo(() => order.map((f) => f.key), [order]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openIdx = openKey ? order.findIndex((f) => f.key === openKey) : -1;

  useEffect(() => {
    let alive = true;
    const need = keys.filter((k) => !urls[k]);
    (async () => {
      for (let i = 0; i < need.length; i += 100) {
        try {
          const r = await loadUrls(need.slice(i, i + 100));
          if (alive) setUrls((u) => ({ ...u, ...r }));
        } catch {
          /* thumbnails are optional */
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  if (!days.length)
    return (
      <div className="empty">
        <h2>Nothing uploaded in the last 24 hours.</h2>
        <p className="muted">New images and videos appear here as soon as they are uploaded.</p>
      </div>
    );

  const section = (title: string, list: ManageFile[]) =>
    list.length ? (
      <div className="mt-5">
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
          {title}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground tabular-nums">{list.length}</span>
        </h3>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {list.map((f) => (
            <Card key={f.key} f={f} link={links[f.key]} url={urls[f.key]} href={href} onOpen={() => setOpenKey(f.key)} />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className="flex flex-col gap-8 sm:gap-9">
        {days.map((d) => (
          <section key={d.key} aria-label={d.label}>
            <div className="eyebrow border-b pb-2">
              {d.label} · {d.images.length + d.videos.length} {d.images.length + d.videos.length === 1 ? 'file' : 'files'}
            </div>
            {section('Images', d.images)}
            {section('Videos', d.videos)}
          </section>
        ))}
      </div>
      {openIdx >= 0 ? <Lightbox files={order} index={openIdx} links={links} urls={urls} href={href} onIndex={(i) => setOpenKey(order[i].key)} onClose={() => setOpenKey(null)} /> : null}
    </>
  );
}
