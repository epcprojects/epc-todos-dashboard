'use client';
import { ChevronLeft, ChevronRight, Download, File as FileGeneric, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, LayoutGrid, List, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALLOWED_EXTENSIONS, FOLDERS, IMAGE_EXTENSIONS, MAX_FILES_PER_UPLOAD_REQUEST, MAX_FILE_BYTES, ROOT_PREFIX, VIDEO_EXTENSIONS, extOf, folderByKey, formatBytes, isAllowedName, sanitizeName, type ManageFile, type ManageSubfolder } from '@/lib/manage-config';
import { api, lsGet, lsSet, sleep } from '@/lib/client/api';
import { uploadToS3 } from '@/lib/client/s3upload';
import { fmtDT } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useApp } from '../store';
import { PageHeader } from '../ui';

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

/** Image / video / PDF preview in a modal, with previous / next across the folder. */
function PreviewDialog({ file, index, total, url, onClose, onPrev, onNext, onDownload, onDelete }: { file: ManageFile; index: number; total: number; url?: string; onClose: () => void; onPrev: () => void; onNext: () => void; onDownload: () => void; onDelete: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onPrev, onNext]);
  const kind = kindOf(file.name);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[94vw] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <FileBadge name={file.name} />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[15px] font-semibold">{file.name}</DialogTitle>
            <DialogDescription className="text-[13px]">
              {formatBytes(file.size)} · {label(file.folder)} · {fmtDT(file.lastModified)}
            </DialogDescription>
          </div>
          <Button variant="outline" size="lg" onClick={onDownload}>
            <Download /> Download
          </Button>
          <Button variant="destructive" size="lg" onClick={onDelete}>
            <Trash2 /> Delete
          </Button>
          <Button variant="ghost" size="icon-lg" onClick={onClose} aria-label="Close preview">
            <X />
          </Button>
        </div>
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
  const [subfolders, setSubfolders] = useState<ManageSubfolder[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [path, setPath] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [desc, setDesc] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [over, setOver] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pv, setPv] = useState<string | null>(null);
  const [clash, setClash] = useState<{ picked: File[]; names: string[] } | null>(null);
  const [clashMode, setClashMode] = useState<'replace' | 'keep'>('replace');
  const fileIn = useRef<HTMLInputElement>(null);
  const uid = useRef(1);
  const running = uploads.some((u) => u.status === 'queued' || u.status === 'uploading');

  useEffect(() => setView(lsGet<'list' | 'grid'>('epc.manage.view', 'list')), []);

  const load = useCallback(async () => {
    try {
      const r = await api<{ files: ManageFile[]; folders: ManageSubfolder[] }>('/api/manage/files');
      setFiles(r.files);
      setSubfolders(r.folders);
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

  const inFolder = useMemo(() => (folder ? files.filter((f) => f.folder === folder && f.path === path) : []), [files, folder, path]);
  // folders directly below the current location: from file paths and from folder markers (empty folders made in S3)
  const children = useMemo(() => {
    if (!folder) return [];
    const base = path ? path + '/' : '';
    const m = new Map<string, { n: number; bytes: number }>();
    const add = (p: string) => {
      if (!p.startsWith(base) || p === path) return null;
      const name = p.slice(base.length).split('/')[0];
      if (!m.has(name)) m.set(name, { n: 0, bytes: 0 });
      return m.get(name) as { n: number; bytes: number };
    };
    subfolders.filter((d) => d.folder === folder).forEach((d) => add(d.path));
    files.filter((f) => f.folder === folder).forEach((f) => {
      const c = add(f.path);
      if (c) {
        c.n++;
        c.bytes += f.size;
      }
    });
    return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [files, subfolders, folder, path]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const l = term ? inFolder.filter((f) => f.name.toLowerCase().includes(term)) : [...inFolder];
    const dir = desc ? -1 : 1;
    l.sort((a, b) => {
      const c = sort === 'size' ? a.size - b.size : sort === 'date' ? a.lastModified.localeCompare(b.lastModified) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      return c * dir || a.name.localeCompare(b.name);
    });
    return l;
  }, [inFolder, q, sort, desc]);
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

  const open = (f: string | null, p = '') => {
    setFolder(f);
    setPath(p);
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

  const startUpload = async (picked: File[], onExisting?: 'replace' | 'keep') => {
    if (!folder || !picked.length) return;
    if (!onExisting) {
      // same name already in this folder: ask whether to replace it or keep both
      const have = new Set(inFolder.map((f) => f.name.toLowerCase()));
      const names = picked.map((f) => sanitizeName(f.name)).filter((n) => have.has(n.toLowerCase()));
      if (names.length) {
        setClashMode('replace');
        setClash({ picked, names: [...new Set(names)] });
        return;
      }
    }
    const ok: { file: File; id: number }[] = [];
    const rejected: UploadItem[] = [];
    for (const file of picked) {
      const id = uid.current++;
      const base = { id, name: file.name, size: file.size, progress: 0 };
      if (file.size > MAX_FILE_BYTES) rejected.push({ ...base, status: 'failed', error: `Too large (${formatBytes(file.size)}). The limit is ${formatBytes(MAX_FILE_BYTES)}.` });
      else if (!isAllowedName(file.name)) rejected.push({ ...base, status: 'failed', error: `File type not allowed (${ALLOWED_EXTENSIONS.join(', ')}).` });
      else ok.push({ file, id });
    }
    setUploads((u) => [...u, ...rejected, ...ok.map((x) => ({ id: x.id, name: x.file.name, size: x.file.size, progress: 0, status: 'queued' as const }))]);
    if (!ok.length) return;

    // 1) ask the server for signed upload forms (in batches), 2) send each file straight to S3
    const queue: { item: { file: File; id: number }; target: Target }[] = [];
    for (let i = 0; i < ok.length; i += MAX_FILES_PER_UPLOAD_REQUEST) {
      const chunk = ok.slice(i, i + MAX_FILES_PER_UPLOAD_REQUEST);
      try {
        const r = await api<{ targets: Target[] }>('/api/manage/upload-url', { body: { folder, path, replace: onExisting === 'replace', files: chunk.map((c) => ({ name: c.file.name, size: c.file.size, type: c.file.type })) } });
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

  const counts = useMemo(() => {
    const m: Record<string, { n: number; bytes: number }> = {};
    FOLDERS.forEach((f) => (m[f.key] = { n: 0, bytes: 0 }));
    files.forEach((f) => {
      if (m[f.folder]) {
        m[f.folder].n++;
        m[f.folder].bytes += f.size;
      }
    });
    return m;
  }, [files]);

  const crumbs = (
    <nav className="mg-crumbs" aria-label="Location">
      <button className="linkish" onClick={() => open(null)}>
        Manage
      </button>
      <span aria-hidden="true">›</span>
      {folder ? (
        <>
          <button className="linkish" onClick={() => open(null)}>
            {ROOT_PREFIX}
          </button>
          <span aria-hidden="true">›</span>
          {path ? (
            <button className="linkish" onClick={() => open(folder)}>
              {label(folder)}
            </button>
          ) : (
            <b>{label(folder)}</b>
          )}
          {path.split('/').filter(Boolean).map((seg, i, a) => (
            <span key={i} className="contents">
              <span aria-hidden="true">›</span>
              {i === a.length - 1 ? (
                <b>{seg}</b>
              ) : (
                <button className="linkish" onClick={() => open(folder, a.slice(0, i + 1).join('/'))}>
                  {seg}
                </button>
              )}
            </span>
          ))}
        </>
      ) : (
        <b>{ROOT_PREFIX}</b>
      )}
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Files"
        sub="Browse, upload, download and delete media."
        eyebrow="Storage"
        actions={
          <button className="btn" onClick={() => void load()}>
            <RefreshCw className="size-4" /> Refresh
          </button>
        }
      />
      {err ? <div className="err" role="alert">{err}</div> : null}
      <section
        className={`panel mg${over ? ' over' : ''}`}
        onDragOver={(e) => {
          if (!folder) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (folder) void startUpload([...e.dataTransfer.files]);
        }}
      >
        {crumbs}
        {!loaded ? (
          <div className="loading">Loading files…</div>
        ) : !folder ? (
          <div className="mg-folders">
            {FOLDERS.map((f) => (
              <button key={f.key} className="mg-folder" onClick={() => open(f.key)}>
                <FolderIcon size={44} />
                <b>{f.label}</b>
                <span className="muted small">
                  {counts[f.key].n} {counts[f.key].n === 1 ? 'file' : 'files'} · {formatBytes(counts[f.key].bytes)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="mg-bar">
              <label className="field mg-search">
                <span>Search files</span>
                <input className="inp" type="search" value={q} placeholder={`Search in ${path.split('/').pop() || label(folder)}…`} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
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

            {over && <div className="mg-drop">Drop files to upload to {path.split('/').pop() || label(folder)}</div>}

            {children.length > 0 && !q && (
              <div className="mg-folders" style={{ marginBottom: 16 }}>
                {children.map((c) => (
                  <button key={c.name} className="mg-folder" onClick={() => open(folder, path ? `${path}/${c.name}` : c.name)}>
                    <FolderIcon size={44} />
                    <b>{c.name}</b>
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
                <h2>{inFolder.length ? 'No files match your search.' : 'This folder is empty.'}</h2>
                <p className="muted">{inFolder.length ? 'Try a different search.' : 'Upload files with the button above, or drag them onto this page.'}</p>
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
                      <th scope="col">Type</th>
                      <th scope="col">Size</th>
                      <th scope="col">Date modified</th>
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
                            <span>{f.name}</span>
                          </button>
                        </td>
                        <td>{extOf(f.name).toUpperCase() || 'File'}</td>
                        <td className="num">{formatBytes(f.size)}</td>
                        <td className="num">{fmtDT(f.lastModified)}</td>
                        <td>
                          <button className="btn sm" onClick={() => void download([f.key])}>
                            Download
                          </button>
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
                      <button className="btn sm" onClick={() => void download([f.key])}>
                        Download
                      </button>
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

      <Dialog open={!!clash} onOpenChange={(o) => !o && setClash(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle className="text-lg font-semibold">Upload options</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {clash && clash.names.length === 1 ? (
              <>
                <b className="text-foreground">{clash.names[0]}</b> already exists in this location.
              </>
            ) : (
              <>
                <b className="text-foreground">{clash?.names.length} files</b> already exist in this location
                {clash ? ` (${clash.names.slice(0, 3).join(', ')}${clash.names.length > 3 ? ', …' : ''})` : ''}.
              </>
            )}{' '}
            Do you want to replace the existing {clash && clash.names.length === 1 ? 'file' : 'files'} with the new {clash && clash.names.length === 1 ? 'version' : 'versions'} or keep both?
          </DialogDescription>
          <div className="grid gap-1" role="radiogroup" aria-label="Upload options">
            {(
              [
                ['replace', 'Replace existing file'],
                ['keep', 'Keep both files'],
              ] as const
            ).map(([v, text]) => (
              <label key={v} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
                <input type="radio" name="clash-mode" className="size-4 accent-[var(--primary)]" checked={clashMode === v} onChange={() => setClashMode(v)} />
                <span className="text-sm font-medium">
                  {text}
                  {v === 'keep' ? <span className="block text-[13px] font-normal text-muted-foreground">The new file is saved as “name (1)”.</span> : <span className="block text-[13px] font-normal text-muted-foreground">The old version is overwritten and cannot be recovered.</span>}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="lg" onClick={() => setClash(null)}>
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={() => {
                const c = clash;
                setClash(null);
                if (c) void startUpload(c.picked, clashMode);
              }}
            >
              Upload
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
          onClose={() => setPv(null)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          onDownload={() => void download([pvFile.key])}
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
