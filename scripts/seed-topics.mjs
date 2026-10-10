import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/config.mjs';
import { getDb } from '../lib/db.mjs';

const topics = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'topics.json'), 'utf8'));
const ins = getDb().prepare('INSERT OR IGNORE INTO topics(pillar, title, media_hint) VALUES(?, ?, ?)');
let n = 0;
for (const t of topics) n += ins.run(t.pillar, t.title, t.media_hint).changes;
console.log(`seeded ${n} new topics (${topics.length} in file)`);
