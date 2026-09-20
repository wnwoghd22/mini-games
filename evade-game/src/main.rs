use std::time::Duration;

use bevy::asset::AssetMetaCheck;
use bevy::input::mouse::MouseMotion;
use bevy::prelude::*;
use bevy::window::{CursorGrabMode, CursorOptions, PrimaryWindow, WindowResolution};

// ---------- 상수 ----------
const WALL_X: f32 = 435.0; // 벽 안쪽 x
const FLOOR_Y: f32 = -300.0; // 바닥 y
const SPAWN_Y: f32 = 400.0; // 적 공 생성 높이 (화면 밖 위)
const GRAVITY: f32 = -1100.0;

const PLAYER_HALF: Vec2 = Vec2::new(24.0, 13.0);
const MOUSE_SENS: f32 = 1.2;

const BALL_START_RADIUS: f32 = 22.0;
const BALL_MIN_RADIUS: f32 = BALL_START_RADIUS; // 시작 크기가 곧 최소 크기
const BALL_MAX_RADIUS: f32 = 90.0;
const FLOOR_DAMAGE: f32 = 6.0; // 바닥 충돌 시 반지름 감소량
const THROW_POWER: f32 = 4.0;
const THROW_MAX_SPEED: f32 = 1500.0;
const CATCH_COOLDOWN: f32 = 0.4;

// ---------- 상태 / 리소스 / 컴포넌트 ----------
#[derive(States, Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
enum GameState {
    #[default]
    Playing,
    Paused,
    GameOver,
}

#[derive(Resource, Default)]
struct Score {
    time: f32,
    absorbed: u32,
}

impl Score {
    fn value(&self) -> u32 {
        (self.time * 10.0) as u32 + self.absorbed * 50
    }
}

#[derive(Resource, Default)]
struct Aim {
    active: bool,
    drag: Vec2,
}

#[derive(Resource)]
struct EnemySpawner(Timer);

impl Default for EnemySpawner {
    fn default() -> Self {
        Self(Timer::from_seconds(1.2, TimerMode::Repeating))
    }
}

#[derive(Resource)]
struct GameAssets {
    ball_body: Handle<Image>,   // 노란 원
    ball_face: Handle<Image>,   // 웃는 얼굴 (100x58)
    enemy_body: Handle<Image>,  // 빨간 원
    enemy_face: Handle<Image>,  // 심술궂은 얼굴 (110x80)
    player_body: Handle<Image>, // 파란 스쿼클
    player_face: Handle<Image>, // 활짝 웃는 얼굴 (118x60)
}

// 초기 상태 전이(OnEnter)가 PreStartup보다 먼저 실행되므로,
// setup_round에서 쓰는 에셋은 앱 빌드 시점에 만들어 둔다
impl FromWorld for GameAssets {
    fn from_world(world: &mut World) -> Self {
        let server = world.resource::<AssetServer>();
        GameAssets {
            ball_body: server.load("sprites/yellow_body_circle.png"),
            ball_face: server.load("sprites/face_a.png"),
            enemy_body: server.load("sprites/red_body_circle.png"),
            enemy_face: server.load("sprites/face_k.png"),
            player_body: server.load("sprites/blue_body_squircle.png"),
            player_face: server.load("sprites/face_c.png"),
        }
    }
}

#[derive(Component)]
struct Player;

#[derive(Component)]
struct PlayerBall {
    radius: f32,
    held: bool,
    catch_cd: f32,
}

#[derive(Component)]
struct Enemy {
    radius: f32,
}

#[derive(Component)]
struct Velocity(Vec2);

/// 라운드 재시작 시 지워지는 엔티티 표시
#[derive(Component)]
struct GameEntity;

#[derive(Component)]
struct ScoreText;

#[derive(Component)]
struct PauseText;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins
            // 웹에서 스프라이트마다 .meta 404 요청이 생기지 않도록 조회 자체를 끔
            .set(AssetPlugin {
                meta_check: AssetMetaCheck::Never,
                ..default()
            })
            .set(WindowPlugin {
            primary_window: Some(Window {
                title: "Duck & Chuck".into(),
                resolution: WindowResolution::new(900, 700),
                resizable: false,
                // 웹: 페이지의 고정 크기 캔버스에 바인딩 (네이티브에선 무시됨)
                canvas: Some("#bevy-canvas".into()),
                ..default()
            }),
            ..default()
        }))
        .insert_resource(ClearColor(Color::srgb(0.08, 0.09, 0.12)))
        .init_resource::<GameAssets>()
        .init_state::<GameState>()
        .init_resource::<Score>()
        .init_resource::<Aim>()
        .init_resource::<EnemySpawner>()
        .add_systems(Startup, (setup, setup_round).chain())
        .add_systems(
            OnTransition {
                exited: GameState::GameOver,
                entered: GameState::Playing,
            },
            setup_round,
        )
        .add_systems(OnEnter(GameState::GameOver), on_game_over)
        .add_systems(OnEnter(GameState::Paused), on_pause)
        .add_systems(OnExit(GameState::Paused), on_unpause)
        .add_systems(
            Update,
            (
                tick_score,
                player_move,
                aim_control,
                held_ball_follow,
                ball_physics,
                absorb_enemies,
                catch_ball,
                spawn_enemies,
                check_player_hit,
                update_hud,
                draw_aim,
                pause_input,
                relock_cursor_on_click,
            )
                .chain()
                .run_if(in_state(GameState::Playing)),
        )
        .add_systems(
            Update,
            resume_input.run_if(in_state(GameState::Paused)),
        )
        .add_systems(
            Update,
            restart_input.run_if(in_state(GameState::GameOver)),
        )
        .run();
}

// ---------- 셋업 ----------
fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);

    // 바닥
    commands.spawn((
        Sprite::from_color(Color::srgb(0.35, 0.38, 0.45), Vec2::new(900.0, 6.0)),
        Transform::from_xyz(0.0, FLOOR_Y - 3.0, 0.0),
    ));
    // 좌우 벽
    for x in [-WALL_X - 3.0, WALL_X + 3.0] {
        commands.spawn((
            Sprite::from_color(Color::srgb(0.35, 0.38, 0.45), Vec2::new(6.0, 700.0)),
            Transform::from_xyz(x, 0.0, 0.0),
        ));
    }

    // 점수 HUD
    commands.spawn((
        Text2d::new("SCORE 0"),
        TextFont {
            font_size: FontSize::Px(26.0),
            ..default()
        },
        TextColor(Color::WHITE),
        Transform::from_xyz(0.0, 318.0, 5.0),
        ScoreText,
    ));
}

/// 라운드 시작: 이전 라운드 엔티티 제거, 리소스 초기화, 플레이어/공 생성, 커서 잠금
fn setup_round(
    mut commands: Commands,
    old: Query<Entity, With<GameEntity>>,
    assets: Res<GameAssets>,
    mut score: ResMut<Score>,
    mut aim: ResMut<Aim>,
    mut spawner: ResMut<EnemySpawner>,
    #[cfg(not(target_arch = "wasm32"))] mut cursor: Query<
        &mut CursorOptions,
        With<PrimaryWindow>,
    >,
) {
    for e in &old {
        commands.entity(e).despawn();
    }
    *score = Score::default();
    *aim = Aim::default();
    *spawner = EnemySpawner::default();

    // 플레이어 (몸통 + 얼굴)
    commands
        .spawn((
            Sprite {
                image: assets.player_body.clone(),
                custom_size: Some(PLAYER_HALF * 2.0),
                ..default()
            },
            Transform::from_xyz(0.0, FLOOR_Y + PLAYER_HALF.y, 1.0),
            Player,
            GameEntity,
        ))
        .with_children(|p| {
            p.spawn((
                Sprite {
                    image: assets.player_face.clone(),
                    custom_size: Some(Vec2::new(30.0, 30.0 * 60.0 / 118.0)),
                    ..default()
                },
                Transform::from_xyz(0.0, 1.5, 0.1),
            ));
        });

    // 플레이어의 공 (처음엔 든 상태)
    // 몸통은 지름 2.0의 유닛 스프라이트, transform.scale = 반지름 → 자식 얼굴도 함께 스케일됨
    commands
        .spawn((
            Sprite {
                image: assets.ball_body.clone(),
                custom_size: Some(Vec2::splat(2.0)),
                ..default()
            },
            Transform::from_xyz(
                0.0,
                FLOOR_Y + PLAYER_HALF.y * 2.0 + BALL_START_RADIUS + 6.0,
                1.0,
            )
            .with_scale(Vec3::splat(BALL_START_RADIUS)),
            PlayerBall {
                radius: BALL_START_RADIUS,
                held: true,
                catch_cd: 0.0,
            },
            Velocity(Vec2::ZERO),
            GameEntity,
        ))
        .with_children(|p| {
            p.spawn((
                Sprite {
                    image: assets.ball_face.clone(),
                    custom_size: Some(Vec2::new(1.0, 0.58)),
                    ..default()
                },
                Transform::from_xyz(0.0, 0.15, 0.1),
            ));
        });

    // 웹은 사용자 제스처 없이 잠금이 거부되므로(NotAllowedError) 첫 클릭 때 relock_cursor_on_click이 잠금
    #[cfg(not(target_arch = "wasm32"))]
    if let Ok(mut c) = cursor.single_mut() {
        c.grab_mode = CursorGrabMode::Locked;
        c.visible = false;
    }
}

fn on_game_over(
    mut commands: Commands,
    score: Res<Score>,
    mut cursor: Query<&mut CursorOptions, With<PrimaryWindow>>,
) {
    if let Ok(mut c) = cursor.single_mut() {
        c.grab_mode = CursorGrabMode::None;
        c.visible = true;
    }

    commands.spawn((
        Text2d::new(format!(
            "GAME OVER\nSCORE {}\n\nClick or press R to restart",
            score.value()
        )),
        TextFont {
            font_size: FontSize::Px(40.0),
            ..default()
        },
        TextColor(Color::srgb(1.0, 0.9, 0.9)),
        Transform::from_xyz(0.0, 40.0, 6.0),
        GameEntity,
    ));
}

// ---------- 플레이 시스템 ----------
fn tick_score(time: Res<Time>, mut score: ResMut<Score>) {
    score.time += time.delta_secs();
}

/// 마우스 delta x로 좌우 이동 (조준 중에는 잠금)
fn player_move(
    mut motion: MessageReader<MouseMotion>,
    aim: Res<Aim>,
    mut player: Query<&mut Transform, With<Player>>,
) {
    let dx: f32 = motion.read().map(|m| m.delta.x).sum();
    if aim.active {
        return;
    }
    let Ok(mut tf) = player.single_mut() else {
        return;
    };
    tf.translation.x = (tf.translation.x + dx * MOUSE_SENS)
        .clamp(-WALL_X + PLAYER_HALF.x, WALL_X - PLAYER_HALF.x);
}

/// 좌클릭 드래그로 조준, 놓으면 발사 (앵그리버드식: 드래그 반대 방향으로 발사)
fn aim_control(
    buttons: Res<ButtonInput<MouseButton>>,
    mut motion: MessageReader<MouseMotion>,
    mut aim: ResMut<Aim>,
    mut ball: Query<(&mut PlayerBall, &mut Velocity)>,
) {
    let Ok((mut ball, mut vel)) = ball.single_mut() else {
        return;
    };

    if !ball.held {
        aim.active = false;
        return;
    }

    if buttons.just_pressed(MouseButton::Left) {
        aim.active = true;
        aim.drag = Vec2::ZERO;
    }

    if aim.active {
        for m in motion.read() {
            // 화면 좌표 → 월드 좌표 (y 반전)
            aim.drag += Vec2::new(m.delta.x, -m.delta.y);
        }

        if buttons.just_released(MouseButton::Left) {
            aim.active = false;
            if aim.drag.length() > 8.0 {
                vel.0 = (-aim.drag * THROW_POWER).clamp_length_max(THROW_MAX_SPEED);
                ball.held = false;
                ball.catch_cd = CATCH_COOLDOWN;
            }
        }
    }
}

/// 든 상태의 공은 플레이어 머리 위를 따라다님
fn held_ball_follow(
    player: Query<&Transform, (With<Player>, Without<PlayerBall>)>,
    mut ball: Query<(&mut Transform, &PlayerBall)>,
) {
    let (Ok(ptf), Ok((mut btf, ball))) = (player.single(), ball.single_mut()) else {
        return;
    };
    if ball.held {
        btf.translation.x = ptf.translation.x;
        btf.translation.y = ptf.translation.y + PLAYER_HALF.y + ball.radius + 6.0;
    }
}

/// 중력·이동·벽/바닥 반사. 플레이어 공은 바닥에 닿으면 지름이 깎임
fn ball_physics(
    time: Res<Time>,
    mut enemies: Query<(&mut Transform, &mut Velocity, &Enemy), Without<PlayerBall>>,
    mut ball: Query<(&mut Transform, &mut Velocity, &mut PlayerBall), Without<Enemy>>,
) {
    let dt = time.delta_secs();

    for (mut tf, mut vel, enemy) in &mut enemies {
        vel.0.y += GRAVITY * dt;
        tf.translation.x += vel.0.x * dt;
        tf.translation.y += vel.0.y * dt;
        let r = enemy.radius;

        // 벽: 안쪽으로 반사
        if tf.translation.x < -WALL_X + r {
            tf.translation.x = -WALL_X + r;
            vel.0.x = vel.0.x.abs();
        } else if tf.translation.x > WALL_X - r {
            tf.translation.x = WALL_X - r;
            vel.0.x = -vel.0.x.abs();
        }
        // 바닥: 완전 탄성으로 계속 튀어오름
        if tf.translation.y < FLOOR_Y + r && vel.0.y < 0.0 {
            tf.translation.y = FLOOR_Y + r;
            vel.0.y = -vel.0.y;
        }
    }

    let Ok((mut tf, mut vel, mut ball)) = ball.single_mut() else {
        return;
    };
    ball.catch_cd = (ball.catch_cd - dt).max(0.0);
    if ball.held {
        tf.scale = Vec3::splat(ball.radius);
        return;
    }

    vel.0.y += GRAVITY * dt;
    tf.translation.x += vel.0.x * dt;
    tf.translation.y += vel.0.y * dt;
    let r = ball.radius;

    if tf.translation.x < -WALL_X + r {
        tf.translation.x = -WALL_X + r;
        vel.0.x = vel.0.x.abs() * 0.85;
    } else if tf.translation.x > WALL_X - r {
        tf.translation.x = WALL_X - r;
        vel.0.x = -vel.0.x.abs() * 0.85;
    }

    if tf.translation.y < FLOOR_Y + r && vel.0.y < 0.0 {
        tf.translation.y = FLOOR_Y + r;
        // 세게 부딪힐 때만 피해 (바닥에서 구를 때 연속 피해 방지)
        if vel.0.y < -160.0 {
            ball.radius = (ball.radius - FLOOR_DAMAGE).max(BALL_MIN_RADIUS);
        }
        vel.0.y = -vel.0.y * 0.7;
        vel.0.x *= 0.95;
    }

    tf.scale = Vec3::splat(ball.radius);
}

/// 던진 공이 자기보다 같거나 작은 적 공과 닿으면 흡수해서 커짐, 큰 공에는 튕겨남
fn absorb_enemies(
    mut commands: Commands,
    mut score: ResMut<Score>,
    mut ball: Query<(&Transform, &mut Velocity, &mut PlayerBall)>,
    enemies: Query<(Entity, &Transform, &Enemy), Without<PlayerBall>>,
) {
    let Ok((btf, mut vel, mut ball)) = ball.single_mut() else {
        return;
    };
    if ball.held {
        return;
    }
    let bpos = btf.translation.truncate();

    for (entity, etf, enemy) in &enemies {
        let epos = etf.translation.truncate();
        if bpos.distance(epos) > ball.radius + enemy.radius {
            continue;
        }

        if enemy.radius <= ball.radius {
            // 흡수: 면적 일부를 넘겨받아 성장
            commands.entity(entity).despawn();
            ball.radius = (ball.radius.powi(2) + 0.6 * enemy.radius.powi(2))
                .sqrt()
                .min(BALL_MAX_RADIUS);
            score.absorbed += 1;
        } else {
            // 더 큰 공: 법선 방향으로 튕겨남
            let n = (bpos - epos).normalize_or(Vec2::Y);
            if vel.0.dot(n) < 0.0 {
                vel.0 = (vel.0 - 2.0 * vel.0.dot(n) * n) * 0.8;
            }
        }
    }
}

/// 던진 공이 플레이어에 닿으면 회수
fn catch_ball(
    player: Query<&Transform, (With<Player>, Without<PlayerBall>)>,
    mut ball: Query<(&Transform, &mut Velocity, &mut PlayerBall)>,
) {
    let (Ok(ptf), Ok((btf, mut vel, mut ball))) = (player.single(), ball.single_mut()) else {
        return;
    };
    if ball.held || ball.catch_cd > 0.0 {
        return;
    }
    let ppos = ptf.translation.truncate();
    let bpos = btf.translation.truncate();
    let closest = bpos.clamp(ppos - PLAYER_HALF, ppos + PLAYER_HALF);
    if bpos.distance(closest) < ball.radius + 4.0 {
        ball.held = true;
        vel.0 = Vec2::ZERO;
    }
}

fn spawn_enemies(
    mut commands: Commands,
    time: Res<Time>,
    score: Res<Score>,
    mut spawner: ResMut<EnemySpawner>,
    assets: Res<GameAssets>,
    enemies: Query<(), With<Enemy>>,
) {
    spawner.0.tick(time.delta());
    if !spawner.0.just_finished() || enemies.iter().count() >= 12 {
        return;
    }

    // 시간이 갈수록 생성 간격 감소
    let interval = (2.0 - score.time * 0.03).max(0.7);
    spawner.0.set_duration(Duration::from_secs_f32(interval));

    let r = rand::random_range(12.0..34.0);
    let x = rand::random_range(-WALL_X + r..WALL_X - r);
    let dir = if rand::random_range(0..2) == 0 { -1.0 } else { 1.0 };
    let vx = rand::random_range(60.0..200.0) * dir;

    commands
        .spawn((
            Sprite {
                image: assets.enemy_body.clone(),
                custom_size: Some(Vec2::splat(2.0)),
                ..default()
            },
            Transform::from_xyz(x, SPAWN_Y, 1.0).with_scale(Vec3::splat(r)),
            Enemy { radius: r },
            Velocity(Vec2::new(vx, 0.0)),
            GameEntity,
        ))
        .with_children(|p| {
            p.spawn((
                Sprite {
                    image: assets.enemy_face.clone(),
                    custom_size: Some(Vec2::new(1.0, 0.727)),
                    ..default()
                },
                Transform::from_xyz(0.0, 0.1, 0.1),
            ));
        });
}

/// 적 공이 플레이어 몸에 닿으면 게임 오버
fn check_player_hit(
    player: Query<&Transform, With<Player>>,
    enemies: Query<(&Transform, &Enemy)>,
    mut next: ResMut<NextState<GameState>>,
) {
    let Ok(ptf) = player.single() else {
        return;
    };
    let ppos = ptf.translation.truncate();

    for (etf, enemy) in &enemies {
        let epos = etf.translation.truncate();
        let closest = epos.clamp(ppos - PLAYER_HALF, ppos + PLAYER_HALF);
        // 판정을 약간 후하게 (0.85배)
        if epos.distance(closest) < enemy.radius * 0.85 {
            next.set(GameState::GameOver);
            return;
        }
    }
}

fn update_hud(
    score: Res<Score>,
    ball: Query<&PlayerBall>,
    mut text: Query<&mut Text2d, With<ScoreText>>,
) {
    let Ok(mut text) = text.single_mut() else {
        return;
    };
    let diameter = ball.single().map(|b| (b.radius * 2.0) as u32).unwrap_or(0);
    text.0 = format!("SCORE {}   BALL {}", score.value(), diameter);
}

/// 조준 중 슬링샷 선 + 예상 궤적 표시
fn draw_aim(mut gizmos: Gizmos, aim: Res<Aim>, ball: Query<(&Transform, &PlayerBall)>) {
    if !aim.active {
        return;
    }
    let Ok((tf, _)) = ball.single() else {
        return;
    };
    let p0 = tf.translation.truncate();

    gizmos.line_2d(p0, p0 + aim.drag, Color::srgba(1.0, 1.0, 1.0, 0.4));

    let v0 = (-aim.drag * THROW_POWER).clamp_length_max(THROW_MAX_SPEED);
    for i in 1..=14 {
        let t = i as f32 * 0.045;
        let p = p0 + v0 * t + 0.5 * Vec2::new(0.0, GRAVITY) * t * t;
        gizmos.circle_2d(p, 3.0, Color::srgba(1.0, 0.9, 0.4, 0.8));
    }
}

// ---------- 일시정지 ----------
// 웹에서는 포인터 잠금 중 ESC가 브라우저의 잠금 해제에 소비되므로 P키도 지원
fn pause_input(keys: Res<ButtonInput<KeyCode>>, mut next: ResMut<NextState<GameState>>) {
    if keys.just_pressed(KeyCode::Escape) || keys.just_pressed(KeyCode::KeyP) {
        next.set(GameState::Paused);
    }
}

fn resume_input(keys: Res<ButtonInput<KeyCode>>, mut next: ResMut<NextState<GameState>>) {
    if keys.just_pressed(KeyCode::Escape) || keys.just_pressed(KeyCode::KeyP) {
        next.set(GameState::Playing);
    }
}

fn on_pause(
    mut commands: Commands,
    mut aim: ResMut<Aim>,
    mut cursor: Query<&mut CursorOptions, With<PrimaryWindow>>,
) {
    // 조준 중이었다면 취소 (일시정지 중 마우스 릴리즈를 놓치는 문제 방지)
    aim.active = false;
    if let Ok(mut c) = cursor.single_mut() {
        c.grab_mode = CursorGrabMode::None;
        c.visible = true;
    }
    commands.spawn((
        Text2d::new("PAUSED\n\nESC or P to resume"),
        TextFont {
            font_size: FontSize::Px(40.0),
            ..default()
        },
        TextColor(Color::srgb(0.9, 0.95, 1.0)),
        Transform::from_xyz(0.0, 40.0, 6.0),
        PauseText,
        GameEntity,
    ));
}

fn on_unpause(
    mut commands: Commands,
    text: Query<Entity, With<PauseText>>,
    mut cursor: Query<&mut CursorOptions, With<PrimaryWindow>>,
) {
    for e in &text {
        commands.entity(e).despawn();
    }
    if let Ok(mut c) = cursor.single_mut() {
        c.grab_mode = CursorGrabMode::Locked;
        c.visible = false;
    }
}

/// 커서 잠금이 풀린 상태에서 클릭하면 다시 잠금.
/// 웹에서 첫 잠금(사용자 제스처 필요)과 ESC로 인한 잠금 이탈 복구를 겸함
fn relock_cursor_on_click(
    buttons: Res<ButtonInput<MouseButton>>,
    mut cursor: Query<&mut CursorOptions, With<PrimaryWindow>>,
) {
    if !buttons.just_pressed(MouseButton::Left) {
        return;
    }
    if let Ok(mut c) = cursor.single_mut() {
        if c.grab_mode != CursorGrabMode::Locked {
            c.grab_mode = CursorGrabMode::Locked;
            c.visible = false;
        }
    }
}

// ---------- 게임 오버 ----------
fn restart_input(
    buttons: Res<ButtonInput<MouseButton>>,
    keys: Res<ButtonInput<KeyCode>>,
    mut next: ResMut<NextState<GameState>>,
) {
    if buttons.just_pressed(MouseButton::Left) || keys.just_pressed(KeyCode::KeyR) {
        next.set(GameState::Playing);
    }
}
