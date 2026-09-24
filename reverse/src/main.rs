//! REVERSE — Shift로 물질계/반물질계를 오가는 도트 탄막 슈팅.

mod bullet;
#[cfg(feature = "demo")]
mod demo;
mod enemy;
mod hud;
mod item;
mod level;
mod phase;
mod pixel;
mod player;

use bevy::asset::AssetMetaCheck;
use bevy::camera::ScalingMode;
use bevy::prelude::*;
use bevy::window::WindowResolution;

use level::{LevelData, Scroll, Stage, LAST_STAGE};
use phase::{PhaseState, Wipe};
use pixel::{sprite, Spr, SpriteSet};

pub const VIEW_W: f32 = 320.0;
pub const VIEW_H: f32 = 240.0;
pub const HALF_W: f32 = VIEW_W / 2.0;
pub const HALF_H: f32 = VIEW_H / 2.0;
pub const TILE: f32 = 16.0;
pub const SCALE: u32 = 3;

#[derive(States, Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum GameState {
    #[default]
    Title,
    Playing,
    /// 스테이지 클리어 화면 (잠시 후 다음 스테이지로)
    StageClear,
    GameOver,
    /// 전 스테이지 클리어
    Clear,
}

/// 월드 좌표(f32). PostUpdate에서 정수로 반올림해 Transform에 기록한다(픽셀 스냅)
#[derive(Component, Clone, Copy)]
pub struct Pos(pub Vec2);

/// 스테이지가 바뀔 때 일괄 제거되는 엔티티 (레벨 오브젝트, 탄, 이펙트)
#[derive(Component)]
pub struct GameEntity;

/// 한 판(런) 동안 유지되는 엔티티 (플레이어). 타이틀/게임오버에서 재시작할 때만 제거
#[derive(Component)]
pub struct RunEntity;

/// 상태별 오버레이 텍스트 (상태를 나갈 때 제거)
#[derive(Component)]
pub struct Overlay;

/// 스테이지 시작 배너 (시간이 지나면 제거)
#[derive(Component)]
pub struct Banner {
    t: f32,
}

#[derive(Component)]
pub struct MainCamera;

#[derive(Resource, Default)]
pub struct Score(pub u32);

/// 스테이지 클리어 화면 남은 시간
#[derive(Resource, Default)]
pub struct StageClearTimer(f32);

fn main() {
    App::new()
        .add_plugins(
            DefaultPlugins
                .set(ImagePlugin::default_nearest())
                .set(AssetPlugin {
                    meta_check: AssetMetaCheck::Never,
                    ..default()
                })
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "REVERSE".into(),
                        resolution: WindowResolution::new(
                            VIEW_W as u32 * SCALE,
                            VIEW_H as u32 * SCALE,
                        ),
                        resizable: false,
                        canvas: Some("#bevy-canvas".into()),
                        ..default()
                    }),
                    ..default()
                }),
        )
        .insert_resource(ClearColor(pixel::paper_color(false)))
        .add_plugins(demo_plugin())
        .init_resource::<SpriteSet>()
        .init_state::<GameState>()
        .init_resource::<Score>()
        .init_resource::<Stage>()
        .init_resource::<StageClearTimer>()
        .init_resource::<PhaseState>()
        .init_resource::<Wipe>()
        .init_resource::<Scroll>()
        .init_resource::<LevelData>()
        .init_resource::<enemy::Rng>()
        .add_message::<player::PlayerHit>()
        .add_systems(Startup, setup)
        .add_systems(OnEnter(GameState::Title), show_title)
        .add_systems(OnExit(GameState::Title), despawn_overlay)
        // 새 런: 타이틀/게임오버/올클리어에서 들어올 때만 점수·플레이어 초기화 (OnTransition은 OnEnter보다 먼저)
        .add_systems(
            OnTransition {
                exited: GameState::Title,
                entered: GameState::Playing,
            },
            reset_run,
        )
        .add_systems(
            OnTransition {
                exited: GameState::GameOver,
                entered: GameState::Playing,
            },
            reset_run,
        )
        .add_systems(
            OnTransition {
                exited: GameState::Clear,
                entered: GameState::Playing,
            },
            reset_run,
        )
        .add_systems(OnEnter(GameState::Playing), (setup_stage, hud::show_hud))
        .add_systems(OnExit(GameState::Playing), hud::hide_hud)
        .add_systems(OnEnter(GameState::StageClear), show_stage_clear)
        .add_systems(OnExit(GameState::StageClear), despawn_overlay)
        .add_systems(OnEnter(GameState::GameOver), show_game_over)
        .add_systems(OnExit(GameState::GameOver), despawn_overlay)
        .add_systems(OnEnter(GameState::Clear), show_clear)
        .add_systems(OnExit(GameState::Clear), despawn_overlay)
        .add_systems(
            Update,
            (
                (
                    phase::phase_input,
                    player::sync_phase,
                    level::scroll,
                    level::spawn_rows,
                    player::player_move,
                    player::player_shoot,
                    enemy::enemy_ai,
                    enemy::twins,
                    enemy::satellites,
                    enemy::lasers,
                    item::items,
                )
                    .chain(),
                (
                    bullet::bullet_move,
                    bullet::bullet_walls,
                    bullet::bullet_hits,
                    player::handle_hits,
                    level::lines,
                    level::tick_switches,
                    enemy::tick_booms,
                    phase::wipe_tick,
                    level::despawn_below,
                    tick_banners,
                    hud::update_hud,
                )
                    .chain(),
            )
                .chain()
                .run_if(in_state(GameState::Playing)),
        )
        .add_systems(Update, title_input.run_if(in_state(GameState::Title)))
        .add_systems(Update, stage_clear_tick.run_if(in_state(GameState::StageClear)))
        .add_systems(
            Update,
            restart_input.run_if(in_state(GameState::GameOver).or_else(in_state(GameState::Clear))),
        )
        .add_systems(
            PostUpdate,
            (
                snap_camera,
                snap_positions,
                hud::bg_scroll,
                phase::sync_clear_color,
                phase::apply_visuals,
                phase::draw_wipe,
            )
                .chain()
                .before(bevy::transform::TransformSystems::Propagate),
        )
        .run();
}

fn setup(mut commands: Commands, set: Res<SpriteSet>, mut gizmos: ResMut<GizmoConfigStore>) {
    gizmos.config_mut::<DefaultGizmoConfigGroup>().0.line.width = 4.0;
    let mut cam = commands.spawn((
        Camera2d,
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: ScalingMode::Fixed {
                width: VIEW_W,
                height: VIEW_H,
            },
            ..OrthographicProjection::default_2d()
        }),
        Transform::from_xyz(0.0, 0.0, 0.0),
        MainCamera,
    ));
    hud::build(&mut cam, &set);
}

/// 새 런 시작: 플레이어·점수·스테이지 초기화 (스테이지 오브젝트는 setup_stage가 정리)
fn reset_run(
    mut commands: Commands,
    set: Res<SpriteSet>,
    old: Query<Entity, With<RunEntity>>,
    mut score: ResMut<Score>,
    mut stage: ResMut<Stage>,
) {
    for e in &old {
        commands.entity(e).despawn();
    }
    *score = Score::default();
    *stage = Stage::default();
    player::spawn_player(&mut commands, &set, &Scroll::default());
}

/// 스테이지 시작: 이전 스테이지 오브젝트 제거, 스크롤/위상/레벨 리셋, 플레이어 위치 복귀, 배너
fn setup_stage(
    mut commands: Commands,
    set: Res<SpriteSet>,
    stage: Res<Stage>,
    old: Query<Entity, With<GameEntity>>,
    mut ps: ResMut<PhaseState>,
    mut wipe: ResMut<Wipe>,
    mut scroll: ResMut<Scroll>,
    mut level: ResMut<LevelData>,
    mut player: Query<(&mut Pos, &mut player::Player)>,
    camera: Query<Entity, With<MainCamera>>,
) {
    for e in &old {
        commands.entity(e).despawn();
    }
    *ps = PhaseState::default();
    *wipe = Wipe::default();
    *scroll = Scroll::default();
    *level = LevelData::new(stage.index);
    if let Ok((mut pos, mut pl)) = player.single_mut() {
        player::reset_for_stage(&mut pos, &mut pl, &scroll);
    }
    if let Ok(cam) = camera.single() {
        banner_text(&mut commands, &set, cam, &format!("STAGE {}", stage.index), 20.0, 2.0);
    }
}

// ---------- 픽셀 스냅 ----------

fn snap_camera(scroll: Res<Scroll>, mut q: Query<&mut Transform, With<MainCamera>>) {
    if let Ok(mut tf) = q.single_mut() {
        tf.translation.y = scroll.cam_y.round();
    }
}

/// 카메라 기준 상대 좌표를 반올림해 화면상 픽셀 위치가 흔들리지 않게 한다
/// (플레이어처럼 카메라와 함께 움직이는 오브젠트를 월드 좌표로 따로 반올림하면 1px 지터가 생김)
fn snap_positions(scroll: Res<Scroll>, mut q: Query<(&Pos, &mut Transform)>) {
    let cam_y = scroll.cam_y.round();
    for (pos, mut tf) in &mut q {
        let x = pos.0.x.round();
        let y = cam_y + (pos.0.y - scroll.cam_y).round();
        if tf.translation.x != x || tf.translation.y != y {
            tf.translation.x = x;
            tf.translation.y = y;
        }
    }
}

// ---------- 오버레이 ----------

/// 카메라 자식으로 가운데 정렬 텍스트(페이퍼 배경판 포함) 생성. 반환: 부모 엔티티
fn spawn_text_overlay(commands: &mut Commands, set: &SpriteSet, camera: Entity, text: &str, y: f32, scale: f32) -> Entity {
    let tf = pixel::centered_text_transform(text, Vec3::new(0.0, y, hud::Z_HUD + 1.0), scale);
    commands
        .spawn((tf, Visibility::default(), ChildOf(camera)))
        .with_children(|p| {
            let w = pixel::text_width(text);
            let mut back = Sprite::from_image(set.get(Spr::PixPaper, false, pixel::Accent::Ink));
            back.custom_size = Some(Vec2::new(w + 4.0, pixel::GLYPH_H + 4.0));
            p.spawn((
                back,
                pixel::SpriteKind(Spr::PixPaper),
                Transform::from_xyz(w / 2.0, -pixel::GLYPH_H / 2.0, -0.5),
            ));
            pixel::spawn_glyphs(p, set, text);
        })
        .id()
}

fn overlay_text(commands: &mut Commands, set: &SpriteSet, camera: Entity, text: &str, y: f32, scale: f32) {
    let e = spawn_text_overlay(commands, set, camera, text, y, scale);
    commands.entity(e).insert(Overlay);
}

fn banner_text(commands: &mut Commands, set: &SpriteSet, camera: Entity, text: &str, y: f32, scale: f32) {
    let e = spawn_text_overlay(commands, set, camera, text, y, scale);
    commands.entity(e).insert(Banner { t: 2.0 });
}

fn tick_banners(mut commands: Commands, time: Res<Time>, mut q: Query<(Entity, &mut Banner, &mut Visibility)>) {
    for (e, mut b, mut vis) in &mut q {
        b.t -= time.delta_secs();
        // 마지막 0.5초는 점멸
        *vis = if b.t < 0.5 && ((b.t * 10.0) as i32) % 2 == 0 { Visibility::Hidden } else { Visibility::Inherited };
        if b.t <= 0.0 {
            commands.entity(e).despawn();
        }
    }
}

fn show_title(mut commands: Commands, set: Res<SpriteSet>, camera: Query<Entity, With<MainCamera>>) {
    // 초기 OnEnter는 Startup보다 먼저 실행되므로 카메라가 없으면 월드 좌표(카메라 원점)로 배치
    let cam = camera.single().ok();
    let mut text = |t: &str, y: f32, s: f32| match cam {
        Some(c) => overlay_text(&mut commands, &set, c, t, y, s),
        None => {
            let tf = pixel::centered_text_transform(t, Vec3::new(0.0, y, hud::Z_HUD + 1.0), s);
            commands
                .spawn((tf, Visibility::default(), Overlay))
                .with_children(|p| pixel::spawn_glyphs(p, &set, t));
        }
    };
    text("REVERSE", 62.0, 3.0);
    text("SHIFT BETWEEN MATTER AND ANTIMATTER", 34.0, 1.0);
    text("RED IS MATTER - BLUE IS ANTIMATTER", 24.0, 1.0);
    text("TOUCHING AN ACTIVE WALL IS FATAL", 14.0, 1.0);
    text("ARROWS/WASD  MOVE", -4.0, 1.0);
    text("Z/SPACE  SHOOT", -14.0, 1.0);
    text("SHIFT  PHASE SHIFT", -24.0, 1.0);
    text("PRESS Z TO START", -60.0, 1.0);
    drop(text);

    if cam.is_none() {
        commands.spawn((sprite(&set, Spr::Player, Vec3::new(-40.0, -44.0, hud::Z_HUD + 1.0)), Overlay));
        commands.spawn((
            sprite(&set, Spr::WallM, Vec3::new(24.0, -44.0, hud::Z_HUD + 1.0)),
            Overlay,
        ));
        commands.spawn((
            sprite(&set, Spr::WallA, Vec3::new(40.0, -44.0, hud::Z_HUD + 1.0)),
            Overlay,
        ));
    }
}

fn show_stage_clear(
    mut commands: Commands,
    set: Res<SpriteSet>,
    score: Res<Score>,
    stage: Res<Stage>,
    mut timer: ResMut<StageClearTimer>,
    camera: Query<Entity, With<MainCamera>>,
) {
    timer.0 = 2.5;
    let Ok(cam) = camera.single() else { return };
    overlay_text(&mut commands, &set, cam, &format!("STAGE {} CLEAR!", stage.index), 30.0, 2.0);
    overlay_text(&mut commands, &set, cam, &format!("SCORE {:06}", score.0), 6.0, 1.0);
    overlay_text(&mut commands, &set, cam, "GET READY", -30.0, 1.0);
}

fn stage_clear_tick(
    time: Res<Time>,
    keys: Res<ButtonInput<KeyCode>>,
    mut timer: ResMut<StageClearTimer>,
    mut stage: ResMut<Stage>,
    mut next: ResMut<NextState<GameState>>,
) {
    timer.0 -= time.delta_secs();
    if timer.0 <= 0.0 || keys.any_just_pressed([KeyCode::KeyZ, KeyCode::Enter]) {
        stage.index += 1;
        next.set(GameState::Playing);
    }
}

fn show_game_over(
    mut commands: Commands,
    set: Res<SpriteSet>,
    score: Res<Score>,
    camera: Query<Entity, With<MainCamera>>,
) {
    let Ok(cam) = camera.single() else { return };
    overlay_text(&mut commands, &set, cam, "GAME OVER", 30.0, 2.0);
    overlay_text(&mut commands, &set, cam, &format!("SCORE {:06}", score.0), 6.0, 1.0);
    overlay_text(&mut commands, &set, cam, "PRESS R TO RESTART", -30.0, 1.0);
}

fn show_clear(
    mut commands: Commands,
    set: Res<SpriteSet>,
    score: Res<Score>,
    camera: Query<Entity, With<MainCamera>>,
) {
    let Ok(cam) = camera.single() else { return };
    overlay_text(&mut commands, &set, cam, "ALL CLEAR!", 30.0, 2.0);
    overlay_text(&mut commands, &set, cam, &format!("{} STAGES COMPLETE", LAST_STAGE), 12.0, 1.0);
    overlay_text(&mut commands, &set, cam, &format!("SCORE {:06}", score.0), 0.0, 1.0);
    overlay_text(&mut commands, &set, cam, "PRESS R TO RESTART", -30.0, 1.0);
}

fn despawn_overlay(mut commands: Commands, q: Query<Entity, With<Overlay>>) {
    for e in &q {
        commands.entity(e).despawn();
    }
}

fn title_input(keys: Res<ButtonInput<KeyCode>>, mut next: ResMut<NextState<GameState>>) {
    if keys.any_just_pressed([KeyCode::KeyZ, KeyCode::Space, KeyCode::Enter]) {
        next.set(GameState::Playing);
    }
}

fn restart_input(keys: Res<ButtonInput<KeyCode>>, mut next: ResMut<NextState<GameState>>) {
    if keys.any_just_pressed([KeyCode::KeyR, KeyCode::Enter]) {
        next.set(GameState::Playing);
    }
}

#[cfg(feature = "demo")]
fn demo_plugin() -> impl Plugin {
    demo::DemoPlugin
}

#[cfg(not(feature = "demo"))]
fn demo_plugin() -> impl Plugin {
    |_: &mut App| {}
}
