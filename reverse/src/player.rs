//! 플레이어: 이동(화면에 올라탐), 벽 접촉 피격, 사격, 피격과 리스폰, 옆에 붙은 호 게이지.

use bevy::prelude::*;

use crate::bullet::{self, Owner};
use crate::enemy;
use crate::level::{Scroll, Wall};
use crate::phase::{interacts, Phase, PhaseState, Wipe};
use crate::pixel::{sprite, Accent, Spr, SpriteSet};
use crate::{GameState, Pos, RunEntity, HALF_H, HALF_W};

pub const Z_PLAYER: f32 = 25.0;
/// 벽 접촉 판정용 몸 반폭 (벽에 닿으면 피격)
pub const BODY_HALF: f32 = 4.0;
/// 탄 피격용 히트박스 반폭
pub const HIT_HALF: f32 = 3.0;
pub const SPEED: f32 = 105.0;
pub const FIRE_INTERVAL: f32 = 0.11;
pub const START_LIVES: i32 = 3;
pub const MAX_LIVES: i32 = 5;
pub const MAX_POWER: u8 = 3;

/// 호 게이지: 플레이어 오른쪽에 반지름 R, ±ARC_DEG 범위의 연속된 픽셀 호(두께 2px)
const GAUGE_R: f32 = 13.0;
const ARC_DEG: f32 = 62.0;

#[derive(Component)]
pub struct Player {
    pub lives: i32,
    pub invuln: f32,
    pub fire_cd: f32,
    /// 전환 거부 표시
    pub deny_flash: f32,
    /// 탄 강화 단계 (1~MAX_POWER)
    pub power: u8,
}

/// 호 게이지의 픽셀 하나. `idx`는 아래에서부터의 순서, `total`은 전체 픽셀 수
#[derive(Component)]
pub struct GaugeSeg {
    pub idx: usize,
    pub total: usize,
}

/// 체력 동그라미: 게이지 호 바깥쪽에 아래→위로 배치 (0 = 맨 아래)
#[derive(Component)]
pub struct LifeDot(pub i32);

const LIFE_R: f32 = 19.0;
const LIFE_ARC_DEG: f32 = 56.0;

/// 피격 이벤트 (여러 시스템이 보내고 handle_hits가 한 번만 처리)
#[derive(Message)]
pub struct PlayerHit;

/// 호 위의 정수 픽셀 좌표를 아래→위 순서로 생성 (두께 2px, 중복 제거)
fn arc_pixels() -> Vec<IVec2> {
    let mut out: Vec<IVec2> = Vec::new();
    let steps = 400;
    for i in 0..=steps {
        let t = i as f32 / steps as f32;
        let a = (-ARC_DEG + 2.0 * ARC_DEG * t).to_radians();
        for r in [GAUGE_R, GAUGE_R + 1.0] {
            let p = IVec2::new((a.cos() * r).round() as i32, (a.sin() * r).round() as i32);
            if !out.contains(&p) {
                out.push(p);
            }
        }
    }
    // 아래→위 순서 보장 (y 오름차순, 같은 y는 안쪽부터)
    out.sort_by_key(|p| (p.y, p.x));
    out
}

pub fn spawn_player(commands: &mut Commands, set: &SpriteSet, scroll: &Scroll) {
    let pos = Vec2::new(0.0, scroll.cam_y - HALF_H + 40.0);
    commands
        .spawn((
            sprite(set, Spr::Player, pos.extend(Z_PLAYER)),
            Pos(pos),
            Phase::Matter,
            Player {
                lives: START_LIVES,
                invuln: 1.0,
                fire_cd: 0.0,
                deny_flash: 0.0,
                power: 1,
            },
            RunEntity,
        ))
        .with_children(|p| {
            let px = arc_pixels();
            let total = px.len();
            for (idx, q) in px.iter().enumerate() {
                let off = Vec3::new(q.x as f32, q.y as f32, 0.5);
                // 오른쪽: 위상 게이지. 빈 부분 바탕(중간톤) + 채움(부분컬러)
                p.spawn(sprite(set, Spr::PixMid, off - Vec3::Z * 0.1));
                p.spawn((
                    sprite(set, Spr::PixAccent, off),
                    Accent::Red,
                    GaugeSeg { idx, total },
                ));
            }
            // 체력 동그라미: 게이지 호 바깥쪽에 아래→위로
            for i in 0..MAX_LIVES {
                let t = (i as f32 + 0.5) / MAX_LIVES as f32;
                let a = (-LIFE_ARC_DEG + 2.0 * LIFE_ARC_DEG * t).to_radians();
                let off = Vec3::new((a.cos() * LIFE_R).round(), (a.sin() * LIFE_R).round(), 0.5);
                p.spawn((sprite(set, Spr::LifeDot, off), LifeDot(i)));
            }
        });
}

/// 스테이지 시작 위치로 복귀 (목숨·강화는 유지)
pub fn reset_for_stage(pos: &mut Pos, player: &mut Player, scroll: &Scroll) {
    pos.0 = Vec2::new(0.0, scroll.cam_y - HALF_H + 40.0);
    player.invuln = 1.5;
    player.fire_cd = 0.0;
    player.deny_flash = 0.0;
}

/// 플레이어의 Phase 컴포넌트를 PhaseState와 동기화
pub fn sync_phase(ps: Res<PhaseState>, mut q: Query<&mut Phase, With<Player>>) {
    if let Ok(mut ph) = q.single_mut() {
        if *ph != ps.player {
            *ph = ps.player;
        }
    }
}

pub fn player_move(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    scroll: Res<Scroll>,
    ps: Res<PhaseState>,
    mut q: Query<(&mut Pos, &mut Player)>,
    walls: Query<(&Pos, &Phase), (With<Wall>, Without<Player>)>,
    mut hits: MessageWriter<PlayerHit>,
) {
    let dt = time.delta_secs().min(0.05);
    let Ok((mut pos, mut player)) = q.single_mut() else {
        return;
    };
    player.invuln = (player.invuln - dt).max(0.0);
    player.fire_cd = (player.fire_cd - dt).max(0.0);
    player.deny_flash = (player.deny_flash - dt).max(0.0);

    // 화면에 올라탐
    pos.0.y += scroll.dy;

    let mut dir = Vec2::ZERO;
    if keys.any_pressed([KeyCode::ArrowLeft, KeyCode::KeyA]) {
        dir.x -= 1.0;
    }
    if keys.any_pressed([KeyCode::ArrowRight, KeyCode::KeyD]) {
        dir.x += 1.0;
    }
    if keys.any_pressed([KeyCode::ArrowUp, KeyCode::KeyW]) {
        dir.y += 1.0;
    }
    if keys.any_pressed([KeyCode::ArrowDown, KeyCode::KeyS]) {
        dir.y -= 1.0;
    }
    pos.0 += dir.normalize_or_zero() * SPEED * dt;

    let bottom = scroll.bottom() + BODY_HALF + 2.0;
    let top = scroll.top() - BODY_HALF - 14.0;
    pos.0.x = pos.0.x.clamp(-HALF_W + BODY_HALF, HALF_W - BODY_HALF);
    pos.0.y = pos.0.y.clamp(bottom, top);

    // 활성(같은 계 또는 중립) 벽에 닿으면 피격
    if player.invuln <= 0.0 {
        let ext = 8.0 + BODY_HALF;
        let touching = walls.iter().any(|(wp, wph)| {
            interacts(*wph, ps.player) && (pos.0.x - wp.0.x).abs() < ext && (pos.0.y - wp.0.y).abs() < ext
        });
        if touching {
            hits.write(PlayerHit);
        }
    }
}

pub fn player_shoot(
    mut commands: Commands,
    keys: Res<ButtonInput<KeyCode>>,
    set: Res<SpriteSet>,
    ps: Res<PhaseState>,
    mut q: Query<(&Pos, &mut Player)>,
) {
    let Ok((pos, mut player)) = q.single_mut() else {
        return;
    };
    if player.fire_cd > 0.0 || !keys.any_pressed([KeyCode::KeyZ, KeyCode::Space]) {
        return;
    }
    player.fire_cd = FIRE_INTERVAL;
    let mut fire = |offset: Vec2, angle: f32| {
        bullet::spawn(
            &mut commands,
            &set,
            Owner::Player,
            ps.player,
            pos.0 + offset,
            Vec2::from_angle(angle).rotate(Vec2::new(0.0, 260.0)),
            Spr::PlayerBullet,
        );
    };
    match player.power {
        1 => fire(Vec2::new(0.0, 6.0), 0.0),
        2 => {
            fire(Vec2::new(-3.0, 6.0), 0.0);
            fire(Vec2::new(3.0, 6.0), 0.0);
        }
        _ => {
            fire(Vec2::new(-3.0, 6.0), 0.0);
            fire(Vec2::new(3.0, 6.0), 0.0);
            fire(Vec2::new(-6.0, 2.0), 0.22);
            fire(Vec2::new(6.0, 2.0), -0.22);
        }
    }
}

/// 피격 처리: 목숨 감소, 적 탄 제거, 물질계로 리스폰 (0이면 게임 오버)
pub fn handle_hits(
    mut commands: Commands,
    mut hits: MessageReader<PlayerHit>,
    set: Res<SpriteSet>,
    scroll: Res<Scroll>,
    mut ps: ResMut<PhaseState>,
    mut wipe: ResMut<Wipe>,
    mut q: Query<(&mut Pos, &mut Player)>,
    walls: Query<(&Pos, &Phase), (With<Wall>, Without<Player>)>,
    enemy_bullets: Query<(Entity, &Pos, &Phase, &bullet::Bullet), Without<Player>>,
    mut next: ResMut<NextState<GameState>>,
) {
    if hits.read().next().is_none() {
        return;
    }
    let Ok((mut pos, mut player)) = q.single_mut() else {
        return;
    };
    if player.invuln > 0.0 {
        return;
    }
    enemy::spawn_boom(&mut commands, &set, pos.0, ps.player);
    player.lives -= 1;
    player.power = player.power.saturating_sub(1).max(1);
    if player.lives <= 0 {
        player.invuln = 999.0;
        next.set(GameState::GameOver);
        return;
    }

    // 적 탄 소거: 탄마다 소형 폭발 (너무 많으면 60개까지만 연출)
    let mut shown = 0;
    for (e, bp, bph, b) in &enemy_bullets {
        if b.owner == Owner::Enemy {
            if shown < 60 {
                enemy::spawn_boom_small(&mut commands, &set, bp.0, *bph);
                shown += 1;
            }
            commands.entity(e).despawn();
        }
    }

    // 리스폰: 화면 아래쫑, 물질계. 그 자리에 물질 벽이 있으면 반물질계로
    let mut spawn = Vec2::new(pos.0.x, scroll.bottom() + 40.0);
    let blocked = |p: Vec2, ph: Phase| {
        walls.iter().any(|(wp, wph)| {
            interacts(*wph, ph) && (wp.0.x - p.x).abs() < 8.0 + BODY_HALF && (wp.0.y - p.y).abs() < 8.0 + BODY_HALF
        })
    };
    let mut phase = Phase::Matter;
    if blocked(spawn, phase) {
        phase = Phase::Anti;
    }
    if blocked(spawn, phase) {
        spawn.x = 0.0;
        phase = Phase::Matter;
        if blocked(spawn, phase) {
            phase = Phase::Anti;
        }
    }
    pos.0 = spawn;
    let was_inv = ps.inverted();
    ps.player = phase;
    ps.gauge = 1.0;
    ps.locked = false;
    ps.cooldown = 0.0;
    if was_inv != ps.inverted() {
        wipe.start(spawn, ps.inverted());
    }
    player.invuln = 2.5;
}
