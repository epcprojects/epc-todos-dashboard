import { NextResponse } from 'next/server';
import { assertToken, readPublicToday } from '@/lib/server/publicLink';
import { ApiError, handle } from '@/lib/server/http';
import { presignGet } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';

/** GET ?t=…&key=…&mode=view|download -> 302 to a 5-minute signed link, only for files in today-posts. */
export const GET = handle(async (req: Request) => {
  const sp = new URL(req.url).searchParams;
  assertToken(sp.get('t'));
  const key = sp.get('key') || '';
  if (!(await readPublicToday()).files.some((f) => f.key === key)) throw new ApiError(404, 'That file is no longer in today-posts.');
  const url = await presignGet(key, { download: sp.get('mode') !== 'view' });
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } });
});
