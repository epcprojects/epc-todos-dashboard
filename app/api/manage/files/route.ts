import { requireSession } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { listAll } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Every signed-in role can see all files in all five folders and the folders nested inside them. */
export const GET = handle(async (req: Request) => {
  await requireSession(req);
  return json(await listAll());
});
