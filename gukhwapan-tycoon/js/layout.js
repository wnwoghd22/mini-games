// 원형 불판의 칸 배치.
// 실제 국화빵 틀(ref/example1~4)은 육각 격자점 중 원 안에 들어오는 칸으로 되어 있다.
// 칸 간격을 1로 두면 반지름 2 → 19구(3-4-5-4-3), √7 → 31구(2-5-6-5-6-5-2), 3 → 37구.
(function (root) {
  const GK = root.GK || (root.GK = {});

  const ROW_H = Math.sqrt(3) / 2;
  const EPS = 1e-6;

  const PLATES = {
    p19: { label: '19구', radius: 2, rotation: 0 },
    p31: { label: '31구', radius: Math.sqrt(7), rotation: 0 },
    p37: { label: '37구', radius: 3, rotation: 0 },
  };

  // 칸 중심 목록 (칸 간격 1, 판 중심 원점). 위 줄부터, 줄 안에서는 왼쪽부터 정렬한다.
  function hexSlots(radius, rotation) {
    const n = Math.ceil(radius) + 1;
    const r2 = radius * radius + EPS;
    const cos = Math.cos(rotation || 0), sin = Math.sin(rotation || 0);
    const pts = [];
    for (let j = -n; j <= n; j++) {
      for (let i = -2 * n; i <= 2 * n; i++) {
        const x = i + j / 2, y = j * ROW_H;
        if (x * x + y * y > r2) continue;
        pts.push({ x: x * cos - y * sin, y: x * sin + y * cos });
      }
    }
    pts.sort((a, b) => (Math.abs(a.y - b.y) > EPS ? a.y - b.y : a.x - b.x));
    return pts;
  }

  // 칸 중심 중 판 중심에서 가장 먼 거리 (화면 크기 맞출 때 사용)
  function extent(pts) {
    let m = 0;
    for (const p of pts) m = Math.max(m, Math.hypot(p.x, p.y));
    return m;
  }

  // 같은 높이에 있는 칸 수를 위 줄부터 센다 (테스트·디버그용)
  function rowCounts(pts) {
    const rows = [];
    let lastY = null;
    for (const p of pts) {
      if (lastY === null || Math.abs(p.y - lastY) > EPS) {
        rows.push(0);
        lastY = p.y;
      }
      rows[rows.length - 1]++;
    }
    return rows;
  }

  GK.layout = { PLATES, hexSlots, extent, rowCounts };
})(typeof window !== 'undefined' ? window : globalThis);
