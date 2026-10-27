'use client';
import { Download, LayoutGrid, List, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALLOWED_EXTENSIONS, FOLDERS, IMAGE_EXTENSIONS, MAX_FILES_PER_UPLOAD_REQUEST, MAX_FILE_BYTES, ROOT_PREFIX, VIDEO_EXTENSIONS, extOf, folderByKey, formatBytes, isAllowedName, type ManageFile } from '@/lib/manage-config';
import { api, lsGet, lsSet, sleep } from '@/lib/client/api';
import { uploadToS3 } from '@/lib/client/s3upload';
import { fmtDT } from '@/lib/dates';
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
function FileBadge({ name, big }: { name: string; big?: boolean }) {
  const e = extOf(name);
  const kind = IMAGE_EXTENSIONS.includes(e) ? 'img' : VIDEO_EXTENSIONS.includes(e) ? 'vid' : ['pdf'].includes(e) ? 'pdf' : ['xls', 'xlsx', 'csv'].includes(e) ? 'xls' : ['doc', 'docx', 'txt', 'md'].includes(e) ? 'doc' : 'oth';
  return (
    <span className={`mg-badge mg-${kind}${big ? ' big' : ''}`} aria-hidden="true">
      {(e || 'file').slice(0, 4).toUpperCase()}
    </span>
  );
}

export function ManageView() {
  const { isAdmin, confirmBox, toast } = useApp();
  const [files, setFiles] = useState<ManageFile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
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
  const fileIn = useRef<HTMLInputElement>(null);
  const uid = useRef(1);
  const running = uploads.some((u) => u.status === 'queued' || u.status === 'uploading');

  useEffect(() => setView(lsGet<'list' | 'grid'>('epc.manage.view', 'list')), []);

  const load = useCallback(async () => {
    try {
      const r = await api<{ files: ManageFile[] }>('/api/manage/files');
      setFiles(r.files);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load the files.');
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!running) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [running]);

  const inFolder = useMemo(() => (folder ? files.filter((f) => f.folder === folder) : []), [files, folder]);
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

  const open = (f: string | null) => {
    setFolder(f);
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

  const startUpload = async (picked: File[]) => {
    if (!folder || !picked.length) return;
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
        const r = await api<{ targets: Target[] }>('/api/manage/upload-url', { body: { folder, files: chunk.map((c) => ({ name: c.file.name, size: c.file.size, type: c.file.type })) } });
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
        patch(item.id, { status: 'uploading', note: target.renamed ? `Saved as ${target.name}` : undefined });
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
  const del = async () => {
    const keys = [...sel];
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
          <b>{label(folder)}</b>
        </>
      ) : (
        <b>{ROOT_PREFIX}</b>
      )}
    </nav>
  );

  return (
    <>
      <PageHeader
        title="Manage files"
        sub={isAdmin ? 'Browse, upload, download and delete the files in storage.' : 'Browse, download and upload files. Only the admin can delete.'}
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
                <input className="inp" type="search" value={q} placeholder={`Search in ${label(folder)}…`} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
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
                {isAdmin && (
                  <button className="btn sm danger" disabled={busy} onClick={() => void del()}>
                    <Trash2 className="size-3.5" /> Delete
                  </button>
                )}
                <button className="btn sm ghost" style={{ color: 'inherit' }} onClick={() => setSel(new Set())}>
                  Clear selection
                </button>
              </div>
            )}

            {over && <div className="mg-drop">Drop files to upload to {label(folder)}</div>}

            {!list.length ? (
              <div className="empty">
                <h2>{inFolder.length ? 'No files match your search.' : 'This folder is empty.'}</h2>
                <p className="muted">{inFolder.length ? 'Try a different search.' : 'Upload files with the button above, or drag them onto this page.'}</p>
              </div>
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
                          <a className="mg-name" href={`/api/manage/download?key=${encodeURIComponent(f.key)}&mode=view`} target="_blank" rel="noopener noreferrer" title="Open in a new tab">
                            <FileBadge name={f.name} />
                            <span>{f.name}</span>
                          </a>
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
                      <a className="mg-thumb" href={`/api/manage/download?key=${encodeURIComponent(f.key)}&mode=view`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${f.name}`}>
                        {url && IMAGE_EXTENSIONS.includes(e) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" loading="lazy" />
                        ) : url && VIDEO_EXTENSIONS.includes(e) ? (
                          <video src={url + '#t=0.1'} preload="metadata" muted playsInline />
                        ) : (
                          <FileBadge name={f.name} big />
                        )}
                      </a>
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
              {ALLOWED_EXTENSIONS.length ? ` · allowed types: ${ALLOWED_EXTENSIONS.join(', ')}` : ''}. A file with a name that already exists is saved as “name (1)”.
            </p>
          </>
        )}
      </section>

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
