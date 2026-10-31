// 손님: 카운터 자리, 등장, 인내심, 손님별 쟁반, 주문 판정, 건네기. 순수 로직이다.
// rng는 0 이상 1 미만을 돌려주는 함수다 (테스트에서 고정값을 넣는다).
//
// state.customers: 길이 COUNTERS. 자리마다 null 또는
//   { order: {속id: 개수}, patience: 남은 초, maxPatience, tray: [{ filling }] }
// state.target: 다 익은 빵을 담을 자리 번호
//
// state.params가 있으면 그날 난이도(day.js의 dayParams)를 쓰고, 없으면 config 기본값을 쓴다.
// state.closed면 새 손님이 오지 않는다. state.stats가 있으면 하루 결산용 숫자를 센다.
(function (root) {
  const GK = root.GK || (root.GK = {});

  function orderSize(order) {
    let n = 0;
    for (const k in order) n += order[k];
    return n;
  }

  function clampRep(state) {
    const cap = GK.config.REP_CAP;
    state.reputation = Math.max(-cap, Math.min(cap, state.reputation));
  }

  // 개수와 속 종류 수를 정하고, 종류마다 최소 KIND_MIN_COUNT개씩 준 뒤 나머지를 무작위로 나눈다.
  // opts: { orderMin, orderMax, kindsMax, patienceBonus } (생략하면 config 기본값)
  function newCustomer(rng, fillings, opts) {
    const c = GK.config;
    const o = opts || {};
    const min = o.orderMin || c.ORDER_MIN, max = o.orderMax || c.ORDER_MAX;
    const size = min + Math.floor(rng() * (max - min + 1));
    const kindsMax = Math.min(o.kindsMax || c.KINDS_MAX, fillings.length,
      Math.floor(size / c.KIND_MIN_COUNT));
    const kinds = 1 + Math.floor(rng() * kindsMax);

    // 해금된 속 중 kinds가지를 겹치지 않게 고른다
    const pool = fillings.slice();
    const picked = [];
    for (let n = 0; n < kinds; n++) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);

    const order = {};
    for (const f of picked) order[f.id] = c.KIND_MIN_COUNT;
    for (let n = kinds * c.KIND_MIN_COUNT; n < size; n++) {
      order[picked[Math.floor(rng() * kinds)].id]++;
    }
    const patience = c.PATIENCE_BASE + c.PATIENCE_PER_BUN * size + (o.patienceBonus || 0);
    return { order, patience, maxPatience: patience, tray: [] };
  }

  // 손님이 있는 자리 번호 목록
  function occupied(state) {
    const list = [];
    state.customers.forEach((cu, k) => { if (cu) list.push(k); });
    return list;
  }

  // 지금 담을 자리가 비어 있으면 손님이 있는 첫 자리로 옮긴다
  function fixTarget(state) {
    if (state.customers[state.target]) return;
    const list = occupied(state);
    if (list.length) state.target = list[0];
  }

  // 손님 등장과 인내심 감소. 떠난 손님 수를 돌려준다.
  // 빈 자리가 있을 때만 대기 시간이 흐르고, 다 차 있으면 대기 시간을 다시 채운다.
  // 그래서 자리가 빈 뒤 delay초가 지나야 다음 손님이 온다 (마감 전까지).
  function tickCustomers(state, dt, rng) {
    const c = GK.config;
    const p = state.params;
    const delay = p ? p.delay : c.SPAWN_DELAY;
    const free = state.customers.indexOf(null);
    if (free < 0) {
      state.spawnTimer = Math.max(state.spawnTimer, delay);
    } else if (!state.closed) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.customers[free] = newCustomer(rng, p ? p.fillings : c.FILLINGS, p);
        state.spawnTimer = delay;
      }
    }

    let left = 0;
    state.customers.forEach((cu, k) => {
      if (!cu) return;
      cu.patience -= dt;
      if (cu.patience > 0) return;
      state.customers[k] = null; // 담아 둔 빵도 같이 사라진다
      left++;
    });
    if (left) {
      state.reputation -= left * c.LEAVE_PENALTY;
      clampRep(state);
      if (state.stats) state.stats.left += left;
    }
    fixTarget(state);
    return left;
  }

  // 주문의 종류별 개수를 모두 채웠으면 ok. 남는 빵은 종류와 상관없이 덤(extra).
  function judgeOrder(order, tray) {
    const have = {};
    for (const bun of tray) have[bun.filling] = (have[bun.filling] || 0) + 1;
    const missing = {};
    let ok = true;
    for (const k in order) {
      const short = order[k] - (have[k] || 0);
      if (short > 0) {
        missing[k] = short;
        ok = false;
      }
    }
    return { ok, missing, extra: ok ? tray.length - orderSize(order) : 0 };
  }

  function orderPrice(order) {
    let sum = 0;
    for (const f of GK.config.FILLINGS) sum += (order[f.id] || 0) * f.price;
    return sum;
  }

  // 쟁반에 더 담을 수 있는지: 주문 개수 + 덤 EXTRA_MAX개까지
  function trayFull(cu) {
    return cu.tray.length >= orderSize(cu.order) + GK.config.EXTRA_MAX;
  }

  // ── 빵 옮기기. 결과: 'ok' | 'none'(그 자리에 손님 없음) | 'full'(쟁반 가득) | 'nobun' ──
  function addTo(state, k, take) {
    const cu = state.customers[k];
    if (!cu) return 'none';
    if (trayFull(cu)) return 'full';
    const bun = take();
    if (!bun) return 'nobun';
    cu.tray.push(bun);
    return 'ok';
  }

  // 다 익은 불판 빵을 k번 손님 쟁반에
  function grillToCustomer(state, i, k) {
    if (!GK.sim.isDone(state.slots[i])) return 'nobun';
    return addTo(state, k, () => GK.sim.pop(state, i));
  }

  // 예비 칸 빵을 k번 손님 쟁반에
  function reserveToCustomer(state, r, k) {
    if (!state.reserve[r]) return 'nobun';
    return addTo(state, k, () => {
      const bun = state.reserve[r];
      state.reserve[r] = null;
      return bun;
    });
  }

  // k번 손님 쟁반에서 그 속 빵 하나를 첫 빈 예비 칸으로 되돌린다
  function customerToReserve(state, k, filling) {
    const cu = state.customers[k];
    const r = state.reserve.indexOf(null);
    if (!cu || r < 0) return false;
    const t = cu.tray.findIndex((b) => b.filling === filling);
    if (t < 0) return false;
    state.reserve[r] = cu.tray.splice(t, 1)[0];
    return true;
  }

  // k번 손님에게 쟁반을 건넨다.
  // 성공: { ok: true, earned, extra }  실패: { ok: false, reason: 'none' | 'missing', missing }
  function serve(state, k) {
    const cu = state.customers[k];
    if (!cu) return { ok: false, reason: 'none' };
    const j = judgeOrder(cu.order, cu.tray);
    if (!j.ok) return { ok: false, reason: 'missing', missing: j.missing };

    const earned = orderPrice(cu.order);
    state.money += earned;
    state.reputation += Math.min(j.extra, GK.config.MAX_EXTRA_REP);
    clampRep(state);
    if (state.stats) {
      state.stats.served++;
      state.stats.earned += earned;
      state.stats.extra += j.extra;
    }
    state.customers[k] = null;
    fixTarget(state);
    return { ok: true, earned, extra: j.extra };
  }

  GK.customers = {
    newCustomer, tickCustomers, judgeOrder, orderPrice, orderSize, occupied, trayFull,
    grillToCustomer, reserveToCustomer, customerToReserve, serve,
  };
})(typeof window !== 'undefined' ? window : globalThis);
