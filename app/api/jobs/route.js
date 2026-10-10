import { getDb } from '@/lib/db.mjs';

export async function GET(req) {
  const type = new URL(req.url).searchParams.get('type');
  const rows = type
    ? getDb().prepare('SELECT * FROM jobs WHERE type = ? ORDER BY id DESC LIMIT 5').all(type)
    : getDb().prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT 10').all();
  return Response.json({ jobs: rows });
}
