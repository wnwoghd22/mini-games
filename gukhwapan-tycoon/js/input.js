// 입력: 도구 + 탭/문지르기, 위·아래 스와이프, 키보드
//
//   탭 / 문지르기  선택한 도구를 지나가는 칸마다 적용 (국자: 빈 칸에 반죽, 속 재료: A면에 속)
//   위로 스와이프   뒤집기 (도구 무관)
//   아래로 스와이프 다 익은 빵 예비 칸으로 꺼내기, 불량(탐·덜 익음) 빵 버리기
//   다 익은 빵 탭   고른 손님 쟁반에 바로 담기 (예비 칸 빵도 탭하면 그 쟁반으로)
(function (root) {
  const GK = root.GK || (root.GK = {});

  // 원 목록 중 (x, y)를 포함하는 원의 번호, 없으면 -1
  function hitCircle(list, x, y) {
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const dx = x - s.x, dy = y - s.y;
      if (dx * dx + dy * dy <= s.r * s.r) return i;
    }
    return -1;
  }

  function hitSlot(view, x, y) {
    return hitCircle(view.slots, x, y);
  }

  // 손을 뗄 때까지 이동이 이 비율(칸 반지름 대비)보다 작으면 탭
  const TAP_RATIO = 0.35;

  // 'up' | 'down' | null. 세로 이동이 가로보다 크고 칸 반지름 비율 이상일 때만 스와이프
  function classifySwipe(dx, dy, r) {
    const min = r * GK.config.SWIPE_RATIO;
    if (Math.abs(dy) < min || Math.abs(dy) <= Math.abs(dx)) return null;
    return dy < 0 ? 'up' : 'down';
  }

  // 도구를 칸에 적용. 적용했으면 true
  function applyTool(state, tool, i) {
    if (tool === 'batter') return GK.sim.pourBatter(state, i);
    return GK.sim.addFilling(state, i, tool);
  }

  function swipeUp(game, i) {
    const slot = game.state.slots[i];
    if (GK.sim.flip(game.state, i)) return;
    if (slot.phase === 'a' && !slot.filling) game.say('속을 넣어야 뒤집을 수 있어요');
  }

  function swipeDown(game, i) {
    const slot = game.state.slots[i];
    if (GK.sim.take(game.state, i) >= 0) return;
    if (GK.sim.isBad(slot)) GK.sim.discard(game.state, i);
    else if (GK.sim.isDone(slot)) game.say('예비 칸이 가득 찼어요');
  }

  // 빵 옮기기 결과에 맞는 안내
  function sayMove(game, result) {
    if (result === 'none') game.say('담을 손님이 없어요');
    else if (result === 'full') game.say('그 손님 쟁반이 가득 찼어요');
  }

  // 탭한 빵은 지금 고른 손님(state.target)의 쟁반으로 간다
  function tapGrill(game, i) {
    const s = game.state;
    if (!GK.sim.isDone(s.slots[i])) return;
    sayMove(game, GK.customers.grillToCustomer(s, i, s.target));
  }

  function tapReserve(game, k) {
    const s = game.state;
    if (!s.reserve[k]) return;
    sayMove(game, GK.customers.reserveToCustomer(s, k, s.target));
  }

  function bind(canvas, game) {
    // mode 'paint': 시작 칸에 도구가 먹혔거나 칸 밖에서 시작 → 지나가는 칸에 도구 적용
    // mode 'swipe': 시작 칸에 도구가 안 먹힘 → 다른 칸은 건드리지 않고 손을 뗄 때 스와이프·탭 판정
    // mode 'reserve': 예비 칸에서 시작 → 손을 뗄 때 탭 판정
    let drag = null; // { x, y, start, painted: Set, mode }

    function local(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function paint(i) {
      if (i < 0 || drag.painted.has(i)) return;
      if (applyTool(game.state, game.tool, i)) drag.painted.add(i);
    }

    canvas.addEventListener('pointerdown', (e) => {
      const p = local(e);
      const i = hitSlot(game.view, p.x, p.y);
      canvas.setPointerCapture(e.pointerId);
      const k = i < 0 ? hitCircle(game.view.reserve, p.x, p.y) : -1;
      if (k >= 0) {
        drag = { x: p.x, y: p.y, start: k, painted: new Set(), mode: 'reserve' };
        return;
      }
      drag = { x: p.x, y: p.y, start: i, painted: new Set(), mode: 'swipe' };
      paint(i);
      if (i < 0 || drag.painted.size > 0) drag.mode = 'paint';
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!drag || drag.mode !== 'paint') return;
      const p = local(e);
      paint(hitSlot(game.view, p.x, p.y));
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const p = local(e);
      const d = drag;
      drag = null;
      const dx = p.x - d.x, dy = p.y - d.y;

      if (d.mode === 'reserve') {
        const r = game.view.reserve[d.start].r;
        if (Math.hypot(dx, dy) < r * TAP_RATIO) tapReserve(game, d.start);
        return;
      }

      // 여러 칸을 문지른 동작은 스와이프로 보지 않는다
      if (d.start < 0 || d.painted.size > 1) return;
      const r = game.view.slots[d.start].r;
      const dir = classifySwipe(dx, dy, r);
      if (dir === 'up') swipeUp(game, d.start);
      else if (dir === 'down') swipeDown(game, d.start);
      else if (d.mode === 'swipe' && Math.hypot(dx, dy) < r * TAP_RATIO) tapGrill(game, d.start);
    });

    canvas.addEventListener('pointercancel', () => { drag = null; });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        game.toggleMode();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= game.tools.length) game.setTool(game.tools[n - 1].id);
    });
  }

  GK.input = { hitSlot, hitCircle, classifySwipe, bind };
})(typeof window !== 'undefined' ? window : globalThis);
