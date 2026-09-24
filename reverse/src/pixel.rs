//! 코드로 생성하는 도트아트: 팔레트 문자열 → Image, 위상 반전 변형, 3x5 픽셀 폰트.

use std::collections::HashMap;

use bevy::asset::RenderAssetUsages;
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};

/// 팔레트 문자: `.` 투명, `#` 잉크, `o` 페이퍼, `+` 중간톤, `*` 부분컬러(오브젝트의 계에 따라 빨강/파랑)
pub struct Palette {
    pub ink: [u8; 4],
    pub paper: [u8; 4],
    pub mid: [u8; 4],
}

/// 물질계: 어두운 배경 위에 밝은 오브젝트
pub const MATTER: Palette = Palette {
    ink: [0xE8, 0xE8, 0xF2, 255],
    paper: [0x12, 0x12, 0x1A, 255],
    mid: [0x7C, 0x7C, 0x90, 255],
};

/// 반물질계: 흑백 반전
pub const ANTI: Palette = Palette {
    ink: [0x12, 0x12, 0x1A, 255],
    paper: [0xE8, 0xE8, 0xF2, 255],
    mid: [0x6E, 0x6E, 0x80, 255],
};

/// 부분컬러: 물질 오브젝트는 빨강, 반물질 오브젝트는 파랑, 중립은 잉크색
#[derive(Component, Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum Accent {
    Red,
    Blue,
    Ink,
}

pub fn accent_rgba(inverted: bool, accent: Accent) -> [u8; 4] {
    match (accent, inverted) {
        (Accent::Red, false) => [0xFF, 0x4F, 0x6E, 255],
        (Accent::Red, true) => [0xE0, 0x20, 0x48, 255],
        (Accent::Blue, false) => [0x4F, 0x9C, 0xFF, 255],
        (Accent::Blue, true) => [0x1E, 0x5C, 0xE6, 255],
        (Accent::Ink, _) => palette(inverted).ink,
    }
}

pub fn palette(inverted: bool) -> &'static Palette {
    if inverted { &ANTI } else { &MATTER }
}

fn to_color(c: [u8; 4]) -> Color {
    Color::srgb_u8(c[0], c[1], c[2])
}

pub fn paper_color(inverted: bool) -> Color {
    to_color(palette(inverted).paper)
}

pub fn ink_color(inverted: bool) -> Color {
    to_color(palette(inverted).ink)
}

pub fn accent_color(inverted: bool, accent: Accent) -> Color {
    to_color(accent_rgba(inverted, accent))
}

/// 스프라이트 종류. 모든 종류마다 normal/inverted 텍스처가 미리 생성된다.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum Spr {
    Player,
    PlayerBullet,
    Turret,
    Drifter,
    Phaser,
    Bullet,
    Needle,
    WallN,
    WallM,
    WallA,
    SwitchOn,
    SwitchOff,
    Field,
    Bg0,
    Bg1,
    Bg2,
    Boss,
    /// 파괴하면 연결된 잠금 벽이 사라지는 코어
    Core,
    /// 코어에 연결된 잠금 벽 (중립, 항상 활성)
    LockWall,
    Boom0,
    Boom1,
    Boom2,
    /// 1x1 잉크 픽셀 (custom_size로 늘려 바/선을 그림)
    Pix,
    PixAccent,
    PixMid,
    PixPaper,
    Life,
    Glyph(char),
}

pub const GLYPHS: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 :-!./>";

const ALL: &[Spr] = &[
    Spr::Player,
    Spr::PlayerBullet,
    Spr::Turret,
    Spr::Drifter,
    Spr::Phaser,
    Spr::Bullet,
    Spr::Needle,
    Spr::WallN,
    Spr::WallM,
    Spr::WallA,
    Spr::SwitchOn,
    Spr::SwitchOff,
    Spr::Field,
    Spr::Bg0,
    Spr::Bg1,
    Spr::Bg2,
    Spr::Boss,
    Spr::Core,
    Spr::LockWall,
    Spr::Boom0,
    Spr::Boom1,
    Spr::Boom2,
    Spr::Pix,
    Spr::PixAccent,
    Spr::PixMid,
    Spr::PixPaper,
    Spr::Life,
];

// ---------- 손으로 그린 패턴 ----------

const PLAYER: [&str; 16] = [
    "................",
    ".......##.......",
    ".......##.......",
    "......####......",
    "......#**#......",
    "......#**#......",
    ".....##**##.....",
    ".....######.....",
    "....##+##+##....",
    "...###+##+###...",
    "..####+##+####..",
    ".###+######+###.",
    ".##+###**###+##.",
    ".#..##+**+##..#.",
    "....#..++..#....",
    "....#......#....",
];

const PLAYER_BULLET: [&str; 8] = [
    "...##...",
    "..####..",
    "..#**#..",
    "..#**#..",
    "..#**#..",
    "..####..",
    "...##...",
    "...++...",
];

const BULLET: [&str; 8] = [
    "........",
    "...##...",
    "..####..",
    ".##**##.",
    ".##**##.",
    "..####..",
    "...##...",
    "........",
];

const NEEDLE: [&str; 8] = [
    "...#....",
    "...##...",
    "..#**#..",
    "..#**#..",
    "..####..",
    "...##...",
    "...+....",
    "........",
];

const TURRET: [&str; 16] = [
    "................",
    "....########....",
    "...#++++++++#...",
    "..#+########+#..",
    ".#+#..####..#+#.",
    ".#+#.#*##*#.#+#.",
    ".#+#.##**##.#+#.",
    ".#+#.##**##.#+#.",
    ".#+#.#*##*#.#+#.",
    ".#+#..####..#+#.",
    "..#+########+#..",
    "...#++++++++#...",
    "....########....",
    "......#..#......",
    ".....##..##.....",
    "................",
];

const DRIFTER: [&str; 16] = [
    "................",
    "......####......",
    ".....######.....",
    "....##+##+##....",
    "...###+##+###...",
    "..####*##*####..",
    ".#####****#####.",
    ".##+##****##+##.",
    ".##+########+##.",
    "..#+##+##+##+#..",
    "...#.##+##+#.#..",
    ".....#.##.#.....",
    "......#..#......",
    ".....#....#.....",
    "................",
    "................",
];

const PHASER: [&str; 16] = [
    "................",
    ".......#........",
    "......###.......",
    ".....#*#*#......",
    "....##*#*##.....",
    "...##+###+##....",
    "..##+#*#*#+##...",
    ".###+#***#+###..",
    "..##+#*#*#+##...",
    "...##+###+##....",
    "....##*#*##.....",
    ".....#*#*#......",
    "......###.......",
    ".......#........",
    "................",
    "................",
];

const WALL_N: [&str; 16] = [
    "################",
    "#+++++++#++++++#",
    "#+++++++#++++++#",
    "#+++++++#++++++#",
    "################",
    "#+++#++++++++++#",
    "#+++#++++++++++#",
    "#+++#++++++++++#",
    "################",
    "#++++++++++#+++#",
    "#++++++++++#+++#",
    "#++++++++++#+++#",
    "################",
    "#+++++#++++++++#",
    "#+++++#++++++++#",
    "################",
];

const LIFE: [&str; 8] = [
    "...##...",
    "...##...",
    "..####..",
    "..#**#..",
    ".######.",
    "###..###",
    "#......#",
    "........",
];

// ---------- 절차적 패턴 ----------

fn rows_of(a: &[&str]) -> Vec<String> {
    a.iter().map(|s| s.to_string()).collect()
}

fn grid<F: Fn(i32, i32) -> char>(w: i32, h: i32, f: F) -> Vec<String> {
    (0..h)
        .map(|y| (0..w).map(|x| f(x, y)).collect())
        .collect()
}

/// 위상 벽: 잉크 테두리 + 대각 빗금. dir=+1 은 물질, dir=-1 은 반물질(반대 방향 빗금). 모서리에 강조색.
fn wall(dir: i32) -> Vec<String> {
    grid(16, 16, |x, y| {
        let edge = x == 0 || y == 0 || x == 15 || y == 15;
        let corner = (x <= 1 || x >= 14) && (y <= 1 || y >= 14);
        if corner {
            '*'
        } else if edge {
            '#'
        } else if (x + dir * y).rem_euclid(4) == 0 {
            '#'
        } else {
            'o'
        }
    })
}

/// 간섭 필드: 점 격자 (배경이 비쳐 보임)
fn field() -> Vec<String> {
    grid(16, 16, |x, y| {
        if x % 4 == 1 && y % 4 == 1 {
            '+'
        } else if x % 8 == 5 && y % 8 == 5 {
            '#'
        } else {
            '.'
        }
    })
}

/// 스위치 블록: 테두리 + 안쪽 코어(on: 강조색, off: 중간톤)
fn switch(on: bool) -> Vec<String> {
    grid(16, 16, |x, y| {
        // 체비셰프 거리 (중심에서 0..8)
        let d = (2 * x - 15).abs().max((2 * y - 15).abs()) / 2;
        let corner = (x == 0 || x == 15) && (y == 0 || y == 15);
        if corner {
            '.'
        } else if d >= 7 {
            '#'
        } else if d == 6 {
            '+'
        } else if d == 5 {
            '#'
        } else if d <= 3 {
            if on { '*' } else { '+' }
        } else {
            'o'
        }
    })
}

/// 코어: 회전하는 링 안의 부분컬러 결정
fn core() -> Vec<String> {
    grid(16, 16, |x, y| {
        let dx = x as f32 - 7.5;
        let dy = y as f32 - 7.5;
        let d = (dx * dx + dy * dy).sqrt();
        let m = dx.abs() + dy.abs();
        if m <= 2.5 {
            '*'
        } else if m <= 4.5 {
            '#'
        } else if d > 5.5 && d < 7.2 {
            if (x + y) % 2 == 0 { '#' } else { '+' }
        } else {
            '.'
        }
    })
}

/// 잠금 벽: 중립 벽 + 코어 색 사슬 무늬
fn lock_wall() -> Vec<String> {
    grid(16, 16, |x, y| {
        let edge = x == 0 || y == 0 || x == 15 || y == 15;
        if edge {
            '#'
        } else if (x % 5 == 2 && (3..=12).contains(&y)) || (y % 5 == 2 && (3..=12).contains(&x)) {
            '*'
        } else if (x + y) % 2 == 0 {
            '+'
        } else {
            'o'
        }
    })
}

/// 배경 타일: 페이퍼 채움 + 희미한 별/점
fn bg(kind: u8) -> Vec<String> {
    grid(16, 16, |x, y| match kind {
        1 if (x, y) == (5, 9) || (x, y) == (12, 3) => '+',
        2 if (x, y) == (8, 8) => '#',
        2 if (x == 8 && (y == 7 || y == 9)) || (y == 8 && (x == 7 || x == 9)) => '+',
        _ => 'o',
    })
}

/// 보스: 32x32 동심 다이아몬드 껍질
fn boss() -> Vec<String> {
    grid(32, 32, |x, y| {
        let d = (x as f32 - 15.5).abs() + (y as f32 - 15.5).abs();
        if d <= 4.0 {
            '*'
        } else if d <= 9.0 {
            if (x + y) % 3 == 0 { '#' } else { '+' }
        } else if d <= 10.5 {
            '#'
        } else if d <= 12.0 {
            '.'
        } else if d <= 13.5 {
            '#'
        } else if d <= 15.0 {
            if (x + 2 * y) % 5 == 0 { '*' } else { '+' }
        } else if d <= 16.5 {
            '#'
        } else {
            '.'
        }
    })
}

/// 폭발 프레임: 커지는 원 → 흩어진 파편
fn boom(frame: u8) -> Vec<String> {
    grid(16, 16, |x, y| {
        let dx = x as f32 - 7.5;
        let dy = y as f32 - 7.5;
        let d = (dx * dx + dy * dy).sqrt();
        match frame {
            0 => {
                if d < 2.5 {
                    '*'
                } else if d < 4.0 {
                    '#'
                } else {
                    '.'
                }
            }
            1 => {
                if d < 3.0 {
                    '+'
                } else if d < 5.5 {
                    '*'
                } else if d < 7.0 {
                    '#'
                } else {
                    '.'
                }
            }
            _ => {
                if d > 5.0 && d < 7.5 && (x * 7 + y * 13) % 5 < 2 {
                    '#'
                } else if d > 3.0 && d < 5.0 && (x + y) % 3 == 0 {
                    '+'
                } else {
                    '.'
                }
            }
        }
    })
}

fn glyph(c: char) -> [&'static str; 5] {
    match c {
        '0' => ["###", "#.#", "#.#", "#.#", "###"],
        '1' => [".#.", "##.", ".#.", ".#.", "###"],
        '2' => ["###", "..#", "###", "#..", "###"],
        '3' => ["###", "..#", "###", "..#", "###"],
        '4' => ["#.#", "#.#", "###", "..#", "..#"],
        '5' => ["###", "#..", "###", "..#", "###"],
        '6' => ["###", "#..", "###", "#.#", "###"],
        '7' => ["###", "..#", "..#", "..#", "..#"],
        '8' => ["###", "#.#", "###", "#.#", "###"],
        '9' => ["###", "#.#", "###", "..#", "###"],
        'A' => [".#.", "#.#", "###", "#.#", "#.#"],
        'B' => ["##.", "#.#", "##.", "#.#", "##."],
        'C' => ["###", "#..", "#..", "#..", "###"],
        'D' => ["##.", "#.#", "#.#", "#.#", "##."],
        'E' => ["###", "#..", "##.", "#..", "###"],
        'F' => ["###", "#..", "##.", "#..", "#.."],
        'G' => ["###", "#..", "#.#", "#.#", "###"],
        'H' => ["#.#", "#.#", "###", "#.#", "#.#"],
        'I' => ["###", ".#.", ".#.", ".#.", "###"],
        'J' => ["..#", "..#", "..#", "#.#", "###"],
        'K' => ["#.#", "#.#", "##.", "#.#", "#.#"],
        'L' => ["#..", "#..", "#..", "#..", "###"],
        'M' => ["#.#", "###", "###", "#.#", "#.#"],
        'N' => ["##.", "#.#", "#.#", "#.#", "#.#"],
        'O' => ["###", "#.#", "#.#", "#.#", "###"],
        'P' => ["###", "#.#", "###", "#..", "#.."],
        'Q' => ["###", "#.#", "#.#", "###", "..#"],
        'R' => ["##.", "#.#", "##.", "#.#", "#.#"],
        'S' => ["###", "#..", "###", "..#", "###"],
        'T' => ["###", ".#.", ".#.", ".#.", ".#."],
        'U' => ["#.#", "#.#", "#.#", "#.#", "###"],
        'V' => ["#.#", "#.#", "#.#", "#.#", ".#."],
        'W' => ["#.#", "#.#", "###", "###", "#.#"],
        'X' => ["#.#", "#.#", ".#.", "#.#", "#.#"],
        'Y' => ["#.#", "#.#", ".#.", ".#.", ".#."],
        'Z' => ["###", "..#", ".#.", "#..", "###"],
        ':' => ["...", ".#.", "...", ".#.", "..."],
        '-' => ["...", "...", "###", "...", "..."],
        '!' => [".#.", ".#.", ".#.", "...", ".#."],
        '.' => ["...", "...", "...", "...", ".#."],
        '/' => ["..#", "..#", ".#.", "#..", "#.."],
        '>' => ["#..", ".#.", "..#", ".#.", "#.."],
        _ => ["...", "...", "...", "...", "..."],
    }
}

fn pattern(spr: Spr) -> Vec<String> {
    match spr {
        Spr::Player => rows_of(&PLAYER),
        Spr::PlayerBullet => rows_of(&PLAYER_BULLET),
        Spr::Turret => rows_of(&TURRET),
        Spr::Drifter => rows_of(&DRIFTER),
        Spr::Phaser => rows_of(&PHASER),
        Spr::Bullet => rows_of(&BULLET),
        Spr::Needle => rows_of(&NEEDLE),
        Spr::WallN => rows_of(&WALL_N),
        Spr::WallM => wall(1),
        Spr::WallA => wall(-1),
        Spr::SwitchOn => switch(true),
        Spr::SwitchOff => switch(false),
        Spr::Field => field(),
        Spr::Bg0 => bg(0),
        Spr::Bg1 => bg(1),
        Spr::Bg2 => bg(2),
        Spr::Boss => boss(),
        Spr::Core => core(),
        Spr::LockWall => lock_wall(),
        Spr::Boom0 => boom(0),
        Spr::Boom1 => boom(1),
        Spr::Boom2 => boom(2),
        Spr::Pix => vec!["#".into()],
        Spr::PixAccent => vec!["*".into()],
        Spr::PixMid => vec!["+".into()],
        Spr::PixPaper => vec!["o".into()],
        Spr::Life => rows_of(&LIFE),
        Spr::Glyph(c) => rows_of(&glyph(c)),
    }
}

fn make_image(rows: &[String], pal: &Palette, accent: [u8; 4]) -> Image {
    let h = rows.len() as u32;
    let w = rows[0].chars().count() as u32;
    let mut data = Vec::with_capacity((w * h * 4) as usize);
    for row in rows {
        debug_assert_eq!(row.chars().count() as u32, w, "row width mismatch");
        for c in row.chars() {
            let px = match c {
                '#' => pal.ink,
                'o' => pal.paper,
                '+' => pal.mid,
                '*' => accent,
                _ => [0, 0, 0, 0],
            };
            data.extend_from_slice(&px);
        }
    }
    Image::new(
        Extent3d {
            width: w,
            height: h,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::default(),
    )
}

/// 모든 스프라이트의 (반전 여부 × 부분컬러) 텍스처 핸들.
/// 초기 OnEnter가 PreStartup보다 먼저 실행되므로 FromWorld로 앱 빌드 시점에 생성한다.
#[derive(Resource)]
pub struct SpriteSet {
    map: HashMap<(Spr, bool, Accent), Handle<Image>>,
}

impl FromWorld for SpriteSet {
    fn from_world(world: &mut World) -> Self {
        let mut images = world.resource_mut::<Assets<Image>>();
        let mut map: HashMap<(Spr, bool, Accent), Handle<Image>> = HashMap::new();
        let kinds = ALL
            .iter()
            .copied()
            .chain(GLYPHS.chars().map(Spr::Glyph));
        for spr in kinds {
            let rows = pattern(spr);
            let has_accent = rows.iter().any(|r| r.contains('*'));
            for inverted in [false, true] {
                for accent in [Accent::Red, Accent::Blue, Accent::Ink] {
                    // 부분컬러가 없는 패턴은 텍스처를 공유
                    if !has_accent && accent != Accent::Red {
                        let h = map[&(spr, inverted, Accent::Red)].clone();
                        map.insert((spr, inverted, accent), h);
                        continue;
                    }
                    let img = make_image(&rows, palette(inverted), accent_rgba(inverted, accent));
                    map.insert((spr, inverted, accent), images.add(img));
                }
            }
        }
        SpriteSet { map }
    }
}

impl SpriteSet {
    pub fn get(&self, spr: Spr, inverted: bool, accent: Accent) -> Handle<Image> {
        self.map
            .get(&(spr, inverted, accent))
            .or_else(|| self.map.get(&(Spr::Glyph(' '), inverted, accent)))
            .cloned()
            .unwrap()
    }
}

/// 위상 비주얼 시스템이 매 프레임 텍스처를 고르는 기준
#[derive(Component, Clone, Copy)]
pub struct SpriteKind(pub Spr);

/// 스프라이트 엔티티 공통 번들 (월드 위치는 Pos/스냅 시스템 또는 부모가 담당)
pub fn sprite(set: &SpriteSet, spr: Spr, translation: Vec3) -> impl Bundle {
    (
        Sprite::from_image(set.get(spr, false, Accent::Ink)),
        SpriteKind(spr),
        Transform::from_translation(translation),
    )
}

/// 픽셀 폰트 글리프 폭/간격
pub const GLYPH_W: f32 = 3.0;
pub const GLYPH_H: f32 = 5.0;
pub const GLYPH_ADV: f32 = 4.0;

pub fn text_width(text: &str) -> f32 {
    text.chars().count() as f32 * GLYPH_ADV - 1.0
}

/// 부모 엔티티 아래에 글리프 스프라이트를 자식으로 생성 (왼쪽 정렬, 원점 = 첫 글리프의 왼쪽 위)
pub fn spawn_glyphs(parent: &mut ChildSpawnerCommands, set: &SpriteSet, text: &str) {
    for (i, c) in text.chars().enumerate() {
        if c == ' ' {
            continue;
        }
        let x = i as f32 * GLYPH_ADV + GLYPH_W / 2.0;
        parent.spawn(sprite(set, Spr::Glyph(c), Vec3::new(x, -GLYPH_H / 2.0, 0.0)));
    }
}

/// 가운데 정렬 텍스트 부모 엔티티의 Transform (center 기준, 정수 배율)
pub fn centered_text_transform(text: &str, center: Vec3, scale: f32) -> Transform {
    let w = text_width(text) * scale;
    let origin = center + Vec3::new(-w / 2.0, GLYPH_H * scale / 2.0, 0.0);
    Transform::from_translation(origin.round()).with_scale(Vec3::splat(scale))
}
