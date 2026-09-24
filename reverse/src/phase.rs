//! 위상(물질/반물질) 시스템: 전환 입력, 게이지, 원형 와이프, 비주얼(텍스처 변형/고스트) 적용.

use bevy::prelude::*;

use crate::level::Field;
use crate::pixel::{self, Accent, SpriteKind, SpriteSet};
use crate::player::{Player, BODY_HALF};
use crate::Pos;

#[derive(Component, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    Matter,
    Anti,
    /// 항상 충돌 (중립 벽 등)
    Neutral,
}

impl Phase {
    pub fn flip(self) -> Phase {
        match self {
            Phase::Matter => Phase::Anti,
            Phase::Anti => Phase::Matter,
            Phase::Neutral => Phase::Neutral,
        }
    }

    pub fn accent(self) -> Accent {
        match self {
            Phase::Matter => Accent::Red,
            Phase::Anti => Accent::Blue,
            Phase::Neutral => Accent::Ink,
        }
    }
}

/// 반대 계 오브젝트(고스트)의 알파
pub const GHOST_ALPHA: f32 = 0.22;

/// 두 위상이 서로 상호작용(충돌)하는가
pub fn interacts(a: Phase, b: Phase) -> bool {
    a == Phase::Neutral || b == Phase::Neutral || a == b
}

pub const GAUGE_DRAIN: f32 = 0.30; // 반물질계 체류 중 초당 소모
pub const GAUGE_REFILL: f32 = 0.45; // 물질계 회복
pub const GAUGE_UNLOCK: f32 = 0.35; // 잠금 해제 문턱
pub const SHIFT_COOLDOWN: f32 = 0.25;
pub const WIPE_SPEED: f32 = 720.0;
pub const WIPE_MAX: f32 = 440.0;

#[derive(Resource)]
pub struct PhaseState {
    pub player: Phase,
    pub gauge: f32,
    pub locked: bool,
    pub cooldown: f32,
    /// 간섭 필드 안 (이번 프레임)
    pub jammed: bool,
}

impl Default for PhaseState {
    fn default() -> Self {
        Self {
            player: Phase::Matter,
            gauge: 1.0,
            locked: false,
            cooldown: 0.0,
            jammed: false,
        }
    }
}

impl PhaseState {
    pub fn inverted(&self) -> bool {
        self.player == Phase::Anti
    }
}

/// 플레이어 중심 원형 전환 이펙트
#[derive(Resource, Default)]
pub struct Wipe {
    pub active: bool,
    pub origin: Vec2,
    pub radius: f32,
    /// 원 안쪽이 반전 세계인가
    pub to_inverted: bool,
}

impl Wipe {
    pub fn start(&mut self, origin: Vec2, to_inverted: bool) {
        self.active = true;
        self.origin = origin;
        self.radius = 0.0;
        self.to_inverted = to_inverted;
    }
}

/// 위상 토글 + 게이지 관리
pub fn phase_input(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    mut ps: ResMut<PhaseState>,
    mut wipe: ResMut<Wipe>,
    mut player: Query<(&Pos, &mut Player)>,
    fields: Query<&Pos, With<Field>>,
) {
    let dt = time.delta_secs().min(0.05);
    ps.cooldown = (ps.cooldown - dt).max(0.0);

    let Ok((pos, mut player)) = player.single_mut() else {
        return;
    };
    let p = pos.0;

    // 간섭 필드 판정 (플레이어 몸이 필드 타일과 겹치면 전환 불가)
    ps.jammed = fields
        .iter()
        .any(|f| (f.0.x - p.x).abs() < 8.0 + BODY_HALF && (f.0.y - p.y).abs() < 8.0 + BODY_HALF);

    // 게이지
    if ps.player == Phase::Anti {
        ps.gauge -= GAUGE_DRAIN * dt;
        if ps.gauge <= 0.0 {
            ps.gauge = 0.0;
            ps.locked = true;
            ps.player = Phase::Matter;
            wipe.start(p, false);
        }
    } else {
        ps.gauge = (ps.gauge + GAUGE_REFILL * dt).min(1.0);
        if ps.locked && ps.gauge >= GAUGE_UNLOCK {
            ps.locked = false;
        }
    }

    let pressed = keys.just_pressed(KeyCode::ShiftLeft) || keys.just_pressed(KeyCode::ShiftRight);
    if !pressed {
        return;
    }
    if ps.cooldown > 0.0 || ps.locked || ps.jammed || player.invuln > 1.5 {
        player.deny_flash = 0.2;
        return;
    }

    ps.player = ps.player.flip();
    ps.cooldown = SHIFT_COOLDOWN;
    wipe.start(p, ps.inverted());
    // 전환 직후 새 위상의 벽 안에 있으면 player_move의 벽 접촉 판정으로 곧바로 피격된다
}

pub fn wipe_tick(time: Res<Time>, mut wipe: ResMut<Wipe>) {
    if !wipe.active {
        return;
    }
    wipe.radius += WIPE_SPEED * time.delta_secs().min(0.05);
    if wipe.radius >= WIPE_MAX {
        wipe.active = false;
    }
}

/// 배경색: 항상 플레이어 위상 기준 (배경 타일이 화면을 덮어 거의 보이지 않음)
pub fn sync_clear_color(ps: Res<PhaseState>, mut clear: ResMut<ClearColor>) {
    clear.0 = pixel::paper_color(ps.inverted());
}

/// 모든 스프라이트에 세계 반전(와이프 안/밖)과 고스트 알파를 적용
pub fn apply_visuals(
    time: Res<Time>,
    ps: Res<PhaseState>,
    wipe: Res<Wipe>,
    set: Res<SpriteSet>,
    mut q: Query<(
        &mut Sprite,
        &SpriteKind,
        &GlobalTransform,
        Option<&Phase>,
        Option<&Accent>,
        Option<&Player>,
    )>,
) {
    let world_inv = ps.inverted();
    let t = time.elapsed_secs();
    for (mut sprite, kind, gt, phase, accent, player) in &mut q {
        let p = gt.translation().truncate();
        let inverted = if wipe.active {
            if p.distance(wipe.origin) < wipe.radius {
                wipe.to_inverted
            } else {
                !wipe.to_inverted
            }
        } else {
            world_inv
        };
        // 부분컬러: Accent 컴포넌트 > 오브젝트의 계 > 잉크
        let accent = accent
            .copied()
            .or_else(|| phase.map(|p| p.accent()))
            .unwrap_or(Accent::Ink);
        let handle = set.get(kind.0, inverted, accent);
        if sprite.image != handle {
            sprite.image = handle;
        }

        let mut alpha = match phase {
            Some(ph) if *ph != Phase::Neutral && *ph != ps.player => GHOST_ALPHA,
            _ => 1.0,
        };
        if let Some(pl) = player {
            if pl.invuln > 0.0 && ((t * 12.0) as i32) % 2 == 0 {
                alpha = 0.15;
            }
        }
        if sprite.color.alpha() != alpha {
            sprite.color.set_alpha(alpha);
        }
    }
}

/// 와이프 충격파 링
pub fn draw_wipe(mut gizmos: Gizmos, wipe: Res<Wipe>) {
    if !wipe.active {
        return;
    }
    let iso = Isometry2d::from_translation(wipe.origin);
    gizmos.circle_2d(iso, wipe.radius, pixel::ink_color(wipe.to_inverted));
    let accent = if wipe.to_inverted { Accent::Blue } else { Accent::Red };
    gizmos.circle_2d(
        iso,
        (wipe.radius - 2.0).max(0.0),
        pixel::accent_color(wipe.to_inverted, accent),
    );
    gizmos.circle_2d(
        iso,
        (wipe.radius - 4.0).max(0.0),
        pixel::paper_color(wipe.to_inverted),
    );
}
