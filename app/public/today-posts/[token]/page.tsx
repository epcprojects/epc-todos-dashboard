'use client';
import { use, useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { EpcMark } from '@/components/EpcMark';
import { TodayGallery, type TodayLink } from '@/components/TodayGallery';
import type { ManageFile } from '@/lib/manage-config';

interface Data {
  now: number;
  files: ManageFile[];
  links: Record<string, TodayLink>;
}

/** Public, no login: view and download the last 24 hours of images and videos. Nothing here can change a file. */
export default function PublicTodayPosts({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/public/today-posts?t=${encodeURIComponent(token)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(r.status === 404 ? 'This link is not valid or has been turned off.' : j.error || 'Could not load the files.');
      setData(j);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load the files.');
    }
    setBusy(false);
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);

  const loadUrls = useCallback(
    async (keys: string[]) => {
      const r = await fetch('/api/public/today-posts/urls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: token, keys }) });
      if (!r.ok) throw new Error('urls');
      return (await r.json()).urls as Record<string, string>;
    },
    [token],
  );
  const href = useCallback((key: string, mode: 'view' | 'download') => `/api/public/today-posts/download?t=${encodeURIComponent(token)}&key=${encodeURIComponent(key)}&mode=${mode}`, [token]);

  return (
    <main className="mx-auto w-full max-w-[1300px] px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#673de6]">
            <EpcMark className="size-7" white />
          </span>
          <div>
            <div className="eyebrow">Endpoint Clients</div>
            <h1 className="font-heading text-[28px] leading-tight font-extrabold sm:text-[34px]">Today’s posts</h1>
          </div>
        </div>
        <button className="btn" onClick={() => void load()} disabled={busy}>
          <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>
      <p className="-mt-4 mb-8 max-w-2xl text-[15px] text-muted-foreground">Everything uploaded in the last 24 hours. You can view and download files and copy their captions.</p>
      {err ? (
        <div className="err" role="alert">
          {err}
        </div>
      ) : !data ? (
        <div className="loading">Loading files…</div>
      ) : (
        <TodayGallery files={data.files} links={data.links} now={data.now} loadUrls={loadUrls} href={href} />
      )}
    </main>
  );
}
