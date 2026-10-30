'use client';
import { ChevronLeft, ChevronRight, Download, File as FileGeneric, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, FolderPlus, LayoutGrid, Link2, List, Pencil, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALLOWED_EXTENSIONS, FOLDERS, IMAGE_EXTENSIONS, MAX_FILES_PER_UPLOAD_REQUEST, MAX_FILE_BYTES, ROOT_PREFIX, VIDEO_EXTENSIONS, extOf, folderByKey, formatBytes, isAllowedName, mediaKind, platformOfPath, sanitizeName, type FileLink, type ManageFile, type MediaKind, type TaskOption } from '@/lib/manage-config';
import { api, lsGet, lsSet, readLocation, sleep, writeLocation } from '@/lib/client/api';
import { uploadToS3 } from '@/lib/client/s3upload';
import { STATUS, type Status } from '@/lib/constants';
import { fmtDate, fmtDT } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PlatformIcon, hasPlatformIcon } from '../PlatformIcon';
import { CopyButton } from '../manage/CopyButton';
import { TaskPicker } from '../manage/TaskPicker';
import { useApp } from '../store';
import { PageHeader, PlatPills } from '../ui';

type SortKey = 'name' | 'size' | 'date';
interface UploadItem {
  id: number;
  name: string;
  size: number;
  status: 'queued' | 'uploading' | 'done' | 'failed';
  progress: number;
  error?: string;
  note?: string;
}
interface Target {
  name: string;
  renamed: boolean;
  replaced?: boolean;
  key: string;
  url: string;
  fields: Record<string, string>;
}

const PAGE = 200;
const CONCURRENCY = 3;
const label = (key: string) => folderByKey(key)?.label || key;
/** Display name of the last segment of a folder path (the friendly name for LinkedIn, TikTok …); the root is Automation-Folder. */
const hereLabel = (path: string) => (path ? (path.includes('/') ? (path.split('/').pop() as string) : label(path)) : ROOT_PREFIX);

function FolderIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style={{ color: '#E0A526' }}>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.9c.5 0 1 .2 1.3.6L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z" />
    </svg>
  );
}
function kindOf(name: string) {
  const e = extOf(name);
  if (IMAGE_EXTENSIONS.includes(e)) return 'img';
  if (VIDEO_EXTENSIONS.includes(e)) return 'vid';
  if (e === 'pdf') return 'pdf';
  if (['xls', 'xlsx', 'csv'].includes(e)) return 'xls';
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(e)) return 'doc';
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(e)) return 'zip';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(e)) return 'aud';
  return 'oth';
}
const KIND_ICON = { img: FileImage, vid: FileVideo, pdf: FileText, xls: FileSpreadsheet, doc: FileText, zip: FileArchive, aud: FileAudio, oth: FileGeneric };

function FileBadge({ name, big }: { name: string; big?: boolean }) {
  const kind = kindOf(name);
  const Icon = KIND_ICON[kind];
  return (
    <span className={`mg-badge mg-${kind}${big ? ' big' : ''}`} aria-hidden="true">
      <Icon className={big ? 'size-8' : 'size-4'} strokeWidth={1.9} />
    </span>
  );
}

/** Under a picture or video: the attached task and its caption with a one-click copy, or an "Attach task" button. */
function LinkLine({ file, link, onAttach }: { file: ManageFile; link?: FileLink; onAttach: () => void }) {
  if (!mediaKind(file.name)) return null;
  if (!link)
    return (
      <button type="button" className="mg-attach" onClick={onAttach}>
        <Link2 className="size-3.5" /> Attach task
      </button>
    );
  return (
    <div className="mg-link">
      <button type="button" className="mg-chip" onClick={onAttach} title="Change the attached task">
        <Link2 className="size-3 shrink-0" />
        <span>{link.title}</span>
      </button>
      {link.caption ? (
        <div className="mg-cap-row">
          <p className="mg-caption">{link.caption}</p>
          <CopyButton text={link.caption} className="btn sm mg-copy" />
        </div>
      ) : (
        <p className="mg-nocap">This task has no caption.</p>
      )}
    </div>
  );
}

/** Image / video / PDF preview in a modal, with previous / next across the folder. Pictures and videos also show their task caption beside the file. */
function PreviewDialog({ file, index, total, url, link, onAttach, onClose, onPrev, onNext, onDownload, onRename, onDelete }: { file: ManageFile; index: number; total: number; url?: string; link?: FileLink; onAttach: () => void; onClose: () => void; onPrev: () => void; onNext: () => void; onDownload: () => void; onRename: () => void; onDelete: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select')) return; // typing in a search box must not flip files
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onPrev, onNext]);
  const kind = kindOf(file.name);
  const mk = mediaKind(file.name);
  const panel = mk ? (
    <aside className="flex max-h-[72vh] min-h-0 flex-col gap-3 overflow-y-auto border-t p-4 lg:border-t-0 lg:border-l" aria-label="Caption">
      <div className="text-xs font-bold tracking-[0.1em] text-muted-foreground uppercase">Caption</div>
      {link ? (
        <>
          <div>
            <div className="text-sm leading-snug font-semibold">{link.title}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
              {link.founder ? <span className="tag founder">Founder</span> : null}
              {link.platform ? <PlatPills value={link.platform} /> : null}
              {link.postDate ? <span>{fmtDate(link.postDate, { year: undefined })}</span> : null}
              <span className="tag">{STATUS[link.status as Status] || link.status}</span>
            </div>
          </div>
          {link.caption ? (
            <>
              <div className="mg-caption-full">{link.caption}</div>
              <CopyButton text={link.caption} label="Copy caption" className="btn primary" showLabel />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">This task has no caption.</p>
          )}
          <Button variant="outline" size="lg" onClick={onAttach}>
            <Link2 /> Change task
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">No task is attached to this {mk === 'image' ? 'picture' : 'video'} yet. Attach one to see its caption here.</p>
          <Button size="lg" onClick={onAttach}>
            <Link2 /> Attach task
          </Button>
        </>
      )}
    </aside>
  ) : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className={`max-w-[94vw] gap-0 overflow-hidden p-0 ${mk ? 'sm:max-w-6xl' : 'sm:max-w-5xl'}`}>
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <FileBadge name={file.name} />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[15px] font-semibold">{file.name}</DialogTitle>
            <DialogDescription className="text-[13px]">
              {formatBytes(file.size)} · {hereLabel(file.path)} · {fmtDT(file.lastModified)}
            </DialogDescription>
          </div>
          <Button variant="outline" size="lg" onClick={onDownload} aria-label="Download">
            <Download /> <span className="max-sm:hidden">Download</span>
          </Button>
          <Button variant="outline" size="lg" onClick={onRename} aria-label="Rename">
            <Pencil /> <span className="max-sm:hidden">Rename</span>
          </Button>
          <Button variant="destructive" size="lg" onClick={onDelete} aria-label="Delete">
            <Trash2 /> <span className="max-sm:hidden">Delete</span>
          </Button>
          <Button variant="ghost" size="icon-lg" onClick={onClose} aria-label="Close preview">
            <X />
          </Button>
        </div>
        <div className={mk ? 'grid min-h-0 lg:grid-cols-[minmax(0,1fr)_340px]' : ''}>
        <div className="relative grid min-h-[50vh] place-items-center bg-muted/60 p-3">
          {total > 1 ? (
            <>
              <Button variant="secondary" size="icon-lg" className="absolute top-1/2 left-3 z-10 -translate-y-1/2 rounded-full shadow-md" onClick={onPrev} aria-label="Previous file">
                <ChevronLeft />
              </Button>
              <Button variant="secondary" size="icon-lg" className="absolute top-1/2 right-3 z-10 -translate-y-1/2 rounded-full shadow-md" onClick={onNext} aria-label="Next file">
                <ChevronRight />
              </Button>
            </>
          ) : null}
          {kind === 'img' && url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.name} className="max-h-[72vh] max-w-full rounded-md object-contain" />
          ) : kind === 'vid' && url ? (
            <video key={url} src={url} controls playsInline className="max-h-[72vh] max-w-full rounded-md bg-black" />
          ) : kind === 'pdf' && url ? (
            <iframe title={file.name} src={url} className="h-[72vh] w-full rounded-md bg-white" />
          ) : kind === 'img' || kind === 'vid' || kind === 'pdf' ? (
            <div className="text-sm text-muted-foreground">Loading preview…</div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <FileBadge name={file.name} big />
              <p className="text-sm text-muted-foreground">No preview for this file type.</p>
              <Button onClick={onDownload}>
                <Download /> Download
              </Button>
            </div>
          )}
        </div>
        {panel}
        </div>
        <div className="flex items-center justify-between border-t px-4 py-2 text-[13px] text-muted-foreground">
          <span className="tabular-nums">
            {index + 1} of {total}
          </span>
          <span>Use ← → to move between files</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ManageView() {
  const { confirmBox, toast } = useApp();
  const [files, setFiles] = useState<ManageFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');
  const [subfolders, setSubfolders] = useState<string[]>([]);
  const [path, setPath] = useState('');
  const [mkdir, setMkdir] = useState<{ name: string; error: string; busy: boolean } | null>(null);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [desc, setDesc] = useState(true); // names start Z → A
  const [only, setOnly] = useState<'' | MediaKind>('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [over, setOver] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pv, setPv] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ file: ManageFile; name: string; error: string; busy: boolean } | null>(null);
  const [pend, setPend] = useState<{ picked: File[]; names: string[]; attach: Record<number, string | null> } | null>(null);
  const [links, setLinks] = useState<Record<string, FileLink>>({});
  const [opts, setOpts] = useState<Partial<Record<MediaKind, TaskOption[]>>>({});
  const [attach, setAttach] = useState<{ file: ManageFile; kind: MediaKind; value: string | null; had: boolean; busy: boolean; error: string } | null>(null);
  const [clashMode, setClashMode] = useState<'replace' | 'keep'>('replace');
  const fileIn = useRef<HTMLInputElement>(null);
  const uid = useRef(1);
  const running = uploads.some((u) => u.status === 'queued' || u.status === 'uploading');

  useEffect(() => setView(lsGet<'list' | 'grid'>('epc.manage.view', 'list')), []);

  // restore the folder from the URL after a reload, and follow browser Back / Forward ("/manage/Linkedin/Campaigns/Q4")
  useEffect(() => {
    const read = () => {
      const [v, ...rest] = readLocation();
      setPath(v === 'manage' ? rest.join('/') : '');
      setSel(new Set());
      setQ('');
      setShown(PAGE);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api<{ files: ManageFile[]; folders: string[]; links?: Record<string, FileLink> }>('/api/manage/files');
      setFiles(r.files);
      setSubfolders(r.folders);
      setLinks(r.links || {});
      setOpts({}); // the task lists are fetched again the next time a picker opens
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load the files.');
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  // once every upload has finished, close the panel by itself (kept open when something failed so the error can be read)
  useEffect(() => {
    if (running || !uploads.length || uploads.some((u) => u.status === 'failed')) return;
    const t = setTimeout(() => setUploads([]), 2500);
    return () => clearTimeout(t);
  }, [running, uploads]);

  useEffect(() => {
    if (!running) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [running]);

  const inFolder = useMemo(() => files.filter((f) => f.path === path), [files, path]);
  // folders directly below the current location: from file paths and from folder markers (empty folders); the five standard folders always show at the top
  const children = useMemo(() => {
    const base = path ? path + '/' : '';
    const m = new Map<string, { n: number; bytes: number }>();
    const add = (p: string) => {
      if (!p.startsWith(base) || p === path) return null;
      const name = p.slice(base.length).split('/')[0];
      if (!m.has(name)) m.set(name, { n: 0, bytes: 0 });
      return m.get(name) as { n: number; bytes: number };
    };
    if (!path) FOLDERS.forEach((f) => add(f.key));
    subfolders.forEach((d) => add(d));
    files.forEach((f) => {
      const c = add(f.path);
      if (c) {
        c.n++;
        c.bytes += f.size;
      }
    });
    const std = (n: string) => FOLDERS.findIndex((f) => f.key === n);
    return [...m.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => {
        if (!path && (std(a.name) >= 0 || std(b.name) >= 0)) return (std(a.name) < 0 ? 99 : std(a.name)) - (std(b.name) < 0 ? 99 : std(b.name)) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [files, subfolders, path]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const l = inFolder.filter((f) => (!term || f.name.toLowerCase().includes(term)) && (!only || mediaKind(f.name) === only));
    const dir = desc ? -1 : 1;
    l.sort((a, b) => {
      const c = sort === 'size' ? a.size - b.size : sort === 'date' ? a.lastModified.localeCompare(b.lastModified) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      return c * dir || a.name.localeCompare(b.name);
    });
    return l;
  }, [inFolder, q, sort, desc, only]);
  const visible = list.slice(0, shown);

  // preview modal: current file plus its neighbours get signed view links
  const pvIdx = pv ? list.findIndex((f) => f.key === pv) : -1;
  const pvFile = pvIdx >= 0 ? list[pvIdx] : null;
  const step = useCallback(
    (d: number) => {
      if (!list.length || pvIdx < 0) return;
      setPv(list[(pvIdx + d + list.length) % list.length].key);
    },
    [list, pvIdx],
  );
  useEffect(() => {
    if (pvIdx < 0) return;
    const keys = [pvIdx, pvIdx + 1, pvIdx - 1]
      .map((i) => list[(i + list.length) % list.length])
      .filter((f) => f && !thumbs[f.key] && (IMAGE_EXTENSIONS.includes(extOf(f.name)) || VIDEO_EXTENSIONS.includes(extOf(f.name)) || extOf(f.name) === 'pdf'))
      .map((f) => f.key);
    if (!keys.length) return;
    let alive = true;
    api<{ urls: Record<string, string> }>('/api/manage/urls', { body: { keys: [...new Set(keys)] } })
      .then((r) => alive && setThumbs((t) => ({ ...t, ...r.urls })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pvIdx, list, thumbs]);

  // thumbnails for images / videos in the grid (signed links, fetched in batches)
  useEffect(() => {
    if (view !== 'grid') return;
    const need = visible.filter((f) => !thumbs[f.key] && (IMAGE_EXTENSIONS.includes(extOf(f.name)) || VIDEO_EXTENSIONS.includes(extOf(f.name))) && f.size < 200 * 1024 * 1024).map((f) => f.key);
    if (!need.length) return;
    let alive = true;
    (async () => {
      for (let i = 0; i < need.length; i += 100) {
        try {
          const r = await api<{ urls: Record<string, string> }>('/api/manage/urls', { body: { keys: need.slice(i, i + 100) } });
          if (alive) setThumbs((t) => ({ ...t, ...r.urls }));
        } catch {
          /* thumbnails are optional */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [view, visible, thumbs]);

  const open = (p: string) => {
    setPath(p);
    writeLocation(['manage', ...p.split('/').filter(Boolean)]);
    setSel(new Set());
    setQ('');
    setShown(PAGE);
  };
  const changeView = (v: 'list' | 'grid') => {
    setView(v);
    lsSet('epc.manage.view', v);
  };
  const toggle = (key: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const allSel = list.length > 0 && list.every((f) => sel.has(f.key));

  /* ---------- upload ---------- */
  const patch = (id: number, p: Partial<UploadItem>) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const ensureOpts = useCallback(
    async (kind: MediaKind) => {
      if (opts[kind]) return;
      try {
        const r = await api<{ tasks: TaskOption[] }>(`/api/manage/task-options?kind=${kind}`);
        setOpts((o) => ({ ...o, [kind]: r.tasks }));
      } catch {
        setOpts((o) => ({ ...o, [kind]: [] }));
      }
    },
    [opts],
  );

  const startUpload = async (picked: File[], go?: { replace: boolean; attach: Record<number, string | null> }) => {
    if (!picked.length) return;
    if (!go) {
      // same name already in this folder: ask whether to replace it or keep both
      const have = new Set(inFolder.map((f) => f.name.toLowerCase()));
      const names = picked.map((f) => sanitizeName(f.name)).filter((n) => have.has(n.toLowerCase()));
      const kinds = new Set(picked.map((f) => mediaKind(f.name)).filter(Boolean) as MediaKind[]);
      // a name clash, or pictures / videos that can have a task attached: show the options first
      if (names.length || kinds.size) {
        setClashMode('replace');
        setPend({ picked, names: [...new Set(names)], attach: {} });
        kinds.forEach((k) => void ensureOpts(k));
        return;
      }
    }
    const ok: { file: File; id: number; idx: number }[] = [];
    const rejected: UploadItem[] = [];
    for (const [idx, file] of picked.entries()) {
      const id = uid.current++;
      const base = { id, name: file.name, size: file.size, progress: 0 };
      if (file.size > MAX_FILE_BYTES) rejected.push({ ...base, status: 'failed', error: `Too large (${formatBytes(file.size)}). The limit is ${formatBytes(MAX_FILE_BYTES)}.` });
      else if (!isAllowedName(file.name)) rejected.push({ ...base, status: 'failed', error: `File type not allowed (${ALLOWED_EXTENSIONS.join(', ')}).` });
      else ok.push({ file, id, idx });
    }
    setUploads((u) => [...u, ...rejected, ...ok.map((x) => ({ id: x.id, name: x.file.name, size: x.file.size, progress: 0, status: 'queued' as const }))]);
    if (!ok.length) return;

    // 1) ask the server for signed upload forms (in batches), 2) send each file straight to S3
    const queue: { item: { file: File; id: number; idx: number }; target: Target }[] = [];
    for (let i = 0; i < ok.length; i += MAX_FILES_PER_UPLOAD_REQUEST) {
      const chunk = ok.slice(i, i + MAX_FILES_PER_UPLOAD_REQUEST);
      try {
        const r = await api<{ targets: Target[] }>('/api/manage/upload-url', { body: { path, replace: !!go?.replace, files: chunk.map((c) => ({ name: c.file.name, size: c.file.size, type: c.file.type })) } });
        chunk.forEach((c, k) => queue.push({ item: c, target: r.targets[k] }));
      } catch (e) {
        chunk.forEach((c) => patch(c.id, { status: 'failed', error: e instanceof Error ? e.message : 'Could not start the upload.' }));
      }
    }
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < queue.length) {
        const { item, target } = queue[next++];
        patch(item.id, { status: 'uploading', note: target.renamed ? `Saved as ${target.name}` : target.replaced ? 'Replaced the existing file' : undefined });
        try {
          await uploadToS3(target.url, target.fields, item.file, (p) => patch(item.id, { progress: p })).promise;
          patch(item.id, { status: 'done', progress: 1 });
          done++;
          const tid = go?.attach[item.idx];
          if (tid) {
            try {
              await api('/api/manage/link', { body: { key: target.key, taskId: tid } });
            } catch (e) {
              toast(`${item.file.name} was uploaded, but its task could not be attached: ${e instanceof Error ? e.message : 'unknown error'}`, 'bad');
            }
          }
        } catch (e) {
          patch(item.id, { status: 'failed', error: e instanceof Error ? e.message : 'Upload failed' });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    if (queue.length) toast(done === queue.length ? `Uploaded ${done} ${done === 1 ? 'file' : 'files'}` : `Uploaded ${done} of ${queue.length} files`, done === queue.length ? undefined : 'bad');
    await load();
  };

  /* ---------- delete / download ---------- */
  const del = async (only?: string[]) => {
    const keys = only ?? [...sel];
    if (!keys.length) return;
    const names = keys.map((k) => files.find((f) => f.key === k)?.name || k.split('/').pop() || k);
    const ok = await confirmBox({
      title: `Delete ${keys.length === 1 ? 'this file' : `${keys.length} files`} permanently?`,
      body: (
        <>
          {keys.length === 1 ? 'This file' : 'These files'} will be permanently deleted from storage and cannot be recovered:
          <br />
          <b>{names.slice(0, 8).join(', ')}</b>
          {names.length > 8 ? <> and {names.length - 8} more</> : null}
        </>
      ),
      ok: keys.length === 1 ? 'Delete file' : `Delete ${keys.length} files`,
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api<{ deleted: number; failed: string[] }>('/api/manage/delete', { body: { keys } });
      toast(r.failed.length ? `Deleted ${r.deleted}, ${r.failed.length} could not be deleted` : `Deleted ${r.deleted} ${r.deleted === 1 ? 'file' : 'files'}`, r.failed.length ? 'bad' : undefined);
      setSel(new Set());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete.', 'bad');
    }
    setBusy(false);
    await load();
  };

  const doMkdir = async () => {
    if (!mkdir) return;
    const name = mkdir.name.trim();
    if (!name) return setMkdir({ ...mkdir, error: 'Enter a folder name.' });
    setMkdir({ ...mkdir, busy: true, error: '' });
    try {
      await api('/api/manage/folder', { body: { path, name } });
      toast(`Created folder ${name}`);
      setMkdir(null);
      await load();
    } catch (e) {
      setMkdir((m) => (m ? { ...m, busy: false, error: e instanceof Error ? e.message : 'Could not create the folder.' } : m));
    }
  };

  const openAttach = (file: ManageFile) => {
    const kind = mediaKind(file.name);
    if (!kind) return;
    setAttach({ file, kind, value: links[file.key]?.taskId ?? null, had: !!links[file.key], busy: false, error: '' });
    void ensureOpts(kind);
  };
  const saveAttach = async () => {
    if (!attach) return;
    if (!attach.had && !attach.value) return setAttach(null);
    setAttach({ ...attach, busy: true, error: '' });
    try {
      await api('/api/manage/link', { body: { key: attach.file.key, taskId: attach.value } });
      toast(attach.value ? 'Task attached' : 'Task removed from the file');
      setAttach(null);
      await load();
    } catch (e) {
      setAttach((a) => (a ? { ...a, busy: false, error: e instanceof Error ? e.message : 'Could not save.' } : a));
    }
  };

  const startRename = (file: ManageFile) => setRenaming({ file, name: file.name, error: '', busy: false });
  const doRename = async () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    if (!name) return setRenaming({ ...renaming, error: 'Enter a file name.' });
    if (name === renaming.file.name) return setRenaming(null);
    setRenaming({ ...renaming, busy: true, error: '' });
    try {
      await api('/api/manage/rename', { body: { key: renaming.file.key, name } });
      toast(`Renamed to ${name}`);
      setRenaming(null);
      await load();
    } catch (e) {
      setRenaming((r) => (r ? { ...r, busy: false, error: e instanceof Error ? e.message : 'Could not rename the file.' } : r));
    }
  };

  const download = async (keys: string[]) => {
    for (const k of keys) {
      const a = document.createElement('a');
      a.href = `/api/manage/download?key=${encodeURIComponent(k)}&mode=download`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      await sleep(400);
    }
  };

  const segs = path.split('/').filter(Boolean);
  const crumbs = (
    <nav className="mg-crumbs" aria-label="Location">
      <button className="linkish" onClick={() => open('')}>
        Content Manage
      </button>
      <span aria-hidden="true">›</span>
      {segs.length ? (
        <button className="linkish" onClick={() => open('')}>
          {ROOT_PREFIX}
        </button>
      ) : (
        <b>{ROOT_PREFIX}</b>
      )}
      {segs.map((seg, i) => (
        <span key={i} className="contents">
          <span aria-hidden="true">›</span>
          {i === segs.length - 1 ? (
            <b>{i === 0 ? label(seg) : seg}</b>
          ) : (
            <button className="linkish" onClick={() => open(segs.slice(0, i + 1).join('/'))}>
              {i === 0 ? label(seg) : seg}
            </button>
          )}
        </span>
      ))}
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Content Manage"
        sub="Browse, upload, organise and download your media."
        eyebrow="Storage"
        actions={
          <button className="btn" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Refresh
          </button>
        }
      />
      {err ? <div className="err" role="alert">{err}</div> : null}
      <section
        className={`panel mg @container ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void startUpload([...e.dataTransfer.files]);
        }}
      >
        {crumbs}
        {!loaded ? (
          <div className="loading">Loading files…</div>
        ) : (
          <>
            <div className="mg-bar">
              <label className="field mg-search">
                <span>Search files</span>
                <input className="inp" type="search" value={q} placeholder={`Search in ${hereLabel(path)}…`} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
              </label>
              <label className="field">
                <span>Sort by</span>
                <select className="inp" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                  <option value="date">Date modified</option>
                </select>
              </label>
              <button className="btn" onClick={() => setDesc((d) => !d)} aria-label="Reverse sort order" title="Reverse sort order">
                {sort === 'name' ? (desc ? 'Z → A' : 'A → Z') : sort === 'size' ? (desc ? 'Largest first' : 'Smallest first') : desc ? 'Newest first' : 'Oldest first'}
              </button>
              <div className="row" role="group" aria-label="Show only">
                {(
                  [
                    ['', 'All'],
                    ['image', 'Images'],
                    ['video', 'Videos'],
                  ] as const
                ).map(([v, text]) => (
                  <button key={v || 'all'} className={`btn ${only === v ? 'primary' : ''}`} aria-pressed={only === v} onClick={() => { setOnly(v); setShown(PAGE); }}>
                    {text}
                  </button>
                ))}
              </div>
              <div className="row" role="group" aria-label="View">
                <button className={`btn ${view === 'list' ? 'primary' : ''}`} aria-pressed={view === 'list'} onClick={() => changeView('list')}>
                  <List className="size-4" /> List
                </button>
                <button className={`btn ${view === 'grid' ? 'primary' : ''}`} aria-pressed={view === 'grid'} onClick={() => changeView('grid')}>
                  <LayoutGrid className="size-4" /> Grid
                </button>
              </div>
              <label className="btn primary" htmlFor="mg-file" style={{ cursor: 'pointer' }}>
                <Upload className="size-4" /> Upload files
              </label>
              <input id="mg-file" ref={fileIn} type="file" multiple hidden onChange={(e) => { void startUpload([...(e.target.files || [])]); e.target.value = ''; }} />
              <button className="btn" onClick={() => setMkdir({ name: '', error: '', busy: false })}>
                <FolderPlus className="size-4" /> New folder
              </button>
            </div>

            {sel.size > 0 && (
              <div className="bulk" role="region" aria-label="Selected files">
                <b>{sel.size} selected</b>
                <button className="btn sm" onClick={() => void download([...sel])}>
                  <Download className="size-3.5" /> Download
                </button>
                <button className="btn sm danger" disabled={busy} onClick={() => void del()}>
                  <Trash2 className="size-3.5" /> Delete
                </button>
                <button className="btn sm ghost" style={{ color: 'inherit' }} onClick={() => setSel(new Set())}>
                  Clear selection
                </button>
              </div>
            )}

            {over && <div className="mg-drop">Drop files to upload to {hereLabel(path)}</div>}

            {children.length > 0 && !q && (
              <div className="mg-folders" style={{ marginBottom: 16 }}>
                {children.map((c) => (
                  <button key={c.name} className="mg-folder" onClick={() => open(path ? `${path}/${c.name}` : c.name)}>
                    {!path && hasPlatformIcon(c.name) ? <PlatformIcon name={c.name} className="size-11" /> : <FolderIcon size={44} />}
                    <b>{!path ? label(c.name) : c.name}</b>
                    <span className="muted small">
                      {c.n} {c.n === 1 ? 'file' : 'files'} · {formatBytes(c.bytes)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!list.length ? (
              children.length > 0 && !q ? null : (
              <div className="empty">
                <h2>{inFolder.length ? (only && !q ? `No ${only === 'image' ? 'images' : 'videos'} in this folder.` : 'No files match your search.') : 'No files in this folder.'}</h2>
                <p className="muted">{inFolder.length ? (only ? 'Choose “All” to see every file.' : 'Try a different search.') : 'Upload files with the button above, drag them onto this page, or create a folder.'}</p>
              </div>
              )
            ) : view === 'list' ? (
              <div className="tw">
                <table className="t">
                  <thead>
                    <tr>
                      <th className="chk">
                        <input type="checkbox" aria-label="Select all files" checked={allSel} onChange={(e) => setSel(e.target.checked ? new Set(list.map((f) => f.key)) : new Set())} />
                      </th>
                      <th scope="col">Name</th>
                      <th scope="col" className="@max-3xl:hidden">Type</th>
                      <th scope="col" className="@max-3xl:hidden">Size</th>
                      <th scope="col" className="mg-capcol @max-3xl:hidden">Task &amp; caption</th>
                      <th scope="col">
                        <span className="sr">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((f) => (
                      <tr key={f.key} className={sel.has(f.key) ? 'sel' : ''}>
                        <td className="chk">
                          <input type="checkbox" aria-label={`Select ${f.name}`} checked={sel.has(f.key)} onChange={() => toggle(f.key)} />
                        </td>
                        <td>
                          <button className="mg-name text-left" onClick={() => setPv(f.key)} title="Preview">
                            <FileBadge name={f.name} />
                            <span className="min-w-0">
                              <span className="block break-all">{f.name}</span>
                              <span className="mt-0.5 hidden text-xs font-normal text-muted-foreground @max-3xl:block">
                                {formatBytes(f.size)} · {new Date(f.lastModified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </span>
                          </button>
                          <div className="@3xl:hidden">
                            <LinkLine file={f} link={links[f.key]} onAttach={() => openAttach(f)} />
                          </div>
                        </td>
                        <td className="@max-3xl:hidden">{extOf(f.name).toUpperCase() || 'File'}</td>
                        <td className="num @max-3xl:hidden">{formatBytes(f.size)}</td>
                        <td className="@max-3xl:hidden">
                          <LinkLine file={f} link={links[f.key]} onAttach={() => openAttach(f)} />
                        </td>
                        <td>
                          <div className="mg-actions">
                            <div className="flex gap-1.5">
                              <button className="btn sm" onClick={() => void download([f.key])} aria-label={`Download ${f.name}`} title="Download">
                                <Download className="size-3.5" />
                              </button>
                              <button className="btn sm" onClick={() => startRename(f)} aria-label={`Rename ${f.name}`} title="Rename">
                                <Pencil className="size-3.5" />
                              </button>
                            </div>
                            <span className="mg-modified @max-3xl:hidden" title={fmtDT(f.lastModified)}>
                              {new Date(f.lastModified).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mg-grid">
                {visible.map((f) => {
                  const e = extOf(f.name);
                  const url = thumbs[f.key];
                  return (
                    <div key={f.key} className={`mg-card${sel.has(f.key) ? ' sel' : ''}`}>
                      <label className="mg-check">
                        <input type="checkbox" aria-label={`Select ${f.name}`} checked={sel.has(f.key)} onChange={() => toggle(f.key)} />
                      </label>
                      <button className="mg-thumb w-full" onClick={() => setPv(f.key)} aria-label={`Preview ${f.name}`}>
                        {url && IMAGE_EXTENSIONS.includes(e) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" loading="lazy" />
                        ) : url && VIDEO_EXTENSIONS.includes(e) ? (
                          <video src={url + '#t=0.1'} preload="metadata" muted playsInline />
                        ) : (
                          <FileBadge name={f.name} big />
                        )}
                      </button>
                      <div className="mg-cap" title={f.name}>
                        <b>{f.name}</b>
                        <span className="muted small">
                          {formatBytes(f.size)} · {new Date(f.lastModified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <LinkLine file={f} link={links[f.key]} onAttach={() => openAttach(f)} />
                      <div className="flex gap-1.5">
                        <button className="btn sm flex-1" onClick={() => void download([f.key])}>
                          Download
                        </button>
                        <button className="btn sm" onClick={() => startRename(f)} aria-label={`Rename ${f.name}`} title="Rename">
                          <Pencil className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {list.length > shown && (
              <div className="pager">
                <span className="muted">
                  Showing {shown} of {list.length}
                </span>
                <button className="btn sm" onClick={() => setShown((s) => s + PAGE)}>
                  Show more
                </button>
              </div>
            )}
            <p className="muted small" style={{ margin: '12px 0 0' }}>
              {list.length} {list.length === 1 ? 'file' : 'files'}
              {q ? ' found' : ''} · largest upload {formatBytes(MAX_FILE_BYTES)}
              {ALLOWED_EXTENSIONS.length ? ` · allowed types: ${ALLOWED_EXTENSIONS.join(', ')}` : ''}. If a name already exists you can replace the file or keep both.
            </p>
          </>
        )}
      </section>

      <Dialog open={!!mkdir} onOpenChange={(o) => !o && !mkdir?.busy && setMkdir(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="text-lg font-semibold">New folder</DialogTitle>
          <DialogDescription className="text-sm">
            Created in <b className="text-foreground">{hereLabel(path)}</b>.
          </DialogDescription>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void doMkdir();
            }}
          >
            <Input autoFocus aria-label="Folder name" placeholder="Folder name" value={mkdir?.name ?? ''} maxLength={100} onChange={(e) => setMkdir((m) => (m ? { ...m, name: e.target.value, error: '' } : m))} className="h-10 text-base" />
            {mkdir?.error ? (
              <p className="text-sm text-destructive" role="alert">
                {mkdir.error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="lg" disabled={mkdir?.busy} onClick={() => setMkdir(null)}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={mkdir?.busy}>
                {mkdir?.busy ? 'Creating…' : 'Create folder'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && !renaming?.busy && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="text-lg font-semibold">Rename file</DialogTitle>
          <DialogDescription className="text-sm">Choose a new name. It stays in the same folder.</DialogDescription>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void doRename();
            }}
          >
            <Input
              autoFocus
              aria-label="New file name"
              value={renaming?.name ?? ''}
              maxLength={200}
              onFocus={(e) => {
                const n = e.currentTarget.value;
                const dot = n.lastIndexOf('.');
                e.currentTarget.setSelectionRange(0, dot > 0 ? dot : n.length);
              }}
              onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value, error: '' } : r))}
              className="h-10 text-base"
            />
            {renaming?.error ? (
              <p className="text-sm text-destructive" role="alert">
                {renaming.error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="lg" disabled={renaming?.busy} onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={renaming?.busy}>
                {renaming?.busy ? 'Renaming…' : 'Rename'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pend} onOpenChange={(o) => !o && setPend(null)}>
        <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-xl">
          <DialogTitle className="text-lg font-semibold">Upload {pend ? (pend.picked.length === 1 ? '1 file' : `${pend.picked.length} files`) : ''}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {pend && pend.names.length ? (
              <>
                {pend.names.length === 1 ? (
                  <>
                    <b className="text-foreground">{pend.names[0]}</b> already exists in this location.
                  </>
                ) : (
                  <>
                    <b className="text-foreground">{pend.names.length} files</b> already exist in this location ({pend.names.slice(0, 3).join(', ')}
                    {pend.names.length > 3 ? ', …' : ''}).
                  </>
                )}{' '}
                Replace {pend.names.length === 1 ? 'it' : 'them'} or keep both?
              </>
            ) : (
              'Optionally attach a task to each picture or video. Its caption then shows with the file.'
            )}
          </DialogDescription>
          {pend && pend.names.length ? (
            <div className="grid gap-1" role="radiogroup" aria-label="When a name already exists">
              {(
                [
                  ['replace', 'Replace existing file', 'The old version is overwritten and cannot be recovered.'],
                  ['keep', 'Keep both files', 'The new file is saved as “name (1)”.'],
                ] as const
              ).map(([v, text, hint]) => (
                <label key={v} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                  <input type="radio" name="clash-mode" className="size-4 accent-[var(--primary)]" checked={clashMode === v} onChange={() => setClashMode(v)} />
                  <span className="text-sm font-medium">
                    {text}
                    <span className="block text-[13px] font-normal text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          {pend && pend.picked.some((f) => mediaKind(f.name)) ? (
            <div className="grid gap-3">
              <div className="text-xs font-bold tracking-[0.1em] text-muted-foreground uppercase">Attach a task (optional)</div>
              {pend.picked.map((f, idx) => {
                const k = mediaKind(f.name);
                if (!k) return null;
                return (
                  <div key={idx} className="grid gap-1.5">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <FileBadge name={f.name} />
                      <span className="min-w-0 break-all">{f.name}</span>
                    </div>
                    <TaskPicker kind={k} platform={platformOfPath(path)} platformLabel={platformOfPath(path) ? label(path.split('/')[0]) : undefined} options={opts[k] ?? null} value={pend.attach[idx] ?? null} onChange={(id) => setPend((p) => (p ? { ...p, attach: { ...p.attach, [idx]: id } } : p))} />
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="lg" onClick={() => setPend(null)}>
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={() => {
                const c = pend;
                setPend(null);
                if (c) void startUpload(c.picked, { replace: c.names.length > 0 && clashMode === 'replace', attach: c.attach });
              }}
            >
              Upload
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!attach} onOpenChange={(o) => !o && !attach?.busy && setAttach(null)}>
        <DialogContent className="gap-4 sm:max-w-md">
          <DialogTitle className="text-lg font-semibold">{attach?.had ? 'Change task' : 'Attach task'}</DialogTitle>
          <DialogDescription className="text-sm break-all">
            {attach ? (
              <>
                {attach.kind === 'image' ? 'A Graphic Designer task' : 'A Video Editor task'} for <b className="text-foreground">{attach.file.name}</b>. Its caption shows with the file.
              </>
            ) : null}
          </DialogDescription>
          {attach ? <TaskPicker kind={attach.kind} platform={platformOfPath(attach.file.path)} platformLabel={platformOfPath(attach.file.path) ? label(attach.file.path.split('/')[0]) : undefined} options={opts[attach.kind] ?? null} value={attach.value} currentTitle={links[attach.file.key]?.title} onChange={(id) => setAttach((a) => (a ? { ...a, value: id, error: '' } : a))} /> : null}
          {attach?.error ? (
            <p className="text-sm text-destructive" role="alert">
              {attach.error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="lg" disabled={attach?.busy} onClick={() => setAttach(null)}>
              Cancel
            </Button>
            <Button size="lg" disabled={attach?.busy || (attach ? attach.value === (links[attach.file.key]?.taskId ?? null) : true)} onClick={() => void saveAttach()}>
              {attach?.busy ? 'Saving…' : attach && !attach.value && attach.had ? 'Remove task' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {pvFile && (
        <PreviewDialog
          file={pvFile}
          index={pvIdx}
          total={list.length}
          url={thumbs[pvFile.key]}
          link={links[pvFile.key]}
          onAttach={() => openAttach(pvFile)}
          onClose={() => setPv(null)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onDownload={() => void download([pvFile.key])}
          onRename={() => {
            setPv(null);
            startRename(pvFile);
          }}
          onDelete={() => {
            const k = pvFile.key;
            setPv(null);
            void del([k]);
          }}
        />
      )}
      {uploads.length > 0 && (
        <section className="mg-uploads" aria-label="Uploads" aria-live="polite">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{running ? 'Uploading…' : 'Uploads'}</b>
            {!running && (
              <button className="btn sm ghost" onClick={() => setUploads([])}>
                Clear
              </button>
            )}
          </div>
          <ul>
            {uploads.slice(-30).map((u) => (
              <li key={u.id}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'nowrap' }}>
                  <span className="mg-uname" title={u.name}>
                    {u.name}
                  </span>
                  <span className={`small ${u.status === 'failed' ? 'bad' : 'muted'}`}>
                    {u.status === 'done' ? 'Done' : u.status === 'failed' ? 'Failed' : u.status === 'queued' ? 'Waiting' : `${Math.round(u.progress * 100)}%`}
                  </span>
                </div>
                <div className="progressbar" style={{ height: 8 }}>
                  <i style={{ width: `${Math.round(u.progress * 100)}%`, background: u.status === 'failed' ? 'var(--danger)' : undefined }} />
                </div>
                {u.error ? <div className="small" style={{ color: 'var(--danger)' }}>{u.error}</div> : u.note ? <div className="small muted">{u.note}</div> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
