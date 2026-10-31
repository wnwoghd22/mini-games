const test = require('node:test');
const assert = require('node:assert');

require('../js/config.js');
require('../js/input.js');
const { input } = globalThis.GK;

test('스와이프 판정: 위/아래, 짧거나 가로 이동은 무시', () => {
  const r = 40; // 최소 거리 = 40 * SWIPE_RATIO
  assert.strictEqual(input.classifySwipe(0, -40, r), 'up');
  assert.strictEqual(input.classifySwipe(5, 40, r), 'down');
  assert.strictEqual(input.classifySwipe(0, -10, r), null); // 너무 짧음 (탭)
  assert.strictEqual(input.classifySwipe(60, -40, r), null); // 가로가 더 큼
});
