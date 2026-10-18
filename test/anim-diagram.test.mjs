import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INTRO, flowRuns, planDiagram } from '../lib/anim-diagram.mjs';

const spec = {
  nodes: [{ id: 'a', label: 'Users', at: [0, 0] }, { id: 'b', label: 'API', at: [0, 1] }],
  edges: [{ from: 'a', to: 'b', breaker: true }],
  beats: [
    { caption: 'one', dur: 2, flows: [{ from: 'a', to: 'b', kind: 'slow' }], nodes: { b: { status: 'slow', load: 0.5 } } },
    { caption: 'two', dur: 2, flows: [{ from: 'a', to: 'b', kind: 'slow' }], breaker: 'open' },
    { caption: 'three', dur: 2, flows: [{ from: 'b', to: 'a', kind: 'ok' }] },
  ],
};

test('beats are laid out back to back after the intro, with state carried forward', () => {
  const { timeline, tTake, total, warnings } = planDiagram(spec);
  assert.deepEqual(warnings, []);
  assert.equal(timeline[0].start, INTRO);
  assert.equal(timeline[2].end, INTRO + 6);
  assert.equal(timeline[2].status.b, 'slow');
  assert.equal(timeline[1].load.b, 0.5);
  assert.equal(timeline[2].breaker, 'open');
  assert.ok(total > tTake && tTake > timeline[2].end);
});

test('identical flows in consecutive beats merge into one run', () => {
  const runs = flowRuns(planDiagram(spec).timeline);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].start, INTRO);
  assert.equal(runs[0].end, INTRO + 4);
});

test('flows without an edge and unknown nodes are dropped with a warning', () => {
  const bad = { ...spec, beats: [...spec.beats, { caption: 'x', flows: [{ from: 'a', to: 'zz' }], nodes: { zz: { status: 'down' } } }] };
  const { timeline, warnings } = planDiagram(bad);
  assert.equal(timeline[3].flows.length, 0);
  assert.equal(warnings.length, 2);
});

import { lintDiagram } from '../lib/render.mjs';

test('LLD diagrams must be class diagrams with an implements arrow', () => {
  assert.equal(lintDiagram({ style: 'lld', mermaid: 'flowchart TD\n A --> B' }).length, 2);
  assert.deepEqual(lintDiagram({ style: 'lld', mermaid: 'classDiagram\n  class Observer {\n    <<interface>>\n    +update(Order)\n  }\n  Observer <|.. Email' }), []);
});

test('HLD diagrams need an architecture, not a chain or mermaid', () => {
  assert.match(lintDiagram({ style: 'hld', mermaid: 'flowchart TD\n A --> B' })[0], /nodes/);
  const chain = { style: 'hld', nodes: ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, label: id, kind: i ? 'service' : 'db', at: [0, i] })),
    edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']].map(([from, to]) => ({ from, to })) };
  assert.ok(lintDiagram(chain).some((w) => /single chain/.test(w)));
  chain.edges.push({ from: 'b', to: 'e' });
  assert.deepEqual(lintDiagram(chain), []);
});
