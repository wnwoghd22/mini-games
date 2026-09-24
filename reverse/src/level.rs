//! ASCII 레벨 데이터, 스크롤, 타일/적 스폰, 홀드(보스전)와 클리어 라인.
//!
//! 레벨은 20열 문자열의 배열이며 **위→아래 순서**로 작성한다(첫 행이 레벨의 끝, 마지막 행이 시작 지점).
//! 타일: `.` 빈칸 `#` 중립 벽 `M` 물질 벽 `A` 반물질 벽 `m`/`a` 물질/반물질 터렛
//! `d`/`D` 물질/반물질 드리프터 `p` 페이저 `~` 간섭 필드 `S` 스위치 블록 `B` 보스 `E` 클리어 라인
//! `1`~`4` 코어(홀수 물질, 짝수 반물질) `q`/`w`/`e`/`r` 코어 1~4에 연결된 잠금 벽(중립, 코어 파괴 시 사라짐)
//! `---hold---` 행: 화면 중앙에 도달하면 스크롤 정지, 화면 안 적을 모두 제거하면 재개

use bevy::prelude::*;

use crate::enemy::{self, Core, Kind};
use crate::phase::Phase;
use crate::pixel::{sprite, Spr, SpriteKind, SpriteSet};
use crate::{GameEntity, GameState, Pos, HALF_H, HALF_W, TILE};

pub const COLS: usize = 20;
pub const SCROLL_SPEED: f32 = 26.0;

pub const Z_WALL: f32 = 10.0;
pub const Z_FIELD: f32 = 5.0;

#[derive(Resource)]
pub struct Scroll {
    pub cam_y: f32,
    /// 이번 프레임 카메라 이동량 (플레이어·부유 적이 화면에 올라타는 데 사용)
    pub dy: f32,
    pub held: bool,
}

impl Default for Scroll {
    fn default() -> Self {
        Self {
            cam_y: 0.0,
            dy: 0.0,
            held: false,
        }
    }
}

impl Scroll {
    pub fn top(&self) -> f32 {
        self.cam_y + HALF_H
    }
    pub fn bottom(&self) -> f32 {
        self.cam_y - HALF_H
    }
}

#[derive(Resource)]
pub struct LevelData {
    rows: Vec<&'static str>,
    /// 다음에 스폰할 행 (아래에서 위로 진행하므로 감소)
    next: isize,
}

impl Default for LevelData {
    fn default() -> Self {
        let rows = build_level();
        for (i, r) in rows.iter().enumerate() {
            assert!(
                r.len() == COLS || r.starts_with("---"),
                "level row {i} has width {} (expected {COLS}): {r:?}",
                r.len()
            );
        }
        let next = rows.len() as isize - 1;
        Self { rows, next }
    }
}

impl LevelData {
    /// 행 r의 월드 y (마지막 행 = 화면 맨 아래 타일)
    fn row_y(&self, r: usize) -> f32 {
        -HALF_H + TILE / 2.0 + TILE * (self.rows.len() - 1 - r) as f32
    }
}

pub fn col_x(c: usize) -> f32 {
    -HALF_W + TILE / 2.0 + TILE * c as f32
}

#[derive(Component)]
pub struct Wall;

#[derive(Component)]
pub struct Field;

/// 잠금 벽이 속한 코어 그룹
#[derive(Component)]
pub struct LockGroup(pub u8);

#[derive(Component)]
pub struct Switch {
    pub cooldown: f32,
    pub on: bool,
}

#[derive(Component)]
pub struct HoldLine;

#[derive(Component)]
pub struct ClearLine;

/// 화면 아래로 벗어나면 제거되는 레벨 오브젝트
#[derive(Component)]
pub struct Scrolled;

// ---------- 시스템 ----------

pub fn scroll(
    time: Res<Time>,
    mut scroll: ResMut<Scroll>,
    enemies: Query<&Pos, With<enemy::Enemy>>,
) {
    let dt = time.delta_secs().min(0.05);
    if scroll.held {
        let top = scroll.top() + 8.0;
        let bottom = scroll.bottom() - 8.0;
        let alive = enemies.iter().any(|p| p.0.y < top && p.0.y > bottom);
        if !alive {
            scroll.held = false;
        }
    }
    scroll.dy = if scroll.held { 0.0 } else { SCROLL_SPEED * dt };
    scroll.cam_y += scroll.dy;
}

/// 화면 위쪽에 다가온 행을 스폰
pub fn spawn_rows(
    mut commands: Commands,
    set: Res<SpriteSet>,
    mut level: ResMut<LevelData>,
    scroll: Res<Scroll>,
) {
    while level.next >= 0 {
        let r = level.next as usize;
        let y = level.row_y(r);
        if y > scroll.top() + TILE * 1.5 {
            break;
        }
        spawn_row(&mut commands, &set, level.rows[r], y);
        level.next -= 1;
    }
}

fn spawn_row(commands: &mut Commands, set: &SpriteSet, row: &str, y: f32) {
    if row.starts_with("---") {
        commands.spawn((HoldLine, Pos(Vec2::new(0.0, y)), Scrolled, GameEntity));
        return;
    }
    for (c, ch) in row.chars().enumerate() {
        let pos = Vec2::new(col_x(c), y);
        match ch {
            '#' => spawn_wall(commands, set, pos, Phase::Neutral),
            'M' => spawn_wall(commands, set, pos, Phase::Matter),
            'A' => spawn_wall(commands, set, pos, Phase::Anti),
            '~' => {
                commands.spawn((
                    sprite(set, Spr::Field, pos.extend(Z_FIELD)),
                    Pos(pos),
                    Field,
                    Scrolled,
                    GameEntity,
                ));
            }
            'S' => {
                commands.spawn((
                    sprite(set, Spr::SwitchOn, pos.extend(Z_WALL)),
                    Pos(pos),
                    Switch {
                        cooldown: 0.0,
                        on: true,
                    },
                    Scrolled,
                    GameEntity,
                ));
            }
            'm' | 'a' | 'd' | 'D' | 'p' | 'B' => {
                let (kind, phase) = match ch {
                    'm' => (Kind::Turret, Phase::Matter),
                    'a' => (Kind::Turret, Phase::Anti),
                    'd' => (Kind::Drifter, Phase::Matter),
                    'D' => (Kind::Drifter, Phase::Anti),
                    'p' => (Kind::Phaser, Phase::Matter),
                    _ => (Kind::Boss, Phase::Matter),
                };
                enemy::spawn(commands, set, kind, phase, pos);
            }
            'E' => {
                commands.spawn((ClearLine, Pos(pos), Scrolled, GameEntity));
            }
            '1'..='4' => {
                let g = ch as u8 - b'0';
                let e = enemy::spawn(commands, set, Kind::Core, core_phase(g), pos);
                commands.entity(e).insert(Core(g));
            }
            'q' | 'w' | 'e' | 'r' => {
                let g = match ch {
                    'q' => 1,
                    'w' => 2,
                    'e' => 3,
                    _ => 4,
                };
                commands.spawn((
                    sprite(set, Spr::LockWall, pos.extend(Z_WALL)),
                    Pos(pos),
                    Phase::Neutral,
                    core_phase(g).accent(),
                    Wall,
                    LockGroup(g),
                    Scrolled,
                    GameEntity,
                ));
            }
            _ => {}
        }
    }
}

/// 코어 번호 → 위상 (홀수 물질, 짝수 반물질)
fn core_phase(g: u8) -> Phase {
    if g % 2 == 1 { Phase::Matter } else { Phase::Anti }
}

fn spawn_wall(commands: &mut Commands, set: &SpriteSet, pos: Vec2, phase: Phase) {
    commands.spawn((
        sprite(set, wall_sprite(phase), pos.extend(Z_WALL)),
        Pos(pos),
        phase,
        Wall,
        Scrolled,
        GameEntity,
    ));
}

pub fn wall_sprite(phase: Phase) -> Spr {
    match phase {
        Phase::Matter => Spr::WallM,
        Phase::Anti => Spr::WallA,
        Phase::Neutral => Spr::WallN,
    }
}

/// 홀드 라인이 화면 중앙에 오면 스크롤 정지, 클리어 라인이 오면 스테이지 클리어
pub fn lines(
    mut commands: Commands,
    mut scroll: ResMut<Scroll>,
    holds: Query<(Entity, &Pos), With<HoldLine>>,
    clears: Query<&Pos, With<ClearLine>>,
    mut next: ResMut<NextState<GameState>>,
) {
    for (e, p) in &holds {
        if p.0.y <= scroll.cam_y {
            scroll.held = true;
            commands.entity(e).despawn();
        }
    }
    if clears.iter().any(|p| p.0.y <= scroll.cam_y + 40.0) {
        next.set(GameState::Clear);
    }
}

pub fn despawn_below(
    mut commands: Commands,
    scroll: Res<Scroll>,
    q: Query<(Entity, &Pos), With<Scrolled>>,
) {
    let limit = scroll.bottom() - TILE * 2.0;
    for (e, p) in &q {
        if p.0.y < limit {
            commands.entity(e).despawn();
        }
    }
}

/// 스위치 토글: 화면 안 물질/반물질 벽의 위상을 전부 뒤집는다 (스위치 자체는 중립, 어떤 탄에도 반응)
pub fn toggle_switch<F: bevy::ecs::query::QueryFilter>(
    switch: &mut Switch,
    switch_kind: &mut SpriteKind,
    scroll: &Scroll,
    walls: &mut Query<(&Pos, &mut Phase, &mut SpriteKind), F>,
) {
    switch.on = !switch.on;
    switch.cooldown = 0.5;
    switch_kind.0 = if switch.on { Spr::SwitchOn } else { Spr::SwitchOff };
    let top = scroll.top() + TILE;
    let bottom = scroll.bottom() - TILE;
    for (p, mut ph, mut kind) in walls.iter_mut() {
        if *ph == Phase::Neutral || p.0.y > top || p.0.y < bottom {
            continue;
        }
        *ph = ph.flip();
        kind.0 = wall_sprite(*ph);
    }
}

pub fn tick_switches(time: Res<Time>, mut q: Query<&mut Switch>) {
    for mut s in &mut q {
        s.cooldown = (s.cooldown - time.delta_secs()).max(0.0);
    }
}

// ---------- 레벨 데이터 (위 → 아래) ----------

fn build_level() -> Vec<&'static str> {
    let mut v = Vec::new();
    v.extend_from_slice(SEG_END);
    v.extend_from_slice(SEG_BOSS);
    v.extend_from_slice(SEG_CORE);
    v.extend_from_slice(SEG_PUZZLE2);
    v.extend_from_slice(SEG_SCROLL2);
    v.extend_from_slice(SEG_PUZZLE1);
    v.extend_from_slice(SEG_SCROLL1);
    v.extend_from_slice(SEG_INTRO);
    v
}

/// 시작 구간: 적 없음, 벽 맛보기
const SEG_INTRO: &[&str] = &[
    "....................",
    "......m......a......",
    "....................",
    "....................",
    "....................",
    "MMMM............AAAA",
    "....................",
    "....................",
    "........MMMM........",
    "....................",
    "....................",
    "AAAA............MMMM",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
];

/// 스크롤 1: 터렛과 드리프터
const SEG_SCROLL1: &[&str] = &[
    "....................",
    ".....D........d.....",
    "....................",
    "##......m....a....##",
    "##................##",
    "##.....MMMMMM.....##",
    "##................##",
    "##................##",
    "##.......d........##",
    "##................##",
    "##.AAAA......AAAA.##",
    "##..a..........m..##",
    "##................##",
    "##................##",
    "##......D..D......##",
    "##................##",
    "##................##",
    "....................",
    "....................",
    "..........d.........",
    "....................",
    "....................",
    "....m..........a....",
    "....................",
    "....................",
    "....................",
];

/// 퍼즐 1: 교대로 위상을 바꿔야만 통과하는 지그재그 회랑 (게이지 관리)
const SEG_PUZZLE1: &[&str] = &[
    "....................",
    "....................",
    "AAAAAAAAAAAAAAAAAAAA",
    "AAAAAAAAAAAAAAAAAAAA",
    "....................",
    "....................",
    "......a......a......",
    "....................",
    "MMMMMMMMMMMMMMMMMMMM",
    "MMMMMMMMMMMMMMMMMMMM",
    "....................",
    "....................",
    "...m............m...",
    "....................",
    "####AAAAAAAAAAAA####",
    "....................",
    "....................",
    "####MMMMMMMMMMMM####",
    "....................",
    "....................",
    "....................",
    "AAAAAAAAAAAA........",
    "........MMMMMMMMMMMM",
    "....................",
    "....................",
    "MMMMMMMMMMMM........",
    "........AAAAAAAAAAAA",
    "....................",
    "....................",
    "....................",
    "AAAAAAAAAAAAAAAAAAAA",
    "....................",
    "....................",
    "....................",
    "MMMMMMMMMMMMMMMMMMMM",
    "....................",
    "....................",
    "....................",
];

/// 스크롤 2: 페이저(위상을 바꾸는 적)
const SEG_SCROLL2: &[&str] = &[
    "....................",
    "....................",
    ".........p..........",
    "....................",
    "....................",
    "..D..............d..",
    "....................",
    "......MMMM..AAAA....",
    "....................",
    "....................",
    ".....p........p.....",
    "....................",
    "....................",
    "....AAAA..MMMM......",
    "....................",
    "....................",
    "..m..............a..",
    "....................",
    "....................",
    "..........p.........",
    "....................",
    "....................",
    "....................",
];

/// 퍼즐 2: 스위치로 벽을 열고, 간섭 필드에서는 전환 불가
const SEG_PUZZLE2: &[&str] = &[
    "....................",
    "....................",
    "####AAAAAAASAAAA####",
    "#~~~~~~~~~~~~~~~~~~#",
    "#~~~~~~~~~~~~~~~~~~#",
    "####MMMMMMMSMMMM####",
    "#~~~~~~~~~~~~~~~~~~#",
    "#~~~~~~~~~~~~~~~~~~#",
    "#~~~~~~~~~~~~~~~~~~#",
    "....................",
    "....................",
    "....................",
    "~~~~~~~~~~~~~~~~~~~~",
    "~~~~a~~~~~~~~~~m~~~~",
    "~~~~~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~~~~~~~~",
    "....................",
    "....................",
    "....................",
    "MMMMMMMMMSMMMMMMMMMM",
    "....................",
    "....................",
    "....................",
    ".........d..........",
    "....................",
    "....................",
];

/// 코어 퍼즐: 잠금 벽(중립, 항상 활성)은 연결된 코어를 파괴해야만 사라진다
const SEG_CORE: &[&str] = &[
    "....................",
    "....................",
    "wwwwwwwwwweeeeeeeeee",
    "....................",
    "....................",
    "~~~~~~~~~~~~~~~~~~~~",
    "~~~~2~~~m~~~a~~~3~~~",
    "~~~~~~~~~~~~~~~~~~~~",
    "~~~~~~~~~~~~~~~~~~~~",
    "....................",
    "....................",
    "....................",
    "qqqqqqqqqqqqqqqqqqqq",
    "....................",
    "....................",
    "AAAAAAAAA1AAAAAAAAAA",
    "....................",
    "....................",
    "..a..............a..",
    "....................",
    "....................",
    "....................",
];

/// 보스: 홀드 라인이 화면 중앙에 오면 정지, 보스 격파 후 재개
const SEG_BOSS: &[&str] = &[
    "....................",
    "....................",
    ".........B..........",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "---hold---",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
];

const SEG_END: &[&str] = &[
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "EEEEEEEEEEEEEEEEEEEE",
    "....................",
    "....................",
    "....................",
    "....................",
];
