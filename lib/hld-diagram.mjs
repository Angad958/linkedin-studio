// HLD architecture image: components placed on a grid, typed shapes (client, service, db, queue, cache, workers),
// arrows with short labels. Laid out explicitly so it stays readable on a phone, unlike auto-layout.

const KINDS = new Set(['client', 'service', 'db', 'queue', 'cache', 'workers']);
const words = (s = '') => String(s).trim().split(/\s+/).filter(Boolean).length;

export function lintHld(spec) {
  const w = [];
  const nodes = spec.nodes || [];
  const ids = new Set(nodes.map((n) => n.id));
  if (nodes.length < 5) w.push(`HLD has ${nodes.length} components; show at least 5 (client, service, datastore, queue/cache, workers).`);
  if (nodes.length > 8) w.push(`HLD has ${nodes.length} components; 8 is the most that reads on a phone.`);
  if (!nodes.some((n) => n.kind === 'db')) w.push('HLD has no datastore (kind "db").');
  const cells = new Set();
  for (const n of nodes) {
    if (!KINDS.has(n.kind)) w.push(`component ${n.id}: kind must be one of ${[...KINDS].join(', ')}.`);
    if (!Array.isArray(n.at) || n.at[0] > 2 || n.at[1] > 4) w.push(`component ${n.id}: "at" must be [col 0-2, row 0-4].`);
    else if (cells.has(String(n.at))) w.push(`component ${n.id}: shares cell ${n.at} with another component.`);
    else cells.add(String(n.at));
    if (words(n.label) > 2) w.push(`component ${n.id}: label is over 2 words.`);
  }
  const deg = {};
  for (const e of spec.edges || []) {
    if (!ids.has(e.from) || !ids.has(e.to)) w.push(`edge ${e.from}->${e.to} references an unknown component.`);
    if (words(e.label) > 3) w.push(`edge ${e.from}->${e.to}: label is over 3 words.`);
    deg[e.from] = (deg[e.from] || 0) + 1; deg[e.to] = (deg[e.to] || 0) + 1;
  }
  if (!Object.values(deg).some((d) => d > 2)) w.push('HLD is a single chain. Show the architecture: branches to datastores, queues and workers.');
  return w;
}

const RUNTIME = String.raw`
const S = window.__HLD, box = document.getElementById('hld'), svg = document.getElementById('hldsvg');
const BW = box.clientWidth, BH = box.clientHeight, PAD = 14;
const cols = 3, rows = Math.max(...S.nodes.map(n => n.at[1])) + 1;
const cw = (BW - 2 * PAD) / cols, rh = (BH - 2 * PAD) / rows;
const NW = Math.min(240, cw - 84), NH = Math.min(96, rh - 76);
svg.setAttribute('viewBox', '0 0 ' + BW + ' ' + BH); svg.setAttribute('width', BW); svg.setAttribute('height', BH);
const pos = {};
S.nodes.forEach(n => {
  const x = PAD + cw * (n.at[0] + .5), y = PAD + rh * (n.at[1] + .5);
  pos[n.id] = { x, y };
  const d = document.createElement('div');
  d.className = 'hn k-' + n.kind;
  d.style.cssText = 'left:' + (x - NW / 2) + 'px;top:' + (y - NH / 2) + 'px;width:' + NW + 'px;height:' + NH + 'px';
  const l = document.createElement('div'); l.className = 'hl'; l.textContent = n.label; d.appendChild(l);
  if (n.sub) { const s = document.createElement('div'); s.className = 'hs'; s.textContent = n.sub; d.appendChild(s); }
  box.appendChild(d);
});
const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, a, p = svg) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); p.appendChild(e); return e; };
const defs = mk('defs', {});
for (const [id, c] of [['arr', '#7DD3FC'], ['arrd', '#FBBF24']]) {
  const m = mk('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
  mk('path', { d: 'M0,0 L10,5 L0,10 z', fill: c }, m);
}
S.edges.forEach(e => {
  const p = pos[e.from], q = pos[e.to]; if (!p || !q) return;
  const dx = q.x - p.x, dy = q.y - p.y;
  const k = Math.min(dx ? (NW / 2 + 8) / Math.abs(dx) : 1e9, dy ? (NH / 2 + 8) / Math.abs(dy) : 1e9);
  const x1 = p.x + dx * k, y1 = p.y + dy * k, x2 = q.x - dx * k, y2 = q.y - dy * k;
  mk('line', { x1, y1, x2, y2, class: e.dashed ? 'he dashed' : 'he', 'marker-end': 'url(#' + (e.dashed ? 'arrd' : 'arr') + ')' });
  if (e.label) {
    const t = document.createElement('div'); t.className = 'hel' + (e.dashed ? ' dashed' : ''); t.textContent = e.label;
    box.appendChild(t);
    const f = e.labelAt ?? .5, flat = Math.abs(y2 - y1) < 2;
    // Labels on side-by-side arrows sit above the line so the arrow stays visible.
    t.style.left = (x1 + (x2 - x1) * f - t.offsetWidth / 2) + 'px';
    t.style.top = (y1 + (y2 - y1) * f - t.offsetHeight / 2 - (flat ? t.offsetHeight / 2 + 12 : 0)) + 'px';
  }
});
document.body.dataset.ready = '1';
`;

export function hldDiagramHtml(spec, { css, esc, rich, badge, foot }) {
  const json = JSON.stringify({ nodes: spec.nodes || [], edges: spec.edges || [] }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}
    .content{gap:24px}
    h1{font-size:64px;line-height:1.08;font-weight:800;letter-spacing:-.02em}
    .cap{font-size:33px;line-height:1.4;color:var(--mute)}
    .note{font-size:32px;line-height:1.4;color:#FDE68A;border-left:6px solid var(--warm);padding-left:22px}
    #hld{position:relative;flex:1;min-height:0;background:rgba(18,28,48,.75);border:2px solid var(--line);border-radius:32px}
    #hldsvg{position:absolute;inset:0}
    .he{stroke:#7DD3FC;stroke-width:4} .he.dashed{stroke:#FBBF24;stroke-dasharray:12 9}
    .hel{position:absolute;white-space:nowrap;font:600 21px/1 -apple-system,Helvetica,Arial,sans-serif;color:#CFE8FF;background:var(--bg);
      border:2px solid var(--line);border-radius:10px;padding:7px 11px}
    .hel.dashed{color:#FDE68A;border-color:rgba(251,191,36,.5)}
    .hn{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;text-align:center;
      background:var(--panel);border:3px solid var(--accent);border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
    .hl{font-size:28px;font-weight:700;line-height:1.1;padding:0 8px} .hs{font-size:20px;color:var(--mute);line-height:1.15}
    .k-client{border-color:#9AAAC4;border-radius:56px}
    .k-db{border-color:var(--ok);border-radius:50% / 22%;background:#0F2A24}
    .k-cache{border-color:#C084FC;background:#211A33}
    .k-queue{border-color:var(--warm);background:#2A2412;border-radius:14px;
      background-image:repeating-linear-gradient(90deg,transparent 0 calc(100% - 46px),rgba(251,191,36,.25) calc(100% - 46px) calc(100% - 42px),transparent calc(100% - 42px) calc(100% - 34px))}
    .k-workers{box-shadow:8px -8px 0 -2px var(--panel2),8px -8px 0 0 var(--accent),16px -16px 0 -2px var(--panel2),16px -16px 0 0 var(--accent),0 10px 30px rgba(0,0,0,.35)}
  </style></head><body>
  <div class="frame"><div class="grid"></div><div class="content">
    <div class="kicker">${esc(spec.kicker || 'HLD')}</div>
    ${badge(spec.badge)}
    <h1>${rich(spec.title)}</h1>
    ${spec.caption ? `<p class="cap">${rich(spec.caption)}</p>` : ''}
    <div id="hld"><svg id="hldsvg"></svg></div>
    ${spec.takeaway ? `<p class="note">${rich(spec.takeaway)}</p>` : ''}
  </div>${foot(spec.footer || '')}</div>
  <script>window.__HLD=${json};</script><script>${RUNTIME}</script></body></html>`;
}
