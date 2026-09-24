//! HUD(점수/목숨/보스 HP)와 스크롤 배경 타일은 카메라의 자식으로 화면에 고정된다.
//! 위상 게이지는 플레이어 옆의 호(player.rs의 GaugeSeg)이며 여기서 채움만 갱신한다.

use bevy::prelude::*;
use bevy::sprite::Anchor;

use crate::enemy::{Boss, Enemy};
use crate::level::Scroll;
use crate::phase::PhaseState;
use crate::pixel::{self, sprite, Accent, Spr, SpriteKind, SpriteSet};
use crate::player::{GaugeSeg, Player, START_LIVES};
use crate::{Score, HALF_H, HALF_W, TILE};

pub const Z_BG: f32 = -50.0;
pub const Z_HUD: f32 = 90.0;

const BG_COLS: i32 = 21;
const BG_ROWS: i32 = 17;

#[derive(Component)]
pub struct BgTile {
    col: i32,
    row: i32,
}

/// HUD 전체(배경 타일 제외)의 부모. 플레이 중에만 표시
#[derive(Component)]
pub struct HudRoot;

#[derive(Component)]
pub struct ScoreText {
    shown: u32,
}

#[derive(Component)]
pub struct LifeIcon(i32);

#[derive(Component)]
pub struct BossBar;

#[derive(Component)]
pub struct BossBarFrame;

const BOSS_W: f32 = 120.0;

/// 카메라 자식으로 배경과 HUD를 생성
pub fn build(camera: &mut EntityCommands, set: &SpriteSet) {
    camera.with_children(|c| {
        for row in 0..BG_ROWS {
            for col in 0..BG_COLS {
                let x = -HALF_W + TILE / 2.0 + col as f32 * TILE;
                c.spawn((
                    sprite(set, Spr::Bg0, Vec3::new(x, 0.0, Z_BG)),
                    BgTile { col, row },
                ));
            }
        }
    });

    let cam_id = camera.id();
    camera
        .commands()
        .spawn((Transform::IDENTITY, Visibility::Hidden, HudRoot, ChildOf(cam_id)))
        .with_children(|c| {
            // 점수 (좌상단) — 벽 위에서도 읽히도록 페이퍼 배경판
            let mut back = Sprite::from_image(set.get(Spr::PixPaper, false, Accent::Ink));
            back.custom_size = Some(Vec2::new(52.0, 9.0));
            c.spawn((
                back,
                SpriteKind(Spr::PixPaper),
                Transform::from_xyz(-HALF_W + 28.0, HALF_H - 6.0, Z_HUD - 0.5),
            ));
            c.spawn((
                Transform::from_xyz(-HALF_W + 4.0, HALF_H - 4.0, Z_HUD),
                Visibility::default(),
                ScoreText { shown: u32::MAX },
            ));

            // 목숨 아이콘 (우상단)
            let mut back = Sprite::from_image(set.get(Spr::PixPaper, false, Accent::Ink));
            back.custom_size = Some(Vec2::new(10.0 * START_LIVES as f32 + 4.0, 11.0));
            c.spawn((
                back,
                SpriteKind(Spr::PixPaper),
                Transform::from_xyz(HALF_W - 3.0 - 5.0 * START_LIVES as f32 - 1.0, HALF_H - 6.0, Z_HUD - 0.5),
            ));
            for i in 0..START_LIVES {
                let x = HALF_W - 8.0 - i as f32 * 10.0;
                c.spawn((
                    sprite(set, Spr::Life, Vec3::new(x, HALF_H - 7.0, Z_HUD)),
                    Accent::Red,
                    LifeIcon(i),
                ));
            }

            // 보스 HP (상단 중앙, 보스가 있을 때만 표시)
            let by = HALF_H - 6.0;
            let mut bframe = Sprite::from_image(set.get(Spr::Pix, false, Accent::Ink));
            bframe.custom_size = Some(Vec2::new(BOSS_W + 4.0, 5.0));
            c.spawn((
                bframe,
                SpriteKind(Spr::Pix),
                Transform::from_xyz(0.0, by, Z_HUD),
                Visibility::Hidden,
                BossBarFrame,
            ));
            let mut bfill = Sprite::from_image(set.get(Spr::PixAccent, false, Accent::Red));
            bfill.custom_size = Some(Vec2::new(BOSS_W, 3.0));
            c.spawn((
                bfill,
                SpriteKind(Spr::PixAccent),
                Accent::Red,
                Anchor(Vec2::new(-0.5, 0.0)),
                Transform::from_xyz(-BOSS_W / 2.0, by, Z_HUD + 0.2),
                Visibility::Hidden,
                BossBar,
            ));
        });
}

/// 배경 타일을 카메라 이동에 맞춰 순환 이동하고, 월드 행 좌표로 무늬를 고른다
pub fn bg_scroll(scroll: Res<Scroll>, mut q: Query<(&BgTile, &mut Transform, &mut SpriteKind)>) {
    let off = scroll.cam_y.rem_euclid(TILE);
    let base_row = (scroll.cam_y / TILE).floor() as i64;
    for (tile, mut tf, mut kind) in &mut q {
        tf.translation.y = -HALF_H - TILE / 2.0 + tile.row as f32 * TILE - off;
        let r = base_row + tile.row as i64;
        let h = (r.wrapping_mul(73_856_093) ^ (tile.col as i64).wrapping_mul(19_349_663)).rem_euclid(11);
        kind.0 = match h {
            0 | 1 => Spr::Bg1,
            2 => Spr::Bg2,
            _ => Spr::Bg0,
        };
    }
}

pub fn update_hud(
    mut commands: Commands,
    time: Res<Time>,
    set: Res<SpriteSet>,
    score: Res<Score>,
    ps: Res<PhaseState>,
    player: Query<&Player>,
    mut score_text: Query<(Entity, &mut ScoreText)>,
    mut lives: Query<(&LifeIcon, &mut Visibility)>,
    mut gauge: Query<(&GaugeSeg, &mut Visibility, &mut Accent), Without<LifeIcon>>,
    bosses: Query<(&Enemy, &crate::phase::Phase), With<Boss>>,
    mut boss_bar: Query<(&mut Sprite, &mut Visibility, &mut Accent), (With<BossBar>, Without<GaugeSeg>, Without<LifeIcon>)>,
    mut boss_frame: Query<&mut Visibility, (With<BossBarFrame>, Without<BossBar>, Without<GaugeSeg>, Without<LifeIcon>)>,
) {
    // 점수
    if let Ok((e, mut st)) = score_text.single_mut() {
        if st.shown != score.0 {
            st.shown = score.0;
            let text = format!("SCORE {:06}", score.0);
            commands.entity(e).despawn_related::<Children>();
            commands.entity(e).with_children(|p| pixel::spawn_glyphs(p, &set, &text));
        }
    }

    // 목숨
    let lives_left = player.single().map(|p| p.lives).unwrap_or(0);
    for (icon, mut vis) in &mut lives {
        *vis = if icon.0 < lives_left { Visibility::Inherited } else { Visibility::Hidden };
    }

    // 호 게이지: 잔량만큼 아래에서부터 채움. 잠금/간섭/전환 거부 중이면 전체 점멸
    let denied = player.single().map(|p| p.deny_flash > 0.0).unwrap_or(false);
    let blink = ((time.elapsed_secs() * 8.0) as i32) % 2 == 0;
    let hide_all = (ps.locked || ps.jammed || denied) && blink;
    for (seg, mut vis, mut accent) in &mut gauge {
        let filled = (ps.gauge * seg.total as f32).ceil() as usize;
        let on = !hide_all && seg.idx < filled;
        *vis = if on { Visibility::Inherited } else { Visibility::Hidden };
        let want = ps.player.accent();
        if *accent != want {
            *accent = want;
        }
    }

    // 보스 HP
    let boss = bosses.iter().next();
    if let Ok((mut sprite, mut vis, mut accent)) = boss_bar.single_mut() {
        match boss {
            Some((b, ph)) => {
                sprite.custom_size = Some(Vec2::new((BOSS_W * b.hp as f32 / 70.0).clamp(0.0, BOSS_W).round(), 3.0));
                *vis = Visibility::Inherited;
                let want = ph.accent();
                if *accent != want {
                    *accent = want;
                }
            }
            None => *vis = Visibility::Hidden,
        }
    }
    if let Ok(mut vis) = boss_frame.single_mut() {
        *vis = if boss.is_some() { Visibility::Inherited } else { Visibility::Hidden };
    }
}

pub fn show_hud(mut q: Query<&mut Visibility, With<HudRoot>>) {
    for mut v in &mut q {
        *v = Visibility::Inherited;
    }
}

pub fn hide_hud(mut q: Query<&mut Visibility, With<HudRoot>>) {
    for mut v in &mut q {
        *v = Visibility::Hidden;
    }
}
