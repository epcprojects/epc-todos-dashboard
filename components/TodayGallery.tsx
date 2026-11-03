'use client';
import { useEffect, useMemo, useState } from 'react';
import { Check, Clapperboard, Copy, Download, Eye, Image as ImageIcon } from 'lucide-react';
import { formatBytes, mediaKind, type ManageFile, type MediaKind } from '@/lib/manage-config';
import { groupRecent, uploadTime } from '@/lib/recent';
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
  /** Address that opens (view) or saves (download) a file. */
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

function Card({ f, link, url, href }: { f: ManageFile; link?: TodayLink; url?: string; href: Props['href'] }) {
  const kind = mediaKind(f.name);
  const [more, setMore] = useState(false);
  const [copied, setCopied] = useState(false);
  const cap = link?.caption?.trim() || '';
  return (
    <article className="flex flex-col gap-3 rounded-2xl border bg-card p-2.5 shadow-(--shadow-card)">
      <a href={href(f.key, 'view')} target="_blank" rel="noreferrer" className="lazy-thumb relative block aspect-[16/10] overflow-hidden rounded-xl bg-muted" aria-label={`Open ${f.name}`}>
        {url && kind === 'image' ? (
          <LazyThumb url={url} video={false} alt={f.name} />
        ) : url && kind === 'video' ? (
          <LazyThumb url={url} video />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">{kind === 'video' ? <Clapperboard className="size-8" /> : <ImageIcon className="size-8" />}</span>
        )}
        <span className="absolute top-2 left-2 rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-bold tracking-wide text-white">{f.name.split('.').pop()?.toUpperCase()}</span>
      </a>
      <div className="flex min-w-0 flex-col gap-1.5 px-1">
        {link?.title ? <span className="line-clamp-2 w-fit max-w-full rounded-lg bg-muted px-2.5 py-1 text-[13px] leading-snug font-medium">{link.title}</span> : null}
        <b className="font-heading truncate text-[17px]" title={f.name}>
          {f.name}
        </b>
        <span className="text-[13px] text-muted-foreground">
          {formatBytes(f.size)} · {uploadTime(f.lastModified)}
          {link?.platform ? ` · ${link.platform}` : ''}
        </span>
        {cap ? (
          <>
            <p className={`text-sm leading-relaxed whitespace-pre-line text-muted-foreground ${more ? '' : 'line-clamp-3'}`}>{cap}</p>
            <button type="button" className="w-fit min-h-8 text-sm font-semibold text-foreground underline-offset-4 hover:underline" onClick={() => setMore((m) => !m)}>
              {more ? 'Show less' : 'Show more'}
            </button>
          </>
        ) : null}
      </div>
      <div className="mt-auto flex gap-2 px-0.5 pb-0.5">
        <a className="btn primary flex-1" href={href(f.key, 'download')}>
          <Download className="size-4" /> Download
        </a>
        <a className="btn" href={href(f.key, 'view')} target="_blank" rel="noreferrer" aria-label={`View ${f.name}`} title="View">
          <Eye className="size-4" />
        </a>
        {cap ? (
          <button
            type="button"
            className="btn"
            aria-label="Copy caption"
            title="Copy caption"
            onClick={async () => {
              await copyText(cap);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </button>
        ) : null}
      </div>
    </article>
  );
}

/** Today's posts: the images and videos of the last 24 hours, by day (Pakistan time), each day split into Images and Videos. Read-only. */
export function TodayGallery({ files, links, now, loadUrls, href, only = '' }: Props) {
  const days = useMemo(() => groupRecent(files, now, only), [files, now, only]);
  const keys = useMemo(() => days.flatMap((d) => [...d.images, ...d.videos].map((f) => f.key)), [days]);
  const [urls, setUrls] = useState<Record<string, string>>({});

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
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {list.map((f) => (
            <Card key={f.key} f={f} link={links[f.key]} url={urls[f.key]} href={href} />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-9">
      {days.map((d) => (
        <section key={d.key} aria-label={d.label}>
          <div className="eyebrow border-b pb-2">
            {d.label} · {d.images.length + d.videos.length} files
          </div>
          {section('Images', d.images)}
          {section('Videos', d.videos)}
        </section>
      ))}
    </div>
  );
}
