//! 아이템: 적 격파 시 드랍, 천천히 내려오며 플레이어가 닿으면 획득. 중립이라 어느 계에서도 집을 수 있다.

use bevy::prelude::*;

use crate::enemy::{Kind, Rng};
use crate::level::Scrolled;
use crate::pixel::{sprite, Accent, Spr, SpriteSet};
use crate::player::{Player, MAX_LIVES, MAX_POWER};
use crate::{GameEntity, Pos, Score};

pub const Z_ITEM: f32 = 28.0;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ItemKind {
    Life,
    Power,
}

#[derive(Component)]
pub struct Item {
    pub kind: ItemKind,
    pub t: f32,
}

pub fn spawn(commands: &mut Commands, set: &SpriteSet, kind: ItemKind, pos: Vec2) {
    let spr = match kind {
        ItemKind::Life => Spr::ItemLife,
        ItemKind::Power => Spr::ItemPower,
    };
    commands.spawn((
        sprite(set, spr, pos.extend(Z_ITEM)),
        Accent::Red,
        Pos(pos),
        Item { kind, t: 0.0 },
        Scrolled,
        GameEntity,
    ));
}

/// 격파한 적 종류에 따라 드랍 결정
pub fn maybe_drop(commands: &mut Commands, set: &SpriteSet, rng: &mut Rng, kind: Kind, pos: Vec2) {
    let r = rng.next_f32();
    let drop = match kind {
        Kind::Turret | Kind::Drifter => {
            if r < 0.12 { Some(ItemKind::Power) } else { None }
        }
        Kind::Phaser => {
            if r < 0.35 { Some(ItemKind::Power) } else { None }
        }
        Kind::Orbiter => Some(if r < 0.5 { ItemKind::Life } else { ItemKind::Power }),
        Kind::Core => {
            if r < 0.6 { Some(ItemKind::Life) } else { Some(ItemKind::Power) }
        }
        Kind::Satellite | Kind::Boss | Kind::LaserBoss | Kind::TwinBoss => None,
    };
    if let Some(k) = drop {
        spawn(commands, set, k, pos);
    }
}

/// 낙하 + 빨강/파랑 점멸 + 획득
pub fn items(
    mut commands: Commands,
    time: Res<Time>,
    mut score: ResMut<Score>,
    mut q: Query<(Entity, &mut Pos, &mut Item, &mut Accent)>,
    mut player: Query<(&Pos, &mut Player), Without<Item>>,
) {
    let dt = time.delta_secs().min(0.05);
    let player = player.single_mut().ok();
    let Some((pp, mut pl)) = player else { return };
    for (e, mut pos, mut item, mut accent) in &mut q {
        item.t += dt;
        pos.0.y -= 18.0 * dt;
        pos.0.x += (item.t * 2.0).sin() * 10.0 * dt;
        let want = if ((item.t * 4.0) as i32) % 2 == 0 { Accent::Red } else { Accent::Blue };
        if *accent != want {
            *accent = want;
        }
        if (pos.0.x - pp.0.x).abs() < 9.0 && (pos.0.y - pp.0.y).abs() < 9.0 {
            match item.kind {
                ItemKind::Life => pl.lives = (pl.lives + 1).min(MAX_LIVES),
                ItemKind::Power => pl.power = (pl.power + 1).min(MAX_POWER),
            }
            score.0 += 200;
            commands.entity(e).despawn();
        }
    }
}
