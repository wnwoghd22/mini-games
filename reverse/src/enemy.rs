//! 적: 터렛/드리프터/페이저/보스의 이동과 탄 패턴, 폭발 이펙트.

use bevy::prelude::*;

use crate::bullet::{self, Owner};
use crate::level::Scroll;
use crate::phase::Phase;
use crate::pixel::{sprite, Spr, SpriteKind, SpriteSet};
use crate::player::Player;
use crate::{GameEntity, Pos, HALF_H, HALF_W};

pub const Z_ENEMY: f32 = 20.0;
pub const Z_FX: f32 = 40.0;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Turret,
    Drifter,
    Phaser,
    Boss,
    /// 고정 코어: 파괴하면 같은 그룹의 잠금 벽이 사라진다
    Core,
}

/// 코어의 잠금 그룹 번호
#[derive(Component)]
pub struct Core(pub u8);

#[derive(Component)]
pub struct Enemy {
    pub kind: Kind,
    pub hp: i32,
    /// 다음 발사까지
    pub timer: f32,
    /// 생존 시간
    pub t: f32,
    pub base_x: f32,
    /// 화면 아래로 벗어나도 제거되지 않고 카메라를 따라다니는가
    pub rides: bool,
    pub shots: u32,
}

#[derive(Component)]
pub struct Boss;

impl Kind {
    fn hp(self) -> i32 {
        match self {
            Kind::Turret => 4,
            Kind::Drifter => 3,
            Kind::Phaser => 6,
            Kind::Boss => 70,
            Kind::Core => 8,
        }
    }
    pub fn score(self) -> u32 {
        match self {
            Kind::Turret => 100,
            Kind::Drifter => 150,
            Kind::Phaser => 250,
            Kind::Boss => 3000,
            Kind::Core => 300,
        }
    }
    pub fn half(self) -> f32 {
        match self {
            Kind::Boss => 13.0,
            _ => 6.0,
        }
    }
    fn spr(self) -> Spr {
        match self {
            Kind::Turret => Spr::Turret,
            Kind::Drifter => Spr::Drifter,
            Kind::Phaser => Spr::Phaser,
            Kind::Boss => Spr::Boss,
            Kind::Core => Spr::Core,
        }
    }
}

pub fn spawn(commands: &mut Commands, set: &SpriteSet, kind: Kind, phase: Phase, pos: Vec2) -> Entity {
    let rides = matches!(kind, Kind::Phaser | Kind::Boss);
    let mut e = commands.spawn((
        sprite(set, kind.spr(), pos.extend(Z_ENEMY)),
        Pos(pos),
        phase,
        Enemy {
            kind,
            hp: kind.hp(),
            timer: match kind {
                Kind::Boss => 1.5,
                _ => 0.8,
            },
            t: 0.0,
            base_x: pos.x,
            rides,
            shots: 0,
        },
        GameEntity,
    ));
    if !rides {
        e.insert(crate::level::Scrolled);
    }
    if kind == Kind::Boss {
        e.insert(Boss);
    }
    e.id()
}

fn on_screen(scroll: &Scroll, p: Vec2) -> bool {
    p.y < scroll.top() + 4.0 && p.y > scroll.bottom() - 4.0 && p.x.abs() < HALF_W + 4.0
}

pub fn enemy_ai(
    mut commands: Commands,
    time: Res<Time>,
    scroll: Res<Scroll>,
    set: Res<SpriteSet>,
    player: Query<&Pos, With<Player>>,
    mut q: Query<(Entity, &mut Pos, &mut Phase, &mut Enemy), Without<Player>>,
) {
    let dt = time.delta_secs().min(0.05);
    let target = player.single().map(|p| p.0).unwrap_or(Vec2::new(0.0, scroll.cam_y - 80.0));

    for (entity, mut pos, mut phase, mut en) in &mut q {
        en.t += dt;
        let visible = on_screen(&scroll, pos.0);
        match en.kind {
            Kind::Core => {}
            Kind::Turret => {
                if !visible {
                    continue;
                }
                en.timer -= dt;
                if en.timer <= 0.0 {
                    en.timer = 1.4;
                    en.shots += 1;
                    let dir = (target - pos.0).normalize_or(Vec2::NEG_Y);
                    // 세 번에 한 번은 3방향 부채
                    let angles: &[f32] = if en.shots % 3 == 0 { &[-0.28, 0.0, 0.28] } else { &[0.0] };
                    for a in angles {
                        let v = Vec2::from_angle(*a).rotate(dir) * 62.0;
                        bullet::spawn(&mut commands, &set, Owner::Enemy, *phase, pos.0, v, Spr::Bullet);
                    }
                }
            }
            Kind::Drifter => {
                pos.0.y -= 34.0 * dt;
                pos.0.x = en.base_x + (en.t * 2.2).sin() * 28.0;
                if !visible {
                    continue;
                }
                en.timer -= dt;
                if en.timer <= 0.0 {
                    en.timer = 1.1;
                    for i in -2..=2 {
                        let v = Vec2::from_angle(i as f32 * 0.22).rotate(Vec2::NEG_Y) * 58.0;
                        bullet::spawn(&mut commands, &set, Owner::Enemy, *phase, pos.0, v, Spr::Needle);
                    }
                }
            }
            Kind::Phaser => {
                if en.rides {
                    pos.0.y += scroll.dy;
                    if en.t > 12.0 {
                        en.rides = false;
                        commands.entity(entity).insert(crate::level::Scrolled);
                    }
                } else {
                    pos.0.y -= 30.0 * dt;
                }
                pos.0.x = en.base_x + (en.t * 1.3).sin() * 44.0;
                if !visible {
                    continue;
                }
                // 2초마다 위상 전환
                let period = 2.0;
                let phase_idx = (en.t / period) as i32;
                let want = if phase_idx % 2 == 0 { Phase::Matter } else { Phase::Anti };
                if *phase != want {
                    *phase = want;
                }
                en.timer -= dt;
                if en.timer <= 0.0 {
                    en.timer = 1.6;
                    let spin = en.t * 0.9;
                    for i in 0..8 {
                        let a = spin + i as f32 * std::f32::consts::TAU / 8.0;
                        let v = Vec2::from_angle(a) * 46.0;
                        bullet::spawn(&mut commands, &set, Owner::Enemy, *phase, pos.0, v, Spr::Bullet);
                    }
                }
            }
            Kind::Boss => {
                pos.0.y += scroll.dy;
                // 화면 상단 부근으로 이동, 좌우로 유영
                let goal = Vec2::new((en.t * 0.6).sin() * 60.0, scroll.cam_y + HALF_H - 56.0);
                let d = goal - pos.0;
                pos.0 += d * (1.6 * dt).min(1.0);

                let stage = ((en.t / 7.0) as i32) % 3;
                let want = match stage {
                    0 => Phase::Matter,
                    1 => Phase::Anti,
                    _ => {
                        if ((en.t / 0.7) as i32) % 2 == 0 {
                            Phase::Matter
                        } else {
                            Phase::Anti
                        }
                    }
                };
                if *phase != want {
                    *phase = want;
                }
                en.timer -= dt;
                if en.timer > 0.0 {
                    continue;
                }
                en.shots += 1;
                match stage {
                    0 => {
                        // 조준 3연사
                        en.timer = 0.55;
                        let dir = (target - pos.0).normalize_or(Vec2::NEG_Y);
                        for a in [-0.18, 0.0, 0.18] {
                            let v = Vec2::from_angle(a).rotate(dir) * 80.0;
                            bullet::spawn(&mut commands, &set, Owner::Enemy, *phase, pos.0, v, Spr::Needle);
                        }
                    }
                    1 => {
                        // 회전 링탄
                        en.timer = 0.75;
                        let spin = en.shots as f32 * 0.35;
                        for i in 0..14 {
                            let a = spin + i as f32 * std::f32::consts::TAU / 14.0;
                            let v = Vec2::from_angle(a) * 52.0;
                            bullet::spawn(&mut commands, &set, Owner::Enemy, *phase, pos.0, v, Spr::Bullet);
                        }
                    }
                    _ => {
                        // 위상을 빠르게 바꾸며 양 위상 탄을 섞어 뿌림
                        en.timer = 0.35;
                        let dir = (target - pos.0).normalize_or(Vec2::NEG_Y);
                        let other = phase.flip();
                        for (i, a) in [-0.5, -0.25, 0.0, 0.25, 0.5].iter().enumerate() {
                            let ph = if i % 2 == 0 { *phase } else { other };
                            let v = Vec2::from_angle(*a).rotate(dir) * 66.0;
                            bullet::spawn(&mut commands, &set, Owner::Enemy, ph, pos.0, v, Spr::Bullet);
                        }
                    }
                }
            }
        }
    }
}

/// 폭발 이펙트
#[derive(Component)]
pub struct Boom {
    t: f32,
}

pub fn spawn_boom(commands: &mut Commands, set: &SpriteSet, pos: Vec2, phase: Phase) {
    commands.spawn((
        sprite(set, Spr::Boom0, pos.extend(Z_FX)),
        Pos(pos),
        phase,
        Boom { t: 0.0 },
        GameEntity,
    ));
}

pub fn tick_booms(
    mut commands: Commands,
    time: Res<Time>,
    mut q: Query<(Entity, &mut Boom, &mut SpriteKind)>,
) {
    for (e, mut b, mut kind) in &mut q {
        b.t += time.delta_secs();
        kind.0 = if b.t < 0.1 {
            Spr::Boom0
        } else if b.t < 0.22 {
            Spr::Boom1
        } else {
            Spr::Boom2
        };
        if b.t > 0.36 {
            commands.entity(e).despawn();
        }
    }
}

