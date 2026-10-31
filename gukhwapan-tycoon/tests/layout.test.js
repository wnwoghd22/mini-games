const test = require('node:test');
const assert = require('node:assert');

require('../js/layout.js');
const { layout } = globalThis.GK;
const { PLATES, hexSlots, rowCounts } = layout;

test('반지름 2: 19구, 3-4-5-4-3 (example1)', () => {
  const pts = hexSlots(PLATES.p19.radius, 0);
  assert.strictEqual(pts.length, 19);
  assert.deepStrictEqual(rowCounts(pts), [3, 4, 5, 4, 3]);
});

test('반지름 √7: 31구, 2-5-6-5-6-5-2 (example4)', () => {
  const pts = hexSlots(PLATES.p31.radius, 0);
  assert.strictEqual(pts.length, 31);
  assert.deepStrictEqual(rowCounts(pts), [2, 5, 6, 5, 6, 5, 2]);
});

test('반지름 3: 37구', () => {
  assert.strictEqual(hexSlots(PLATES.p37.radius, 0).length, 37);
});

test('칸끼리 간격은 1 이상 (겹치지 않음)', () => {
  for (const key of Object.keys(PLATES)) {
    const pts = hexSlots(PLATES[key].radius, 0.3);
    for (let a = 0; a < pts.length; a++)
      for (let b = a + 1; b < pts.length; b++)
        assert.ok(Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) > 1 - 1e-6);
  }
});

test('회전해도 칸 수는 같다', () => {
  assert.strictEqual(hexSlots(2, Math.PI / 7).length, 19);
});
