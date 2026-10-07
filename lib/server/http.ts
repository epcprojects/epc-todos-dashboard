import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Setup mistakes get an actionable message; anything else stays generic so internals never leak. */
function friendlyServerError(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  const code = (e as { code?: string } | null)?.code;
  if (/DATABASE_URL is not set/.test(msg)) return 'Server setup problem: the DATABASE_URL environment variable is not set.';
  if (/SESSION_SECRET/.test(msg)) return 'Server setup problem: SESSION_SECRET must be set to a random string of at least 32 characters.';
  if (code === '42P01' || /settings row missing/.test(msg)) return 'Database setup problem: the tables are missing. Run neon_schema.sql in the Neon SQL Editor.';
  if (/Error connecting to database/.test(msg)) return 'Could not connect to the database. Check DATABASE_URL (use the pooled connection string).';
  return 'Something went wrong on the server. Please try again.';
}

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, { ...init, headers: { 'Cache-Control': 'no-store', ...(init?.headers || {}) } });

/** Wrap a route handler: ApiError / validation errors become clear JSON errors. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) {
        const first = e.issues[0];
        const where = first && first.path.length ? ` (${first.path.join('.')})` : '';
        return json({ error: `Invalid request: ${first ? first.message : 'bad input'}${where}` }, { status: 400 });
      }
      console.error(e);
      return json({ error: friendlyServerError(e) }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, 'Invalid request: body must be JSON');
  }
  return schema.parse(raw);
}

/** IANA timezone sent by the browser; only used to word history messages. Invalid values are ignored. */
export function clientTz(req: Request): string | undefined {
  const tz = req.headers.get('x-tz') || undefined;
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim().slice(0, 64) || 'unknown';
  return req.headers.get('x-real-ip') || 'unknown';
}
