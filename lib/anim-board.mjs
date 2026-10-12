// "Board" explainer video: one light dashboard that stays on screen the whole time. The header, legend,
// pattern box, interview line and footer are static; the stage in the middle plays the story in beats:
// nodes with icons, requests as dots on the edges, a live metric box and a phone showing the outcome.
// Timeline and flow logic come from anim-diagram.mjs. Everything is a pure function of time t.
import { flowRuns, planDiagram } from './anim-diagram.mjs';

export const BOARD_W = 1080;
export const BOARD_H = 1350;

const words = (s = '') => String(s).trim().split(/\s+/).filter(Boolean).length;

// 24x24 stroke icons for nodes.
export const ICONS = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2.5.6 4 2.4 4 5.5"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  cache: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  queue: '<rect x="3" y="5" width="4" height="14" rx="1"/><rect x="10" y="5" width="4" height="14" rx="1"/><rect x="17" y="5" width="4" height="14" rx="1"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
  car: '<path d="M5 16h14v-4l-2-5H7l-2 5z"/><circle cx="8" cy="17" r="1.8"/><circle cx="16" cy="17" r="1.8"/>',
  worker: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  api: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lb: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v10M11 7 6 17M13 7l5 10"/>',
  file: '<path d="M6 2h8l4 4v16H6zM14 2v4h4"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
};

const TONES = new Set(['ok', 'warn', 'bad', 'info']);
const toneOf = (v, d) => (TONES.has(v) ? v : d);

// Plans the board: the diagram timeline plus the per-beat metric, outcome and tone, carried forward.
export function planBoard(raw) {
  const plan = planDiagram(raw);
  const warnings = [...plan.warnings];
  let metric = raw.metric ? { value: String(raw.metric.normal ?? ''), tone: 'ok' } : null;
  let outcome = raw.outcome ? { value: '', note: '', tone: 'ok', alt: false } : null;
  let tone = 'ok';
  const beats = (raw.beats || []).slice(0, plan.timeline.length);
  const timeline = plan.timeline.map((b, i) => {
    const src = beats[i] || {};
    tone = toneOf(src.tone, i === 0 ? 'ok' : tone);
    const prevMetric = metric;
    if (metric && src.metric !== undefined) {
      const m = typeof src.metric === 'object' ? src.metric : { value: src.metric };
      metric = { value: String(m.value ?? metric.value), tone: toneOf(m.tone, tone) };
    }
    if (outcome && src.outcome !== undefined) {
      const o = typeof src.outcome === 'object' ? src.outcome : { value: src.outcome };
      outcome = { value: String(o.value ?? outcome.value), note: o.note ?? outcome.note, tone: toneOf(o.tone, tone), alt: Boolean(o.alt ?? outcome.alt) };
      if (words(outcome.value) > 4) warnings.push(`beat ${i + 1}: outcome "${outcome.value}" is over 4 words.`);
      if (words(outcome.note) > 8) warnings.push(`beat ${i + 1}: outcome note is over 8 words.`);
    }
    return { ...b, tone, metric, prevMetric, outcome };
  });
  if (!raw.metric) warnings.push('animation has no "metric" box; the stage looks empty without one.');
  if (!raw.outcome) warnings.push('animation has no "outcome" panel; show what the user sees.');
  const legend = (raw.legend || []).slice(0, 4);
  if (legend.length < 3) warnings.push('animation legend needs 3-4 chips.');
  legend.forEach((l, i) => { if (words(l.text) > 5) warnings.push(`legend chip ${i + 1} is over 5 words.`); });
  if (words(raw.subtitle) > 14) warnings.push('animation subtitle is over 14 words.');
  if (words(raw.pattern) > 22) warnings.push('animation "pattern" is over 22 words.');
  if (words(raw.interview || raw.takeaway) > 12) warnings.push('animation interview line is over 12 words.');
  return { ...plan, timeline, legend, warnings };
}

const RUNTIME = String.raw`
const S = window.__SPEC, TL = window.__TL, RUNS = window.__RUNS, TTAKE = window.__TTAKE, TOTAL = window.__TOTAL, B = window.__BOX;
const NW = 210, NH = 96;
const cols = Math.max(...S.nodes.map(n => n.at[0])) + 1, rows = Math.max(...S.nodes.map(n => n.at[1])) + 1;
const pos = {};
S.nodes.forEach(n => { pos[n.id] = { x: B.x0 + (B.x1 - B.x0) * (n.at[0] + .5) / cols, y: B.y0 + (B.y1 - B.y0) * (n.at[1] + .5) / rows }; });
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (v) => { v = clamp(v); return v < .5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
const fade = (t, a, b = .5) => clamp((t - a) / b);
const TONE = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--info)' };
const svg = document.getElementById('net'), NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
function seg(a, b) {
  const p = pos[a], q = pos[b], dx = q.x - p.x, dy = q.y - p.y;
  const cut = (hw, hh) => Math.min(dx ? hw / Math.abs(dx) : 1e9, dy ? hh / Math.abs(dy) : 1e9);
  const k = cut(NW / 2 + 8, NH / 2 + 8);
  const x1 = p.x + dx * k, y1 = p.y + dy * k, x2 = q.x - dx * k, y2 = q.y - dy * k;
  return { x1, y1, x2, y2, len: Math.hypot(x2 - x1, y2 - y1), at: (u) => ({ x: x1 + (x2 - x1) * u, y: y1 + (y2 - y1) * u }) };
}
const edgeEls = S.edges.map(e => { const s = seg(e.from, e.to); return el('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, class: 'edge' }); });
let brk = null;
if (S.breakerEdge) {
  const s = seg(S.breakerEdge.from, S.breakerEdge.to), m = s.at(.5);
  const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180 / Math.PI;
  const g = el('g', { transform: 'translate(' + m.x + ',' + m.y + ')' });
  const ring = el('circle', { r: 30, class: 'brk-ring' }, g);
  const inner = el('g', { transform: 'rotate(' + ang + ')' }, g);
  el('circle', { cx: -15, cy: 0, r: 5, class: 'brk-pin' }, inner);
  el('circle', { cx: 15, cy: 0, r: 5, class: 'brk-pin' }, inner);
  const lever = el('line', { x1: -15, y1: 0, x2: 15, y2: 0, class: 'brk-lever' }, inner);
  brk = { g, ring, lever, m };
}
const dots = el('g', {});
const DOT = [];
RUNS.forEach(r => {
  const s = seg(r.from, r.to);
  const travel = Math.max(.5, s.len / 420);
  if (r.kind === 'probe') { DOT.push({ r, s, t0: r.start + .35, travel: travel * 1.8 }); return; }
  const gap = r.kind === 'slow' ? .3 : .4;
  let i = 0;
  for (let t0 = r.start + .05; t0 < r.end - (r.kind === 'slow' ? .2 : travel * .6); t0 += gap, i++) DOT.push({ r, s, t0, travel, i });
});
DOT.forEach(d => { d.c = el('circle', { r: 9, class: 'dot' }, dots); d.burst = el('circle', { r: 9, class: 'burst' }, dots); });
const DOTC = { ok: 'var(--accent)', slow: 'var(--warn)', fail: 'var(--bad)', fallback: 'var(--ok)', probe: 'var(--info)' };
function placeDot(d, t) {
  const { r, s } = d, age = t - d.t0;
  d.burst.setAttribute('opacity', 0);
  if (age < 0) { d.c.setAttribute('opacity', 0); return; }
  let u, op = 1;
  if (r.kind === 'slow') {
    const cap = 1 - (14 + d.i * 22) / s.len;
    u = Math.min(age / d.travel, Math.max(.06, cap));
    op = t > r.end ? 1 - (t - r.end) / .35 : 1;
  } else if (r.kind === 'fallback') {
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
        d.burst.setAttribute('r', 9 + ba * 70);
        d.burst.setAttribute('opacity', 1 - ba / .45);
        d.burst.style.stroke = r.kind === 'fail' ? 'var(--bad)' : 'var(--info)';
      }
    }
    u = Math.min(1, p);
  }
  const q = s.at(u);
  d.c.setAttribute('cx', q.x); d.c.setAttribute('cy', q.y);
  d.c.setAttribute('opacity', clamp(op)); d.c.style.fill = DOTC[r.kind];
}

const nodeEls = {};
const layer = document.getElementById('nodes');
S.nodes.forEach((n, i) => {
  const d = document.createElement('div');
  d.className = 'node';
  d.style.left = (pos[n.id].x - NW / 2) + 'px'; d.style.top = (pos[n.id].y - NH / 2) + 'px';
  const icon = window.__ICONS[n.icon];
  d.innerHTML = (icon ? '<svg class="ic" viewBox="0 0 24 24">' + icon + '</svg>' : '') +
    '<div class="nt"><div class="nl"></div>' + (n.sub ? '<div class="ns"></div>' : '') + (n.gauge ? '<div class="gauge"><i></i></div>' : '') + '</div><div class="ntag"></div>';
  d.querySelector('.nl').textContent = n.label;
  if (n.sub) d.querySelector('.ns').textContent = n.sub;
  layer.appendChild(d);
  nodeEls[n.id] = { d, i, fill: d.querySelector('.gauge i'), tag: d.querySelector('.ntag') };
});
const brkTag = document.getElementById('brktag');
const cap = document.getElementById('cap'), capTxt = document.getElementById('captxt'), pips = document.getElementById('pips');
TL.forEach(() => pips.appendChild(document.createElement('span')));
const mBox = document.getElementById('metric'), mVal = document.getElementById('mval');
const phone = document.getElementById('phone'), chip = document.getElementById('chip'), note = document.getElementById('note');
const route = document.getElementById('route'), alt = document.getElementById('alt');

// Tweens between two numeric metric values, keeping the target's decimals and any unit text.
function tweenValue(from, to, k) {
  const num = (s) => { const m = String(s || '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  const a = num(from), b = num(to);
  if (a === null || b === null || k >= 1) return to;
  const dec = (String(to).match(/\.(\d+)/) || ['', ''])[1].length;
  return String(to).replace(/-?\d+(\.\d+)?/, (a + (b - a) * k).toFixed(dec));
}

window.render = function (t) {
  document.querySelectorAll('[data-in]').forEach(e => {
    const v = ease(fade(t, +e.dataset.in, .5)); e.style.opacity = v; e.style.transform = 'translateY(' + (1 - v) * 18 + 'px)';
  });
  const idx = TL.findIndex(b => t < b.end);
  const bi = idx === -1 ? TL.length - 1 : idx;
  const beat = TL[bi], inBeats = t >= TL[0].start, local = t - beat.start;
  S.nodes.forEach(n => {
    const ne = nodeEls[n.id], v = ease(fade(t, .5 + ne.i * .08, .4));
    ne.d.style.opacity = v; ne.d.style.transform = 'scale(' + (.9 + .1 * v) + ')';
    const st = inBeats ? beat.status[n.id] : 'ok';
    ne.d.dataset.status = st;
    ne.tag.textContent = st === 'slow' ? 'SLOW' : st === 'down' ? 'DOWN' : '';
    if (ne.fill) {
      const from = inBeats ? beat.prevLoad[n.id] : 0, to = inBeats ? beat.load[n.id] : 0;
      const l = from + (to - from) * ease(local / .9);
      ne.fill.style.width = (l * 100) + '%';
      ne.fill.style.background = l > .85 ? 'var(--bad)' : l > .55 ? 'var(--warn)' : 'var(--ok)';
    }
  });
  edgeEls.forEach(x => { x.style.opacity = ease(fade(t, .7, .4)); });
  if (brk) {
    const v = ease(fade(t, .8, .4));
    brk.g.style.opacity = v;
    const st = inBeats ? beat.breaker : 'closed', prev = inBeats && bi > 0 ? TL[bi - 1].breaker : st;
    const angOf = (s) => s === 'open' ? -42 : s === 'half' ? -20 : 0;
    const a = angOf(prev) + (angOf(st) - angOf(prev)) * ease(local / .35);
    brk.lever.setAttribute('transform', 'rotate(' + a + ' -15 0)');
    const col = st === 'open' ? 'var(--bad)' : st === 'half' ? 'var(--warn)' : 'var(--ok)';
    brk.ring.style.stroke = col; brk.lever.style.stroke = col;
    brkTag.textContent = st === 'open' ? 'OPEN' : st === 'half' ? 'HALF-OPEN' : 'CLOSED';
    brkTag.style.color = col; brkTag.style.borderColor = col; brkTag.style.opacity = v;
    brkTag.style.left = (brk.m.x + 40) + 'px'; brkTag.style.top = (brk.m.y - 16) + 'px';
  }
  DOT.forEach(d => placeDot(d, t));
  if (mBox && beat.metric) {
    const m = inBeats ? beat.metric : TL[0].prevMetric || beat.metric;
    const from = inBeats && beat.prevMetric ? beat.prevMetric.value : m.value;
    mVal.textContent = tweenValue(from, m.value, ease(local / .8));
    mVal.style.color = TONE[inBeats ? m.tone : 'ok'];
    mBox.style.borderColor = inBeats && m.tone !== 'ok' ? TONE[m.tone] : 'var(--line)';
  }
  if (phone && beat.outcome) {
    const o = inBeats ? beat.outcome : { value: '', note: '', tone: 'ok', alt: false };
    const prev = bi > 0 ? TL[bi - 1].outcome : null;
    const changed = !prev || prev.value !== o.value;
    const pop = changed && inBeats ? ease(local / .35) : 1;
    chip.textContent = o.value; chip.style.display = o.value ? '' : 'none';
    chip.style.color = TONE[o.tone]; chip.style.borderColor = TONE[o.tone];
    chip.style.transform = 'scale(' + (.8 + .2 * pop) + ')'; chip.style.opacity = pop;
    note.textContent = o.note || '';
    route.style.background = o.tone === 'ok' ? 'var(--ok)' : 'linear-gradient(var(--ok) 0 45%,' + TONE[o.tone] + ' 45% 100%)';
    alt.style.opacity = o.alt ? ease(local / .5) : 0;
  }
  if (t < TTAKE) {
    const out = beat.end - t;
    const v = inBeats ? Math.min(ease(local / .35), bi === TL.length - 1 ? 1 : ease(out / .25)) : 0;
    capTxt.innerHTML = beat.captionHtml; capTxt.style.color = TONE[beat.tone];
    cap.style.opacity = v; cap.style.transform = 'translateY(' + (1 - v) * 10 + 'px)';
    [...pips.children].forEach((p, i) => p.className = i < bi ? 'done' : i === bi ? 'on' : '');
  } else {
    const v = ease(fade(t, TTAKE, .4));
    capTxt.innerHTML = window.__TAKE; capTxt.style.color = 'var(--info)'; cap.style.opacity = v; cap.style.transform = 'none';
    [...pips.children].forEach(p => p.className = 'done');
  }
  const iv = document.getElementById('interview');
  if (iv) { const g = t >= TTAKE ? Math.sin(clamp((t - TTAKE) / 1.2) * Math.PI) : 0; iv.style.boxShadow = '0 0 0 ' + (g * 8) + 'px rgba(225,29,72,.25)'; }
  document.querySelector('.prog').style.transform = 'scaleX(' + clamp(t / TOTAL) + ')';
};
window.seek = (ms) => window.render(ms / 1000);
window.render(0);
`;

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#F1F4F9;--card:#FFFFFF;--line:#DCE3EE;--ink:#1B2433;--mute:#64748B;--accent:#2563EB;--red:#E11D48;
    --ok:#16A34A;--warn:#D97706;--bad:#DC2626;--info:#7C3AED;--navy:#1E293B}
  html,body{background:var(--bg);color:var(--ink);font-family:-apple-system,"SF Pro Display","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  b{color:inherit;font-weight:800}
  code{font-family:"SF Mono",Menlo,monospace;background:#EEF2FF;color:var(--accent);padding:1px 8px;border-radius:6px;font-size:.88em}
  .frame{position:relative;width:${BOARD_W}px;height:${BOARD_H}px;overflow:hidden;background:var(--bg)}
  .content{position:absolute;left:44px;right:44px;top:40px;height:186px;overflow:hidden}
  .topbar{width:72px;height:9px;border-radius:5px;background:var(--red)}
  .hrow{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-top:18px}
  h1{font-size:50px;line-height:1.08;font-weight:800;letter-spacing:-.01em;text-transform:uppercase;text-wrap:balance}
  h1 b{color:var(--red)}
  .who{flex:none;display:flex;align-items:center;gap:12px;background:var(--card);border:2px solid var(--line);border-radius:99px;padding:8px 22px 8px 8px}
  .av{width:50px;height:50px;border-radius:50%;background:var(--accent);color:#fff;font-weight:800;font-size:21px;display:flex;align-items:center;justify-content:center}
  .who .n{font-weight:800;font-size:22px;line-height:1.1} .who .r{font-size:17px;color:var(--mute)}
  .sub{font-size:25px;color:var(--mute);margin-top:12px;line-height:1.3}
  .case{display:inline-block;font:700 17px/1 "SF Mono",Menlo,monospace;letter-spacing:.08em;color:var(--red);margin-right:10px}
  .stage{position:absolute;left:44px;right:44px;top:236px;height:660px;background:var(--card);border:2px solid var(--line);border-radius:26px;box-shadow:0 8px 30px rgba(15,23,42,.06)}
  #net{position:absolute;inset:0;width:${BOARD_W}px;height:${BOARD_H}px;overflow:visible}
  .edge{stroke:#93A6C2;stroke-width:5;stroke-linecap:round;stroke-dasharray:10 9}
  .burst{fill:none;stroke-width:4}
  .brk-ring{fill:#fff;stroke-width:4} .brk-pin{fill:var(--ink)} .brk-lever{stroke-width:6;stroke-linecap:round}
  #brktag{position:absolute;font:800 17px/1 "SF Mono",Menlo,monospace;letter-spacing:.1em;padding:7px 10px;border:2px solid;border-radius:10px;background:#fff}
  #brktag:empty{display:none}
  #nodes{position:absolute;inset:0}
  .node{position:absolute;width:210px;height:96px;border-radius:20px;background:#F8FAFD;border:2.5px solid #BFD0EA;display:flex;align-items:center;gap:12px;padding:0 14px;opacity:0}
  .node .ic{flex:none;width:44px;height:44px;padding:9px;border-radius:12px;background:#E8F0FE;stroke:var(--accent);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .nt{min-width:0;flex:1}
  .nl{font-size:23px;font-weight:800;line-height:1.1}
  .ns{font-size:16px;color:var(--mute);margin-top:3px;line-height:1.15}
  .gauge{height:9px;border-radius:5px;background:#E5EAF2;overflow:hidden;margin-top:7px} .gauge i{display:block;height:100%;width:0;border-radius:5px}
  .node[data-status=slow]{border-color:var(--warn);background:#FFF8EB} .node[data-status=slow] .ic{background:#FDECC8;stroke:var(--warn)}
  .node[data-status=down]{border-color:var(--bad);background:#FEF0F0} .node[data-status=down] .ic{background:#FBD5D5;stroke:var(--bad)}
  .ntag{position:absolute;top:-14px;right:-10px;font:800 15px/1 "SF Mono",Menlo,monospace;letter-spacing:.08em;padding:6px 8px;border-radius:8px;color:#fff}
  .ntag:empty{display:none} .node[data-status=slow] .ntag{background:var(--warn)} .node[data-status=down] .ntag{background:var(--bad)}
  #metric{position:absolute;left:70px;top:262px;width:270px;background:#fff;border:2.5px solid var(--line);border-radius:16px;padding:12px 18px}
  #metric .ml{font-size:17px;color:var(--mute)} #mval{font-size:44px;font-weight:800;line-height:1.1;letter-spacing:-.01em} #metric .mn{font-size:16px;color:var(--mute)}
  #phone{position:absolute;right:76px;top:270px;width:236px;height:430px;border:5px solid var(--ink);border-radius:34px;background:#fff;padding:16px 14px}
  #phone .spk{width:64px;height:6px;border-radius:3px;background:var(--ink);margin:0 auto 14px}
  #phone .scr{height:250px;border-radius:14px;background:#F4F7FB;border:1.5px solid var(--line);position:relative}
  #route{position:absolute;left:84px;top:26px;width:9px;height:196px;border-radius:5px;background:var(--ok)}
  #alt{position:absolute;left:128px;top:26px;width:0;height:196px;border-left:5px dashed var(--ok);opacity:0}
  #alt span{position:absolute;left:8px;top:80px;font-size:16px;font-weight:700;color:var(--ok)}
  #chip{display:block;margin:14px auto 0;width:max-content;max-width:100%;border:2.5px solid;border-radius:99px;padding:6px 14px;font-size:19px;font-weight:800;text-align:center;background:#fff}
  #note{font-size:15px;color:var(--mute);text-align:center;margin-top:8px;line-height:1.25}
  .plabel{position:absolute;right:76px;width:236px;top:712px;text-align:center;font-size:18px;font-weight:700;color:var(--mute)}
  #cap{position:absolute;left:70px;right:70px;top:780px;text-align:center;opacity:0}
  #captxt{font-size:31px;font-weight:800;line-height:1.2;text-wrap:balance}
  #pips{display:flex;gap:8px;justify-content:center;margin-top:14px}
  #pips span{width:28px;height:6px;border-radius:3px;background:var(--line)} #pips span.done{background:#9DB2D3} #pips span.on{background:var(--accent)}
  .lower{position:absolute;left:44px;right:44px;top:922px;bottom:96px;display:flex;flex-direction:column;justify-content:space-between}
  .chips{display:flex;flex-wrap:wrap;gap:10px}
  .chip{border:2.5px solid;border-radius:99px;padding:8px 18px;font-size:21px;font-weight:700;background:#fff}
  .chip.ok{color:var(--ok)} .chip.warn{color:var(--warn)} .chip.bad{color:var(--bad)} .chip.info{color:var(--info)} .chip.accent{color:var(--accent)}
  .pattern{background:#fff;border:2px solid var(--line);border-radius:16px;padding:14px 20px}
  .pattern .pl{font-size:17px;color:var(--mute);margin-bottom:4px} .pattern .pt{font-size:22px;font-weight:700;line-height:1.3}
  #interview{background:var(--navy);color:#fff;border-radius:18px;padding:22px 26px}
  #interview .il{font:700 16px/1 "SF Mono",Menlo,monospace;letter-spacing:.14em;color:#94A3B8;margin-bottom:10px}
  #interview .iq{font-size:30px;font-weight:800;line-height:1.25}
  .foot{position:absolute;left:44px;right:44px;bottom:30px;padding-top:16px;border-top:2px solid var(--line);display:flex;justify-content:space-between;font-size:21px;font-weight:700}
  .foot .r{color:var(--red)}
  .prog{position:absolute;left:0;bottom:0;height:6px;width:100%;background:var(--red);transform-origin:left;transform:scaleX(0)}
`;

export function boardAnimationHtml(raw, { esc, rich, handle, role, openTo }) {
  const plan = planBoard(raw);
  const { spec, tTake, total, warnings, legend } = plan;
  const timeline = plan.timeline.map((b) => ({ ...b, captionHtml: rich(b.caption) }));
  const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  // Stage area for the diagram: leave room for the metric box (top-left) and the phone (right).
  const box = { x0: 70, x1: spec.outcome ? 740 : 1010, y0: spec.metric ? 400 : 270, y1: 760 };
  const initials = String(handle).split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const interview = spec.interview || spec.takeaway || '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
  <div class="frame">
    <div class="content">
      <div class="topbar"></div>
      <div class="hrow"><h1>${rich(spec.title)}</h1>
        <div class="who"><div class="av">${esc(initials)}</div><div><div class="n">${esc(handle)}</div><div class="r">${esc(role)}</div></div></div></div>
      <div class="sub">${spec.badge ? `<span class="case">${esc(spec.badge)}</span>` : ''}${rich(spec.subtitle || '')}</div>
    </div>
    <div class="stage" data-in="0.15"></div>
    <svg id="net" viewBox="0 0 ${BOARD_W} ${BOARD_H}"></svg><div id="nodes"></div><div id="brktag"></div>
    ${spec.metric ? `<div id="metric" data-in="0.35"><div class="ml">${esc(spec.metric.label || 'live')}</div><div id="mval">${esc(String(spec.metric.normal ?? ''))}</div>${spec.metric.normal !== undefined ? `<div class="mn">normal: ${esc(String(spec.metric.normal))}</div>` : ''}</div>` : ''}
    ${spec.outcome ? `<div id="phone" data-in="0.45"><div class="spk"></div><div class="scr"><div id="route"></div><div id="alt"><span>alt</span></div></div><div id="chip"></div><div id="note"></div></div>
      <div class="plabel" data-in="0.45">${esc(spec.outcome.label || 'your phone')}</div>` : ''}
    <div id="cap"><div id="captxt"></div><div id="pips"></div></div>
    <div class="lower">
      ${legend.length ? `<div class="chips" data-in="0.6">${legend.map((l) => `<span class="chip ${esc(l.tone || 'accent')}">${esc(l.text)}</span>`).join('')}</div>` : ''}
      ${spec.pattern ? `<div class="pattern" data-in="0.7"><div class="pl">the same pattern everywhere:</div><div class="pt">${rich(spec.pattern)}</div></div>` : ''}
      ${interview ? `<div id="interview" data-in="0.8"><div class="il">THE INTERVIEW LINE</div><div class="iq">“${rich(interview)}”</div></div>` : ''}
    </div>
    <div class="foot"><div>${esc(handle)}${role ? ` &nbsp;|&nbsp; ${esc(role)}` : ''}</div><div class="r">${esc(openTo || '')}</div></div>
    <div class="prog"></div>
  </div>
  <script>window.__SPEC=${json(spec)};window.__TL=${json(timeline)};window.__RUNS=${json(flowRuns(timeline))};window.__TTAKE=${tTake};window.__TOTAL=${total};
  window.__BOX=${json(box)};window.__ICONS=${json(ICONS)};window.__TAKE=${json(rich(spec.takeaway || ''))};</script>
  <script>${RUNTIME}</script></body></html>`;
  return { html, total, tTake, warnings };
}
