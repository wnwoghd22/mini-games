const test = require('node:test');
const assert = require('node:assert');

require('../js/config.js');
require('../js/sim.js');
require('../js/customers.js');
const { sim, customers: cs, config } = globalThis.GK;

const bun = (filling) => ({ filling });
const buns = (filling, n) => Array.from({ length: n }, () => bun(filling));
const R = 'red-bean', C = 'custard', P = 'pizza';

// 정해진 값을 차례로 돌려주는 rng
function seq(...vals) {
  let i = 0;
  return () => vals[i++ % vals.length];
}

// 재현 가능한 의사 난수 (LCG)
function lcg(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function cust(order, tray) {
  return { order, patience: 10, maxPatience: 10, tray: tray || [] };
}

// 다 익은 빵이 n칸 깔린 불판
function doneGrill(n, filling) {
  const s = sim.newState(n);
  for (let i = 0; i < n; i++) {
    Object.assign(s.slots[i], { phase: 'b', p: 1.2, pA: 1.1, filling: filling || R });
  }
  return s;
}

test('판정: 정확히 맞으면 성공, 덤 0', () => {
  assert.deepStrictEqual(cs.judgeOrder({ [R]: 2 }, buns(R, 2)), { ok: true, missing: {}, extra: 0 });
});

test('판정: 섞인 주문은 종류별로 모두 채워야 하고, 남는 빵은 종류 무관 덤', () => {
  const order = { [R]: 2, [C]: 1 };
  const short = cs.judgeOrder(order, buns(R, 3));
  assert.deepStrictEqual([short.ok, short.missing], [false, { [C]: 1 }]);
  const j = cs.judgeOrder(order, [bun(C), bun(R), bun(R), bun(P), bun(R)]);
  assert.deepStrictEqual([j.ok, j.extra], [true, 2]);
});

test('손님 생성: 개수 범위, 종류 수 상한, 종류마다 최소 개수', () => {
  const rng = lcg(7);
  for (let n = 0; n < 300; n++) {
    const c = cs.newCustomer(rng, config.FILLINGS, { orderMin: 10, orderMax: 15, kindsMax: 3 });
    const size = cs.orderSize(c.order);
    const kinds = Object.keys(c.order);
    assert.ok(size >= 10 && size <= 15, `size ${size}`);
    assert.ok(kinds.length >= 1 && kinds.length <= 3);
    assert.ok(kinds.every((k) => c.order[k] >= config.KIND_MIN_COUNT));
    assert.strictEqual(c.maxPatience, config.PATIENCE_BASE + config.PATIENCE_PER_BUN * size);
    assert.deepStrictEqual(c.tray, []);
  }
});

test('손님 생성: kindsMax 1이면 한 종류만', () => {
  const c = cs.newCustomer(seq(0.99, 0.5, 0.3), config.FILLINGS, { orderMin: 10, orderMax: 12, kindsMax: 1 });
  assert.strictEqual(Object.keys(c.order).length, 1);
  assert.strictEqual(cs.orderSize(c.order), 12);
});

test('불판·예비 칸 → 고른 손님 쟁반, 덤 상한까지', () => {
  const cap = 2 + config.EXTRA_MAX;
  const s = doneGrill(cap + 1);
  s.customers[1] = cust({ [R]: 2 });
  assert.strictEqual(cs.grillToCustomer(s, 0, 0), 'none'); // 빈 자리
  for (let i = 0; i < cap; i++) assert.strictEqual(cs.grillToCustomer(s, i, 1), 'ok');
  assert.strictEqual(s.slots[0].phase, 'empty');
  assert.strictEqual(cs.grillToCustomer(s, cap, 1), 'full');
  assert.strictEqual(s.slots[cap].phase, 'b'); // 가득이면 불판에 그대로
  assert.strictEqual(cs.grillToCustomer(s, 0, 1), 'nobun');

  s.customers[2] = cust({ [C]: 2 });
  s.reserve[3] = bun(C);
  assert.strictEqual(cs.reserveToCustomer(s, 3, 2), 'ok');
  assert.strictEqual(s.reserve[3], null);
  assert.deepStrictEqual(s.customers[2].tray, [bun(C)]);
});

test('손님 쟁반 → 예비 칸: 그 속 하나만, 예비 칸이 가득이면 실패', () => {
  const s = sim.newState(1);
  s.customers[0] = cust({ [R]: 2 }, [bun(R), bun(C)]);
  assert.strictEqual(cs.customerToReserve(s, 0, C), true);
  assert.deepStrictEqual(s.customers[0].tray, [bun(R)]);
  assert.deepStrictEqual(s.reserve[0], bun(C));
  assert.strictEqual(cs.customerToReserve(s, 0, P), false);
  s.reserve.fill(bun(R));
  assert.strictEqual(cs.customerToReserve(s, 0, R), false);
});

test('건네기: 돈은 주문 값만, 덤은 평판(상한), 자리 비우고 담을 손님 옮김', () => {
  const s = sim.newState(1);
  s.customers[0] = cust({ [R]: 1, [C]: 1 }, [bun(R), bun(C), bun(R), bun(R), bun(C)]); // 덤 3
  s.customers[2] = cust({ [R]: 1 });
  s.target = 0;
  const r = cs.serve(s, 0);
  assert.deepStrictEqual(r, { ok: true, earned: 500 + 600, extra: 3 });
  assert.strictEqual(s.money, 1100);
  assert.strictEqual(s.reputation, config.MAX_EXTRA_REP);
  assert.strictEqual(s.customers[0], null);
  assert.strictEqual(s.target, 2);
});

test('건네기: 모자라면 거절하고 쟁반과 손님은 그대로', () => {
  const s = sim.newState(1);
  s.customers[1] = cust({ [C]: 2 }, [bun(C)]);
  assert.deepStrictEqual(cs.serve(s, 1), { ok: false, reason: 'missing', missing: { [C]: 1 } });
  assert.strictEqual(s.customers[1].tray.length, 1);
  assert.strictEqual(cs.serve(s, 0).reason, 'none');
});

test('평판은 ±REP_CAP 안에서만 움직인다', () => {
  const s = sim.newState(1);
  s.reputation = config.REP_CAP;
  s.customers[0] = cust({ [R]: 1 }, buns(R, 3));
  cs.serve(s, 0);
  assert.strictEqual(s.reputation, config.REP_CAP);
});

test('손님 등장: 빈 자리에 하나씩, 자리가 다 차면 대기, 자리가 비면 delay 뒤에 온다', () => {
  const s = sim.newState(1);
  const rng = lcg(1);
  cs.tickCustomers(s, config.FIRST_CUSTOMER_DELAY, rng);
  assert.strictEqual(cs.occupied(s).length, 1);
  for (let k = 0; k < 10; k++) {
    s.customers.forEach((c) => { if (c) c.patience = 1e9; });
    cs.tickCustomers(s, config.SPAWN_DELAY, rng);
  }
  assert.strictEqual(cs.occupied(s).length, config.COUNTERS);
  s.customers[1] = null;
  cs.tickCustomers(s, config.SPAWN_DELAY - 0.5, rng);
  assert.strictEqual(s.customers[1], null);
  cs.tickCustomers(s, 1, rng);
  assert.ok(s.customers[1]);
});

test('인내심이 다하면 떠나고 평판이 깎이며 담은 빵도 사라진다', () => {
  const s = sim.newState(1);
  s.spawnTimer = 1e9;
  s.customers[1] = { order: { [R]: 1 }, patience: 1, maxPatience: 1, tray: [bun(R)] };
  s.target = 1;
  assert.strictEqual(cs.tickCustomers(s, 0.5, seq(0)), 0);
  assert.strictEqual(cs.tickCustomers(s, 0.6, seq(0)), 1);
  assert.strictEqual(s.customers[1], null);
  assert.strictEqual(s.reputation, -config.LEAVE_PENALTY);
});
