import { requireSession } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { readLinks } from '@/lib/server/filelinks';
import { listAll } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Every signed-in role can see all files in all five folders and the folders nested inside them. */
export const GET = handle(async (req: Request) => {
  await requireSession(req);
  const [all, links] = await Promise.all([listAll(), readLinks()]);
  // only links of files that exist (a link whose file was removed in the S3 console is ignored)
  const have = new Set(all.files.map((f) => f.key));
  return json({ ...all, links: Object.fromEntries(Object.entries(links).filter(([k]) => have.has(k))) });
});
