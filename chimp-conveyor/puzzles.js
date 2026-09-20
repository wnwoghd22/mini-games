// puzzles.js — production-line work orders for Chimp Conveyor (v4: batches of 10).
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
// Pass = at least PASS_COUNT correct items. Prompt limit / temperature / memory come from
// PROGRESSION[level] (level = number of passed orders).
//
// Data is English factory ERP (colon fields, codes with ≤ 1 hyphen except deliberate nasties).
// Sample solutions are English on purpose: the chimp (Qwen2.5-0.5B) follows English far better.
// Design rule: intended path uses only atoms the chimp was MEASURED to do; exceptions are fair
// (a more general instruction survives them); 1–2 items per order are genuinely nasty so 10/10 is rare.

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

/** Knobs applied when STARTING level i (i = number of passed orders). Index 8 = after the finale. */
export const PROGRESSION = [
    // temperature measured: 0.6 mangles part codes even on uppercase (3–5/10); 0.35 gives 6–7/10.
    // memoryLevel stays 0: showing the original slip as a reference made chimps copy the wrong line (L7 4/10).
    { promptLimit: 60, temperature: 0.35, memoryLevel: 0, maxTokens: 48 },
    { promptLimit: 70, temperature: 0.33, memoryLevel: 0, maxTokens: 48 },
    { promptLimit: 80, temperature: 0.31, memoryLevel: 0, maxTokens: 56 },
    { promptLimit: 90, temperature: 0.29, memoryLevel: 0, maxTokens: 56 },
    { promptLimit: 110, temperature: 0.27, memoryLevel: 0, maxTokens: 64 },
    { promptLimit: 120, temperature: 0.25, memoryLevel: 0, maxTokens: 72 },
    { promptLimit: 125, temperature: 0.22, memoryLevel: 0, maxTokens: 80 },
    { promptLimit: 135, temperature: 0.20, memoryLevel: 0, maxTokens: 96 },
    { promptLimit: 135, temperature: 0.20, memoryLevel: 0, maxTokens: 96 },
];

const S = (input, target, note) => (note ? { input, target, note } : { input, target });

export const WORK_ORDERS = [
    {
        id: 'rcv-uppercase',
        dept: 'rcv',
        title: '입고 라벨 대문자화',
        brief: '사장: "라벨러 셋 잘랐어. 소문자를 대문자로. 이건 침팬지가 아니라 돌도 해."',
        flavor: '입고 전표의 소문자 부품명을 창고 규격인 대문자로 바꿉니다. 전표는 열 장인데 생긴 게 다 다릅니다.',
        chimps: 2,
        match: 'exact',
        itemThreshold: 0.95,
        revenue: 2000,
        materialCost: 400,
        samples: [
            S('brg-6204 steel bearing', 'BRG-6204 STEEL BEARING'),
            S('gear-12t spur gear', 'GEAR-12T SPUR GEAR'),
            S('nut-m8 hex nut', 'NUT-M8 HEX NUT'),
        ],
        batch: [
            S('brg-6204 steel bearing', 'BRG-6204 STEEL BEARING'),
            S('gear-12t spur gear', 'GEAR-12T SPUR GEAR'),
            S('nut-m8 hex nut', 'NUT-M8 HEX NUT'),
            S('bolt-m8 hex bolt zinc', 'BOLT-M8 HEX BOLT ZINC'),
            S('Gear-12T Spur Gear', 'GEAR-12T SPUR GEAR', '대소문자 혼합'),
            S('pulley-v2 v-belt pulley', 'PULLEY-V2 V-BELT PULLEY', '못됨: 하이픈 단어 두 개, 마지막 단어를 흘린다'),
            S('part: nut-m8, qty: 40', 'PART: NUT-M8, QTY: 40', '콜론 필드와 숫자. 추출하면 안 되고 그대로 대문자'),
            S('brg-6204 steel bearing   ', 'BRG-6204 STEEL BEARING', '끝 공백. 샘플 1과 같아 보인다'),
            S('coil-stl-09 copper coil', 'COIL-STL-09 COPPER COIL', '못됨: 하이픈 2개 코드가 조각난다'),
            S('12 pcs nut-m8', '12 PCS NUT-M8', '숫자로 시작'),
        ],
        hint: '"UPPERCASE"라는 단어를 정확히 쓰고 "Output only the result."로 끝내세요. 둘째 침팬지도 뭔가 시켜야 합니다. 이미 대문자인 걸 또 대문자로 바꾸라고 하면 침팬지는 딴짓을 합니다. "그대로 넘겨라"가 안전합니다.',
        perChimp: [{ label: '대문자화' }, { label: '전달' }],
        sampleSolution: ['Convert the input to UPPERCASE. Output only the result.', 'Output the input exactly as it is.'],
        trap: '"Change brg-6204 to BRG-6204."처럼 샘플을 베끼면 열 건 모두 같은 답. "Make the letters big."은 신제품 발명. 둘째에게도 대문자화를 시키면 이미 대문자인 코드를 다시 "고쳐" 망가뜨린다(측정: 4~5/10 → 6~7/10).',
    },
    {
        id: 'rcv-bin-field',
        dept: 'rcv',
        title: '선반 번호 추출',
        brief: '사장: "창고 로봇은 선반 번호만 받아. 전표 열 장이 다 같은 순서일 거라곤 나도 안 했어."',
        flavor: 'ERP 한 줄에서 선반(bin) 번호 하나만 뽑아 창고 로봇에 넘깁니다. 전표 작성자가 세 명이라 필드 순서가 제멋대로입니다.',
        chimps: 2,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 3000,
        materialCost: 600,
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
            S('part: BRG-6204, bin: A5, qty: 60', 'A5', 'bin이 가운데. "마지막 값"은 60'),
            S('part: PULLEY-V2, qty: 40, bin: B2, lot: L-2209', 'B2', '필드 추가. "마지막 값"은 L-2209'),
            S('Part: NUT-M8, Qty: 40, Bin: C9', 'C9', '키 대문자'),
            S('part: BOLT-M8, qty: 120, bin: A12', 'A12', '세 글자 선반'),
            S('bin: E1, part: SHAFT-20, qty: 8', 'E1', '못됨: 첫 필드'),
            S('part: GEAR-12T, qty: 12, bin: b7 ', 'b7', '소문자 값과 끝 공백'),
        ],
        hint: '필드 이름을 전표에 적힌 그대로("value of bin") 쓰세요. "마지막 값"이라고 쓰면 순서가 바뀐 전표에서 죽습니다. 둘째는 "그대로 넘겨라"만.',
        perChimp: [{ label: '필드 추출' }, { label: '전달' }],
        sampleSolution: ['Output only the value of bin. Nothing else.', 'Output the input exactly as it is.'],
        trap: '"Output the last word."는 순서 바뀐 두 건에서 죽어 7/10 언저리. "Output the shelf number."(전표에 없는 단어)는 설명문. "Output A3."는 열 건 모두 A3.',
    },
    {
        id: 'asm-lot-tag',
        dept: 'asm',
        title: '로트 태그 인쇄',
        brief: '사장: "조립대엔 [로트번호] 태그만 붙여. 뽑는 놈, 괄호 치는 놈. 두 마리면 사치지."',
        flavor: 'ERP 한 줄에서 로트(lot) 번호를 뽑아 대괄호 태그 양식으로 만듭니다. 로트 번호 모양이 늘 같지는 않습니다.',
        chimps: 2,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 4000,
        materialCost: 800,
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
            S('part: BOLT-M8, bin: A5, lot: L-2302', '[L-2302]', 'lot이 마지막'),
            S('part: PULLEY-V2, lot: L-2303, bin: B2, qty: 40', '[L-2303]', '필드 추가'),
            S('part: GEAR-12T, lot: 7731, bin: B7', '[7731]', '숫자만인 로트. "L로 시작하는 코드"는 죽는다'),
            S('Part: BRG-6204, Lot: L-2304, Bin: A3', '[L-2304]', '키 대문자'),
            S('lot: L-2305, part: NUT-M8, bin: C2', '[L-2305]', '못됨: 첫 필드'),
            S('part: BOLT-M8, lot: L-2308-B, bin: A3', '[L-2308-B]', '못됨: 하이픈 2개 로트'),
        ],
        hint: '괄호는 말로 설명하지 말고 "B7 becomes [B7]"처럼 변환 예시를 보여 주세요. 예시가 입력과 닮으면 침팬지가 예시를 그대로 베낍니다.',
        perChimp: [{ label: '로트 추출' }, { label: '괄호 치기' }],
        sampleSolution: ['Output only the value of lot. Nothing else.', 'Put square brackets around the input. Example: B7 becomes [B7]. Nothing else.'],
        trap: '예시 없이 "Put brackets around it."는 "[ ]". 예시를 [L-0001]로 쓰면 서너 건이 [L-0001]. 한 마리에게 다 시키면 줄 전체를 괄호 친다.',
    },
    {
        id: 'pack-pallet-label',
        dept: 'pack',
        title: '팔레트 수량 라벨',
        brief: '사장: "영업이 문장으로 보내. 라벨은 PALLETS: 숫자야. 문장에 숫자가 몇 개든 팔레트는 하나잖아."',
        flavor: '영업팀 문장에서 팔레트 수를 뽑아 포장 라벨 양식으로 만듭니다. 문장엔 주문번호도 숫자입니다.',
        chimps: 2,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 5000,
        materialCost: 1000,
        samples: [
            S('Order SO-4471: ship 3 pallets of BRG-6204 to Busan by Friday', 'PALLETS: 3'),
            S('Order SO-4472: ship 5 pallets of GEAR-12T to Daegu by Monday', 'PALLETS: 5'),
            S('Order SO-4473: ship 2 pallets of NUT-M8 to Incheon by Tuesday', 'PALLETS: 2'),
        ],
        batch: [
            S('Order SO-4471: ship 3 pallets of BRG-6204 to Busan by Friday', 'PALLETS: 3'),
            S('Order SO-4472: ship 5 pallets of GEAR-12T to Daegu by Monday', 'PALLETS: 5'),
            S('Order SO-4473: ship 2 pallets of NUT-M8 to Incheon by Tuesday', 'PALLETS: 2'),
            S('Order SO-4474: 4 PLT of BOLT-M8 to Gwangju by Friday', 'PALLETS: 4', '못됨: pallets 대신 PLT 약어'),
            S('Order SO-4475: ship 12 pallets of SHAFT-20 to Busan by Friday', 'PALLETS: 12', '두 자리 수. 한 자리 예시를 베끼는 경향'),
            S('Ship 6 pallets of PULLEY-V2 to Daegu. Order SO-4476.', 'PALLETS: 6', '주문번호가 뒤에'),
            S('Order SO-4477: BRG-6204, 7 pallets, to Incheon by Monday', 'PALLETS: 7', '어순 변경'),
            S('Order SO-4478: ship 8 pallets of GEAR-12T and 3 boxes of NUT-M8 to Busan', 'PALLETS: 8', '못됨: 두 수량. 3이나 11이 나오기 쉽다'),
            S('Order SO-4479: ship 10 pallets of NUT-M8 (2 boxes each) to Daegu', 'PALLETS: 10', '못됨: 작은 숫자가 하나 더'),
            S('Order SO-4480: ship 1 pallet of SHAFT-20 to Gwangju by Tuesday', 'PALLETS: 1', '단수형 pallet'),
        ],
        hint: '"몇 팔레트냐"고 질문 형태로 물으면 숫자를 잘 뽑습니다. 양식은 "prefix"라는 단어로 시키세요. 예시 숫자를 보여 주면 침팬지는 예시를 베끼고, "그대로 넘겨라"는 라벨을 떼고 숫자만 넘깁니다.',
        perChimp: [{ label: '수량 추출' }, { label: '라벨 양식' }],
        sampleSolution: ['How many pallets? Output only the number.', 'Add the prefix PALLETS: before the input. Output only the result.'],
        trap: '"Output the number."는 4471. "Output the second number."는 주문번호가 뒤에 있는 건에서 죽는다. 예시를 PALLETS: 3으로 쓰면 절반이 3.',
    },
    {
        id: 'ship-dest-tag',
        dept: 'ship',
        title: '도착지 코드 태그',
        brief: '사장: "택배사는 도시 대신 세 글자 코드를 써. 코드표? 어디 두든 알아서 해. 광주도 간다더라."',
        flavor: '주문 한 줄에서 도착지를 뽑아 코드로 바꾸고 [코드] 태그로 만듭니다. 코드표를 어디에 적느냐, 순서를 어떻게 두느냐가 전부입니다.',
        chimps: 3,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 6500,
        materialCost: 1300,
        samples: [
            S('order: SO-7781, part: BOLT-M8, dest: Daegu, qty: 200', '[TAE]'),
            S('order: SO-7782, part: GEAR-12T, dest: Busan, qty: 40', '[PUS]'),
            S('order: SO-7783, part: NUT-M8, dest: Incheon, qty: 500', '[ICN]'),
        ],
        batch: [
            S('order: SO-7781, part: BOLT-M8, dest: Daegu, qty: 200', '[TAE]'),
            S('order: SO-7782, part: GEAR-12T, dest: Busan, qty: 40', '[PUS]'),
            S('order: SO-7783, part: NUT-M8, dest: Incheon, qty: 500', '[ICN]'),
            S('order: SO-7784, part: SHAFT-20, dest: Gwangju, qty: 8', '[KWJ]', '샘플에 없는 도시'),
            S('order: SO-7785, part: BRG-6204, qty: 60, dest: Daegu', '[TAE]', 'dest가 마지막'),
            S('order: SO-7786, dest: Busan, part: PULLEY-V2, qty: 40', '[PUS]', 'dest가 둘째'),
            S('Order: SO-7787, Part: BOLT-M8, Dest: Incheon, Qty: 120', '[ICN]', '키 대문자'),
            S('order: SO-7788, part: NUT-M8, dest: daegu, qty: 500', '[TAE]', '못됨: 소문자 도시'),
            S('dest: Gwangju, order: SO-7789, part: GEAR-12T, qty: 12', '[KWJ]', '못됨: 첫 필드'),
            S('order: SO-7790, part: SHAFT-20, dest: Busan, qty: 8, carrier: CJ', '[PUS]', '필드 추가'),
        ],
        hint: '추출 → 조회 → 괄호. 코드표는 둘째 침팬지의 지시서 안에 직접 적으세요 (Busan=PUS, Incheon=ICN, Daegu=TAE, Gwangju=KWJ). 힌트에 도시가 넷인 이유가 있습니다.',
        perChimp: [{ label: '도착지 추출' }, { label: '코드 조회' }, { label: '태그 양식' }],
        sampleSolution: ['Output only the value of dest. Nothing else.', 'Codes: Busan=PUS, Incheon=ICN, Daegu=TAE, Gwangju=KWJ. Find the input city in the list. Output only its code.', 'Put square brackets around the input. Example: B7 becomes [B7]. Nothing else.'],
        trap: '1번에게 코드표를 주면 열 건 전부 PUS(표의 첫 항목). 표를 3개 도시로만 쓰면 광주 두 건 탈락. 괄호를 먼저 치면 [Daegu]=TAE.',
    },
    {
        id: 'pack-robot-json',
        dept: 'pack',
        title: '포장 로봇 JSON',
        brief: '사장: "포장 로봇은 JSON만 먹어. 키는 item, qty, dest. 영업 문장은… 영업이 쓰는 거니까 기대 마."',
        flavor: '영업 문장을 포장 로봇용 JSON으로 바꿉니다. 키 이름은 로봇이 정했고, 문장은 영업이 정했습니다.',
        chimps: 2,
        match: 'json',
        itemThreshold: 0.9,
        revenue: 8000,
        materialCost: 1600,
        samples: [
            S('Ship 3 pallets of BRG-6204 to Busan by Friday', '{"item":"BRG-6204","qty":3,"dest":"Busan"}'),
            S('Ship 5 pallets of GEAR-12T to Daegu by Monday', '{"item":"GEAR-12T","qty":5,"dest":"Daegu"}'),
            S('Ship 2 pallets of NUT-M8 to Incheon by Tuesday', '{"item":"NUT-M8","qty":2,"dest":"Incheon"}'),
        ],
        batch: [
            S('Ship 3 pallets of BRG-6204 to Busan by Friday', '{"item":"BRG-6204","qty":3,"dest":"Busan"}'),
            S('Ship 5 pallets of GEAR-12T to Daegu by Monday', '{"item":"GEAR-12T","qty":5,"dest":"Daegu"}'),
            S('Ship 2 pallets of NUT-M8 to Incheon by Tuesday', '{"item":"NUT-M8","qty":2,"dest":"Incheon"}'),
            S('Ship 4 pallets of BOLT-M8 to Gwangju by Friday', '{"item":"BOLT-M8","qty":4,"dest":"Gwangju"}'),
            S('Ship 12 pallets of SHAFT-20 to Busan by Friday', '{"item":"SHAFT-20","qty":12,"dest":"Busan"}', '두 자리 수'),
            S('Ship 6 boxes of PULLEY-V2 to Daegu', '{"item":"PULLEY-V2","qty":6,"dest":"Daegu"}', '단위가 boxes. "number of pallets"라고 쓰면 죽는다'),
            S('To Incheon: 7 pallets of BRG-6204, urgent', '{"item":"BRG-6204","qty":7,"dest":"Incheon"}', '어순 변경과 잡단어'),
            S('Order SO-4478: ship 8 pallets of NUT-M8 to Daegu', '{"item":"NUT-M8","qty":8,"dest":"Daegu"}', '숫자 추가. qty가 4478이 되는 경우'),
            S('Ship 9 pallets of COIL-STL-09 to Busan', '{"item":"COIL-STL-09","qty":9,"dest":"Busan"}', '못됨: 하이픈 2개 코드'),
            S('Ship 3 pallets of BRG-6204 to Busan by Friday. Call before delivery.', '{"item":"BRG-6204","qty":3,"dest":"Busan"}', '문장 추가. note 키를 창작하기도'),
        ],
        hint: '키 이름(item, qty, dest)을 지시서에 직접 적고 각 키가 뭔지 한 단어로 설명하세요. "pallets"라고 못 박으면 상자로 오는 주문에서 죽습니다. 둘째는 "그대로 출력". "검수해라"는 감상문을 받습니다.',
        perChimp: [{ label: 'JSON 변환' }, { label: '전달' }],
        sampleSolution: ['Output JSON with keys item (part code), qty (number) and dest (city). Output only the JSON.', 'Output the input exactly as it is.'],
        trap: '"Convert to JSON."은 키를 창작(product, amount). 둘째에 "Check the JSON."은 설명이 붙어 열 건 전멸.',
    },
    {
        id: 'lbl-robot-return-tag',
        dept: 'lbl',
        title: '로봇 반송 태그',
        brief: '사장: "포장 로봇이 JSON으로 반송을 보내. 거기서 item 꺼내서 [코드] 태그 붙여. 로봇이 보내는 건데 형식이 왜 매번 다르냐고? 로봇도 영업이 가르쳤어."',
        flavor: '포장 로봇이 보낸 JSON에서 부품 코드를 꺼내 대괄호 태그로 만듭니다. 키 순서, 공백, 따옴표 모양이 매번 다릅니다.',
        chimps: 2,
        match: 'exact',
        itemThreshold: 0.9,
        revenue: 10000,
        materialCost: 2000,
        samples: [
            S('{"item":"NUT-M8","qty":3,"dest":"Busan"}', '[NUT-M8]'),
            S('{"item":"GEAR-12T","qty":12,"dest":"Daegu"}', '[GEAR-12T]'),
            S('{"item":"BOLT-M8","qty":5,"dest":"Incheon"}', '[BOLT-M8]'),
        ],
        batch: [
            S('{"item":"NUT-M8","qty":3,"dest":"Busan"}', '[NUT-M8]'),
            S('{"item":"GEAR-12T","qty":12,"dest":"Daegu"}', '[GEAR-12T]'),
            S('{"item":"BOLT-M8","qty":5,"dest":"Incheon"}', '[BOLT-M8]'),
            S('{"item":"SHAFT-20","qty":2,"dest":"Gwangju"}', '[SHAFT-20]'),
            S('{"dest":"Incheon","item":"BRG-6204","qty":40}', '[BRG-6204]', 'item이 둘째 키'),
            S('{"qty":8,"dest":"Busan","item":"PULLEY-V2"}', '[PULLEY-V2]', 'item이 마지막 키'),
            S('{ "item": "NUT-M8", "qty": 3, "dest": "Daegu", "note": "urgent" }', '[NUT-M8]', '공백과 추가 키'),
            S('{"item":["GEAR-12T"],"qty":[12],"dest":["Busan"]}', '[GEAR-12T]', '값이 배열. 로봇이 포장을 두 번 했다'),
            S('{"item":"COIL-STL-09","qty":9,"dest":"Busan"}', '[COIL-STL-09]', '못됨: 하이픈 2개 코드'),
            S('{"item":"bolt-m8","qty":5,"dest":"Incheon"}', '[bolt-m8]', '소문자 코드 (대문자로 내도 case-only 0.9로 통과)'),
        ],
        hint: 'JSON도 전표입니다. "the value of item"으로 부르면 키 순서가 바뀌어도 살아남습니다. 괄호는 "B7 becomes [B7]" 변환 예시로. 따옴표가 남으면 채점이 벗겨 줍니다.',
        perChimp: [{ label: 'item 추출' }, { label: '괄호 치기' }],
        sampleSolution: ['Output only the value of item. Nothing else.', 'Put square brackets around the input. Example: B7 becomes [B7]. Nothing else.'],
        trap: '"Output the first value"는 키 순서가 바뀐 건에서 죽는다. "Output the part code"는 JSON 전체를 돌려주기도 한다. 배열 값은 ["GEAR-12T"]째로 괄호를 쳐 [["GEAR-12T"]]가 된다.',
    },
    {
        id: 'ship-safety-relay',
        dept: 'ship',
        title: '안전 공지 릴레이',
        brief: '사장: "출하장까지 공지 열 장 돌려. 넷이 차례로 전달만. 그대로. 그. 대. 로. 살 붙이면 바나나 압류."',
        flavor: '공지 한 장을 네 마리가 한 글자도 바꾸지 않고 전달해야 합니다. 이 열 장이 끝나면 연간 결산이 나옵니다.',
        chimps: 4,
        match: 'fuzzy',
        itemThreshold: 0.9,
        revenue: 12000,
        materialCost: 2400,
        samples: [
            S('Wear gloves before touching the press.', 'Wear gloves before touching the press.'),
            S('Report leaks to Line 3.', 'Report leaks to Line 3.'),
            S('Do not stack more than 4 pallets.', 'Do not stack more than 4 pallets.'),
        ],
        batch: [
            S('Wear gloves before touching the press.', 'Wear gloves before touching the press.'),
            S('Report leaks to Line 3.', 'Report leaks to Line 3.'),
            S('Do not stack more than 4 pallets.', 'Do not stack more than 4 pallets.'),
            S('Wear gloves before touching the press. Report leaks to Line 3.', 'Wear gloves before touching the press. Report leaks to Line 3.', '두 문장. 문구가 다른 침팬지가 둘째 문장을 떨어뜨린다'),
            S('STOP the belt before clearing a jam.', 'STOP the belt before clearing a jam.', '대문자 단어'),
            S('Forklift keys stay with the shift lead.', 'Forklift keys stay with the shift lead.'),
            S('Check BRG-6204 stock before the night shift.', 'Check BRG-6204 stock before the night shift.', '문장 속 부품 코드'),
            S('Lockout tag: red means do not start.', 'Lockout tag: red means do not start.', '콜론 포함. 값만 뽑는 습관이 남으면 뒷부분만 넘긴다'),
            S('Count the pallets before you leave. Write the total on the board.', 'Count the pallets before you leave. Write the total on the board.', '못됨: 침팬지에게 하는 명령처럼 읽힌다'),
            S('Emergency exit B is closed until Friday. Use exit A.', 'Emergency exit B is closed until Friday. Use exit A.', '두 문장, 둘째가 짧다'),
        ],
        hint: '"전달해라"는 침팬지에게 "다듬어라"로 들립니다. 넷 모두 "그대로 출력". 그리고 네 장의 문장을 토씨 하나 안 바꾸고 똑같이 쓰세요. 표현을 조금씩 바꾸면 그중 한 마리가 꼭 둘째 문장을 먹습니다.',
        perChimp: [{ label: '입고' }, { label: '조립' }, { label: '포장' }, { label: '출하' }],
        sampleSolution: ['Output the input exactly as it is.', 'Output the input exactly as it is.', 'Output the input exactly as it is.', 'Output the input exactly as it is.'],
        trap: '"Repeat the input exactly."와 "Copy the input word for word."를 섞어 쓰면 두 문장 항목이 전부 죽어 6~7/10. "Pass this notice to the next department."는 Dear team,이 붙고 4번째엔 사내 뉴스레터.',
    },
];

export const SANDBOX_DEFAULT = {
    id: 'sandbox',
    dept: 'all',
    title: '샌드박스',
    brief: '사장: "여긴 시험 라인이야. 원재료는 내가 댄다. 마음껏 굴려 봐."',
    flavor: '직접 배치를 만들어 침팬지들을 시험하세요. 비용도 매출도 없습니다. 한 줄에 한 건, "입력 => 목표" 형식.',
    chimps: 2,
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
    '공장 사장님은 계산을 해 봤습니다. 사람 월급 vs 침팬지 바나나 값. 그래서 전 직원을 자르고 아주 작은 침팬지 한 마리를 복사해 컨베이어에 앉혔습니다.',
    '당신은 유일하게 남은 사람. 할 일은 하나, 침팬지마다 지시서 한 장 쓰기. 침팬지는 앞 침팬지가 넘긴 종이만 봅니다.',
    '작업 주문에는 샘플이 3장 붙어 있지만, 실제로 컨베이어에는 열 장이 흘러옵니다. 순서가 뒤바뀐 전표, 두 자리 수량, 처음 보는 도시. 열 장 중 여섯 장을 맞히면 합격입니다.',
    '샘플만 보고 쓴 지시서는 샘플만 맞힙니다. 전표에 적힌 이름 그대로, 한 마리에게 한 가지 일만.',
    '팁: 이 침팬지는 이상하게 영어 지시를 훨씬 잘 알아듣습니다. 짧고 정확하게, 그리고 꼭 이 문장으로 끝내세요. "Output only the result."',
    '',
    '첫 실행 시 침팬지 모델을 수백 MB 내려받습니다. 모든 연산은 이 컴퓨터 안에서만 일어납니다.',
].join('\n');
