import { neon } from '@neondatabase/serverless';

type Sql = ReturnType<typeof neon>;
let cached: Sql | null = null;

/** Neon HTTP driver, created lazily so `next build` works without DATABASE_URL. */
export function db(): Sql {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    cached = neon(url);
  }
  return cached;
}

export type Row = Record<string, unknown>;

/** Parameterised query. `text` always contains $1, $2 … placeholders; values never get concatenated. */
export function q(text: string, params: unknown[] = []) {
  return db().query(text, params);
}

/** Run several queries as one transaction (one HTTP round trip). */
export async function tx(queries: ReturnType<typeof q>[]): Promise<Row[][]> {
  return (await db().transaction(queries)) as unknown as Row[][];
}

export const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
