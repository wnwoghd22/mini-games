// 밸런스 상수. 브라우저(window.GK)와 Node 테스트(globalThis.GK)에서 같이 쓴다.
(function (root) {
  const GK = root.GK || (root.GK = {});

  GK.config = {
    // 조리 모드에서 한 면의 녹색 게이지(0→1)가 다 차는 데 걸리는 초
    SECONDS_PER_LAP: 6,
    // 한 프레임 dt 상한 (탭 전환 뒤 큰 dt로 한꺼번에 타는 것 방지)
    MAX_DT: 0.1,
    // 속 재료 (빵 종류). short는 칸 위에 표시하는 글자, price는 한 개 값(원), unlockDay부터 주문에 나온다
    FILLINGS: [
      { id: 'red-bean', label: '팥', short: '팥', price: 500, unlockDay: 1 },
      { id: 'custard', label: '슈크림', short: '슈', price: 600, unlockDay: 2 },
      { id: 'pizza', label: '피자', short: '피', price: 800, unlockDay: 3 },
      { id: 'spicy', label: '매운맛', short: '매', price: 700, unlockDay: 4 },
      { id: 'choco', label: '초코', short: '초', price: 600, unlockDay: 5 },
    ],
    // 예비 칸 수 (다 구운 빵 보관)
    RESERVE_SLOTS: 4,
    // 손님 (카운터에 동시에 COUNTERS명, 손님마다 자기 쟁반)
    COUNTERS: 3,
    SPAWN_DELAY: 8,          // 빈 자리가 생긴 뒤 다음 손님이 오기까지(초), 1일차 기준
    FIRST_CUSTOMER_DELAY: 3, // 영업 시작 후 첫 손님까지(초)
    ORDER_MIN: 10,           // 주문 개수 기본 범위 (dayParams가 날짜별로 좁힌다)
    ORDER_MAX: 15,
    KINDS_MAX: 3,            // 한 주문에 섞이는 속 종류 최대
    KIND_MIN_COUNT: 2,       // 주문에 들어간 속은 종류마다 최소 이만큼
    PATIENCE_BASE: 30,       // 인내심(초) = BASE + PER_BUN × 주문 개수
    PATIENCE_PER_BUN: 5,
    EXTRA_MAX: 3,            // 쟁반에 주문보다 더 담을 수 있는 개수 (덤)
    MAX_EXTRA_REP: 2,        // 손님 한 명당 평판으로 쳐 주는 덤 최대 개수
    LEAVE_PENALTY: 2,        // 인내심이 다해 떠난 손님의 평판 감점 (담아 둔 빵도 버려진다)
    // 하루 영업 (day.js). 날짜가 갈수록 영업 시간은 길어지고 손님은 자주 온다
    DAY_LENGTH_BASE: 120,    // 1일차 영업 시간(초)
    DAY_LENGTH_STEP: 15,     // 하루마다 늘어나는 시간
    DAY_LENGTH_MAX: 210,
    DELAY_STEP: 1,           // 하루마다 줄어드는 다음 손님 대기(초)
    DELAY_MIN: 2,
    // 평판은 ±REP_CAP 안에서만 움직인다. 평판 1당 다음 손님 대기 -1%, 인내심 +0.5초
    REP_CAP: 20,
    REP_DELAY: 0.01,
    REP_PATIENCE: 0.5,
    // 상점. 불판은 이 순서로 업그레이드한다 (가격 원)
    PLATE_UPGRADES: [
      { plate: 'p19', price: 0 },
      { plate: 'p31', price: 60000 },
      { plate: 'p37', price: 150000 },
    ],
    RESERVE_PRICE: 8000,     // 예비 칸 +1 가격 = RESERVE_PRICE × (지금 칸 수 - 3)
    RESERVE_MAX: 8,

    // 스와이프로 인정하는 최소 이동 거리 (칸 반지름 대비)
    SWIPE_RATIO: 0.6,
  };
})(typeof window !== 'undefined' ? window : globalThis);
