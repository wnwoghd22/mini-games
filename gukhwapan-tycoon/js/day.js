// 하루 영업 루프와 상점. 순수 로직이다.
//
// 하루 흐름: startDay → (영업 시간 동안 손님이 옴) → 시간이 다 되면 마감(closed, 새 손님 없음)
//           → 줄에 남은 손님까지 처리하면 하루 끝(over) → 결산·상점 → 다음 날 startDay
//
// state에 더하는 값:
//   day       몇 일차
//   plate     불판 키 (layout.PLATES)
//   timeLeft  남은 영업 시간(초)
//   closed    마감했는지
//   params    그날 난이도 (dayParams)
//   stats     그날 결산 { served, left, earned, extra, repStart }
(function (root) {
  const GK = root.GK || (root.GK = {});

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // 날짜와 평판에 따른 난이도
  function dayParams(day, reputation) {
    const c = GK.config;
    const rep = clamp(reputation, -c.REP_CAP, c.REP_CAP);
    const base = Math.max(c.DELAY_MIN, c.SPAWN_DELAY - c.DELAY_STEP * (day - 1));
    return {
      length: Math.min(c.DAY_LENGTH_MAX, c.DAY_LENGTH_BASE + c.DAY_LENGTH_STEP * (day - 1)),
      // 자리가 빈 뒤 다음 손님까지. 평판이 좋으면 더 빨리 온다 (나쁘면 더 늦게)
      delay: base * (1 - rep * c.REP_DELAY),
      // 1일차 10~12개, 2일차 11~13개, 3일차 12~14개, 4일차부터 12~15개
      orderMin: Math.min(c.ORDER_MIN + 2, c.ORDER_MIN + day - 1),
      orderMax: Math.min(c.ORDER_MAX, c.ORDER_MIN + day + 1),
      // 한 주문에 섞이는 속 종류: 1일차 1종, 2~3일차 2종까지, 4일차부터 3종까지
      kindsMax: Math.min(c.KINDS_MAX, 1 + Math.floor(day / 2)),
      // 평판이 좋으면 손님이 더 오래 기다린다
      patienceBonus: rep * c.REP_PATIENCE,
      fillings: c.FILLINGS.filter((f) => f.unlockDay <= day),
    };
  }

  // 새 게임: 1일차 시작 전 상태
  function newGame(plate) {
    const key = plate || GK.config.PLATE_UPGRADES[0].plate;
    const state = GK.sim.newState(GK.layout.hexSlots(GK.layout.PLATES[key].radius).length);
    state.plate = key;
    state.day = 0;
    return state;
  }

  // 다음 날 영업 시작. 불판·예비 칸·손님 쟁반에 남은 빵과 손님은 모두 정리한다.
  function startDay(state) {
    const plate = GK.layout.PLATES[state.plate];
    state.day++;
    state.params = dayParams(state.day, state.reputation);
    state.timeLeft = state.params.length;
    state.closed = false;
    state.mode = 'warm';
    state.slots = GK.sim.newState(GK.layout.hexSlots(plate.radius, plate.rotation).length, 0).slots;
    state.reserve = new Array(state.reserve.length).fill(null);
    state.customers = new Array(GK.config.COUNTERS).fill(null);
    state.target = 0;
    state.spawnTimer = GK.config.FIRST_CUSTOMER_DELAY;
    state.stats = { served: 0, left: 0, earned: 0, extra: 0, repStart: state.reputation };
  }

  // 영업 시간을 흘린다. 'open' | 'closing'(마감, 남은 손님 처리 중) | 'over'
  function tickDay(state, dt) {
    if (!state.closed) {
      state.timeLeft = Math.max(0, state.timeLeft - dt);
      if (state.timeLeft <= 0) state.closed = true;
    }
    if (!state.closed) return 'open';
    return state.customers.some(Boolean) ? 'closing' : 'over';
  }

  // ── 상점 ──
  // 다음 불판 업그레이드 { plate, price } 또는 null (마지막 단계)
  function nextPlate(state) {
    const list = GK.config.PLATE_UPGRADES;
    const i = list.findIndex((u) => u.plate === state.plate);
    return list[i + 1] || null;
  }

  // 불판은 다음 날 startDay에서 새 칸 수로 바뀐다
  function buyPlate(state) {
    const up = nextPlate(state);
    if (!up || state.money < up.price) return false;
    state.money -= up.price;
    state.plate = up.plate;
    return true;
  }

  // 예비 칸 +1 가격, 더 늘릴 수 없으면 null
  function reservePrice(state) {
    const n = state.reserve.length;
    if (n >= GK.config.RESERVE_MAX) return null;
    return GK.config.RESERVE_PRICE * (n - 3);
  }

  function buyReserve(state) {
    const price = reservePrice(state);
    if (price == null || state.money < price) return false;
    state.money -= price;
    state.reserve.push(null);
    return true;
  }

  GK.day = { dayParams, newGame, startDay, tickDay, nextPlate, buyPlate, reservePrice, buyReserve };
})(typeof window !== 'undefined' ? window : globalThis);
