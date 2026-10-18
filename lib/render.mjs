import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { CHROME, ROOT, config } from './config.mjs';
import { diagramAnimationHtml } from './anim-diagram.mjs';
import { hldDiagramHtml, lintHld } from './hld-diagram.mjs';

const W = 1080;
const H = 1350;
const FPS = 30;
const MERMAID_JS = path.join(ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Allow **bold** and `code` inside copy.
const rich = (s = '') => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/\n/g, '<br>');

const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0B1220;--panel:#121C30;--panel2:#162340;--line:#24324D;--ink:#E8EEF8;--mute:#9AAAC4;--accent:#38BDF8;--warm:#FBBF24;--ok:#34D399;--bad:#F87171}
  html,body{background:var(--bg);color:var(--ink);font-family:-apple-system,"SF Pro Display","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  h1,h2,.stake,.lead,.pt{text-wrap:pretty} h1,h2{text-wrap:balance}
  code{font-family:"SF Mono",Menlo,monospace;background:#1B2742;color:var(--accent);padding:2px 10px;border-radius:8px;font-size:.88em}
  b{color:var(--warm);font-weight:700}
  .frame{position:relative;width:${W}px;height:${H}px;overflow:hidden;padding:100px 88px 150px;
    background:radial-gradient(900px 600px at 85% -10%,rgba(56,189,248,.16),transparent 60%),radial-gradient(700px 500px at -10% 110%,rgba(251,191,36,.07),transparent 60%),var(--bg)}
  .grid{position:absolute;inset:0;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
    background-size:54px 54px;opacity:.16;pointer-events:none}
  .content{position:relative;height:100%;display:flex;flex-direction:column}
  .foot{position:absolute;left:88px;right:88px;bottom:58px;display:flex;justify-content:space-between;align-items:center;color:var(--mute);font-size:28px}
  .foot .h{display:flex;align-items:center;gap:14px;font-weight:600}
  .foot .dot{width:14px;height:14px;border-radius:50%;background:var(--accent)}
  .kicker{font:600 26px/1 "SF Mono",Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
  .badge{display:inline-flex;align-items:center;gap:14px;align-self:flex-start;background:rgba(251,191,36,.12);border:2px solid rgba(251,191,36,.45);color:#FDE68A;
    border-radius:99px;padding:10px 22px;font:600 26px/1.1 -apple-system,Helvetica,Arial,sans-serif}
  .badge .tag{font:700 20px/1 "SF Mono",Menlo,monospace;letter-spacing:.14em;color:var(--warm)}
  .stat{display:flex;align-items:baseline;gap:22px}
  .stat .n{font-size:150px;font-weight:800;letter-spacing:-.04em;line-height:1;color:var(--warm)}
  .stat .l{font-size:36px;color:var(--mute);line-height:1.25;max-width:520px}
  .bar{position:absolute;left:0;top:0;height:10px;background:linear-gradient(90deg,var(--accent),#7DD3FC)}
`;

const foot = (right = '') => `<div class="foot"><div class="h"><span class="dot"></span>${esc(config.handle)}</div><div>${esc(right)}</div></div>`;
const badge = (b) => (b ? `<div class="badge"><span class="tag">CASE STUDY</span>${esc(b)}</div>` : '');
const stat = (s) => (s?.value ? `<div class="stat"><span class="n">${esc(s.value)}</span><span class="l">${rich(s.label || '')}</span></div>` : '');

// Shrinks a frame's content (CSS zoom) until it fits. Returns per-frame { zoom, overflow }.
const AUTOFIT = `(() => {
  return [...document.querySelectorAll('.frame')].map((f, i) => {
    const c = f.querySelector('.content'); let z = 1;
    const over = () => c.scrollHeight > c.clientHeight + 2 || c.scrollWidth > c.clientWidth + 2;
    while (over() && z > 0.7) { z = +(z - 0.04).toFixed(2); c.style.zoom = z; }
    return { slide: i + 1, zoom: z, overflow: over() };
  });
})()`;

function fitWarnings(fits, label) {
  const w = [];
  for (const f of fits) {
    if (f.overflow) w.push(`${label} ${f.slide}: text still overflows after shrinking. Cut words.`);
    else if (f.zoom < 0.85) w.push(`${label} ${f.slide}: text had to shrink to ${Math.round(f.zoom * 100)}% to fit. Too dense for a phone, so cut words.`);
  }
  return w;
}

async function withPage(fn) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

const MERMAID_INIT = `mermaid.initialize({startOnLoad:false,theme:'base',flowchart:{htmlLabels:false,padding:20,nodeSpacing:46,rankSpacing:56},sequence:{useMaxWidth:false,actorMargin:60},themeVariables:{
  background:'transparent',primaryColor:'#16233D',primaryTextColor:'#E8EEF8',primaryBorderColor:'#38BDF8',
  lineColor:'#7DD3FC',secondaryColor:'#1F2A44',tertiaryColor:'#121C30',fontSize:'22px',edgeLabelBackground:'#0B1220',
  fontFamily:'-apple-system,Helvetica,Arial,sans-serif',noteBkgColor:'#3B2F10',noteTextColor:'#FDE68A',noteBorderColor:'#FBBF24',
  clusterBkg:'#0F1A2E',clusterBorder:'#FBBF24',titleColor:'#FDE68A',
  actorBkg:'#16233D',actorBorder:'#38BDF8',actorTextColor:'#E8EEF8',signalColor:'#7DD3FC',signalTextColor:'#E8EEF8'}});`;
// Scale each rendered diagram to fill its box; record the effective scale for readability checks.
const MERMAID_FIT = `window.__scales=[];document.querySelectorAll('.mbox').forEach(box=>{const svg=box.querySelector('svg');if(!svg)return;
  const vb=svg.viewBox.baseVal,bw=box.clientWidth-60,bh=box.clientHeight-60;const k=Math.min(bw/vb.width,bh/vb.height,2.6);
  svg.style.maxWidth='none';svg.setAttribute('width',vb.width*k);svg.setAttribute('height',vb.height*k);window.__scales.push(k)});`;

async function runMermaid(page) {
  await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 25000 });
  const err = await page.evaluate(() => document.body.dataset.error);
  if (err) throw new Error(`Mermaid failed: ${err}`);
  const scales = await page.evaluate(() => window.__scales || []);
  return scales.map((k, i) => (k < 0.85 ? `diagram ${i + 1}: labels render at ~${Math.round(22 * k)}px, too small on a phone. Use fewer nodes or shorter labels.` : null)).filter(Boolean);
}

/* ---------------------------------- Carousel ---------------------------------- */

function slideHtml(s, i, n) {
  const count = `${i + 1}/${n}`;
  let inner = '';
  switch (s.type) {
    case 'cover':
      inner = `<div class="kicker">${esc(s.kicker || 'System Design')}</div>
        ${badge(s.badge)}
        <h1 class="cover">${rich(s.title)}</h1>
        <p class="lead">${rich(s.subtitle || '')}</p>
        <div class="swipe">Swipe →</div>`;
      break;
    case 'story':
      inner = `<div class="kicker">${esc(s.kicker || 'What happened')}</div>${badge(s.badge)}
        ${stat(s.stat)}
        <p class="story">${rich(s.text)}</p>`;
      break;
    case 'stake':
      inner = `<div class="kicker">${esc(s.kicker || 'Why it matters')}</div><p class="stake">${rich(s.text || s.title)}</p>`;
      break;
    case 'compare': {
      const col = (c, cls, mark) => `<div class="col ${cls}"><div class="ch">${esc(c?.label || '')}</div>
        ${(c?.items || []).map((it) => `<div class="ci"><span class="mk">${mark}</span><span>${rich(it)}</span></div>`).join('')}</div>`;
      inner = `<div class="kicker">${esc(s.kicker || 'Compare')}</div><h2>${rich(s.title)}</h2>
        <div class="cmp">${col(s.left, 'bad', '✕')}${col(s.right, 'good', '✓')}</div>`;
      break;
    }
    case 'diagram':
      inner = `<div class="kicker">${esc(s.kicker || 'The picture')}</div><h2 class="dh">${rich(s.title)}</h2>
        <div class="mbox"><pre class="mermaid">${esc(s.mermaid)}</pre></div>${s.caption ? `<p class="cap">${rich(s.caption)}</p>` : ''}`;
      break;
    case 'recap':
      inner = `<div class="kicker">Recap</div><h2>${rich(s.title || 'The whole thing')}</h2>
        <ol class="recap">${(s.items || []).map((it) => `<li>${rich(it)}</li>`).join('')}</ol>`;
      break;
    case 'cta':
      inner = `<div class="kicker">Your turn</div><h2 class="ctah">${rich(s.title)}</h2><p class="lead">${rich(s.body || '')}</p>`;
      break;
    default: // point
      inner = `<div class="row1"><span class="big">${esc(s.num ?? '')}</span><div class="kicker">${esc(s.kicker || '')}</div></div>
        <h2>${rich(s.title)}</h2>
        <p class="pt">${rich(s.body || '')}</p>
        ${s.code ? `<pre>${esc(s.code)}</pre>` : ''}
        ${s.analogy ? `<div class="ana"><span class="at">THINK OF IT LIKE</span>${rich(s.analogy)}</div>` : ''}`;
  }
  const center = s.type === 'diagram' ? '' : ' center';
  return `<section class="frame"><div class="grid"></div><div class="bar" style="width:${((i + 1) / n) * 100}%"></div>
    <div class="content${center}">${inner}</div>${foot(count)}</section>`;
}

function carouselHtml(spec) {
  const slides = spec.slides || [];
  let stepNo = 0;
  const numbered = slides.map((s) => (s.type === 'point' || !s.type ? { ...s, num: s.num ?? ++stepNo } : s));
  const body = numbered.map((s, i) => slideHtml(s, i, slides.length)).join('\n');
  const hasMermaid = slides.some((s) => s.type === 'diagram');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    @page{size:${W}px ${H}px;margin:0}
    section{page-break-after:always}
    .content{gap:36px}
    .content.center{justify-content:center}
    h1.cover{font-size:108px;line-height:1.03;font-weight:800;letter-spacing:-.03em}
    h2{font-size:72px;line-height:1.08;font-weight:800;letter-spacing:-.02em}
    h2.dh{font-size:60px}
    .ctah{font-size:80px}
    .lead{font-size:40px;line-height:1.4;color:var(--mute)}
    .story{font-size:46px;line-height:1.4;font-weight:500;color:#DCE5F3}
    .stake{font-size:62px;line-height:1.25;font-weight:700}
    .pt{font-size:42px;line-height:1.45;color:#C9D4E8}
    .row1{display:flex;align-items:center;gap:26px}
    .big{font-size:120px;font-weight:800;line-height:.9;color:transparent;-webkit-text-stroke:3px var(--accent)}
    pre{font:30px/1.5 "SF Mono",Menlo,monospace;background:var(--panel);border:2px solid var(--line);border-radius:24px;padding:30px 34px;white-space:pre-wrap;color:#CFE8FF}
    .ana{background:rgba(56,189,248,.08);border-left:8px solid var(--accent);border-radius:16px;padding:24px 30px;font-size:36px;line-height:1.4;color:#D6E9FA}
    .ana .at{display:block;font:700 20px/1 "SF Mono",Menlo,monospace;letter-spacing:.14em;color:var(--accent);margin-bottom:12px}
    .cmp{display:grid;grid-template-columns:1fr 1fr;gap:24px}
    .col{border-radius:26px;padding:30px;display:flex;flex-direction:column;gap:20px;border:2px solid var(--line);background:var(--panel)}
    .col.bad{border-color:rgba(248,113,113,.45);background:rgba(248,113,113,.06)}
    .col.good{border-color:rgba(52,211,153,.5);background:rgba(52,211,153,.07)}
    .ch{font-size:34px;font-weight:800}
    .col.bad .ch{color:var(--bad)} .col.good .ch{color:var(--ok)}
    .ci{display:flex;gap:14px;font-size:32px;line-height:1.35}
    .col.bad .mk{color:var(--bad);font-weight:800} .col.good .mk{color:var(--ok);font-weight:800}
    .mbox{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:rgba(18,28,48,.75);border:2px solid var(--line);border-radius:28px;padding:30px}
    .cap{font-size:32px;color:var(--mute);line-height:1.4}
    .recap{list-style:none;counter-reset:r;display:flex;flex-direction:column;gap:20px}
    .recap li{counter-increment:r;font-size:37px;line-height:1.35;padding:22px 28px 22px 100px;position:relative;background:var(--panel);border:2px solid var(--line);border-radius:22px}
    .recap li::before{content:counter(r);position:absolute;left:28px;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;background:var(--accent);color:#06101F;font-weight:800;font-size:28px;display:flex;align-items:center;justify-content:center}
    .swipe{font-size:34px;color:var(--accent);font-weight:700}
  </style>${hasMermaid ? `<script src="file://${MERMAID_JS}"></script>` : ''}</head><body>${body}
  <script>${hasMermaid ? `${MERMAID_INIT}mermaid.run({querySelector:'.mermaid'}).then(()=>{${MERMAID_FIT}document.body.dataset.ready='1'}).catch(e=>{document.body.dataset.error=String(e)});` : "document.body.dataset.ready='1';"}</script>
  </body></html>`;
}

const wc = (t = '') => String(t).replace(/[*`]/g, '').split(/\s+/).filter(Boolean).length;
// Copy limits that keep slides readable on a phone, even when the text technically fits.
function lintSlides(slides) {
  const w = [];
  slides.forEach((s, i) => {
    const n = i + 1;
    if (s.type === 'cover' && wc(s.title) > 7) w.push(`slide ${n} (cover): title is ${wc(s.title)} words, keep it to 6 or fewer.`);
    if (['point', 'diagram', 'compare', 'recap'].includes(s.type || 'point') && wc(s.title) > 8) w.push(`slide ${n}: headline is ${wc(s.title)} words, keep it to 7 or fewer.`);
    if (wc(s.body) > 30) w.push(`slide ${n}: body is ${wc(s.body)} words, keep it to 25 or fewer.`);
    if (wc(s.text) > 40) w.push(`slide ${n}: text is ${wc(s.text)} words, keep it to 35 or fewer.`);
    if (s.code && s.code.split('\n').length > 7) w.push(`slide ${n}: code block has more than 7 lines.`);
    for (const side of ['left', 'right']) if ((s[side]?.items || []).some((it) => wc(it) > 9)) w.push(`slide ${n}: a compare item is over 8 words.`);
    if ((s.items || []).length > 6) w.push(`slide ${n}: recap has ${(s.items || []).length} items, keep it to 6 or fewer.`);
  });
  return w;
}

export async function renderCarousel(spec, outDir) {
  const htmlPath = path.join(outDir, 'carousel.html');
  fs.writeFileSync(htmlPath, carouselHtml(spec));
  for (const f of fs.readdirSync(outDir)) if (/^slide-\d+\.png$/.test(f)) fs.rmSync(path.join(outDir, f));
  const media = [{ kind: 'pdf', file: 'carousel.pdf', label: `Carousel PDF (${spec.slides.length} slides)` }];
  const warnings = [];
  await withPage(async (page) => {
    await page.goto(`file://${htmlPath}`);
    warnings.push(...await runMermaid(page));
    warnings.push(...fitWarnings(await page.evaluate(AUTOFIT), 'slide'));
    await page.pdf({ path: path.join(outDir, 'carousel.pdf'), width: `${W}px`, height: `${H}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const sections = page.locator('section');
    const n = await sections.count();
    for (let i = 0; i < n; i++) {
      const file = `slide-${String(i + 1).padStart(2, '0')}.png`;
      await sections.nth(i).screenshot({ path: path.join(outDir, file) });
      media.push({ kind: 'slide', file, label: `Slide ${i + 1}`, preview: i === 0 });
    }
  });
  if (spec.slides.length < 6 || spec.slides.length > 12) warnings.push(`carousel has ${spec.slides.length} slides; aim for 7-10.`);
  warnings.push(...lintSlides(spec.slides));
  return { media, warnings, qa: media.filter((m) => m.kind === 'slide').map((m) => m.file) };
}

/* ---------------------------------- Diagram ---------------------------------- */

// HLD = architecture snapshot (components, datastores, branches). LLD = UML class diagram.
export function diagramStyle(spec) {
  const st = String(spec.style || spec.kicker || '').toLowerCase();
  return st === 'hld' || st === 'lld' ? st : 'flow';
}

export function lintDiagram(spec) {
  const w = [];
  const src = String(spec.mermaid || '').trim();
  const style = diagramStyle(spec);
  if (style === 'lld') {
    if (!/^classDiagram\b/.test(src)) w.push('LLD diagram must be a Mermaid classDiagram (classes, interfaces, methods), not a flowchart.');
    const classes = new Set([...src.matchAll(/\bclass\s+(\w+)/g)].map((m) => m[1]));
    for (const m of src.matchAll(/(\w+)\s*(?:<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|o--|-->|\.\.>|--|\.\.)\s*(?:"[^"]*"\s*)?(\w+)/g)) { classes.add(m[1]); classes.add(m[2]); }
    if (classes.size > 6) w.push(`LLD diagram has ${classes.size} classes; keep it to 6 or fewer.`);
    if (!/<\|(--|\.\.)|(--|\.\.)\|>/.test(src)) w.push('LLD diagram has no inheritance/implements arrow (<|-- or <|..). Show the interface and who implements it.');
    for (const [, name, body] of src.matchAll(/class\s+(\w+)\s*\{([^}]*)\}/g)) {
      const members = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('<<'));
      if (members.length > 4) w.push(`LLD class ${name} lists ${members.length} members; keep the 2-4 that matter.`);
    }
  } else if (style === 'hld') {
    if (Array.isArray(spec.nodes)) w.push(...lintHld(spec));
    else w.push('HLD diagram must use "nodes"/"edges" (architecture layout), not a mermaid flowchart.');
  }
  return w;
}

export async function renderDiagram(spec, outDir) {
  const arch = Array.isArray(spec.nodes) && spec.nodes.length > 0;
  const html = arch ? hldDiagramHtml(spec, { css: BASE_CSS, esc, rich, badge, foot }) : `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    .content{gap:26px}
    h1{font-size:66px;line-height:1.08;font-weight:800;letter-spacing:-.02em}
    .mbox{flex:1;display:flex;align-items:center;justify-content:center;background:rgba(18,28,48,.75);border:2px solid var(--line);border-radius:32px;padding:30px;min-height:0}
    .cap{font-size:34px;line-height:1.4;color:var(--mute)}
    .note{font-size:32px;line-height:1.4;color:#FDE68A;border-left:6px solid var(--warm);padding-left:22px}
  </style><script src="file://${MERMAID_JS}"></script></head><body>
  <div class="frame"><div class="grid"></div><div class="content">
    <div class="kicker">${esc(spec.kicker || 'System Design')}</div>
    ${badge(spec.badge)}
    <h1>${rich(spec.title)}</h1>
    ${spec.caption ? `<p class="cap">${rich(spec.caption)}</p>` : ''}
    <div class="mbox"><pre class="mermaid">${esc(spec.mermaid)}</pre></div>
    ${spec.takeaway ? `<p class="note">${rich(spec.takeaway)}</p>` : ''}
  </div>${foot(spec.footer || '')}</div>
  <script>${MERMAID_INIT}mermaid.run({querySelector:'.mermaid'}).then(()=>{${MERMAID_FIT}document.body.dataset.ready='1'}).catch(e=>{document.body.dataset.error=String(e)});</script></body></html>`;
  const htmlPath = path.join(outDir, 'diagram.html');
  fs.writeFileSync(htmlPath, html);
  const warnings = [];
  await withPage(async (page) => {
    await page.goto(`file://${htmlPath}`);
    if (arch) await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 15000 });
    else warnings.push(...await runMermaid(page));
    warnings.push(...fitWarnings(await page.evaluate(AUTOFIT), 'image'));
    await page.screenshot({ path: path.join(outDir, 'diagram.png') });
  });
  warnings.push(...lintDiagram(spec));
  return { media: [{ kind: 'png', file: 'diagram.png', label: 'Diagram image', preview: true }], warnings, qa: ['diagram.png'] };
}

/* --------------------------------- Animation --------------------------------- */

function animationHtml(spec) {
  const steps = (spec.steps || []).slice(0, 4);
  const hasStat = Boolean(spec.stat?.value);
  const t0 = hasStat ? 2.4 : 1.6; // steps start
  const per = 1.45;               // seconds per step
  const tTake = t0 + steps.length * per + 0.3;
  const total = tTake + 2.8;
  const stepsHtml = steps.map((s, i) => {
    const d = t0 + i * per;
    const conn = i < steps.length - 1
      ? `<div class="conn" style="animation-delay:${d + 0.55}s"><span class="pkt" style="animation-delay:${d + 0.8}s"></span></div>` : '';
    return `<div class="step" style="animation-delay:${d}s,${d}s">
        <div class="num">${i + 1}</div>
        <div class="txt"><div class="lbl">${rich(s.label)}</div>${s.detail ? `<div class="det">${rich(s.detail)}</div>` : ''}</div>
      </div>${conn}`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
    .content{gap:0}
    .kicker{opacity:0;animation:fade .5s ease-out .1s both}
    .badge{margin-top:22px;opacity:0;animation:fade .5s ease-out .3s both}
    h1{font-size:68px;line-height:1.06;font-weight:800;letter-spacing:-.02em;margin:22px 0 10px;opacity:0;animation:rise .7s cubic-bezier(.2,.8,.2,1) .35s both}
    .sub{font-size:34px;color:var(--mute);line-height:1.3;opacity:0;animation:fade .6s ease-out .8s both}
    .stat{margin-top:18px;opacity:0;animation:pop .6s cubic-bezier(.2,1.4,.4,1) 1.2s both}
    .stat .n{font-size:110px}
    .flow{margin-top:34px;display:flex;flex-direction:column}
    .step{display:flex;gap:26px;align-items:center;background:var(--panel);border:2px solid var(--line);border-radius:26px;padding:20px 28px;
      opacity:0;animation:slide .6s cubic-bezier(.2,.8,.2,1) both, glow 1.4s ease-out both}
    .num{flex:none;width:62px;height:62px;border-radius:50%;background:var(--accent);color:#06101F;font-weight:800;font-size:31px;display:flex;align-items:center;justify-content:center}
    .lbl{font-size:37px;font-weight:700;line-height:1.2}
    .det{font-size:28px;color:var(--mute);margin-top:6px;line-height:1.35}
    .conn{position:relative;height:28px;width:4px;margin-left:58px;background:var(--line);transform-origin:top;transform:scaleY(0);animation:grow .3s ease-out both}
    .pkt{position:absolute;left:-7px;top:0;width:18px;height:18px;border-radius:50%;background:var(--warm);box-shadow:0 0 18px var(--warm);opacity:0;animation:travel .5s ease-in both}
    .take{margin-top:30px;background:linear-gradient(135deg,#3B2F10,#1E1A0E);border:2px solid var(--warm);border-radius:28px;padding:28px 34px;
      font-size:37px;line-height:1.35;font-weight:600;opacity:0;animation:pop .6s cubic-bezier(.2,1.4,.4,1) ${tTake}s both}
    .take .tk{font:700 22px/1 "SF Mono",Menlo,monospace;letter-spacing:.14em;color:var(--warm);display:block;margin-bottom:12px}
    .prog{position:absolute;left:0;bottom:0;height:8px;width:100%;background:linear-gradient(90deg,var(--accent),var(--warm));transform-origin:left;transform:scaleX(0);animation:progress ${total}s linear 0s both}
    @keyframes fade{from{opacity:0}to{opacity:1}}
    @keyframes rise{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}
    @keyframes slide{from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:none}}
    @keyframes glow{0%{border-color:var(--accent);background:var(--panel2)}100%{border-color:var(--line);background:var(--panel)}}
    @keyframes grow{to{transform:scaleY(1)}}
    @keyframes travel{0%{opacity:1;top:0}90%{opacity:1}100%{opacity:0;top:18px}}
    @keyframes pop{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:none}}
    @keyframes progress{to{transform:scaleX(1)}}
  </style></head><body>
  <div class="frame"><div class="grid"></div><div class="content">
    <div class="kicker">${esc(spec.kicker || 'How it works')}</div>
    ${badge(spec.badge)}
    <h1>${rich(spec.title)}</h1>
    ${spec.subtitle ? `<div class="sub">${rich(spec.subtitle)}</div>` : ''}
    ${stat(spec.stat)}
    <div class="flow">${stepsHtml}</div>
    <div class="take"><span class="tk">TAKEAWAY</span>${rich(spec.takeaway || '')}</div>
  </div>${foot('')}<div class="prog"></div></div>
  <script>
    document.getAnimations().forEach(a=>a.pause());
    window.seek=(ms)=>document.getAnimations().forEach(a=>{a.currentTime=ms});
  </script></body></html>`;
  return { html, total, tTake };
}

function ffmpeg(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.slice(0, 400)}`))));
    if (input) input(p.stdin);
  });
}

export async function renderAnimation(spec, outDir) {
  // Specs with nodes get the animated system diagram; older text-step specs keep the step template.
  const diagram = Array.isArray(spec.nodes) && spec.nodes.length > 0;
  const { html, total, tTake, warnings: planWarnings = [] } = diagram
    ? diagramAnimationHtml(spec, { css: BASE_CSS, esc, rich, badge, foot })
    : animationHtml(spec);
  const htmlPath = path.join(outDir, 'animation.html');
  fs.writeFileSync(htmlPath, html);
  const mp4 = path.join(outDir, 'explainer.mp4');
  const gif = path.join(outDir, 'explainer.gif');
  const frames = Math.ceil(total * FPS);
  const warnings = [...planWarnings];
  const steps = (spec.steps || []).length;
  if (!diagram && steps > 4) warnings.push(`animation has ${steps} steps; only the first 4 are shown. Merge steps.`);
  const qaTimes = [Math.max(1.5, tTake - 2.6), total - 0.1];
  await withPage(async (page) => {
    await page.goto(`file://${htmlPath}`);
    await page.evaluate(() => document.fonts.ready);
    // Fit check on the final state, where everything is visible.
    await page.evaluate((ms) => window.seek(ms), total * 1000);
    warnings.push(...fitWarnings(await page.evaluate(AUTOFIT), 'video frame'));
    let feed;
    const done = ffmpeg(
      ['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', mp4],
      (stdin) => { feed = stdin; },
    );
    for (let i = 0; i < frames; i++) {
      await page.evaluate((ms) => window.seek(ms), (i * 1000) / FPS);
      const buf = await page.screenshot({ type: 'png' });
      if (!feed.write(buf)) await new Promise((r) => feed.once('drain', r));
    }
    feed.end();
    await done;
    for (const [i, t] of qaTimes.entries()) {
      await page.evaluate((ms) => window.seek(ms), t * 1000);
      await page.screenshot({ path: path.join(outDir, `qa-frame-${i + 1}.png`) });
    }
  });
  await ffmpeg(['-i', mp4, '-vf', 'fps=12,scale=540:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', gif]);
  return {
    media: [
      { kind: 'mp4', file: 'explainer.mp4', label: `Explainer video (${total.toFixed(0)}s, upload this)`, preview: true },
      { kind: 'gif', file: 'explainer.gif', label: 'GIF version' },
    ],
    warnings,
    qa: ['qa-frame-1.png', 'qa-frame-2.png'],
  };
}

export async function renderMedia(type, dirIn) {
  const dir = path.resolve(dirIn);
  const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (type === 'carousel') return renderCarousel(read('carousel.json'), dir);
  if (type === 'diagram') return renderDiagram(read('diagram.json'), dir);
  if (type === 'animation') return renderAnimation(read('animation.json'), dir);
  return { media: [], warnings: [], qa: [] };
}
