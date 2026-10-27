import { NextResponse } from 'next/server';
import { parseKey } from '@/lib/manage-config';
import { requireSession } from '@/lib/server/auth';
import { ApiError, handle } from '@/lib/server/http';
import { presignGet } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';

/** GET /api/manage/download?key=…&mode=view|download -> redirects to a 5-minute signed link (login required). */
export const GET = handle(async (req: Request) => {
  await requireSession(req);
  const sp = new URL(req.url).searchParams;
  const key = sp.get('key') || '';
  if (!parseKey(key)) throw new ApiError(400, 'Invalid request: bad file key');
  const url = await presignGet(key, { download: sp.get('mode') !== 'view' });
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } });
});
