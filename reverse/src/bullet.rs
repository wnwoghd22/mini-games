//! 탄: 이동, 화면 밖 제거, 벽 충돌, 피격 판정(플레이어/적/스위치).

use bevy::prelude::*;

use crate::enemy::{self, Core, Enemy};
use crate::level::{self, LockGroup, Scroll, Switch, Wall};
use crate::phase::{interacts, Phase};
use crate::pixel::{sprite, Spr, SpriteKind, SpriteSet};
use crate::player::{Player, PlayerHit, HIT_HALF};
use crate::{GameEntity, Pos, Score, HALF_H, HALF_W};

pub const Z_BULLET: f32 = 30.0;
pub const BULLET_HALF: f32 = 2.0;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Owner {
    Player,
    Enemy,
}

#[derive(Component)]
pub struct Bullet {
    pub vel: Vec2,
    pub owner: Owner,
}

pub fn spawn(
    commands: &mut Commands,
    set: &SpriteSet,
    owner: Owner,
    phase: Phase,
    pos: Vec2,
    vel: Vec2,
    spr: Spr,
) {
    commands.spawn((
        sprite(set, spr, pos.extend(Z_BULLET)),
        Pos(pos),
        phase,
        Bullet { vel, owner },
        GameEntity,
    ));
}

pub fn bullet_move(
    mut commands: Commands,
    time: Res<Time>,
    scroll: Res<Scroll>,
    mut q: Query<(Entity, &mut Pos, &Bullet)>,
) {
    let dt = time.delta_secs().min(0.05);
    for (e, mut pos, b) in &mut q {
        pos.0 += b.vel * dt;
        let p = pos.0;
        if p.x.abs() > HALF_W + 12.0 || p.y > scroll.cam_y + HALF_H + 12.0 || p.y < scroll.cam_y - HALF_H - 12.0 {
            commands.entity(e).despawn();
        }
    }
}

fn overlap(a: Vec2, ha: f32, b: Vec2, hb: f32) -> bool {
    (a.x - b.x).abs() < ha + hb && (a.y - b.y).abs() < ha + hb
}

/// 벽/스위치와의 충돌: 상호작용하는 벽에 막히고, 스위치를 맞히면 토글
pub fn bullet_walls(
    mut commands: Commands,
    scroll: Res<Scroll>,
    bullets: Query<(Entity, &Pos, &Phase, &Bullet)>,
    mut walls: Query<(&Pos, &mut Phase, &mut SpriteKind), (With<Wall>, Without<Bullet>, Without<Switch>)>,
    mut switches: Query<(&Pos, &mut Switch, &mut SpriteKind), (Without<Wall>, Without<Bullet>)>,
) {
    for (e, bp, bph, b) in &bullets {
        let mut dead = false;
        for (wp, wph, _) in walls.iter() {
            if interacts(*bph, *wph) && overlap(bp.0, BULLET_HALF, wp.0, 8.0) {
                dead = true;
                break;
            }
        }
        if !dead {
            for (sp, mut sw, mut kind) in &mut switches {
                if overlap(bp.0, BULLET_HALF, sp.0, 8.0) {
                    dead = true;
                    if b.owner == Owner::Player && sw.cooldown <= 0.0 {
                        level::toggle_switch(&mut sw, &mut kind, &scroll, &mut walls);
                    }
                    break;
                }
            }
        }
        if dead {
            commands.entity(e).despawn();
        }
    }
}

/// 적 탄 → 플레이어, 플레이어 탄 → 적
pub fn bullet_hits(
    mut commands: Commands,
    set: Res<SpriteSet>,
    mut score: ResMut<Score>,
    bullets: Query<(Entity, &Pos, &Phase, &Bullet)>,
    player: Query<(&Pos, &Phase, &Player)>,
    mut enemies: Query<(Entity, &Pos, &Phase, &mut Enemy, Option<&Core>)>,
    locks: Query<(Entity, &Pos, &LockGroup)>,
    mut hits: MessageWriter<PlayerHit>,
) {
    let player = player.single().ok();
    for (e, bp, bph, b) in &bullets {
        match b.owner {
            Owner::Enemy => {
                let Some((pp, pph, pl)) = player else { continue };
                if pl.invuln > 0.0 || !interacts(*bph, *pph) {
                    continue;
                }
                if overlap(bp.0, BULLET_HALF, pp.0, HIT_HALF) {
                    commands.entity(e).despawn();
                    hits.write(PlayerHit);
                }
            }
            Owner::Player => {
                for (ee, ep, eph, mut en, core) in &mut enemies {
                    if !interacts(*bph, *eph) || !overlap(bp.0, BULLET_HALF, ep.0, en.kind.half()) {
                        continue;
                    }
                    commands.entity(e).despawn();
                    en.hp -= 1;
                    if en.hp <= 0 {
                        score.0 += en.kind.score();
                        enemy::spawn_boom(&mut commands, &set, ep.0, *eph);
                        if en.kind == enemy::Kind::Boss {
                            for d in [Vec2::new(-10.0, 8.0), Vec2::new(9.0, -7.0), Vec2::new(0.0, 12.0)] {
                                enemy::spawn_boom(&mut commands, &set, ep.0 + d, *eph);
                            }
                        }
                        // 코어 파괴: 같은 그룹의 잠금 벽이 폭발하며 사라짐
                        if let Some(core) = core {
                            for (le, lp, lg) in &locks {
                                if lg.0 == core.0 {
                                    enemy::spawn_boom(&mut commands, &set, lp.0, *eph);
                                    commands.entity(le).despawn();
                                }
                            }
                        }
                        commands.entity(ee).despawn();
                    }
                    break;
                }
            }
        }
    }
}
