/* Thin fetch wrapper. Sends the browser's timezone so the server can word history messages in local time,
   and reports 401 (session ended / PIN changed) to whoever registered a handler. */

export class ApiFail extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

const tz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown; quiet401?: boolean }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method || (init?.body !== undefined ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', 'x-tz': tz() },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiFail(0, 'Could not reach the server. Check your connection and try again.');
  }
  let data: { error?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    if (res.status === 401 && !init?.quiet401 && onUnauthorized) onUnauthorized();
    throw new ApiFail(res.status, (data && data.error) || `Request failed (${res.status})`);
  }
  return data as T;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry network errors and 5xx a few times with backoff; never retry 4xx. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let d = 500;
  for (let a = 0; ; a++) {
    try {
      return await fn();
    } catch (e) {
      const st = e instanceof ApiFail ? e.status : 0;
      if ((st === 0 || st >= 500 || st === 429) && a < tries - 1) {
        await sleep(d + Math.random() * d);
        d *= 2;
        continue;
      }
      throw e;
    }
  }
}

export function lsGet<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
}
export function lsSet(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

/** The page the user is on lives in the URL hash ("#/distribution", "#/manage/Linkedin/Q4") so a reload or a shared link returns to it. */
export function readLocation(): string[] {
  try {
    return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return [];
  }
}
export function writeLocation(segs: string[]) {
  try {
    history.replaceState(null, '', '#/' + segs.map(encodeURIComponent).join('/'));
  } catch {
    /* ignore */
  }
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
