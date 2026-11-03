// Runs migrations/004_users.sql once on the database in .env (DATABASE_URL). Nothing else.
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const root = path.join(__dirname, '..');
const m = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
if (!m) throw new Error('DATABASE_URL not found in .env');
const url = m[1].trim().replace(/^['"]|['"]$/g, ''); // .env values may be quoted
const sql = neon(url);

(async () => {
  console.log('database host:', url.split('@')[1].split('/')[0]);
  const t = (await sql.query("select to_regclass('public.tasks') as tasks, to_regclass('public.users') as users"))[0];
  if (!t.tasks) throw new Error('tasks table not found: this does not look like the dashboard database, stopping');
  console.log('users table before:', t.users);
  const file = fs.readFileSync(path.join(root, 'migrations', '004_users.sql'), 'utf8');
  const stmts = file.split(/;\s*\n/).map((s) => s.replace(/^(\s*--.*\n)+/gm, '').trim()).filter(Boolean);
  for (const s of stmts) await sql.query(s);
  console.log('users now:', await sql.query('select id, username, role from users'));
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
