// puzzles.js — production-line work orders for Chimp Conveyor (v5: 1 → 4 chimps, batches of 10).
//
// Work order shape:
// {
//   id, dept, title, brief (사장 한마디), flavor, chimps,
//   match: 'exact' | 'fuzzy' | 'set' | 'number' | 'json', itemThreshold (per item),
//   revenue (₩ for all 10 items; each correct item pays revenue/10), materialCost (₩ burned per run),
//   samples: [{ input, target }] × 3 (shown to the player),
//   batch:   [{ input, target, note? }] × 10 (what actually flows; note = why it is an exception),
//   hint, perChimp: [{ label }], sampleSolution: string[], trap (design note)
// }
// Pass = at least PASS_COUNT correct items. Prompt limit / temperature / max tokens come from
// PROGRESSION[level] (level = number of passed orders).
//
// Design: the line starts with ONE chimp and grows to four. Each level adds either a stage or
// more exceptions in the batch. Intended paths use only atoms measured reliable on Qwen2.5-0.5B:
// UPPERCASE, colon-field value (not the first field), number by question, "Add the prefix X:"
// (numbers/words only, never hyphen codes), brackets with a conversion example, lookup with the
// table inside the instruction (cities), sentence → JSON with named keys, JSON field value, and
// copying a LONG output. Everything else appears only as a trap. Part-code lookup tables were
// measured at 40–60% and are not used.

export const BATCH_SIZE = 10;
export const PASS_COUNT = 6;

export const DEPARTMENTS = {
    rcv: '입고',
    lbl: '라벨링',
    asm: '조립',
    pack: '포장',
    ship: '출하',
    all: '전사',
};

/** Knobs applied when STARTING level i (i = number of passed orders). Last entry = after the finale. */
export const PROGRESSION = [
    { promptLimit: 60, temperature: 0.35, memoryLevel: 0, maxTokens: 48 },
    { promptLimit: 65, temperature: 0.34, memoryLevel: 0, maxTokens: 48 },
    { promptLimit: 70, temperature: 0.33, memoryLevel: 0, maxTokens: 48 },
    { promptLimit: 80, temperature: 0.31, memoryLevel: 0, maxTokens: 56 },
    { promptLimit: 90, temperature: 0.30, memoryLevel: 0, maxTokens: 56 },
    { promptLimit: 100, temperature: 0.28, memoryLevel: 0, maxTokens: 64 },
    { promptLimit: 110, temperature: 0.27, memoryLevel: 0, maxTokens: 64 },
    { promptLimit: 120, temperature: 0.25, memoryLevel: 0, maxTokens: 72 },
    { promptLimit: 130, temperature: 0.24, memoryLevel: 0, maxTokens: 80 },
    { promptLimit: 140, temperature: 0.22, memoryLevel: 0, maxTokens: 88 },
    { promptLimit: 150, temperature: 0.21, memoryLevel: 0, maxTokens: 96 },
    { promptLimit: 160, temperature: 0.20, memoryLevel: 0, maxTokens: 96 },
    { promptLimit: 160, temperature: 0.20, memoryLevel: 0, maxTokens: 96 },
];

const S = (input, target, note) => (note ? { input, target, note } : { input, target });
const CODES = 'Codes: Busan=PUS, Incheon=ICN, Daegu=TAE, Gwangju=KWJ. Find the input city in the list. Output only its code.';
const JSON_PROMPT = 'Output JSON with keys item (part code), qty (number) and dest (city). Output only the JSON.';

export const WORK_ORDERS = [
    // ---------- 1 chimp ----------
    {
        id: 'rcv-uppercase',
        dept: 'rcv',
        title: '입고 라벨 대문자화',
        brief: '사장: "라벨러 잘랐어. 소문자를 대문자로. 이건 침팬지가 아니라 돌도 해."',
        flavor: '입고 전표의 소문자 부품명을 창고 규격인 대문자로 바꿉니다. 한 마리로 충분한 일입니다. 아마도.',
        chimps: 1,
        match: 'exact',
        itemThreshold: 0.95,
        revenue: 1500,
        materialCost: 300,
        samples: [
            S('brg-6204 steel bearing', 'BRG-6204 STEEL BEARING'),
            S('gear-12t spur gear', 'GEAR-12T SPUR GEAR'),
            S('nut-m8 hex nut', 'NUT-M8 HEX NUT'),
        ],
        batch: [
            S('brg-6204 steel bearing', 'BRG-6204 STEEL BEARING'),
            S('gear-12t spur gear', 'GEAR-12T SPUR GEAR'),
            S('nut-m8 hex nut', 'NUT-M8 HEX NUT'),
            S('pin-4 dowel pin', 'PIN-4 DOWEL PIN'),
            S('shaft-20 drive shaft', 'SHAFT-20 DRIVE SHAFT'),
            S('cap-10 end cap', 'CAP-10 END CAP'),
            S('ring-33 o ring', 'RING-33 O RING'),
            S('plate-7 base plate', 'PLATE-7 BASE PLATE'),
            S('Spring-2 Coil Spring', 'SPRING-2 COIL SPRING', '대소문자 혼합. "소문자를 바꿔라"라고 좁게 쓰면 흔들린다'),
            S('clip-5 hose clip', 'CLIP-5 HOSE CLIP', '못됨: hose를 다른 단어로 바꿔 버린다'),
        ],
        hint: '"capital letters"나 "UPPERCASE"처럼 정확한 단어를 쓰고 "Output only that."로 끝내세요. 샘플 하나를 베껴 적으면 열 장이 전부 같은 답이 됩니다.',
        perChimp: [{ label: '대문자화' }],
        sampleSolution: ['Rewrite the input in capital letters. Output only that.'],
        trap: '"Change brg-6204 to BRG-6204."는 열 건 모두 같은 답. "Make the letters big."은 신제품 발명.',
    },
    {
        id: 'rcv-bin-field',
        dept: 'rcv',
        title: '선반 번호 추출',
        brief: '사장: "창고 로봇은 선반 번호만 받아. 전표 순서가 다 같을 거라곤 나도 안 했어."',
        flavor: 'ERP 한 줄에서 선반(bin) 번호 하나만 뽑습니다. 전표 작성자가 셋이라 필드 순서가 제멋대로입니다.',
        chimps: 1,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 2000,
        materialCost: 400,
        samples: [
            S('part: BOLT-M8, qty: 120, bin: A3', 'A3'),
            S('part: GEAR-12T, qty: 12, bin: B7', 'B7'),
            S('part: NUT-M8, qty: 500, bin: C2', 'C2'),
        ],
        batch: [
            S('part: BOLT-M8, qty: 120, bin: A3', 'A3'),
            S('part: GEAR-12T, qty: 12, bin: B7', 'B7'),
            S('part: NUT-M8, qty: 500, bin: C2', 'C2'),
            S('part: SHAFT-20, qty: 8, bin: D4', 'D4'),
            S('part: WASHER-M8, qty: 300, bin: A9', 'A9'),
            S('Part: PIN-4 | Qty: 50 | Bin: C1', 'C1', '구분자가 세로줄, 키 대문자'),
            S('part: BELT-A42, qty: 6, bin:B4 (rack 2)', 'B4', '콜론 뒤 공백 없음, 뒤에 메모'),
            S('part: BRG-6204, bin: A5, qty: 60', 'A5', 'bin이 가운데. "마지막 값"은 60'),
            S('part: PULLEY-V2, qty: 40, bin: B2, lot: L-2209', 'B2', '필드 추가. "마지막 값"은 L-2209'),
            S('bin: E1, part: SHAFT-20, qty: 8', 'E1', '못됨: 첫 필드. 줄 전체를 돌려준다'),
        ],
        hint: '필드 이름을 전표에 적힌 그대로("value of bin") 쓰세요. "마지막 값"이라고 쓰면 순서 바뀐 전표에서 죽습니다.',
        perChimp: [{ label: '필드 추출' }],
        sampleSolution: ['Output only the value of bin. Nothing else.'],
        trap: '"Output the last word."는 순서 바뀐 두 건에서 죽어 7/10 언저리. "Output the shelf number."(전표에 없는 단어)는 설명문.',
    },
    {
        id: 'rcv-pallet-count',
        dept: 'rcv',
        title: '입고 팔레트 수 보고',
        brief: '사장: "트럭에서 팔레트 몇 개 내렸는지 숫자만. 세는 게 아니야, 읽는 거야."',
        flavor: '입고 통지 문장에서 팔레트 수를 숫자로만 보고합니다. 문장은 사람이 썼기 때문에 표현이 매번 다릅니다.',
        chimps: 1,
        match: 'number',
        itemThreshold: 1.0,
        revenue: 2500,
        materialCost: 500,
        samples: [
            S('Inbound: 3 pallets of BOLT-M8 from Incheon.', '3'),
            S('Inbound: 5 pallets of GEAR-12T from Busan.', '5'),
            S('Inbound: 2 pallets of NUT-M8 from Daegu.', '2'),
        ],
        batch: [
            S('Inbound: 3 pallets of BOLT-M8 from Incheon.', '3'),
            S('Inbound: 5 pallets of GEAR-12T from Busan.', '5'),
            S('Inbound: 2 pallets of NUT-M8 from Daegu.', '2'),
            S('Inbound from Incheon: SHAFT-20, pallets: 7, boxes: 28.', '7', '콜론 형식, 상자 수 동거'),
            S('Truck 7 unloaded 4 pallets of WASHER-M8 from Busan.', '4', '트럭 번호가 먼저'),
            S('Inbound: 12 pallets of BOLT-M8 from Incheon.', '12', '두 자리 수'),
            S('Inbound: a dozen pallets of PIN-4 from Busan.', '12', '못됨: dozen'),
            S('Inbound: 1 pallet of BRG-6204 from Busan.', '1', '단수 pallet'),
            S('Order 4471: 9 pallets of PIN-4 arrive from Daegu.', '9', '주문번호 숫자 동거. "첫 숫자"는 4471'),
            S('Inbound: 3 pallets of NUT-M8 plus 2 pallets of BOLT-M8 from Incheon.', '5', '못됨: 두 묶음을 더해야 한다'),
        ],
        hint: '질문형이 가장 잘 먹힙니다. "How many pallets?" 다음에 "Output only the number." 자릿수나 단수/복수는 쓰지 마세요.',
        perChimp: [{ label: '수량 판독' }],
        sampleSolution: ['How many pallets? Output only the number.'],
        trap: '"Output the first number."는 주문번호를 낸다. "Count the pallets."는 세기로 해석되어 엉뚱한 수.',
    },
    // ---------- 2 chimps ----------
    {
        id: 'asm-lot-tag',
        dept: 'asm',
        title: '로트 태그 조립',
        brief: '사장: "조립대엔 [로트번호] 태그만 붙여. 뽑는 놈, 괄호 치는 놈. 두 마리면 사치지."',
        flavor: '처음으로 두 마리입니다. 첫째가 로트(lot) 번호를 뽑고, 둘째가 대괄호 태그로 조립합니다. 둘째는 첫째의 출력만 봅니다.',
        chimps: 2,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 3500,
        materialCost: 700,
        samples: [
            S('part: GEAR-12T, lot: L-2209, bin: B7', '[L-2209]'),
            S('part: BRG-6204, lot: L-2210, bin: A3', '[L-2210]'),
            S('part: NUT-M8, lot: L-2215, bin: C2', '[L-2215]'),
        ],
        batch: [
            S('part: GEAR-12T, lot: L-2209, bin: B7', '[L-2209]'),
            S('part: BRG-6204, lot: L-2210, bin: A3', '[L-2210]'),
            S('part: NUT-M8, lot: L-2215, bin: C2', '[L-2215]'),
            S('part: SHAFT-20, lot: L-2301, bin: D4', '[L-2301]'),
            S('part: WASHER-M8, lot: L-2305, bin: A9', '[L-2305]'),
            S('part: PIN-4, lot: L-2308, bin: C1', '[L-2308]'),
            S('part: BELT-A42, lot: L-2311, bin: B4', '[L-2311]'),
            S('part: BOLT-M8, bin: A5, lot: L-2302', '[L-2302]', 'lot이 마지막'),
            S('part: PULLEY-V2, lot: L-2303, bin: B2, qty: 40', '[L-2303]', '필드 추가'),
            S('lot: L-2320, part: GEAR-12T, bin: B7', '[L-2320]', '못됨: 첫 필드. 줄 전체에 괄호가 쳐진다'),
        ],
        hint: '첫째는 작업 2에서 쓴 문장 그대로, 필드 이름만 바꾸세요. 둘째에게는 변환 예시를 하나 넣어 주세요("Example: B7 becomes [B7]"). 예시가 없으면 괄호 대신 설명을 씁니다.',
        perChimp: [{ label: '로트 추출' }, { label: '태그 조립' }],
        sampleSolution: ['Output only the value of lot. Nothing else.', 'Put square brackets around the input. Example: B7 becomes [B7].'],
        trap: '한 마리에게 다 시키면 줄 전체를 괄호 친다. 순서를 뒤집어 괄호를 먼저 치면 둘째의 필드 추출이 죽는다. 순서 교훈의 첫 등장.',
    },
    {
        id: 'pack-pallet-label',
        dept: 'pack',
        title: '팔레트 라벨 조립',
        brief: '사장: "포장 라벨엔 PALLETS: 3처럼 찍어. 읽는 놈, 붙이는 놈. 이번엔 문장이 좀 길어."',
        flavor: '포장 지시 문장에서 팔레트 수를 읽고 라벨 접두어를 붙입니다. 접두어는 숫자 앞에 붙일 때만 안전합니다.',
        chimps: 2,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 4500,
        materialCost: 900,
        samples: [
            S('Pack order SO-1188: 3 pallets of BOLT-M8, ship to Busan.', 'PALLETS: 3'),
            S('Pack order SO-1189: 5 pallets of GEAR-12T, ship to Incheon.', 'PALLETS: 5'),
            S('Pack order SO-1190: 2 pallets of NUT-M8, ship to Daegu.', 'PALLETS: 2'),
        ],
        batch: [
            S('Pack order SO-1188: 3 pallets of BOLT-M8, ship to Busan.', 'PALLETS: 3'),
            S('Pack order SO-1189: 5 pallets of GEAR-12T, ship to Incheon.', 'PALLETS: 5'),
            S('Pack order SO-1190: 2 pallets of NUT-M8, ship to Daegu.', 'PALLETS: 2'),
            S('Pack order SO-1191: 7 pallets of SHAFT-20, ship to Busan.', 'PALLETS: 7'),
            S('Pack order SO-1192: 4 pallets of WASHER-M8, ship to Daegu.', 'PALLETS: 4'),
            S('Pack order SO-1193: 12 pallets of BOLT-M8, ship to Incheon.', 'PALLETS: 12', '두 자리'),
            S('Pack order SO-1194: 1 pallet of BRG-6204, ship to Busan.', 'PALLETS: 1', '단수'),
            S('Pack order SO-1195: 6 PLT of PIN-4, ship to Daegu.', 'PALLETS: 6', '약어 PLT'),
            S('Pack order SO-1196: 8 pallets and 3 boxes of BELT-A42, ship to Busan.', 'PALLETS: 8', '상자 수 동거'),
            S('Pack order SO-1197: three pallets of NUT-M8, ship to Incheon.', 'PALLETS: 3', '못됨: 숫자 단어'),
        ],
        hint: '순서가 전부입니다. 먼저 숫자만 남기고, 그 다음 접두어. 반대로 하면 둘째가 라벨을 도로 떼어냅니다. 접두어 뒤의 콜론까지 지시문에 그대로 쓰세요.',
        perChimp: [{ label: '수량 판독' }, { label: '라벨 접두어' }],
        sampleSolution: ['How many pallets? Output only the number.', 'Add the prefix PALLETS: before the input. Output only the result.'],
        trap: '접두어→숫자로 순서를 뒤집으면 숫자만 남아 열 건 전멸. 여기서 "출력이 다음 입력"임을 몸으로 배운다.',
    },
    {
        id: 'lbl-json-label',
        dept: 'lbl',
        title: '조립 전표 작성 (JSON)',
        brief: '사장: "라벨 프린터는 JSON만 먹어. 문장을 JSON으로. 둘째는… 아무것도 안 하면 안 되나?"',
        flavor: '지시 문장을 라벨 프린터용 JSON 전표로 조립합니다. 일은 한 마리로 끝나는데 라인엔 두 마리가 앉아 있습니다. 노는 침팬지는 반드시 "그대로 넘겨라"를 받아야 하고, 이번엔 출력이 길어서 그게 안전합니다.',
        chimps: 2,
        match: 'json',
        itemThreshold: 0.66,
        revenue: 5500,
        materialCost: 1100,
        samples: [
            S('Send 3 NUT-M8 to Busan.', '{"item":"NUT-M8","qty":3,"dest":"Busan"}'),
            S('Send 12 GEAR-12T to Incheon.', '{"item":"GEAR-12T","qty":12,"dest":"Incheon"}'),
            S('Send 5 SHAFT-20 to Daegu.', '{"item":"SHAFT-20","qty":5,"dest":"Daegu"}'),
        ],
        batch: [
            S('Send 3 NUT-M8 to Busan.', '{"item":"NUT-M8","qty":3,"dest":"Busan"}'),
            S('Send 12 GEAR-12T to Incheon.', '{"item":"GEAR-12T","qty":12,"dest":"Incheon"}'),
            S('Send 5 SHAFT-20 to Daegu.', '{"item":"SHAFT-20","qty":5,"dest":"Daegu"}'),
            S('Send 40 BOLT-M8 to Busan.', '{"item":"BOLT-M8","qty":40,"dest":"Busan"}'),
            S('Send 8 BRG-6204 to Daegu.', '{"item":"BRG-6204","qty":8,"dest":"Daegu"}'),
            S('Send 6 BELT-A42 to Incheon.', '{"item":"BELT-A42","qty":6,"dest":"Incheon"}'),
            S('Busan needs 20 WASHER-M8 today.', '{"item":"WASHER-M8","qty":20,"dest":"Busan"}', '도시가 앞, to 없음'),
            S('Please rush 15 PIN-4 to Daegu by Friday.', '{"item":"PIN-4","qty":15,"dest":"Daegu"}', '잡말 추가'),
            S('Ship 9 PULLEY-V2 to Incheon, dock 2.', '{"item":"PULLEY-V2","qty":9,"dest":"Incheon"}', '다른 숫자(dock 2)'),
            S('Send 3 COIL-STL-09 to Busan.', '{"item":"COIL-STL-09","qty":3,"dest":"Busan"}', '못됨: 하이픈 2개 코드가 조각난다. 부분 점수로 운에 맡김'),
        ],
        hint: '키 이름 셋을 지시문에 정확히 적고 각 키가 뭔지 괄호로 한 단어씩. 둘째는 할 일이 없습니다. 이럴 땐 "Output the input exactly as it is." 단, 이게 안전한 건 출력이 긴 JSON이라서입니다. 짧은 라벨 뒤에 복사 침팬지를 두면 라벨이 사라집니다.',
        perChimp: [{ label: 'JSON 조립' }, { label: '전달' }],
        sampleSolution: [JSON_PROMPT, 'Output the input exactly as it is.'],
        trap: '둘째에게 "Format the JSON nicely"라고 시키면 키를 바꾸거나 설명을 덧붙인다. 세트에서 유일한 복사 교훈.',
    },
    {
        id: 'ship-city-code',
        dept: 'ship',
        title: '목적지 공항 코드 변환',
        brief: '사장: "출하 시스템은 도시명 안 받아. PUS, ICN 이런 거. 코드표는 지시문에 네가 넣어."',
        flavor: '출하 전표에서 목적지 도시를 뽑고 코드표로 바꿉니다. 코드표는 침팬지 머리에 없으니 지시문 안에 써 줘야 합니다.',
        chimps: 2,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 6500,
        materialCost: 1300,
        samples: [
            S('order: SO-1201, dest: Busan, qty: 3', 'PUS'),
            S('order: SO-1202, dest: Incheon, qty: 12', 'ICN'),
            S('order: SO-1203, dest: Daegu, qty: 5', 'TAE'),
        ],
        batch: [
            S('order: SO-1201, dest: Busan, qty: 3', 'PUS'),
            S('order: SO-1202, dest: Incheon, qty: 12', 'ICN'),
            S('order: SO-1203, dest: Daegu, qty: 5', 'TAE'),
            S('order: SO-1204, dest: Busan, qty: 40', 'PUS'),
            S('order: SO-1205, dest: Daegu, qty: 8', 'TAE'),
            S('order: SO-1206, qty: 6, dest: Incheon', 'ICN', 'dest가 마지막'),
            S('order: SO-1207, dest: Busan, qty: 20, carrier: Hanjin', 'PUS', '필드 추가. 운송사 이름이 도시처럼 보인다'),
            S('Order: SO-1208, Dest: Daegu, Qty: 15', 'TAE', '키 대문자'),
            S('order: SO-1209, dest: Gwangju, qty: 9', 'KWJ', '못됨: 표에 있어도 광주는 거의 못 찾는다'),
            S('order: SO-1210, dest: busan, qty: 3', 'PUS', '못됨: 소문자 도시'),
        ],
        hint: '둘째 지시문 맨 앞에 코드표를 "Busan=PUS, Incheon=ICN, …" 식으로 넣고 "Find the input city in the list. Output only its code." 코드표가 있어도 못 찾는 도시가 있습니다. 침팬지니까요.',
        perChimp: [{ label: '목적지 추출' }, { label: '코드 변환' }],
        sampleSolution: ['Output only the value of dest. Nothing else.', CODES],
        trap: '표 없이 "airport code"를 물으면 발명(BSN 등). 첫째 없이 둘째에게 전표를 주면 SO 번호를 도시로 오인.',
    },
    // ---------- 3 chimps ----------
    {
        id: 'lbl-dest-tag',
        dept: 'lbl',
        title: '출하 라벨 목적지 태그',
        brief: '사장: "전표가 두 줄이 됐어. 목적지 코드에 괄호까지. 셋이면 충분하지? 충분해야 해."',
        flavor: '두 줄 전표에서 목적지를 뽑아 코드로 바꾸고 태그로 감쌉니다. 세 단계인데 순서를 바꾸면 중간 결과가 다음 침팬지에게 외계어가 됩니다.',
        chimps: 3,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 8000,
        materialCost: 1600,
        samples: [
            S('order: SO-1301, part: BOLT-M8\nqty: 40, dest: Incheon, bin: A3', '[ICN]'),
            S('order: SO-1302, part: GEAR-12T\nqty: 12, dest: Busan, bin: B7', '[PUS]'),
            S('order: SO-1303, part: NUT-M8\nqty: 500, dest: Daegu, bin: C2', '[TAE]'),
        ],
        batch: [
            S('order: SO-1301, part: BOLT-M8\nqty: 40, dest: Incheon, bin: A3', '[ICN]'),
            S('order: SO-1302, part: GEAR-12T\nqty: 12, dest: Busan, bin: B7', '[PUS]'),
            S('order: SO-1303, part: NUT-M8\nqty: 500, dest: Daegu, bin: C2', '[TAE]'),
            S('order: SO-1304, part: SHAFT-20\nqty: 8, dest: Busan, bin: D4', '[PUS]'),
            S('order: SO-1305, part: WASHER-M8\nqty: 300, dest: Incheon, bin: A9', '[ICN]'),
            S('order: SO-1306, dest: Daegu\npart: PIN-4, qty: 50, bin: C1', '[TAE]', 'dest가 첫 줄. "둘째 줄에서 찾아라"는 죽는다'),
            S('order: SO-1307, part: BELT-A42\nqty: 6, bin: B4, dest: Busan', '[PUS]', 'dest 마지막'),
            S('Order: SO-1308, Part: BRG-6204\nQty: 60, Dest: Incheon, Bin: A5', '[ICN]', '키 대문자'),
            S('order: SO-1309, part: PULLEY-V2\nqty: 40, dest: Daegu, bin: B2, carrier: Hanjin', '[TAE]', '필드 추가'),
            S('order: SO-1310, part: BOLT-M8\nqty: 40, dest: Gwangju, bin: A3', '[KWJ]', '못됨: 광주'),
        ],
        hint: '줄 번호로 지시하지 마세요("second line"은 안 됩니다). 필드 이름으로 뽑고 → 코드표 → 괄호 순서. 괄호 예시는 정답에 없는 코드로("B7 becomes [B7]"). 정답을 예시로 적으면 사장이 가로챕니다.',
        perChimp: [{ label: '목적지 추출' }, { label: '코드 변환' }, { label: '태그 조립' }],
        sampleSolution: ['Output only the value of dest. Nothing else.', CODES, 'Put square brackets around the input. Example: B7 becomes [B7]. Nothing else.'],
        trap: '괄호를 룩업 앞에 두면 [Busan]이 표에 없어 실패. 룩업을 첫째로 두면 전표 전체에서 도시를 찾다 SO-1301을 낸다.',
    },
    {
        id: 'asm-ship-code',
        dept: 'asm',
        title: '조립 지시 출하 코드',
        brief: '사장: "조립 지시문에서 도착지 코드만. 문장에서 바로 뽑으라니까 자꾸 딴 걸 뽑아?"',
        flavor: '사람이 쓴 조립 지시문에서 도착지를 공항 코드로 바꿉니다. 문장에서 도시를 바로 뽑으라는 지시는 잘 안 먹힙니다. 대신 JSON 전표로 한 번 조립하면 그 다음은 콜론 전표와 똑같아집니다.',
        chimps: 3,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 9500,
        materialCost: 1900,
        samples: [
            S('Assemble 3 NUT-M8 for the Busan order.', 'PUS'),
            S('Assemble 12 GEAR-12T for the Incheon order.', 'ICN'),
            S('Assemble 5 SHAFT-20 for the Daegu order.', 'TAE'),
        ],
        batch: [
            S('Assemble 3 NUT-M8 for the Busan order.', 'PUS'),
            S('Assemble 12 GEAR-12T for the Incheon order.', 'ICN'),
            S('Assemble 5 SHAFT-20 for the Daegu order.', 'TAE'),
            S('Assemble 40 BOLT-M8 for the Busan order.', 'PUS'),
            S('Assemble 8 BRG-6204 for the Daegu order.', 'TAE'),
            S('GEAR-12T x12 for Incheon, assemble today.', 'ICN', '코드가 문장 맨 앞, x12 수량 표기'),
            S('Daegu order: assemble 20 WASHER-M8 by Friday.', 'TAE', '도시 앞, 잡말'),
            S('Assemble 6 BELT-A42 for Busan, then pack them.', 'PUS', '뒤에 절 추가'),
            S('Assemble 15 PIN-4 for the incheon order.', 'ICN', '소문자 도시'),
            S('Assemble 3 COIL-STL-09 for the Gwangju order.', 'KWJ', '못됨: 광주'),
        ],
        hint: '문장에서 바로 도시를 시키지 말고, 작업 6의 JSON 지시를 첫째에게 주세요. 둘째는 JSON에서 "value of dest", 셋째는 작업 7의 코드표. 중간 산출물이 길수록 침팬지가 덜 헷갈립니다.',
        perChimp: [{ label: 'JSON 조립' }, { label: '도착지 추출' }, { label: '코드 변환' }],
        sampleSolution: [JSON_PROMPT, 'Output only the value of dest, without quotes.', CODES],
        trap: '첫째에게 "Output only the city."를 주는 게 가장 자연스러운 실수. 부품 코드나 문장 조각을 낸다. 교훈: 직접 못 하면 아는 형식으로 바꿔서 한다.',
    },
    {
        id: 'ship-gate-label',
        dept: 'ship',
        title: '출하 게이트 라벨',
        brief: '사장: "두 줄 전표 보고 게이트 라벨 찍어. GATE: 코드. 뽑고, 바꾸고, 붙여. 셋이면 충분하지."',
        flavor: '두 줄 출하 전표에서 도착지를 뽑아 공항 코드로 바꾸고 라벨 접두어를 붙입니다. 접두어는 코드(단어) 앞에 붙일 때 안전합니다.',
        chimps: 3,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 11000,
        materialCost: 2200,
        samples: [
            S('order: SO-1401, part: BOLT-M8\nload: 8 pallets, dest: Busan', 'GATE: PUS'),
            S('order: SO-1402, part: GEAR-12T\nload: 3 pallets, dest: Incheon', 'GATE: ICN'),
            S('order: SO-1403, part: NUT-M8\nload: 5 pallets, dest: Daegu', 'GATE: TAE'),
        ],
        batch: [
            S('order: SO-1401, part: BOLT-M8\nload: 8 pallets, dest: Busan', 'GATE: PUS'),
            S('order: SO-1402, part: GEAR-12T\nload: 3 pallets, dest: Incheon', 'GATE: ICN'),
            S('order: SO-1403, part: NUT-M8\nload: 5 pallets, dest: Daegu', 'GATE: TAE'),
            S('order: SO-1404, part: SHAFT-20\nload: 4 pallets, dest: BUSAN', 'GATE: PUS', '대문자 도시'),
            S('order: SO-1405, part: WASHER-M8, origin: Busan\nload: 6 pallets, dest: Daegu', 'GATE: TAE', '도시 두 개(origin)'),
            S('order: SO-1406, dest: Incheon\npart: PIN-4, load: 12 pallets', 'GATE: ICN', 'dest가 첫 줄'),
            S('order: SO-1407, part: BRG-6204\nload: 1 pallet, dest: Busan, carrier: CJ', 'GATE: PUS', '필드 추가'),
            S('Order: SO-1408, Part: BELT-A42\nLoad: 7 PLT, Dest: Daegu', 'GATE: TAE', '키 대문자'),
            S('load: 9 pallets, dest: Incheon\norder: SO-1409, part: PULLEY-V2', 'GATE: ICN', '줄 순서 뒤바뀜'),
            S('order: SO-1410, part: BOLT-M8\nload: 8 pallets, destination: Gwangju', 'GATE: KWJ', '못됨: 키가 destination, 그리고 광주'),
        ],
        hint: '필드 이름으로 뽑고 → 코드표 → 접두어. 접두어를 표 앞에 두면 표 침팬지가 "GATE: Busan"을 못 찾습니다. 코드표는 여전히 지시서 안에.',
        perChimp: [{ label: '도착지 추출' }, { label: '코드 변환' }, { label: '라벨 접두어' }],
        sampleSolution: ['Output only the value of dest. Nothing else.', CODES, 'Add the prefix GATE: before the input. Output only the result.'],
        trap: '접두어→표 순서면 열 건 전부 실패. "Output the city"는 SO 번호나 부품 코드를 낸다.',
    },
    {
        id: 'ship-dock-tag',
        dept: 'ship',
        title: '출하 도크 배정 태그',
        brief: '사장: "전표 석 줄. 목적지 코드에 DOCK: 붙이고 괄호까지, [DOCK: ICN]. 넷이나 줬으니 핑계 없다."',
        flavor: '세 줄 출하 전표에서 목적지를 뽑아 공항 코드로 바꾸고, 라벨 접두어와 괄호를 붙입니다. 네 단계 중 어느 둘을 바꿔도 다음 침팬지가 못 알아듭니다.',
        chimps: 4,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 13000,
        materialCost: 2600,
        samples: [
            S('order: SO-1501, part: BOLT-M8\nqty: 40, dest: Incheon\nbin: A3, carrier: Hanjin', '[DOCK: ICN]'),
            S('order: SO-1502, part: GEAR-12T\nqty: 12, dest: Busan\nbin: B7, carrier: CJ', '[DOCK: PUS]'),
            S('order: SO-1503, part: NUT-M8\nqty: 500, dest: Daegu\nbin: C2, carrier: Hanjin', '[DOCK: TAE]'),
        ],
        batch: [
            S('order: SO-1501, part: BOLT-M8\nqty: 40, dest: Incheon\nbin: A3, carrier: Hanjin', '[DOCK: ICN]'),
            S('order: SO-1502, part: GEAR-12T\nqty: 12, dest: Busan\nbin: B7, carrier: CJ', '[DOCK: PUS]'),
            S('order: SO-1503, part: NUT-M8\nqty: 500, dest: Daegu\nbin: C2, carrier: Hanjin', '[DOCK: TAE]'),
            S('order: SO-1504, part: SHAFT-20\nqty: 8, dest: Busan\nbin: D4, carrier: CJ', '[DOCK: PUS]'),
            S('order: SO-1505, dest: Daegu\npart: WASHER-M8, qty: 300\nbin: A9, carrier: Hanjin', '[DOCK: TAE]', 'dest가 첫 줄'),
            S('order: SO-1506, part: PIN-4\nqty: 50, bin: C1\ncarrier: CJ, dest: Incheon', '[DOCK: ICN]', 'dest가 마지막 줄 마지막 필드'),
            S('Order: SO-1507, Part: BELT-A42\nQty: 6, Dest: Busan\nBin: B4, Carrier: Hanjin', '[DOCK: PUS]', '키 대문자'),
            S('order: SO-1508, part: BRG-6204, qty: 60, dest: Daegu, bin: A5, carrier: CJ', '[DOCK: TAE]', '한 줄로 뭉친 전표'),
            S('order: SO-1509, part: PULLEY-V2\nqty: 40, dest: Incheon, origin: Busan\nbin: B2', '[DOCK: ICN]', '도시 두 개(origin). dest 필드명으로 뽑으면 안전'),
            S('order: SO-1510, part: BOLT-M8\nqty: 40, dest: Gwangju\nbin: A3, carrier: Hanjin', '[DOCK: KWJ]', '못됨: 광주'),
        ],
        hint: '네 단계: 필드 → 코드표 → 접두어 → 괄호. 표 침팬지에게 도시 대신 전표를 주면 SO 번호를 도시로 착각합니다. 접두어는 반드시 표 다음, 괄호는 맨 마지막. 셋으로 끝내고 넷째에게 복사를 시키면 짧은 라벨이 뭉개집니다.',
        perChimp: [{ label: '목적지 추출' }, { label: '코드 변환' }, { label: '라벨 접두어' }, { label: '태그 조립' }],
        sampleSolution: [
            'Output only the value of dest. Nothing else.',
            CODES,
            'Add the prefix DOCK: before the input. Output only the result.',
            'Put square brackets around the input. Example: B7 becomes [B7]. Nothing else.',
        ],
        trap: '"여유 침팬지" 사고: 3단계로 끝내고 넷째에게 복사를 시키면 [DOCK: D2] 같은 짧은 라벨이 뭉개진다(작업 6 힌트의 예고 회수).',
    },
    {
        id: 'ship-final-dispatch',
        dept: 'all',
        title: '출하 통지 최종 조립',
        brief: '사장: "석 줄짜리 메모에서 목적지 코드 뽑아 SHIP TO: PUS. 이거 되면 침팬지 더 안 살 거야."',
        flavor: '사람이 쓴 세 줄 출하 메모입니다. 문장을 JSON으로 조립하고, 목적지를 뽑고, 공항 코드로 바꾸고, 출하 라벨 접두어를 붙입니다. 배운 걸 전부 순서대로 꿰는 작업입니다. 끝나면 연간 결산이 나옵니다.',
        chimps: 4,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 15000,
        materialCost: 3000,
        samples: [
            S('DISPATCH NOTE SO-1601\nShip 6 GEAR-12T to Busan by truck.\nContact: Kim, dock office', 'SHIP TO: PUS'),
            S('DISPATCH NOTE SO-1602\nShip 3 NUT-M8 to Incheon by truck.\nContact: Lee, dock office', 'SHIP TO: ICN'),
            S('DISPATCH NOTE SO-1603\nShip 5 SHAFT-20 to Daegu by rail.\nContact: Park, dock office', 'SHIP TO: TAE'),
        ],
        batch: [
            S('DISPATCH NOTE SO-1601\nShip 6 GEAR-12T to Busan by truck.\nContact: Kim, dock office', 'SHIP TO: PUS'),
            S('DISPATCH NOTE SO-1602\nShip 3 NUT-M8 to Incheon by truck.\nContact: Lee, dock office', 'SHIP TO: ICN'),
            S('DISPATCH NOTE SO-1603\nShip 5 SHAFT-20 to Daegu by rail.\nContact: Park, dock office', 'SHIP TO: TAE'),
            S('DISPATCH NOTE SO-1604\nShip 40 BOLT-M8 to Busan by truck.\nContact: Choi, dock office', 'SHIP TO: PUS'),
            S('DISPATCH NOTE SO-1605\nIncheon will receive 12 WASHER-M8 by truck.\nContact: Kim, dock office', 'SHIP TO: ICN', '도시가 문장 앞, to 없음, 두 자리'),
            S('DISPATCH NOTE SO-1606\nShip 8 BRG-6204 to Daegu, call 010-5512-7788 on arrival.\nContact: Lee', 'SHIP TO: TAE', '전화번호 숫자 잡음'),
            S('DISPATCH NOTE SO-1607\nContact: Park, dock office\nShip 15 PIN-4 to Busan by rail.', 'SHIP TO: PUS', '줄 순서 뒤바뀜'),
            S('DISPATCH NOTE SO-1608\nPlease rush 6 belt-a42 to Incheon before Friday, then confirm.\nContact: Choi', 'SHIP TO: ICN', '소문자 코드, 잡말, 추가 절'),
            S('DISPATCH NOTE SO-1609\nShip 9 PULLEY-V2 from Daegu to Busan by truck.\nContact: Kim', 'SHIP TO: PUS', '도시 두 개(from/to). 경계선'),
            S('DISPATCH NOTE SO-1610\nShip 4 NUT-M8 to Gwangju by truck.\nContact: Lee, dock office', 'SHIP TO: KWJ', '못됨: 광주'),
        ],
        hint: '첫째는 작업 6의 JSON 지시, 둘째는 "value of dest", 셋째는 작업 7의 코드표, 넷째는 접두어. 넷째가 붙이는 건 코드(단어)라서 접두어가 안전합니다. 둘째가 따옴표를 남기면 셋째가 못 찾으니 "without quotes"를 덧붙여 보세요.',
        perChimp: [{ label: 'JSON 조립' }, { label: '목적지 추출' }, { label: '코드 변환' }, { label: '출하 라벨' }],
        sampleSolution: [JSON_PROMPT, 'Output only the value of dest, without quotes.', CODES, 'Add the prefix SHIP TO: before the input. Output only the result.'],
        trap: '첫째에 "value of dest"를 바로 시키면 콜론 필드가 없어 "Contact: Kim"을 낸다. 접두어를 룩업 앞에 두면 표 침팬지가 "SHIP TO: Busan"을 못 찾는다.',
    },
];

export const SANDBOX_DEFAULT = {
    id: 'sandbox',
    dept: 'all',
    title: '샌드박스',
    brief: '사장: "여긴 시험 라인이야. 원재료는 내가 댄다. 마음껏 굴려 봐."',
    flavor: '직접 배치를 만들어 침팬지들을 시험하세요. 비용도 매출도 없습니다. 한 줄에 한 건, "입력 => 목표" 형식.',
    chimps: 1,
    match: 'exact',
    itemThreshold: 0.9,
    revenue: 0,
    materialCost: 0,
    samples: [],
    batch: [
        S('brg-6204 steel bearing', 'BRG-6204 STEEL BEARING'),
        S('gear-12t spur gear', 'GEAR-12T SPUR GEAR'),
        S('nut-m8 hex nut', 'NUT-M8 HEX NUT'),
    ],
};

export const MATCH_MODES = [
    { value: 'exact', label: '정확히 일치' },
    { value: 'fuzzy', label: '비슷하면 됨' },
    { value: 'set', label: '목록(순서 무관)' },
    { value: 'number', label: '숫자' },
    { value: 'json', label: 'JSON' },
];

/** Parse sandbox text: one item per line, "input => target". Lines without "=>" use the input as target. */
export function parseBatchText(text) {
    return String(text ?? '')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .slice(0, BATCH_SIZE)
        .map(l => {
            const i = l.indexOf('=>');
            if (i < 0) return S(l, l);
            return S(l.slice(0, i).trim().replace(/\\n/g, '\n'), l.slice(i + 2).trim());
        });
}

export function batchToText(batch) {
    return batch.map(b => `${b.input.replace(/\n/g, '\\n')} => ${b.target}`).join('\n');
}

/** A work order is unlocked when it is first or the previous one has been passed. */
export function isUnlocked(index, passed) {
    if (index <= 0) return true;
    const prev = WORK_ORDERS[index - 1];
    return !!passed[prev.id];
}

export function campaignComplete(passed) {
    return WORK_ORDERS.every(w => passed[w.id]);
}

export const INTRO_TEXT = [
    '사장이 라인 노동자를 전부 잘랐다. 대신 들여온 건 "침팬지", 같은 소형 두뇌를 복사한 일꾼들이다.',
    '침팬지는 영어 지시 한 줄만 읽고, 앞에 놓인 물건 하나만 본다. 그리고 가끔 딴짓을 한다.',
    '처음엔 한 마리로 충분한 일이 내려온다. 대문자로 바꾸기, 칸 하나 읽기, 숫자 읽기.',
    '일이 커지면 라인이 길어진다. 앞 침팬지의 출력이 그대로 다음 침팬지의 입력이 된다.',
    '순서를 잘못 짜면 정답이 도중에 녹아 없어진다. 전표 열 장 중 여섯 장만 맞으면 통과다.',
    '팁: 지시는 영어로, 짧고 정확하게, 그리고 "Output only the result."로 끝내라.',
    '',
    '첫 실행 시 침팬지 모델을 수백 MB 내려받습니다. 모든 연산은 이 컴퓨터 안에서만 일어납니다.',
].join('\n');
