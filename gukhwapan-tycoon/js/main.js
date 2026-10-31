// 게임 루프, 화면 크기, HUD
(function () {
  const GK = window.GK;
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const modeBtn = document.getElementById('btn-mode');
  const toolbar = document.getElementById('toolbar');
  const toast = document.getElementById('toast');
  const clockEl = document.getElementById('clock');
  const moneyEl = document.getElementById('money');
  const summaryEl = document.getElementById('summary');
  const sumTitle = document.getElementById('sum-title');
  const sumStats = document.getElementById('sum-stats');
  const shopEl = document.getElementById('shop');
  const nextBtn = document.getElementById('btn-next');
  const countersEl = document.getElementById('counters');

  const fillingById = {};
  for (const f of GK.config.FILLINGS) fillingById[f.id] = f;

  // 받침이 있으면 '이', 없으면 '가'
  function subjectJosa(word) {
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    return code >= 0 && code < 11172 && code % 28 !== 0 ? '이' : '가';
  }

  let unitSlots = [];
  let paused = false; // 결산 화면이 떠 있는 동안
  const game = {
    state: null, view: null, tool: 'batter', tools: [],
    toggleMode, setTool, say,
  };

  // 하루 시작: 불판 칸 배치와 도구(그날 해금된 속)를 다시 맞춘다
  function beginDay() {
    const s = game.state;
    GK.day.startDay(s);
    const plate = GK.layout.PLATES[s.plate];
    unitSlots = GK.layout.hexSlots(plate.radius, plate.rotation);
    buildToolbar(s.params.fillings);
    resize();
    updateModeButton();
    paused = false;
    summaryEl.hidden = true;
    say(`${s.day}일차 영업 시작` + newFillingNote(s.day));
  }

  function newFillingNote(day) {
    if (day <= 1) return '';
    const fresh = GK.config.FILLINGS.filter((f) => f.unlockDay === day);
    return fresh.length ? ` · 새 메뉴: ${fresh.map((f) => f.label).join(', ')}` : '';
  }

  function buildToolbar(fillings) {
    game.tools = [{ id: 'batter', label: '반죽' }]
      .concat(fillings.map((f) => ({ id: f.id, label: f.label })));
    toolbar.replaceChildren();
    game.tools.forEach((t, n) => {
      const b = document.createElement('button');
      b.className = 'btn tool';
      b.dataset.tool = t.id;
      b.textContent = `${n + 1} ${t.label}`;
      b.addEventListener('click', () => { setTool(t.id); b.blur(); });
      toolbar.appendChild(b);
    });
    setTool(game.tools.some((t) => t.id === game.tool) ? game.tool : 'batter');
  }

  function toggleMode() {
    GK.sim.toggleMode(game.state);
    updateModeButton();
  }

  function updateModeButton() {
    const cooking = game.state.mode === 'cook';
    modeBtn.textContent = cooking ? '조리 중 (Space: 보온)' : '보온 중 (Space: 조리)';
    modeBtn.dataset.mode = game.state.mode;
  }

  function setTool(id) {
    game.tool = id;
    for (const b of toolbar.children) b.classList.toggle('selected', b.dataset.tool === id);
  }

  let toastTimer = 0;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
  }

  // ── 캔버스 밖 패널 (손님, 쟁반, HUD). 내용이 바뀔 때만 DOM을 다시 만든다 ──
  const domKeys = {};
  function changed(name, key) {
    if (domKeys[name] === key) return false;
    domKeys[name] = key;
    return true;
  }

  function updatePanels() {
    const s = game.state;

    const hud = `${s.money.toLocaleString()}원 · 평판 ${s.reputation}`;
    if (changed('hud', hud)) moneyEl.textContent = hud;
    const t = Math.ceil(s.timeLeft);
    const clock = s.closed
      ? `${s.day}일차 · 마감`
      : `${s.day}일차 · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (changed('clock', clock)) {
      clockEl.textContent = clock;
      clockEl.classList.toggle('closed', s.closed);
    }

    const counterKey = JSON.stringify([s.target, s.closed, s.customers.map((cu) =>
      cu && [cu.order, cu.tray.map((b) => b.filling).join()])]);
    if (changed('counters', counterKey)) buildCounters(s);
    s.customers.forEach((cu, k) => {
      if (!cu || !patienceBars[k]) return;
      const ratio = Math.max(cu.patience / cu.maxPatience, 0);
      patienceBars[k].style.width = `${ratio * 100}%`;
      patienceBars[k].classList.toggle('low', ratio < 0.3);
    });
  }

  // 손님 자리 카드: 주문 칩(담은 수/주문 수, 주문에 없는 속은 덤), 인내심 바, 건네기 버튼
  const KEYS = ['Q', 'W', 'E', 'R', 'T'];
  let patienceBars = [];
  function buildCounters(s) {
    countersEl.replaceChildren();
    patienceBars = [];
    s.customers.forEach((cu, k) => {
      const card = document.createElement('div');
      card.className = 'counter';
      countersEl.appendChild(card);
      if (!cu) {
        card.classList.add('vacant');
        card.innerHTML = `<span class="empty">${s.closed ? '영업 끝' : '빈 자리'}</span>`;
        return;
      }
      card.classList.toggle('target', s.target === k);
      card.addEventListener('click', () => selectCounter(k));

      const head = document.createElement('div');
      head.className = 'counter-head';
      const size = GK.customers.orderSize(cu.order);
      head.innerHTML = `<span>${KEYS[k] || ''} 손님</span><span>${cu.tray.length}/${size}</span>`;

      const have = {};
      for (const bun of cu.tray) have[bun.filling] = (have[bun.filling] || 0) + 1;
      const order = document.createElement('div');
      order.className = 'order';
      for (const f of GK.config.FILLINGS) {
        const want = cu.order[f.id] || 0, got = have[f.id] || 0;
        if (!want && !got) continue;
        const chip = document.createElement('button');
        if (want) {
          chip.className = 'chip' + (got >= want ? ' met' : '');
          chip.textContent = `${f.short} ${Math.min(got, want)}/${want}` + (got > want ? ` +${got - want}` : '');
        } else {
          chip.className = 'chip extra';
          chip.textContent = `${f.short} +${got}`;
        }
        chip.title = '탭하면 이 빵 하나를 예비 칸으로';
        chip.addEventListener('click', () => {
          if (got && !GK.customers.customerToReserve(game.state, k, f.id)) say('예비 칸이 가득 찼어요');
        });
        order.appendChild(chip);
      }

      const patience = document.createElement('div');
      patience.className = 'patience';
      const bar = document.createElement('div');
      bar.className = 'patience-bar';
      patience.appendChild(bar);
      patienceBars[k] = bar;

      const btn = document.createElement('button');
      btn.className = 'btn serve';
      btn.textContent = '건네기';
      btn.addEventListener('click', () => {
        serve(k);
        btn.blur();
      });

      card.append(head, order, patience, btn);
    });
  }

  function selectCounter(k) {
    if (game.state.customers[k]) game.state.target = k;
  }

  function serve(k) {
    const r = GK.customers.serve(game.state, k);
    if (r.ok) {
      say(`+${r.earned.toLocaleString()}원` + (r.extra ? ` (덤 ${r.extra})` : ''));
    } else if (r.reason === 'none') {
      say('기다리는 손님이 없어요');
    } else {
      const parts = Object.keys(r.missing).map((id) => {
        const label = fillingById[id].label;
        return `${label}${subjectJosa(label)} ${r.missing[id]}개`;
      });
      say(`${parts.join(', ')} 모자라요`);
    }
  }

  // ── 결산 + 상점 ──
  function showSummary() {
    const s = game.state;
    const st = s.stats;
    const repDiff = s.reputation - st.repStart;
    sumTitle.textContent = `${s.day}일차 결산`;
    const rows = [
      ['받은 손님', `${st.served}명`],
      ['그냥 간 손님', `${st.left}명`],
      ['번 돈', `${st.earned.toLocaleString()}원`],
      ['덤', `${st.extra}개`],
      ['평판', `${s.reputation} (${repDiff >= 0 ? '+' : ''}${repDiff})`],
      ['가진 돈', `${s.money.toLocaleString()}원`],
    ];
    sumStats.replaceChildren();
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v;
      sumStats.append(dt, dd);
    }
    buildShop();
    summaryEl.hidden = false;
    paused = true;
  }

  function shopButton(label, price, buy) {
    const b = document.createElement('button');
    b.className = 'btn';
    const name = document.createElement('span');
    const cost = document.createElement('span');
    name.textContent = label;
    cost.textContent = price == null ? '최대' : `${price.toLocaleString()}원`;
    b.append(name, cost);
    b.disabled = price == null || game.state.money < price;
    b.addEventListener('click', () => {
      if (buy()) showSummary(); // 가진 돈과 가격을 다시 그린다
    });
    return b;
  }

  function buildShop() {
    const s = game.state;
    shopEl.replaceChildren();
    const up = GK.day.nextPlate(s);
    const cur = GK.layout.PLATES[s.plate].label;
    shopEl.appendChild(up
      ? shopButton(`불판 ${cur} → ${GK.layout.PLATES[up.plate].label}`, up.price, () => GK.day.buyPlate(s))
      : shopButton(`불판 ${cur}`, null, () => false));
    shopEl.appendChild(shopButton(`예비 칸 ${s.reserve.length} → ${s.reserve.length + 1}`,
      GK.day.reservePrice(s), () => GK.day.buyReserve(s)));
  }

  // 화면 배치: 위쪽 정사각형에 불판, 그 아래 띠에 예비 칸 줄.
  // 불판 칸은 칸 간격 1 기준 좌표를 옮긴 것이고, 가장 바깥 칸 바깥에 반 칸 정도 테두리를 남긴다.
  function layoutView(w, h) {
    const cx = w / 2, cy = w / 2;
    const plateR = w * 0.47;
    const spacing = plateR / (GK.layout.extent(unitSlots) + 0.75);
    const r = spacing * 0.36;

    const n = game.state.reserve.length;
    const band = { x: w * 0.05, y: w, w: w * 0.9, h: h - w };
    const cell = band.w / n;
    const rr = Math.min(cell * 0.38, band.h * 0.38);
    const reserve = [];
    for (let k = 0; k < n; k++) {
      reserve.push({ x: band.x + cell * (k + 0.5), y: band.y + band.h / 2, r: rr });
    }

    return {
      cx, cy, plateR,
      slots: unitSlots.map((p) => ({ x: cx + p.x * spacing, y: cy + p.y * spacing, r })),
      band, reserve,
    };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    game.view = layoutView(rect.width, rect.height);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, GK.config.MAX_DT);
    last = now;
    if (!paused) {
      const s = game.state;
      const wasClosed = s.closed;
      GK.sim.tick(s, dt);
      if (GK.customers.tickCustomers(s, dt, Math.random) > 0) say('손님이 기다리다 떠났어요 (담은 빵도 버려요)');
      const phase = GK.day.tickDay(s, dt);
      if (!wasClosed && phase === 'closing') say('마감! 남은 손님만 받아요');
      if (phase === 'over') showSummary();
    }
    const rect = canvas.getBoundingClientRect();
    GK.render.draw(ctx, rect.width, rect.height, game.state, game.view);
    updatePanels();
    requestAnimationFrame(frame);
  }

  // ?demo : 여러 상태의 빵을 미리 깔아 둔다 (스크린샷 확인용)
  function seedDemo(state) {
    const demo = [
      { phase: 'a', p: 0.3 },                                         // 반죽만
      { phase: 'a', p: 0.7, filling: 'red-bean' },                    // A면 + 팥
      { phase: 'a', p: 1.4, filling: 'custard' },                     // A면 노란 구간
      { phase: 'b', p: 0.6, pA: 0.4, filling: 'red-bean', defect: 'undercooked' },
      { phase: 'b', p: 0.5, pA: 1.2, filling: 'red-bean' },           // 정상 뒤집음
      { phase: 'b', p: 1.3, pA: 1.1, filling: 'custard' },            // 완성
      { phase: 'burnt', p: 2, pA: 1.0, filling: 'red-bean' },
    ];
    demo.forEach((d, i) => Object.assign(state.slots[i], d));
    state.reserve[0] = { filling: 'red-bean' };
    state.reserve[1] = { filling: 'red-bean' };
    state.reserve[2] = { filling: 'custard' };
    // 1번: 섞인 주문을 일부 담음(덤 하나 포함), 2번: 비어 있음, 3번: 한 종류 주문
    const bun = (f, n) => Array.from({ length: n }, () => ({ filling: f }));
    state.customers[0] = {
      order: { 'red-bean': 6, custard: 4, pizza: 3 }, patience: 50, maxPatience: 95,
      tray: [...bun('red-bean', 6), ...bun('custard', 2), ...bun('choco', 1)],
    };
    state.customers[2] = {
      order: { custard: 11 }, patience: 20, maxPatience: 85, tray: bun('custard', 3),
    };
    state.target = 0;
    state.spawnTimer = 1e9;
  }

  nextBtn.addEventListener('click', () => {
    nextBtn.blur();
    beginDay();
  });

  modeBtn.addEventListener('click', () => {
    toggleMode();
    modeBtn.blur(); // 포커스가 남으면 Space가 버튼까지 눌러 두 번 전환된다
  });
  window.addEventListener('keydown', (e) => {
    if (paused) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      serve(game.state.target);
      return;
    }
    // Q/W/E: 담을 손님 고르기
    const k = KEYS.indexOf(e.code.replace('Key', ''));
    if (k >= 0 && k < game.state.customers.length) selectCounter(k);
  });
  window.addEventListener('resize', resize);

  // 확인용 URL 옵션
  //   ?plate=p31  시작 불판   ?day=3  시작 날짜   ?demo  여러 상태의 빵   ?end  바로 결산 화면
  const params = new URLSearchParams(location.search);
  const startPlate = GK.layout.PLATES[params.get('plate')] ? params.get('plate') : null;
  game.state = GK.day.newGame(startPlate);
  game.state.day = Math.max(0, (Number(params.get('day')) || 1) - 1);
  beginDay();
  if (params.has('demo')) seedDemo(game.state);
  if (params.has('end')) {
    Object.assign(game.state.stats, { served: 5, left: 1, earned: 38400, extra: 4 });
    game.state.money = 64000;
    game.state.reputation = 4;
    showSummary();
  }

  GK.input.bind(canvas, game);
  requestAnimationFrame(frame);
})();
