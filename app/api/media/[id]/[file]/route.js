import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '@/lib/db.mjs';

const TYPES = { pdf: 'application/pdf', png: 'image/png', mp4: 'video/mp4', gif: 'image/gif', json: 'application/json', txt: 'text/plain' };

export async function GET(req, { params }) {
  const { id, file } = await params;
  const name = decodeURIComponent(file);
  if (!/^[\w.-]+$/.test(name)) return new Response('bad name', { status: 400 });
  const d = getDb().prepare('SELECT dir FROM drafts WHERE id = ?').get(Number(id));
  if (!d) return new Response('not found', { status: 404 });
  const p = path.join(d.dir, name);
  if (!fs.existsSync(p)) return new Response('not found', { status: 404 });
  const ext = name.split('.').pop();
  const download = new URL(req.url).searchParams.has('download');
  return new Response(fs.readFileSync(p), {
    headers: {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
      ...(download ? { 'content-disposition': `attachment; filename="${id}-${name}"` } : {}),
    },
  });
}
