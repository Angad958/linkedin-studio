// Diagram explainer video: services as nodes, requests as dots moving along edges, told in short beats.
// Everything is a pure function of time t so frames can be seeked deterministically.

const KINDS = new Set(['ok', 'slow', 'fail', 'fallback', 'probe']);
const STATUSES = new Set(['ok', 'slow', 'down']);
const BREAKER = new Set(['closed', 'open', 'half']);

export const INTRO = 1.1;     // header + nodes appear
export const TAKEAWAY = 2.8;  // takeaway card on screen at the end

const words = (s = '') => String(s).trim().split(/\s+/).filter(Boolean).length;

// Validates and normalizes a diagram animation spec. Returns { spec, timeline, warnings }.
export function planDiagram(raw) {
  const warnings = [];
  const nodes = (raw.nodes || []).slice(0, 8);
  if ((raw.nodes || []).length > 8) warnings.push(`animation has ${raw.nodes.length} nodes; only 8 fit on a phone. Merge nodes.`);
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    if (!Array.isArray(n.at) || n.at.length !== 2) warnings.push(`node ${n.id}: "at" must be [col,row].`);
    if (words(n.label) > 2) warnings.push(`node ${n.id}: label "${n.label}" is over 2 words.`);
  }
  const edges = (raw.edges || []).filter((e) => {
    const ok = ids.has(e.from) && ids.has(e.to);
    if (!ok) warnings.push(`edge ${e.from}->${e.to} references an unknown node; dropped.`);
    return ok;
  });
  const edgeKey = (a, b) => [a, b].sort().join('|');
  const edgeSet = new Set(edges.map((e) => edgeKey(e.from, e.to)));
  const breakerEdge = edges.find((e) => e.breaker);

  const beats = (raw.beats || []).slice(0, 7);
  if (beats.length < 3) warnings.push('animation needs at least 3 beats.');
  let t = INTRO;
  let status = Object.fromEntries(nodes.map((n) => [n.id, 'ok']));
  let load = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  let breaker = 'closed';
  const timeline = beats.map((b, i) => {
    const dur = Math.min(4, Math.max(1.8, Number(b.dur) || 2.6));
    if (words(b.caption) > 7) warnings.push(`beat ${i + 1}: caption is over 7 words.`);
    const prevLoad = { ...load };
    for (const [id, st] of Object.entries(b.nodes || {})) {
      if (!ids.has(id)) { warnings.push(`beat ${i + 1}: unknown node ${id}.`); continue; }
      if (st.status && STATUSES.has(st.status)) status = { ...status, [id]: st.status };
      if (typeof st.load === 'number') load = { ...load, [id]: Math.max(0, Math.min(1, st.load)) };
    }
    if (b.breaker) {
      if (!breakerEdge) warnings.push(`beat ${i + 1}: sets breaker but no edge has "breaker": true.`);
      else if (BREAKER.has(b.breaker)) breaker = b.breaker;
    }
    const flows = (b.flows || []).filter((f) => {
      const ok = ids.has(f.from) && ids.has(f.to) && edgeSet.has(edgeKey(f.from, f.to)) && KINDS.has(f.kind || 'ok');
      if (!ok) warnings.push(`beat ${i + 1}: flow ${f.from}->${f.to} (${f.kind}) has no matching edge or kind; dropped.`);
      return ok;
    }).map((f) => ({ from: f.from, to: f.to, kind: f.kind || 'ok' }));
    const beat = { start: t, end: t + dur, caption: b.caption || '', flows, status: { ...status }, load: { ...load }, prevLoad, breaker };
    t += dur;
    return beat;
  });
  const tTake = t + 0.2;
  const total = tTake + TAKEAWAY;
  return { spec: { ...raw, nodes, edges, breakerEdge }, timeline, tTake, total, warnings };
}

// Groups identical flows in consecutive beats into continuous runs, so a pile-up keeps growing across beats.
export function flowRuns(timeline) {
  const runs = [];
  const open = new Map();
  timeline.forEach((b, i) => {
    const seen = new Set();
    for (const f of b.flows) {
      const k = `${f.from}>${f.to}>${f.kind}`;
      seen.add(k);
      const r = open.get(k);
      if (r && r.lastBeat === i - 1) { r.end = b.end; r.lastBeat = i; }
      else { const nr = { ...f, start: b.start, end: b.end, lastBeat: i }; runs.push(nr); open.set(k, nr); }
    }
  });
  return runs.map(({ lastBeat, ...r }) => r);
}

const RUNTIME = String.raw`
const S = window.__SPEC, TL = window.__TL, RUNS = window.__RUNS, TTAKE = window.__TTAKE, TOTAL = window.__TOTAL;
const X0 = 88, X1 = 992, Y0 = 360, Y1 = 1055, NW = 216, NH = 104;
const cols = Math.max(...S.nodes.map(n => n.at[0])) + 1, rows = Math.max(...S.nodes.map(n => n.at[1])) + 1;
const pos = {};
S.nodes.forEach(n => { pos[n.id] = { x: X0 + (X1 - X0) * (n.at[0] + .5) / cols, y: Y0 + (Y1 - Y0) * (n.at[1] + .5) / rows }; });
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (v) => { v = clamp(v); return v < .5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
const svg = document.getElementById('net'), NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
// Segment between two node boxes, clipped to their borders.
function seg(a, b) {
  const p = pos[a], q = pos[b], dx = q.x - p.x, dy = q.y - p.y;
  const cut = (hw, hh) => Math.min(dx ? hw / Math.abs(dx) : 1e9, dy ? hh / Math.abs(dy) : 1e9);
  const k = cut(NW / 2 + 10, NH / 2 + 10);
  const x1 = p.x + dx * k, y1 = p.y + dy * k, x2 = q.x - dx * k, y2 = q.y - dy * k;
  return { x1, y1, x2, y2, len: Math.hypot(x2 - x1, y2 - y1), at: (u) => ({ x: x1 + (x2 - x1) * u, y: y1 + (y2 - y1) * u }) };
}
const edgeEls = S.edges.map(e => {
  const s = seg(e.from, e.to);
  const line = el('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, class: e.dashed ? 'edge dashed' : 'edge' });
  let lab = null;
  if (e.label) {
    // Short static label; above the line for side-by-side arrows so dots stay visible.
    lab = document.createElement('div'); lab.className = 'elab' + (e.dashed ? ' dashed' : ''); lab.textContent = e.label;
    document.getElementById('nodes').appendChild(lab);
    const m = s.at(.5), flat = Math.abs(s.y2 - s.y1) < 2;
    lab.style.left = (m.x - lab.offsetWidth / 2) + 'px';
    lab.style.top = (m.y - lab.offsetHeight / 2 - (flat ? lab.offsetHeight / 2 + 14 : 0)) + 'px';
    if (!flat) lab.style.left = (m.x + 16) + 'px';
  }
  return { e, s, line, lab };
});
// Breaker switch at the midpoint of its edge.
let brk = null;
if (S.breakerEdge) {
  const s = seg(S.breakerEdge.from, S.breakerEdge.to), m = s.at(.5);
  const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180 / Math.PI;
  const g = el('g', { transform: 'translate(' + m.x + ',' + m.y + ')' });
  const ring = el('circle', { r: 40, class: 'brk-ring' }, g);
  const inner = el('g', { transform: 'rotate(' + ang + ')' }, g);
  el('circle', { cx: -20, cy: 0, r: 6, class: 'brk-pin' }, inner);
  el('circle', { cx: 20, cy: 0, r: 6, class: 'brk-pin' }, inner);
  const lever = el('line', { x1: -20, y1: 0, x2: 20, y2: 0, class: 'brk-lever' }, inner);
  brk = { g, ring, lever, m, s };
}
const dots = el('g', {});
// Precompute every dot from the flow runs.
const DOT = [];
RUNS.forEach(r => {
  const s = seg(r.from, r.to);
  const travel = Math.max(.55, s.len / 520);
  if (r.kind === 'probe') { DOT.push({ r, s, t0: r.start + .35, travel: travel * 1.8 }); return; }
  const gap = r.kind === 'slow' ? .3 : .42;
  let i = 0;
  for (let t0 = r.start + .05; t0 < r.end - (r.kind === 'slow' ? .2 : travel * .6); t0 += gap, i++) DOT.push({ r, s, t0, travel, i });
});
DOT.forEach(d => { d.c = el('circle', { r: 12, class: 'dot' }, dots); d.burst = el('circle', { r: 12, class: 'burst' }, dots); });

const COLORS = { ok: 'var(--accent)', slow: 'var(--warm)', fail: 'var(--warm)', fallback: 'var(--ok)', probe: 'var(--warm)' };
function placeDot(d, t) {
  const { r, s } = d, age = t - d.t0;
  d.burst.setAttribute('opacity', 0);
  if (age < 0) { d.c.setAttribute('opacity', 0); return; }
  let u, op = 1, fill = COLORS[r.kind];
  if (r.kind === 'slow') {
    // Dots crawl in and stack up from the far end: the pile-up.
    const cap = 1 - (18 + d.i * 30) / s.len;
    u = Math.min(age / d.travel, Math.max(.06, cap));
    op = t > r.end ? 1 - (t - r.end) / .35 : 1;
  } else if (r.kind === 'fallback') {
    // Out to the breaker, straight back.
    const p = age / (d.travel * .7);
    if (p > 1) op = 0;
    u = p < .5 ? p : 1 - p;
  } else {
    const p = age / d.travel;
    if (p > 1) {
      op = 0;
      const ba = age - d.travel;
      if ((r.kind === 'fail' || r.kind === 'probe') && ba < .45) {
        const q = s.at(1);
        d.burst.setAttribute('cx', q.x); d.burst.setAttribute('cy', q.y);
        d.burst.setAttribute('r', 12 + ba * 90);
        d.burst.setAttribute('opacity', 1 - ba / .45);
        d.burst.style.stroke = r.kind === 'fail' ? 'var(--bad)' : 'var(--ok)';
      }
    }
    u = Math.min(1, p);
  }
  const q = s.at(u);
  d.c.setAttribute('cx', q.x); d.c.setAttribute('cy', q.y);
  d.c.setAttribute('opacity', clamp(op)); d.c.style.fill = fill; d.c.style.color = fill;
}

const nodeEls = {};
const layer = document.getElementById('nodes');
S.nodes.forEach((n, i) => {
  const d = document.createElement('div');
  d.className = 'node' + (n.kind ? ' k-' + n.kind : '');
  d.style.left = (pos[n.id].x - NW / 2) + 'px'; d.style.top = (pos[n.id].y - NH / 2) + 'px';
  d.innerHTML = '<div class="nl"></div>' + (n.sub ? '<div class="ns"></div>' : '') + (n.gauge ? '<div class="gauge"><i></i></div>' : '') + '<div class="ntag"></div>';
  d.querySelector('.nl').textContent = n.label;
  if (n.sub) d.querySelector('.ns').textContent = n.sub;
  layer.appendChild(d);
  nodeEls[n.id] = { d, i, fill: d.querySelector('.gauge i'), tag: d.querySelector('.ntag') };
});
const brkTag = document.getElementById('brktag');
const cap = document.getElementById('cap'), capTxt = document.getElementById('captxt'), pips = document.getElementById('pips');
TL.forEach(() => pips.appendChild(document.createElement('span')));
const fade = (t, a, b = .5) => clamp((t - a) / b);

window.render = function (t) {
  for (const [sel, a] of [['.kicker', .05], ['.badge', .2], ['h1', .3]]) {
    const e = document.querySelector(sel); if (!e) continue;
    const v = ease(fade(t, a, .6)); e.style.opacity = v; e.style.transform = 'translateY(' + (1 - v) * 30 + 'px)';
  }
  const bi = Math.max(0, TL.findIndex(b => t < b.end) === -1 ? TL.length - 1 : TL.findIndex(b => t < b.end));
  const beat = TL[bi], inBeats = t >= TL[0].start;
  // Nodes
  S.nodes.forEach(n => {
    const ne = nodeEls[n.id], v = ease(fade(t, .45 + ne.i * .1, .45));
    ne.d.style.opacity = v; ne.d.style.transform = 'scale(' + (.85 + .15 * v) + ')';
    const st = inBeats ? beat.status[n.id] : 'ok';
    ne.d.dataset.status = st;
    ne.tag.textContent = st === 'slow' ? 'SLOW' : st === 'down' ? 'DOWN' : '';
    if (ne.fill) {
      const from = inBeats ? beat.prevLoad[n.id] : 0, to = inBeats ? beat.load[n.id] : 0;
      const l = from + (to - from) * ease((t - beat.start) / .9);
      ne.fill.style.width = (l * 100) + '%';
      ne.fill.style.background = l > .85 ? 'var(--bad)' : l > .55 ? 'var(--warm)' : 'var(--ok)';
    }
  });
  edgeEls.forEach(x => { const v = ease(fade(t, .7, .5)); x.line.style.opacity = v; if (x.lab) x.lab.style.opacity = v; });
  // Breaker
  if (brk) {
    const v = ease(fade(t, .8, .4));
    brk.g.style.opacity = v;
    const st = inBeats ? beat.breaker : 'closed';
    const prev = inBeats && bi > 0 ? TL[bi - 1].breaker : st;
    const angOf = (s) => s === 'open' ? -42 : s === 'half' ? -20 : 0;
    const a = angOf(prev) + (angOf(st) - angOf(prev)) * ease((t - (inBeats ? beat.start : 0)) / .35);
    brk.lever.setAttribute('transform', 'rotate(' + a + ' -20 0)');
    const col = st === 'open' ? 'var(--bad)' : st === 'half' ? 'var(--warm)' : 'var(--ok)';
    brk.ring.style.stroke = col; brk.lever.style.stroke = col;
    brkTag.textContent = st === 'open' ? 'OPEN' : st === 'half' ? 'HALF-OPEN' : 'CLOSED';
    brkTag.style.color = col; brkTag.style.borderColor = col; brkTag.style.opacity = v;
    brkTag.style.left = (brk.m.x + 56) + 'px'; brkTag.style.top = (brk.m.y - 22) + 'px';
  }
  DOT.forEach(d => placeDot(d, t));
  // Caption crossfades per beat, then the takeaway takes over.
  if (t < TTAKE) {
    const local = t - beat.start, out = beat.end - t;
    const v = inBeats ? Math.min(ease(local / .35), bi === TL.length - 1 ? 1 : ease(out / .25)) : 0;
    capTxt.innerHTML = beat.captionHtml; cap.style.opacity = v; cap.style.transform = 'translateY(' + (1 - v) * 16 + 'px)';
    [...pips.children].forEach((p, i) => p.className = i < bi ? 'done' : i === bi ? 'on' : '');
  } else cap.style.opacity = clamp(1 - (t - TTAKE) / .25);
  const tk = document.querySelector('.take'), tv = ease(fade(t, TTAKE + .1, .5));
  tk.style.opacity = tv; tk.style.transform = 'scale(' + (.88 + .12 * tv) + ')';
  document.querySelector('.prog').style.transform = 'scaleX(' + clamp(t / TOTAL) + ')';
};
window.seek = (ms) => window.render(ms / 1000);
window.render(0);
`;

export function diagramAnimationHtml(raw, { css, esc, rich, badge, foot }) {
  const plan = planDiagram(raw);
  const { spec, tTake, total, warnings } = plan;
  const timeline = plan.timeline.map((b) => ({ ...b, captionHtml: rich(b.caption) }));
  const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
    .content{height:330px;flex:none}
    .kicker,.badge,h1{opacity:0}
    .badge{margin-top:22px}
    h1{font-size:62px;line-height:1.08;font-weight:800;letter-spacing:-.02em;margin-top:22px}
    #net{position:absolute;inset:0;width:1080px;height:1350px;overflow:visible}
    .edge{stroke:#3A4B6E;stroke-width:5;stroke-linecap:round} .edge.dashed{stroke-dasharray:12 10}
    .elab{position:absolute;white-space:nowrap;font:600 19px/1 -apple-system,Helvetica,Arial,sans-serif;color:#9FB6D6;background:var(--bg);
      border:2px solid var(--line);border-radius:9px;padding:5px 8px;opacity:0}
    .elab.dashed{color:#FDE68A;border-color:rgba(251,191,36,.4)}
    .dot{filter:drop-shadow(0 0 8px currentColor)}
    .burst{fill:none;stroke-width:5}
    .brk-ring{fill:var(--panel2);stroke-width:5}
    .brk-pin{fill:var(--ink)}
    .brk-lever{stroke-width:7;stroke-linecap:round}
    #brktag:empty{display:none} #brktag{position:absolute;font:700 22px/1 "SF Mono",Menlo,monospace;letter-spacing:.12em;padding:10px 14px;border:2px solid;border-radius:12px;background:var(--bg)}
    #nodes{position:absolute;inset:0}
    .node{position:absolute;width:216px;height:104px;border-radius:24px;background:var(--panel);border:3px solid var(--accent);
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;box-shadow:0 10px 40px rgba(0,0,0,.35);opacity:0}
    .node[data-status=slow]{border-color:var(--warm);background:#2A2412}
    .node[data-status=down]{border-color:var(--bad);background:#2C1418}
    .k-client{border-color:#9AAAC4;border-radius:56px}
    .k-db{border-color:var(--ok);border-radius:50% / 22%;background:#0F2A24}
    .k-cache{border-color:#C084FC;background:#211A33}
    .k-queue{border-color:var(--warm);background:#2A2412;border-radius:14px}
    .k-workers{box-shadow:8px -8px 0 -2px var(--panel2),8px -8px 0 0 var(--accent),16px -16px 0 -2px var(--panel2),16px -16px 0 0 var(--accent)}
    .nl{font-size:29px;font-weight:700;text-align:center;line-height:1.1}
    .ns{font-size:21px;color:var(--mute)}
    .gauge{width:200px;height:12px;border-radius:6px;background:#0B1220;overflow:hidden;margin-top:6px}
    .gauge i{display:block;height:100%;width:0;border-radius:6px}
    .ntag{position:absolute;top:-18px;right:-12px;font:800 20px/1 "SF Mono",Menlo,monospace;letter-spacing:.1em;padding:7px 10px;border-radius:10px;color:#06101F}
    .ntag:empty{display:none}
    .node[data-status=slow] .ntag{background:var(--warm)} .node[data-status=down] .ntag{background:var(--bad)}
    #cap{position:absolute;left:88px;right:88px;top:1078px;text-align:center;opacity:0}
    #captxt{font-size:46px;font-weight:700;line-height:1.2;text-wrap:balance}
    #pips{display:flex;gap:10px;justify-content:center;margin-top:20px}
    #pips span{width:34px;height:7px;border-radius:4px;background:var(--line)}
    #pips span.done{background:#4B6A93} #pips span.on{background:var(--accent)}
    .take{position:absolute;left:88px;right:88px;top:1060px;background:linear-gradient(135deg,#3B2F10,#1E1A0E);border:2px solid var(--warm);border-radius:28px;
      padding:26px 34px;font-size:40px;line-height:1.3;font-weight:700;text-align:center;opacity:0}
    .take .tk{font:700 22px/1 "SF Mono",Menlo,monospace;letter-spacing:.14em;color:var(--warm);display:block;margin-bottom:12px}
    .prog{position:absolute;left:0;bottom:0;height:8px;width:100%;background:linear-gradient(90deg,var(--accent),var(--warm));transform-origin:left;transform:scaleX(0)}
  </style></head><body>
  <div class="frame"><div class="grid"></div><div class="content">
    <div class="kicker">${esc(spec.kicker || 'How it works')}</div>
    ${badge(spec.badge)}
    <h1>${rich(spec.title)}</h1>
  </div>
  <svg id="net" viewBox="0 0 1080 1350"></svg><div id="nodes"></div><div id="brktag"></div>
  <div id="cap"><div id="captxt"></div><div id="pips"></div></div>
  <div class="take"><span class="tk">TAKEAWAY</span>${rich(spec.takeaway || '')}</div>
  ${foot('')}<div class="prog"></div></div>
  <script>window.__SPEC=${json(spec)};window.__TL=${json(timeline)};window.__RUNS=${json(flowRuns(timeline))};window.__TTAKE=${tTake};window.__TOTAL=${total};</script>
  <script>${RUNTIME}</script></body></html>`;
  return { html, total, tTake, warnings };
}
