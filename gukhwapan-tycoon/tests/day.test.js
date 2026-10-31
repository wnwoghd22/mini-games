const test = require('node:test');
const assert = require('node:assert');

require('../js/config.js');
require('../js/layout.js');
require('../js/sim.js');
require('../js/customers.js');
require('../js/day.js');
const { day: D, customers: cs, config } = globalThis.GK;

const cust = (order, tray) => ({ order, patience: 99, maxPatience: 99, tray: tray || [] });

test('난이도: 날이 갈수록 길어지고, 손님은 빨리, 주문은 커지고, 종류가 섞인다', () => {
  const d1 = D.dayParams(1, 0), d3 = D.dayParams(3, 0), d4 = D.dayParams(4, 0), d20 = D.dayParams(20, 0);
  assert.strictEqual(d1.length, config.DAY_LENGTH_BASE);
  assert.ok(d3.length > d1.length && d20.length === config.DAY_LENGTH_MAX);
  assert.ok(d3.delay < d1.delay && d20.delay === config.DELAY_MIN);
  assert.deepStrictEqual([d1.orderMin, d1.orderMax, d1.kindsMax], [10, 12, 1]);
  assert.deepStrictEqual([d3.orderMin, d3.orderMax, d3.kindsMax], [12, 14, 2]);
  assert.deepStrictEqual([d4.orderMin, d4.orderMax, d4.kindsMax], [12, 15, 3]);
  assert.deepStrictEqual([d20.orderMin, d20.orderMax, d20.kindsMax], [12, 15, 3]);
});

test('난이도: 속은 해금일부터 주문에 나온다 (5일차에 5종)', () => {
  assert.deepStrictEqual(D.dayParams(1, 0).fillings.map((f) => f.id), ['red-bean']);
  assert.strictEqual(D.dayParams(2, 0).fillings.length, 2);
  assert.strictEqual(D.dayParams(5, 0).fillings.length, 5);
});

test('평판: 좋으면 손님이 빨리 오고 오래 기다린다, 효과에는 상한이 있다', () => {
  const lo = D.dayParams(3, -100), mid = D.dayParams(3, 0), hi = D.dayParams(3, 10), cap = D.dayParams(3, 100);
  assert.ok(hi.delay < mid.delay && mid.delay < lo.delay);
  assert.ok(hi.patienceBonus > 0 && lo.patienceBonus < 0);
  assert.strictEqual(cap.patienceBonus, config.REP_CAP * config.REP_PATIENCE);
});

test('하루: 시작하면 칸·예비 칸·손님 자리를 비우고 결산을 0부터 센다', () => {
  const s = D.newGame();
  s.reputation = 3;
  D.startDay(s);
  s.slots[0].phase = 'a';
  s.reserve[0] = { filling: 'red-bean' };
  s.customers[1] = cust({ 'red-bean': 1 }, [{ filling: 'red-bean' }]);
  s.target = 1;
  s.mode = 'cook';
  D.startDay(s);
  assert.strictEqual(s.day, 2);
  assert.strictEqual(s.slots.length, 19);
  assert.ok(s.slots.every((x) => x.phase === 'empty'));
  assert.ok(s.reserve.every((x) => x === null));
  assert.deepStrictEqual(s.customers, [null, null, null]);
  assert.deepStrictEqual([s.target, s.mode], [0, 'warm']);
  assert.deepStrictEqual(s.stats, { served: 0, left: 0, earned: 0, extra: 0, repStart: 3 });
});

test('하루: 시간이 다 되면 마감, 남은 손님을 다 보내야 끝난다', () => {
  const s = D.newGame();
  D.startDay(s);
  assert.strictEqual(D.tickDay(s, 1), 'open');
  s.customers[2] = cust({ 'red-bean': 1 });
  assert.strictEqual(D.tickDay(s, s.params.length), 'closing');
  // 마감 뒤에는 빈 자리가 있어도 새 손님이 오지 않는다
  s.spawnTimer = 0;
  cs.tickCustomers(s, 0.1, () => 0);
  assert.strictEqual(cs.occupied(s).length, 1);
  s.customers[2].tray.push({ filling: 'red-bean' });
  assert.strictEqual(cs.serve(s, 2).ok, true);
  assert.strictEqual(D.tickDay(s, 0.1), 'over');
  assert.deepStrictEqual([s.stats.served, s.stats.earned], [1, 500]);
});

test('하루: 그날 난이도로 손님이 온다 (1일차는 팥 한 종류, 10~12개)', () => {
  const s = D.newGame();
  D.startDay(s);
  cs.tickCustomers(s, config.FIRST_CUSTOMER_DELAY, () => 0.99);
  const cu = s.customers[0];
  assert.deepStrictEqual(cu.order, { 'red-bean': 12 });
  assert.strictEqual(s.spawnTimer, s.params.delay);
});

test('떠난 손님은 결산에 센다', () => {
  const s = D.newGame();
  D.startDay(s);
  s.spawnTimer = 1e9;
  s.customers[0] = { order: { 'red-bean': 1 }, patience: 0.1, maxPatience: 1, tray: [] };
  cs.tickCustomers(s, 1, () => 0);
  assert.strictEqual(s.stats.left, 1);
});

test('상점: 불판은 19 → 31 → 37구 순서, 돈이 모자라면 못 산다', () => {
  const s = D.newGame();
  assert.strictEqual(D.nextPlate(s).plate, 'p31');
  s.money = 1000;
  assert.strictEqual(D.buyPlate(s), false);
  s.money = 1e6;
  assert.strictEqual(D.buyPlate(s), true);
  assert.strictEqual(s.plate, 'p31');
  D.startDay(s);
  assert.strictEqual(s.slots.length, 31);
  assert.strictEqual(D.buyPlate(s), true);
  assert.strictEqual(D.nextPlate(s), null);
  assert.strictEqual(D.buyPlate(s), false);
});

test('상점: 예비 칸은 늘릴수록 비싸지고 상한이 있다', () => {
  const s = D.newGame();
  s.money = 1e6;
  const p1 = D.reservePrice(s);
  assert.strictEqual(D.buyReserve(s), true);
  assert.ok(D.reservePrice(s) > p1);
  while (D.buyReserve(s));
  assert.strictEqual(s.reserve.length, config.RESERVE_MAX);
  assert.strictEqual(D.reservePrice(s), null);
  D.startDay(s);
  assert.strictEqual(s.reserve.length, config.RESERVE_MAX);
});
