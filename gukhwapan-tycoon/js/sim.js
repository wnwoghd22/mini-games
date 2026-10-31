// 순수 게임 로직. DOM에 의존하지 않는다.
//
// 슬롯 phase:
//   'empty'  빈 칸
//   'a'      반죽을 부어 아랫면(A면)이 익는 중. 이때만 속을 넣을 수 있다.
//   'b'      뒤집어서 B면이 익는 중
//   'burnt'  어느 면이든 게이지가 2에 도달해 탐
//
// 게이지 p (지금 익는 면 기준): 0~1 녹색(1 = 다 익음), 1~2 노란색, 2 이상 탐.
// A면이 녹색을 다 채우기 전에 뒤집으면 defect = 'undercooked' (팔 수 없는 불량).
(function (root) {
  const GK = root.GK || (root.GK = {});

  const BURN_AT = 2;

  function newSlot() {
    return { phase: 'empty', p: 0, pA: 0, filling: null, defect: null };
  }

  // reserve: 예비 칸. 빈 칸은 null, 빵은 { filling }
  // customers: 카운터 자리마다 손님 또는 null. 손님마다 자기 쟁반이 있다 (customers.js가 다룬다)
  // target: 다 익은 빵을 담을 손님 자리 번호
  function newState(slotCount, reserveCount) {
    const slots = [];
    for (let i = 0; i < slotCount; i++) slots.push(newSlot());
    const n = reserveCount == null ? GK.config.RESERVE_SLOTS : reserveCount;
    return {
      mode: 'warm', slots, reserve: new Array(n).fill(null),
      customers: new Array(GK.config.COUNTERS).fill(null), target: 0,
      money: 0, reputation: 0, spawnTimer: GK.config.FIRST_CUSTOMER_DELAY,
    };
  }

  function reserveFull(state) {
    return state.reserve.indexOf(null) < 0;
  }

  function isCooking(slot) {
    return slot.phase === 'a' || slot.phase === 'b';
  }

  // 조리 모드일 때만 모든 슬롯 게이지가 찬다. 보온이면 그대로 멈춘다.
  function tick(state, dt) {
    if (state.mode !== 'cook') return;
    const rate = 1 / GK.config.SECONDS_PER_LAP;
    for (const slot of state.slots) {
      if (!isCooking(slot)) continue;
      slot.p += rate * dt;
      if (slot.p >= BURN_AT) {
        slot.p = BURN_AT;
        slot.phase = 'burnt';
      }
    }
  }

  function toggleMode(state) {
    state.mode = state.mode === 'cook' ? 'warm' : 'cook';
    return state.mode;
  }

  // 아래 동작들은 성공하면 true, 할 수 없는 동작이면 false
  function pourBatter(state, i) {
    const slot = state.slots[i];
    if (!slot || slot.phase !== 'empty') return false;
    Object.assign(slot, newSlot(), { phase: 'a' });
    return true;
  }

  // 속은 뒤집기 전(A면)에만, 한 번만 넣을 수 있다
  function addFilling(state, i, kind) {
    const slot = state.slots[i];
    if (!slot || slot.phase !== 'a' || slot.filling) return false;
    slot.filling = kind;
    return true;
  }

  // 속이 있어야 뒤집을 수 있다. A면이 덜 익었으면 불량이 된다.
  function flip(state, i) {
    const slot = state.slots[i];
    if (!slot || slot.phase !== 'a' || !slot.filling) return false;
    if (slot.p < 1) slot.defect = 'undercooked';
    slot.pA = slot.p;
    slot.p = 0;
    slot.phase = 'b';
    return true;
  }

  function isDone(slot) {
    return slot.phase === 'b' && slot.p >= 1 && !slot.defect;
  }

  function isBad(slot) {
    return slot.phase === 'burnt' || !!slot.defect;
  }

  // 다 익은 빵을 첫 번째 빈 예비 칸으로 꺼낸다. 꺼낸 빵은 더 익지 않는다.
  // 들어간 예비 칸 번호, 못 꺼내면 -1 (덜 익음·불량·예비 칸 가득)
  function take(state, i) {
    const slot = state.slots[i];
    if (!slot || !isDone(slot)) return -1;
    const r = state.reserve.indexOf(null);
    if (r < 0) return -1;
    state.reserve[r] = { filling: slot.filling };
    state.slots[i] = newSlot();
    return r;
  }

  // 다 익은 불판 빵을 꺼내 돌려준다 (칸은 비운다). 못 꺼내면 null
  function pop(state, i) {
    const slot = state.slots[i];
    if (!slot || !isDone(slot)) return null;
    state.slots[i] = newSlot();
    return { filling: slot.filling };
  }

  // 아무 상태의 빵이든 버린다
  function discard(state, i) {
    const slot = state.slots[i];
    if (!slot || slot.phase === 'empty') return false;
    state.slots[i] = newSlot();
    return true;
  }

  // 게이지 색 구간: 'green' | 'yellow' | 'red'
  function gaugeZone(p) {
    if (p >= BURN_AT) return 'red';
    if (p >= 1) return 'yellow';
    return 'green';
  }

  GK.sim = {
    BURN_AT, newState, tick, toggleMode,
    pourBatter, addFilling, flip, take, discard,
    pop, isDone, isBad, reserveFull, gaugeZone,
  };
})(typeof window !== 'undefined' ? window : globalThis);
