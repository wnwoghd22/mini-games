// Canvas 렌더링. 아트가 들어오기 전까지 원·호·글자로만 그리는 임시 도형이다.
(function (root) {
  const GK = root.GK || (root.GK = {});

  const COLORS = {
    plate: '#3a3a3a',
    hole: '#222',
    batter: '#d9c9a3',   // 반죽 윗면 (A면 굽는 중)
    baked: '#b07a3a',    // 뒤집어서 보이는 다 익은 A면
    burnt: '#2b1d14',
    track: '#555',
    tray: '#2e2e2e',
    trayHole: '#3c3c3c',
    green: '#3fbf5f',
    yellow: '#f2c230',
    red: '#e0413a',
    text: '#222',
    textOnDark: '#eee',
    // 속 색 (임시. 아트가 들어오면 바뀐다)
    filling: {
      'red-bean': '#5a2a22', custard: '#f3dd8a', pizza: '#e07a2e', spicy: '#c0161b', choco: '#3a2418',
    },
  };

  const GAUGE_RATIO = 0.18; // 칸 반지름 대비 게이지 두께
  const TOP = -Math.PI / 2;

  function arc(ctx, x, y, r, from, to, color, width) {
    ctx.beginPath();
    ctx.arc(x, y, r, from, to);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function disc(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => {
      const ca = (pa >> s) & 255, cb = (pb >> s) & 255;
      return Math.round(ca + (cb - ca) * t);
    };
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  function label(ctx, x, y, r, text, color) {
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(r * 0.7)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  // 링 게이지: 녹색이 한 바퀴 차고, 그 위로 노란색이 한 바퀴 더 차면 전체가 빨간색
  function drawGauge(ctx, x, y, r, p) {
    const w = r * GAUGE_RATIO;
    const gr = r + w;
    arc(ctx, x, y, gr, 0, Math.PI * 2, COLORS.track, w);
    const zone = GK.sim.gaugeZone(p);
    if (zone === 'red') {
      arc(ctx, x, y, gr, 0, Math.PI * 2, COLORS.red, w);
    } else if (zone === 'yellow') {
      arc(ctx, x, y, gr, 0, Math.PI * 2, COLORS.green, w);
      arc(ctx, x, y, gr, TOP, TOP + (p - 1) * Math.PI * 2, COLORS.yellow, w);
    } else if (p > 0) {
      arc(ctx, x, y, gr, TOP, TOP + p * Math.PI * 2, COLORS.green, w);
    }
  }

  function fillingShort(id) {
    const f = GK.config.FILLINGS.find((f) => f.id === id);
    return f ? f.short : '?';
  }

  function drawSlot(ctx, x, y, r, slot) {
    if (slot.phase === 'empty') {
      disc(ctx, x, y, r, COLORS.hole);
      return;
    }

    if (slot.phase === 'burnt') {
      disc(ctx, x, y, r, COLORS.burnt);
    } else if (slot.phase === 'a') {
      disc(ctx, x, y, r, COLORS.batter);
      // 속은 반죽 위에 올린 덩어리로 보인다
      if (slot.filling) {
        disc(ctx, x, y, r * 0.45, COLORS.filling[slot.filling]);
      }
    } else {
      // B면: 뒤집어서 보이는 A면 색은 A면을 얼마나 구웠는지에 따라 정해진다
      disc(ctx, x, y, r, mix(COLORS.batter, COLORS.baked, Math.min(slot.pA, 1)));
      label(ctx, x, y, r, fillingShort(slot.filling), COLORS.text);
    }

    drawGauge(ctx, x, y, r, slot.p);

    // 불량 표시: 덜 익음은 빨간 X
    if (slot.defect) {
      const d = r * 0.55;
      ctx.beginPath();
      ctx.moveTo(x - d, y - d); ctx.lineTo(x + d, y + d);
      ctx.moveTo(x + d, y - d); ctx.lineTo(x - d, y + d);
      ctx.strokeStyle = COLORS.red;
      ctx.lineWidth = r * 0.15;
      ctx.stroke();
    }
  }

  // 예비 칸: 받침 띠 위에 빈 자리 또는 다 구운 빵(속 글자)
  function drawReserve(ctx, view, reserve) {
    const b = view.band;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y + b.h * 0.08, b.w, b.h * 0.84, b.h * 0.2);
    ctx.fillStyle = COLORS.tray;
    ctx.fill();
    view.reserve.forEach((s, k) => {
      const bun = reserve[k];
      if (!bun) {
        disc(ctx, s.x, s.y, s.r, COLORS.trayHole);
        return;
      }
      disc(ctx, s.x, s.y, s.r, COLORS.baked);
      label(ctx, s.x, s.y, s.r, fillingShort(bun.filling), COLORS.text);
    });
  }

  function draw(ctx, w, h, state, view) {
    ctx.clearRect(0, 0, w, h);
    disc(ctx, view.cx, view.cy, view.plateR, COLORS.plate);
    view.slots.forEach((s, i) => drawSlot(ctx, s.x, s.y, s.r, state.slots[i]));
    drawReserve(ctx, view, state.reserve);
  }

  GK.render = { draw, COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
