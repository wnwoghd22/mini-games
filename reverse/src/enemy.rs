//! 적: 터렛/드리프터/페이저/위성 적/코어/보스의 이동과 탄 패턴, 보스 레이저·방어막, 폭발 이펙트.

use bevy::prelude::*;

use crate::bullet::{self, Owner};
use crate::level::{Scroll, Stage, Tuning};
use crate::phase::{interacts, Phase};
use crate::pixel::{sprite, Spr, SpriteKind, SpriteSet};
use crate::player::{Player, PlayerHit, HIT_HALF};
use crate::{GameEntity, Pos, HALF_H, HALF_W};

pub const Z_ENEMY: f32 = 20.0;
pub const Z_FX: f32 = 40.0;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Turret,
    Drifter,
    Phaser,
    Boss,
    /// ST2 보스: 방어막을 펴고 정면 레이저를 쏘는 척하다 한 바퀴 회전
    LaserBoss,
    /// ST3 보스: 물질/반물질 한 쌍. 커튼탄 → 자리·계 교차 → 반대 방향 링탄
    TwinBoss,
    /// 고정 코어: 파괴하면 같은 그룹의 잠금 벽이 사라진다
    Core,
    /// 위성 두 개(물질 시계방향, 반물질 반시계방향)를 거느린 본체
    Orbiter,
    Satellite,
}

/// 코어의 잠금 그룹 번호
#[derive(Component)]
pub struct Core(pub u8);

/// 트윈 보스 한쪽
#[derive(Component)]
pub struct Twin {
    pub other: Entity,
    /// -1 왼쪽, +1 오른쪽 (교차 시 뒤바뀜)
    pub side: f32,
}

/// 위성: 본체 주위를 공전
#[derive(Component)]
pub struct Satellite {
    pub body: Entity,
    pub angle: f32,
    /// +1 반시계, -1 시계
    pub dir: f32,
}

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
    /// 보스: 마지막으로 진입한 단계
    pub stage: i32,
    pub max_hp: i32,
}

#[derive(Component)]
pub struct Boss;

/// 방어막 전개 중 (피해 무시)
#[derive(Component)]
pub struct Shielded;

#[derive(Component)]
pub struct ShieldFx;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum LaserState {
    /// 정면을 겨누며 점멸 (쏘는 척)
    Warn,
    /// 정면 발사
    Fire,
    /// 한 바퀴 회전
    Sweep,
}

/// 보스 레이저: 보스 위치에서 `angle` 방향으로 뻗는 선분
#[derive(Component)]
pub struct Laser {
    pub boss: Entity,
    pub angle: f32,
    pub state: LaserState,
    pub t: f32,
}

pub const LASER_LEN: f32 = 300.0;
const LASER_WARN: f32 = 1.2;
const LASER_FIRE: f32 = 0.7;
const LASER_SWEEP: f32 = 3.2;
const BOSS_CYCLE: f32 = 7.0;
const BOSS_STAGES: i32 = 3;
/// 레이저 보스: 조준 사격 구간 + 레이저 구간
const LB_SHOOT: f32 = 4.5;
const LB_LASER: f32 = LASER_WARN + LASER_FIRE + LASER_SWEEP + 0.6;

impl Kind {
    fn hp(self) -> i32 {
        match self {
            Kind::Turret => 4,
            Kind::Drifter => 3,
            Kind::Phaser => 6,
            Kind::Boss => 90,
            Kind::LaserBoss => 70,
            Kind::TwinBoss => 45,
            Kind::Core => 8,
            Kind::Orbiter => 12,
            Kind::Satellite => 3,
        }
    }
    pub fn score(self) -> u32 {
        match self {
            Kind::Turret => 100,
            Kind::Drifter => 150,
            Kind::Phaser => 250,
            Kind::Boss => 3000,
            Kind::LaserBoss => 2000,
            Kind::TwinBoss => 1500,
            Kind::Core => 300,
            Kind::Orbiter => 500,
            Kind::Satellite => 80,
        }
    }
    pub fn half(self) -> f32 {
        match self {
            Kind::Boss | Kind::LaserBoss => 13.0,
            Kind::TwinBoss => 12.0,
            Kind::Satellite => 4.0,
            _ => 6.0,
        }
    }
    fn spr(self) -> Spr {
        match self {
            Kind::Turret => Spr::Turret,
            Kind::Drifter => Spr::Drifter,
            Kind::Phaser => Spr::Phaser,
            Kind::Boss => Spr::Boss,
            Kind::LaserBoss => Spr::Boss2,
            Kind::TwinBoss => Spr::Boss3,
            Kind::Core => Spr::Core,
            Kind::Orbiter => Spr::Orbiter,
            Kind::Satellite => Spr::Satellite,
        }
    }
}

pub fn spawn(commands: &mut Commands, set: &SpriteSet, kind: Kind, phase: Phase, pos: Vec2) -> Entity {
    let rides = matches!(kind, Kind::Phaser | Kind::Boss | Kind::LaserBoss | Kind::TwinBoss | Kind::Orbiter);
    let mut e = commands.spawn((
        sprite(set, kind.spr(), pos.extend(Z_ENEMY)),
        Pos(pos),
        phase,
        Enemy {
            kind,
            hp: kind.hp(),
            timer: match kind {
                Kind::Boss | Kind::LaserBoss | Kind::TwinBoss => 1.5,
                _ => 0.8,
            },
            t: 0.0,
            base_x: pos.x,
            rides,
            shots: 0,
            stage: -1,
            max_hp: kind.hp(),
        },
        GameEntity,
    ));
    if !rides {
        e.insert(crate::level::Scrolled);
    }
    if matches!(kind, Kind::Boss | Kind::LaserBoss | Kind::TwinBoss) {
        e.insert(Boss);
    }
    let id = e.id();

    if kind == Kind::Orbiter {
        // 물질 위성은 시계방향, 반물질 위성은 반시계방향으로 공전
        for (ph, dir, a0) in [(Phase::Matter, -1.0, 0.0), (Phase::Anti, 1.0, std::f32::consts::PI)] {
            let sid = spawn(commands, set, Kind::Satellite, ph, pos);
            commands.entity(sid).insert(Satellite {
                body: id,
                angle: a0,
                dir,
            });
        }
    }
    id
}

/// 트윈 보스 한 쌍 스폰: 왼쪽 물질, 오른쪽 반물질
pub fn spawn_twins(commands: &mut Commands, set: &SpriteSet, pos: Vec2) {
    let l = spawn(commands, set, Kind::TwinBoss, Phase::Matter, pos + Vec2::new(-56.0, 0.0));
    let r = spawn(commands, set, Kind::TwinBoss, Phase::Anti, pos + Vec2::new(56.0, 0.0));
    commands.entity(l).insert(Twin { other: r, side: -1.0 });
    commands.entity(r).insert(Twin { other: l, side: 1.0 });
}

/// 적 탄 발사 (스테이지 난이도 계수로 속도 보정)
fn shoot(commands: &mut Commands, set: &SpriteSet, tun: &Tuning, phase: Phase, pos: Vec2, vel: Vec2, spr: Spr) {
    bullet::spawn(commands, set, Owner::Enemy, phase, pos, vel * tun.bullet_mul, spr);
}

fn on_screen(scroll: &Scroll, p: Vec2) -> bool {
    p.y < scroll.top() + 4.0 && p.y > scroll.bottom() - 4.0 && p.x.abs() < HALF_W + 4.0
}

pub fn enemy_ai(
    mut commands: Commands,
    time: Res<Time>,
    scroll: Res<Scroll>,
    stage: Res<Stage>,
    set: Res<SpriteSet>,
    player: Query<&Pos, With<Player>>,
    mut q: Query<(Entity, &mut Pos, &mut Phase, &mut Enemy), (Without<Player>, Without<Satellite>, Without<Twin>)>,
) {
    let dt = time.delta_secs().min(0.05);
    let tun = stage.tuning();
    let target = player.single().map(|p| p.0).unwrap_or(Vec2::new(0.0, scroll.cam_y - 80.0));

    for (entity, mut pos, mut phase, mut en) in &mut q {
        en.t += dt;
        let visible = on_screen(&scroll, pos.0);
        match en.kind {
            Kind::Core | Kind::Satellite | Kind::TwinBoss => {}
            Kind::Turret => {
                if !visible {
                    continue;
                }
                en.timer -= dt;
                if en.timer <= 0.0 {
                    en.timer = 1.4 * tun.fire_mul;
                    en.shots += 1;
                    let dir = (target - pos.0).normalize_or(Vec2::NEG_Y);
                    let angles: &[f32] = if en.shots % 3 == 0 { &[-0.28, 0.0, 0.28] } else { &[0.0] };
                    for a in angles {
                        let v = Vec2::from_angle(*a).rotate(dir) * 62.0;
                        shoot(&mut commands, &set, &tun, *phase, pos.0, v, Spr::Bullet);
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
                    en.timer = 1.1 * tun.fire_mul;
                    for i in -2..=2 {
                        let v = Vec2::from_angle(i as f32 * 0.22).rotate(Vec2::NEG_Y) * 58.0;
                        shoot(&mut commands, &set, &tun, *phase, pos.0, v, Spr::Needle);
                    }
                }
            }
            Kind::Phaser => {
                if en.rides {
                    pos.0.y += scroll.dy;
                    if en.t > 12.0 && !scroll.held {
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
                let want = if ((en.t / 2.0) as i32) % 2 == 0 { Phase::Matter } else { Phase::Anti };
                if *phase != want {
                    *phase = want;
                }
                en.timer -= dt;
                if en.timer <= 0.0 {
                    en.timer = 1.6 * tun.fire_mul;
                    let spin = en.t * 0.9;
                    for i in 0..8 {
                        let a = spin + i as f32 * std::f32::consts::TAU / 8.0;
                        shoot(&mut commands, &set, &tun, *phase, pos.0, Vec2::from_angle(a) * 46.0, Spr::Bullet);
                    }
                }
            }
            Kind::Orbiter => {
                // 화면 위쪽에서 천천히 8자 유영, 14초 뒤 이탈. 본체는 중립이라 어느 계의 탄에도 맞는다
                if en.rides {
                    pos.0.y += scroll.dy;
                    if en.t > 14.0 && !scroll.held {
                        en.rides = false;
                        commands.entity(entity).insert(crate::level::Scrolled);
                    }
                } else {
                    pos.0.y -= 30.0 * dt;
                }
                pos.0.x = en.base_x + (en.t * 0.8).sin() * 50.0;
                if en.rides {
                    let goal_y = scroll.cam_y + HALF_H - 60.0 + (en.t * 1.6).sin() * 12.0;
                    pos.0.y += (goal_y - pos.0.y) * (1.5 * dt).min(1.0);
                }
            }
            Kind::LaserBoss => {
                pos.0.y += scroll.dy;
                // 사이클: 조준 사격(LB_SHOOT초) → 방어막+레이저(LB_LASER초). 사이클마다 계가 바뀐다
                let cycle = LB_SHOOT + LB_LASER;
                let n = (en.t / cycle) as i32;
                let tc = en.t - n as f32 * cycle;
                let want = if n % 2 == 0 { Phase::Matter } else { Phase::Anti };
                if *phase != want {
                    *phase = want;
                }
                let stage = if tc < LB_SHOOT { 0 } else { 1 };
                let entered = stage != en.stage;
                en.stage = stage;

                // 레이저 중엔 화면 중앙 위에 멈춰 서고, 사격 중엔 좌우로 움직인다
                let goal = if stage == 1 {
                    Vec2::new(0.0, scroll.cam_y + HALF_H - 60.0)
                } else {
                    Vec2::new((en.t * 0.9).sin() * 70.0, scroll.cam_y + HALF_H - 56.0)
                };
                let d = goal - pos.0;
                pos.0 += d * (2.0 * dt).min(1.0);

                if stage == 1 {
                    if entered {
                        spawn_laser(&mut commands, &set, entity, pos.0, *phase);
                    }
                    continue;
                }
                // 두 번째 사이클부터 사격 구간 시작 시 위성 적 1기 동반 소환
                if entered && n >= 1 {
                    spawn(&mut commands, &set, Kind::Orbiter, Phase::Neutral, pos.0 + Vec2::new(-pos.0.x.signum() * 60.0, -10.0));
                }
                en.timer -= dt;
                if en.timer <= 0.0 {
                    en.timer = 0.6 * tun.fire_mul;
                    let dir = (target - pos.0).normalize_or(Vec2::NEG_Y);
                    for a in [-0.12, 0.12] {
                        let v = Vec2::from_angle(a).rotate(dir) * 75.0;
                        shoot(&mut commands, &set, &tun, *phase, pos.0, v, Spr::Needle);
                    }
                }
            }
            Kind::Boss => {
                pos.0.y += scroll.dy;
                let goal = Vec2::new((en.t * 0.6).sin() * 60.0, scroll.cam_y + HALF_H - 56.0);
                let d = goal - pos.0;
                pos.0 += d * (1.6 * dt).min(1.0);

                let stage = ((en.t / BOSS_CYCLE) as i32) % BOSS_STAGES;
                let entered = stage != en.stage;
                en.stage = stage;

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
                let _ = entered;

                en.timer -= dt;
                if en.timer > 0.0 {
                    continue;
                }
                en.shots += 1;
                match stage {
                    0 => {
                        en.timer = 0.55 * tun.fire_mul;
                        let dir = (target - pos.0).normalize_or(Vec2::NEG_Y);
                        for a in [-0.18, 0.0, 0.18] {
                            let v = Vec2::from_angle(a).rotate(dir) * 80.0;
                            shoot(&mut commands, &set, &tun, *phase, pos.0, v, Spr::Needle);
                        }
                    }
                    1 => {
                        en.timer = 0.75 * tun.fire_mul;
                        let spin = en.shots as f32 * 0.35;
                        for i in 0..14 {
                            let a = spin + i as f32 * std::f32::consts::TAU / 14.0;
                            shoot(&mut commands, &set, &tun, *phase, pos.0, Vec2::from_angle(a) * 52.0, Spr::Bullet);
                        }
                    }
                    _ => {
                        en.timer = 0.35 * tun.fire_mul;
                        let dir = (target - pos.0).normalize_or(Vec2::NEG_Y);
                        let other = phase.flip();
                        for (i, a) in [-0.5, -0.25, 0.0, 0.25, 0.5].iter().enumerate() {
                            let ph = if i % 2 == 0 { *phase } else { other };
                            let v = Vec2::from_angle(*a).rotate(dir) * 66.0;
                            shoot(&mut commands, &set, &tun, ph, pos.0, v, Spr::Bullet);
                        }
                    }
                }
            }
        }
    }
}

/// 위성: 본체 주위를 공전하며 바깥쪽으로 탄을 흩뿌린다. 본체가 죽으면 함께 폭발
pub fn satellites(
    mut commands: Commands,
    time: Res<Time>,
    scroll: Res<Scroll>,
    stage: Res<Stage>,
    set: Res<SpriteSet>,
    bodies: Query<&Pos, (With<Enemy>, Without<Satellite>)>,
    mut sats: Query<(Entity, &mut Pos, &mut Satellite, &Phase, &mut Enemy), Without<Player>>,
) {
    let dt = time.delta_secs().min(0.05);
    let tun = stage.tuning();
    for (e, mut pos, mut sat, phase, mut en) in &mut sats {
        let Ok(body) = bodies.get(sat.body) else {
            spawn_boom(&mut commands, &set, pos.0, *phase);
            commands.entity(e).despawn();
            continue;
        };
        sat.angle += sat.dir * 2.2 * dt;
        let radial = Vec2::from_angle(sat.angle);
        pos.0 = body.0 + radial * 26.0;
        en.t += dt;
        if !on_screen(&scroll, pos.0) {
            continue;
        }
        en.timer -= dt;
        if en.timer <= 0.0 {
            en.timer = 0.45 * tun.fire_mul;
            // 바깥 방향 + 공전 방향 접선 → 나선형 탄막
            let tangent = Vec2::new(-radial.y, radial.x) * sat.dir;
            let v = (radial * 0.8 + tangent * 0.6).normalize() * 55.0;
            shoot(&mut commands, &set, &tun, *phase, pos.0, v, Spr::Bullet);
        }
    }
}

/// 트윈 보스: 8초 사이클. 0~3초 커튼탄(틈 하나), 3~5초 자리·계 교차 + 조준탄, 5~8초 반대 방향 링탄.
/// 한쪽이 죽으면 남은 쪽은 발사 간격 0.6배로 광폭화
pub fn twins(
    mut commands: Commands,
    time: Res<Time>,
    scroll: Res<Scroll>,
    stage: Res<Stage>,
    set: Res<SpriteSet>,
    player: Query<&Pos, With<Player>>,
    mut q: Query<(Entity, &mut Pos, &mut Phase, &mut Enemy, &mut Twin), Without<Player>>,
) {
    let dt = time.delta_secs().min(0.05);
    let tun = stage.tuning();
    let target = player.single().map(|p| p.0).unwrap_or(Vec2::new(0.0, scroll.cam_y - 80.0));
    let alive: Vec<Entity> = q.iter().map(|(e, ..)| e).collect();

    for (_e, mut pos, mut phase, mut en, mut twin) in &mut q {
        en.t += dt;
        pos.0.y += scroll.dy;
        let enraged = !alive.contains(&twin.other);
        let rate = if enraged { 0.6 } else { 1.0 } * tun.fire_mul;

        let cycle = 8.0;
        let tc = en.t % cycle;
        let stage_idx = if tc < 3.0 { 0 } else if tc < 5.0 { 1 } else { 2 };
        let entered = stage_idx != en.stage;
        en.stage = stage_idx;

        // 교차 단계가 끝나는 순간 자리와 계를 맞바꿈
        if entered && stage_idx == 2 {
            twin.side = -twin.side;
            *phase = phase.flip();
        }
        let goal_x = if stage_idx == 1 { -twin.side * 56.0 } else { twin.side * 56.0 } + (en.t * 0.8).sin() * 8.0;
        let goal = Vec2::new(goal_x, scroll.cam_y + HALF_H - 52.0);
        let d = goal - pos.0;
        pos.0 += d * (2.2 * dt).min(1.0);

        en.timer -= dt;
        if en.timer > 0.0 {
            continue;
        }
        en.shots += 1;
        match stage_idx {
            0 => {
                // 커튼탄: 물질은 짝수 박자, 반물질은 홀수 박자에 발사 → 계가 번갈아 내려온다
                en.timer = 0.8 * rate;
                let beat = (tc / 0.8) as u32;
                let mine = if *phase == Phase::Matter { beat % 2 == 0 } else { beat % 2 == 1 };
                if !mine {
                    continue;
                }
                let gap = (-target.x * 0.5 + twin.side * 30.0).clamp(-120.0, 120.0);
                let mut x = -HALF_W + 8.0;
                while x <= HALF_W - 8.0 {
                    if (x - gap).abs() > 14.0 {
                        shoot(&mut commands, &set, &tun, *phase, Vec2::new(x, pos.0.y - 10.0), Vec2::new(0.0, -55.0), Spr::Bullet);
                    }
                    x += 15.0;
                }
            }
            1 => {
                en.timer = 0.5 * rate;
                let dir = (target - pos.0).normalize_or(Vec2::NEG_Y);
                for a in [-0.15, 0.15] {
                    shoot(&mut commands, &set, &tun, *phase, pos.0, Vec2::from_angle(a).rotate(dir) * 78.0, Spr::Needle);
                }
            }
            _ => {
                en.timer = 0.7 * rate;
                let dir_sign = if *phase == Phase::Matter { 1.0 } else { -1.0 };
                let spin = dir_sign * en.shots as f32 * 0.4;
                for i in 0..10 {
                    let a = spin + i as f32 * std::f32::consts::TAU / 10.0;
                    shoot(&mut commands, &set, &tun, *phase, pos.0, Vec2::from_angle(a) * 50.0, Spr::Bullet);
                }
            }
        }
    }
}

// ---------- 보스 레이저 / 방어막 ----------

fn spawn_laser(commands: &mut Commands, set: &SpriteSet, boss: Entity, pos: Vec2, phase: Phase) {
    commands.entity(boss).insert(Shielded);
    // 방어막 링 (보스 자식)
    commands.spawn((
        sprite(set, Spr::Shield, Vec3::new(0.0, 0.0, 0.5)),
        phase,
        ShieldFx,
        ChildOf(boss),
    ));
    // 레이저: 아래(-90도)를 겨누고 시작
    let angle = -std::f32::consts::FRAC_PI_2;
    commands
        .spawn((
            Transform::from_translation(pos.extend(Z_FX - 5.0)).with_rotation(Quat::from_rotation_z(angle)),
            Visibility::default(),
            Pos(pos),
            phase,
            Laser {
                boss,
                angle,
                state: LaserState::Warn,
                t: 0.0,
            },
            GameEntity,
        ))
        .with_children(|p| {
            let n = (LASER_LEN / 8.0) as i32;
            for i in 0..n {
                p.spawn((
                    sprite(set, Spr::LaserBit, Vec3::new(18.0 + i as f32 * 8.0, 0.0, 0.0)),
                    phase.accent(),
                ));
            }
        });
}

pub fn lasers(
    mut commands: Commands,
    time: Res<Time>,
    mut q: Query<(Entity, &mut Laser, &mut Pos, &mut Transform, &mut Visibility, &Phase)>,
    bosses: Query<&Pos, (With<Boss>, Without<Laser>)>,
    shields: Query<(Entity, &ChildOf), With<ShieldFx>>,
    player: Query<(&Pos, &Phase, &Player), Without<Laser>>,
    mut hits: MessageWriter<PlayerHit>,
) {
    let dt = time.delta_secs().min(0.05);
    for (e, mut laser, mut pos, mut tf, mut vis, phase) in &mut q {
        let Ok(bp) = bosses.get(laser.boss) else {
            commands.entity(e).despawn();
            continue;
        };
        pos.0 = bp.0;
        laser.t += dt;
        let mut lethal = true;
        match laser.state {
            LaserState::Warn => {
                lethal = false;
                *vis = if ((laser.t * 10.0) as i32) % 2 == 0 { Visibility::Inherited } else { Visibility::Hidden };
                if laser.t >= LASER_WARN {
                    laser.state = LaserState::Fire;
                    laser.t = 0.0;
                    *vis = Visibility::Inherited;
                }
            }
            LaserState::Fire => {
                if laser.t >= LASER_FIRE {
                    laser.state = LaserState::Sweep;
                    laser.t = 0.0;
                }
            }
            LaserState::Sweep => {
                laser.angle = -std::f32::consts::FRAC_PI_2 + std::f32::consts::TAU * (laser.t / LASER_SWEEP);
                if laser.t >= LASER_SWEEP {
                    // 종료: 방어막 해제
                    commands.entity(laser.boss).remove::<Shielded>();
                    for (se, parent) in &shields {
                        if parent.parent() == laser.boss {
                            commands.entity(se).despawn();
                        }
                    }
                    commands.entity(e).despawn();
                    continue;
                }
            }
        }
        tf.rotation = Quat::from_rotation_z(laser.angle);

        // 플레이어 피격: 선분까지의 거리
        if !lethal {
            continue;
        }
        let Ok((pp, pph, pl)) = player.single() else { continue };
        if pl.invuln > 0.0 || !interacts(*phase, *pph) {
            continue;
        }
        let u = Vec2::from_angle(laser.angle);
        let d = pp.0 - pos.0;
        let s = d.dot(u);
        let off = (d.x * u.y - d.y * u.x).abs();
        if s > 14.0 && s < LASER_LEN + 14.0 && off < 2.0 + HIT_HALF {
            hits.write(PlayerHit);
        }
    }
}

// ---------- 폭발 ----------

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

/// 소형 폭발: 파편 프레임만 짧게 (사망 시 탄 소거 연출)
pub fn spawn_boom_small(commands: &mut Commands, set: &SpriteSet, pos: Vec2, phase: Phase) {
    commands.spawn((
        sprite(set, Spr::Boom2, pos.extend(Z_FX)),
        Pos(pos),
        phase,
        Boom { t: 0.22 },
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

/// 단순 LCG 난수 (rand 크레이트 없이 드랍 확률에 사용)
#[derive(Resource)]
pub struct Rng(pub u32);

impl Default for Rng {
    fn default() -> Self {
        Rng(0x9E37_79B9)
    }
}

impl Rng {
    pub fn next_f32(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        (self.0 >> 8) as f32 / (1u32 << 24) as f32
    }
}

