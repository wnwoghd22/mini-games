const test = require('node:test');
const assert = require('node:assert');

require('../js/config.js');
require('../js/sim.js');
const { sim, config } = globalThis.GK;
const LAP = config.SECONDS_PER_LAP;

// dt 상한을 지키며 여러 프레임으로 나눠 진행
function run(state, seconds) {
  const step = 0.05;
  for (let t = 0; t < seconds - 1e-9; t += step) sim.tick(state, Math.min(step, seconds - t));
}

test('반죽은 빈 칸에만 부을 수 있다', () => {
  const s = sim.newState(1);
  assert.strictEqual(sim.pourBatter(s, 0), true);
  assert.strictEqual(s.slots[0].phase, 'a');
  assert.strictEqual(sim.pourBatter(s, 0), false);
});

test('보온 모드에서는 게이지가 멈춘다', () => {
  const s = sim.newState(1);
  sim.pourBatter(s, 0);
  run(s, LAP * 3);
  assert.strictEqual(s.slots[0].p, 0);
  assert.strictEqual(s.slots[0].phase, 'a');
});

test('조리 모드: 녹색 → 노란색 → 탐', () => {
  const s = sim.newState(1);
  sim.pourBatter(s, 0);
  sim.toggleMode(s);
  assert.strictEqual(s.mode, 'cook');

  run(s, LAP * 0.5);
  assert.strictEqual(sim.gaugeZone(s.slots[0].p), 'green');

  run(s, LAP * 1.0); // 누적 1.5바퀴
  assert.strictEqual(sim.gaugeZone(s.slots[0].p), 'yellow');
  assert.strictEqual(s.slots[0].phase, 'a');

  run(s, LAP * 0.6); // 누적 2.1바퀴
  assert.strictEqual(s.slots[0].phase, 'burnt');
  assert.strictEqual(s.slots[0].p, sim.BURN_AT);
});

test('조리 중 보온으로 바꾸면 그 자리에서 멈춘다', () => {
  const s = sim.newState(1);
  sim.pourBatter(s, 0);
  sim.toggleMode(s);
  run(s, LAP * 0.5);
  const p = s.slots[0].p;
  sim.toggleMode(s);
  run(s, LAP * 2);
  assert.strictEqual(s.slots[0].p, p);
});

test('탄 빵은 버리면 빈 칸이 된다', () => {
  const s = sim.newState(1);
  sim.pourBatter(s, 0);
  sim.toggleMode(s);
  run(s, LAP * 2.5);
  assert.strictEqual(sim.discard(s, 0), true);
  assert.strictEqual(s.slots[0].phase, 'empty');
  assert.strictEqual(sim.discard(s, 0), false);
});

// 반죽 → (조리 seconds) → 결과 슬롯
function cooked(seconds) {
  const s = sim.newState(1);
  sim.pourBatter(s, 0);
  sim.toggleMode(s);
  run(s, seconds);
  return s;
}

test('속은 A면에서 한 번만 넣을 수 있다', () => {
  const s = sim.newState(1);
  assert.strictEqual(sim.addFilling(s, 0, 'red-bean'), false); // 빈 칸
  sim.pourBatter(s, 0);
  assert.strictEqual(sim.addFilling(s, 0, 'red-bean'), true);
  assert.strictEqual(sim.addFilling(s, 0, 'custard'), false);
  assert.strictEqual(s.slots[0].filling, 'red-bean');
});

test('속 없이는 뒤집을 수 없다', () => {
  const s = cooked(LAP * 1.2);
  assert.strictEqual(sim.flip(s, 0), false);
  assert.strictEqual(s.slots[0].phase, 'a');
});

test('뒤집은 뒤에는 속을 넣을 수 없고 B면 게이지가 0부터 찬다', () => {
  const s = cooked(LAP * 1.2);
  sim.addFilling(s, 0, 'red-bean');
  assert.strictEqual(sim.flip(s, 0), true);
  assert.strictEqual(s.slots[0].phase, 'b');
  assert.strictEqual(s.slots[0].p, 0);
  assert.strictEqual(s.slots[0].defect, null);
  assert.strictEqual(sim.addFilling(s, 0, 'custard'), false);
  assert.strictEqual(sim.flip(s, 0), false);
});

test('A면이 덜 익은 채 뒤집으면 불량, 꺼낼 수 없다', () => {
  const s = cooked(LAP * 0.5);
  sim.addFilling(s, 0, 'red-bean');
  sim.flip(s, 0);
  assert.strictEqual(s.slots[0].defect, 'undercooked');
  run(s, LAP * 1.2);
  assert.strictEqual(sim.isBad(s.slots[0]), true);
  assert.strictEqual(sim.take(s, 0), -1);
  assert.strictEqual(sim.discard(s, 0), true);
});

test('B면이 다 익어야 꺼낼 수 있고, 꺼낸 빵은 예비 칸에 들어간다', () => {
  const s = cooked(LAP * 1.5); // A면 노란 구간에서 뒤집어도 정상
  sim.addFilling(s, 0, 'custard');
  sim.flip(s, 0);
  run(s, LAP * 0.5);
  assert.strictEqual(sim.take(s, 0), -1);
  run(s, LAP * 0.6);
  assert.strictEqual(sim.take(s, 0), 0);
  assert.deepStrictEqual(s.reserve[0], { filling: 'custard' });
  assert.strictEqual(s.slots[0].phase, 'empty');
});

test('B면도 너무 오래 두면 탄다', () => {
  const s = cooked(LAP * 1.1);
  sim.addFilling(s, 0, 'red-bean');
  sim.flip(s, 0);
  run(s, LAP * 2.1);
  assert.strictEqual(s.slots[0].phase, 'burnt');
  assert.strictEqual(sim.take(s, 0), -1);
});

test('A면에서 속을 안 넣고 두면 탄다', () => {
  const s = cooked(LAP * 2.1);
  assert.strictEqual(s.slots[0].phase, 'burnt');
});

test('예비 칸이 가득 차면 꺼낼 수 없고 빵은 불판에 남는다', () => {
  const s = sim.newState(2, 1);
  for (const i of [0, 1]) {
    sim.pourBatter(s, i);
    sim.addFilling(s, i, 'red-bean');
  }
  sim.toggleMode(s);
  run(s, LAP * 1.1);
  sim.flip(s, 0);
  sim.flip(s, 1);
  run(s, LAP * 1.1);
  assert.strictEqual(sim.take(s, 0), 0);
  assert.strictEqual(sim.reserveFull(s), true);
  assert.strictEqual(sim.take(s, 1), -1);
  assert.strictEqual(s.slots[1].phase, 'b');
});

// 다 익은 빵이 n개 있는 불판
function doneGrill(n, filling) {
  const s = sim.newState(n);
  for (let i = 0; i < n; i++) {
    sim.pourBatter(s, i);
    sim.addFilling(s, i, filling || 'red-bean');
  }
  sim.toggleMode(s);
  run(s, LAP * 1.1);
  for (let i = 0; i < n; i++) sim.flip(s, i);
  run(s, LAP * 1.1);
  return s;
}

test('pop: 다 익은 빵만 꺼내고 칸을 비운다', () => {
  const s = doneGrill(1, 'custard');
  assert.deepStrictEqual(sim.pop(s, 0), { filling: 'custard' });
  assert.strictEqual(s.slots[0].phase, 'empty');
  assert.strictEqual(sim.pop(s, 0), null);
});
