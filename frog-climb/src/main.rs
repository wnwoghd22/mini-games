mod core;
mod pixel;

use bevy::asset::AssetMetaCheck;
use bevy::camera::ScalingMode;
use bevy::prelude::*;
use bevy::window::{CursorMoved, PrimaryWindow, WindowResolution};

use core::{HEIGHT, Point, STEP, Support, WIDTH, World as Pond};
use pixel::{AQUA, Art, GOLD, GREEN, MUTED, WHITE};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Screen {
    Title,
    Playing,
    Paused,
    Over,
}

#[derive(Clone, Copy)]
struct Aim {
    origin: Point,
    drag: Point,
}

#[derive(Resource)]
struct Game {
    pond: Pond,
    screen: Screen,
    aim: Option<Aim>,
    accumulator: f32,
    best: u32,
    seed: u64,
}

impl Game {
    fn new() -> Self {
        let seed = seed();
        Self {
            pond: Pond::new(seed),
            screen: Screen::Title,
            aim: None,
            accumulator: 0.0,
            best: load_best(),
            seed,
        }
    }

    fn restart(&mut self) {
        self.seed = self.seed.wrapping_add(0x9e3779b97f4a7c15);
        self.pond = Pond::new(self.seed);
        self.screen = Screen::Playing;
        self.aim = None;
        self.accumulator = 0.0;
    }
}

#[cfg(target_arch = "wasm32")]
fn seed() -> u64 {
    js_sys::Date::now() as u64
}

#[cfg(not(target_arch = "wasm32"))]
fn seed() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}

#[cfg(target_arch = "wasm32")]
fn load_best() -> u32 {
    web_sys::window()
        .and_then(|w| w.local_storage().ok().flatten())
        .and_then(|s| s.get_item("frog-climb.best.v1").ok().flatten())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

#[cfg(not(target_arch = "wasm32"))]
fn load_best() -> u32 {
    0
}

#[cfg(target_arch = "wasm32")]
fn save_best(best: u32) {
    if let Some(storage) = web_sys::window().and_then(|w| w.local_storage().ok().flatten()) {
        let _ = storage.set_item("frog-climb.best.v1", &best.to_string());
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn save_best(_: u32) {}

#[derive(Resource, Default)]
struct SpritePool(Vec<Entity>);

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
                        title: "Frog Climb".into(),
                        resolution: WindowResolution::new(960, 720),
                        resizable: false,
                        canvas: Some("#bevy-canvas".into()),
                        prevent_default_event_handling: true,
                        ..default()
                    }),
                    ..default()
                }),
        )
        .insert_resource(ClearColor(Color::srgb_u8(10, 23, 35)))
        .insert_resource(Game::new())
        .init_resource::<SpritePool>()
        .add_systems(Startup, setup)
        .add_systems(Update, (input, simulate, render).chain())
        .run();
}

fn setup(mut commands: Commands, mut images: ResMut<Assets<Image>>) {
    commands.insert_resource(Art::new(&mut images));
    commands.spawn((
        Camera2d,
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: ScalingMode::Fixed {
                width: WIDTH,
                height: HEIGHT,
            },
            ..OrthographicProjection::default_2d()
        }),
    ));
}

fn input(
    mut game: ResMut<Game>,
    mouse: Res<ButtonInput<MouseButton>>,
    keys: Res<ButtonInput<KeyCode>>,
    windows: Query<&Window, With<PrimaryWindow>>,
    mut cursor_events: MessageReader<CursorMoved>,
) {
    let Ok(window) = windows.single() else { return };
    // Captured pointer events may be outside the canvas, where cursor_position() is None.
    let position = cursor_events
        .read()
        .last()
        .map(|event| event.position)
        .or_else(|| window.cursor_position());
    let clicked = mouse.just_pressed(MouseButton::Left);
    let confirm = clicked || keys.any_just_pressed([KeyCode::Enter, KeyCode::Space]);
    match game.screen {
        Screen::Title | Screen::Over => {
            if confirm || keys.just_pressed(KeyCode::KeyR) {
                game.restart();
            }
            return;
        }
        Screen::Paused => {
            if window.focused
                && (confirm || keys.any_just_pressed([KeyCode::KeyP, KeyCode::Escape]))
            {
                game.screen = Screen::Playing;
            }
            return;
        }
        Screen::Playing => {}
    }
    if !window.focused || keys.any_just_pressed([KeyCode::Escape, KeyCode::KeyP]) {
        game.screen = Screen::Paused;
        game.aim = None;
        game.accumulator = 0.0;
        return;
    }
    if keys.just_pressed(KeyCode::KeyR) {
        game.restart();
        return;
    }
    let cursor = position.map(|p| {
        Point::new(
            p.x * WIDTH / window.width(),
            -p.y * HEIGHT / window.height(),
        )
    });
    if clicked {
        if game.pond.frog.support == Support::Air {
            game.pond.grab();
            // Grabbing consumes this press. Only a later press starts aiming.
            game.aim = None;
        } else if let Some(origin) = cursor {
            game.aim = Some(Aim {
                origin,
                drag: Point::default(),
            });
        }
    }
    if let Some(aim) = &mut game.aim
        && let Some(cursor) = cursor
    {
        aim.drag = Point::new(cursor.x - aim.origin.x, cursor.y - aim.origin.y);
    }
    if mouse.just_pressed(MouseButton::Right) {
        game.aim = None;
    }
    if mouse.just_released(MouseButton::Left)
        && let Some(aim) = game.aim.take()
        && let Some(velocity) = core::launch_velocity(aim.drag)
    {
        game.pond.launch(velocity);
    }
}

fn simulate(time: Res<Time>, mut game: ResMut<Game>) {
    if game.screen != Screen::Playing {
        return;
    }
    game.accumulator += time.delta_secs().min(0.1);
    while game.accumulator >= STEP {
        game.pond.step(STEP);
        game.accumulator -= STEP;
        if game.pond.over {
            game.screen = Screen::Over;
            game.aim = None;
            break;
        }
    }
    let score = game.pond.score();
    if score > game.best {
        game.best = score;
        save_best(score);
    }
}

struct Frame<'a> {
    art: &'a Art,
    sprites: Vec<(Sprite, Transform)>,
}

fn color(rgba: [u8; 4]) -> Color {
    Color::srgba_u8(rgba[0], rgba[1], rgba[2], rgba[3])
}

impl<'a> Frame<'a> {
    fn new(art: &'a Art) -> Self {
        Self {
            art,
            sprites: Vec::with_capacity(500),
        }
    }

    fn image(&mut self, handle: Handle<Image>, x: f32, y: f32, z: f32, scale: f32, tint: [u8; 4]) {
        let sprite = Sprite {
            image: handle,
            color: color(tint),
            ..default()
        };
        let transform = Transform::from_xyz(x.round(), y.round(), z).with_scale(Vec3::splat(scale));
        self.sprites.push((sprite, transform));
    }

    fn rect(&mut self, x: f32, y: f32, width: f32, height: f32, z: f32, tint: [u8; 4]) {
        self.sprites.push((
            Sprite::from_color(color(tint), Vec2::new(width, height)),
            Transform::from_xyz(x.round(), y.round(), z),
        ));
    }

    fn text(&mut self, text: &str, x: f32, y: f32, scale: f32, tint: [u8; 4], centered: bool) {
        let width = (text.len() as f32 * 4.0 - 1.0) * scale;
        let left = if centered { x - width / 2.0 } else { x };
        for (i, c) in text.chars().enumerate() {
            if let Some(handle) = self.art.glyphs.get(&c) {
                self.image(
                    handle.clone(),
                    left + (i as f32 * 4.0 + 1.5) * scale,
                    y,
                    30.0,
                    scale,
                    tint,
                );
            }
        }
    }

    fn wrapped(
        &mut self,
        handle: Handle<Image>,
        x: f32,
        y: f32,
        z: f32,
        width: f32,
        tint: [u8; 4],
    ) {
        if !(-136.0..=136.0).contains(&y) {
            return;
        }
        for offset in [-WIDTH, 0.0, WIDTH] {
            let px = x + offset;
            if px + width / 2.0 >= -WIDTH / 2.0 && px - width / 2.0 <= WIDTH / 2.0 {
                self.image(handle.clone(), px, y, z, 1.0, tint);
            }
        }
    }

    fn background(&mut self, camera_y: f32, elapsed: f32) {
        // Horizontal bands and distant reeds give the pond depth without texture filtering.
        for i in 0..8 {
            self.rect(
                0.0,
                105.0 - i as f32 * 30.0,
                WIDTH,
                30.0,
                -20.0,
                [10 + i * 2, 23 + i * 2, 35 + i * 2, 255],
            );
        }
        self.rect(105.0, 76.0, 21.0, 23.0, -16.0, [46, 66, 74, 255]);
        self.rect(103.0, 78.0, 25.0, 17.0, -16.0, [46, 66, 74, 255]);
        self.rect(99.0, 81.0, 20.0, 22.0, -15.0, [13, 29, 41, 255]);
        for i in 0..65 {
            let x = ((i * 73 + 19) % 310) as f32 - 155.0;
            let y = (((i * 47 + 11) as f32 - camera_y * 0.16).rem_euclid(HEIGHT)) - HEIGHT / 2.0;
            let tint = if (i as f32 * 0.73 + elapsed).sin() > 0.5 {
                [103, 139, 136, 255]
            } else {
                [49, 84, 92, 255]
            };
            self.rect(x, y, 1.0, 1.0, -14.0, tint);
        }
        for i in 0..14 {
            let side = if i % 2 == 0 { -1.0 } else { 1.0 };
            let x = side * (146.0 + (i % 4) as f32 * 3.0);
            let y = ((i as f32 * 43.0 - camera_y * 0.35).rem_euclid(300.0)) - 150.0;
            self.rect(x, y - 12.0, 2.0, 40.0, -12.0, [25, 65, 64, 255]);
            self.image(
                self.art.leaf.clone(),
                x - side * 3.0,
                y,
                -11.0,
                1.0,
                [100, 160, 130, 255],
            );
        }
        for x in [-159.0, 159.0] {
            for i in 0..20 {
                self.rect(
                    x,
                    -114.0 + i as f32 * 12.0,
                    1.0,
                    3.0,
                    -2.0,
                    [49, 87, 98, 255],
                );
            }
        }
    }

    fn panel(&mut self) {
        self.rect(0.0, 0.0, WIDTH, HEIGHT, 18.0, [6, 17, 27, 175]);
        self.rect(0.0, 0.0, 264.0, 178.0, 20.0, [65, 101, 103, 255]);
        self.rect(0.0, 0.0, 260.0, 174.0, 21.0, [13, 30, 40, 255]);
        for x in [-125.0, 125.0] {
            for y in [-81.0, 81.0] {
                self.rect(x, y, 2.0, 2.0, 22.0, GREEN);
            }
        }
    }
}

fn render(mut commands: Commands, game: Res<Game>, art: Res<Art>, mut pool: ResMut<SpritePool>) {
    let pond = &game.pond;
    let mut frame = Frame::new(&art);
    frame.background(pond.camera_y, pond.elapsed);
    for p in &pond.platforms {
        let handle = if p.width == WIDTH {
            art.floor.clone()
        } else {
            let textures = match p.kind {
                core::PlatformKind::Solid => &art.solid,
                core::PlatformKind::Fragile => &art.fragile,
            };
            textures[((p.width - 48.0) / 8.0) as usize].clone()
        };
        frame.wrapped(
            handle,
            p.pos.x,
            p.pos.y - pond.camera_y - 4.0,
            0.0,
            p.width,
            WHITE,
        );
    }
    for p in &pond.pickups {
        frame.wrapped(
            art.orb.clone(),
            p.pos.x,
            p.pos.y - pond.camera_y,
            2.0,
            7.0,
            WHITE,
        );
    }
    let nearest = pond.nearest_grip().map(|g| g.id);
    for g in &pond.grips {
        let y = g.pos.y - pond.camera_y;
        frame.wrapped(art.grip.clone(), g.pos.x, y, 3.0, 10.0, WHITE);
        for offset in [-WIDTH, 0.0, WIDTH] {
            let x = g.pos.x + offset;
            if x.abs() <= WIDTH / 2.0 + 8.0 && y.abs() <= 145.0 {
                frame.rect(x, y + 15.0, 1.0, 20.0, 1.0, [57, 113, 102, 255]);
                frame.image(art.leaf.clone(), x + 3.0, y + 21.0, 2.0, 1.0, WHITE);
            }
        }
        if Some(g.id) == nearest {
            frame.text(
                "CLICK!",
                g.pos.x.clamp(-138.0, 138.0),
                y + 12.0,
                1.0,
                AQUA,
                true,
            );
            for x in [g.pos.x - 8.0, g.pos.x + 8.0] {
                frame.rect(core::wrap(x), y, 2.0, 2.0, 4.0, AQUA);
            }
        }
    }
    for p in &pond.particles {
        frame.wrapped(
            if p.gold {
                art.gold_pixel.clone()
            } else {
                art.green_pixel.clone()
            },
            p.pos.x,
            p.pos.y - pond.camera_y,
            5.0,
            1.0,
            WHITE,
        );
    }
    if let Some(aim) = game.aim {
        if let Some(velocity) = core::launch_velocity(aim.drag) {
            for p in pond.preview(velocity) {
                frame.wrapped(
                    art.gold_pixel.clone(),
                    p.x,
                    p.y - pond.camera_y,
                    5.0,
                    1.0,
                    WHITE,
                );
            }
            // A short pixel line shows the pull direction, independent of screen wrapping.
            let length = aim.drag.length().min(40.0);
            for i in 0..length as usize {
                let ratio = i as f32 / aim.drag.length();
                let x = core::wrap(pond.frog.pos.x + aim.drag.x * ratio);
                let y = pond.frog.pos.y - pond.camera_y + aim.drag.y * ratio;
                frame.image(art.white_pixel.clone(), x, y, 4.0, 1.0, MUTED);
            }
        }
    }
    let frog_art = if game.aim.is_some() {
        2
    } else if pond.frog.support == Support::Air {
        1
    } else {
        0
    };
    frame.wrapped(
        art.frogs[frog_art].clone(),
        pond.frog.pos.x,
        pond.frog.pos.y - pond.camera_y + 1.0,
        7.0,
        16.0,
        WHITE,
    );
    frame.rect(0.0, 105.0, WIDTH, 30.0, 10.0, [9, 23, 34, 235]);
    frame.text(
        &format!("SCORE {}", pond.score()),
        -149.0,
        108.0,
        2.0,
        WHITE,
        false,
    );
    frame.text(
        &format!("BEST {}", game.best),
        60.0,
        110.0,
        1.0,
        GOLD,
        false,
    );
    frame.text(
        &format!("HEIGHT {}", pond.max_height as u32),
        60.0,
        97.0,
        1.0,
        MUTED,
        false,
    );
    frame.rect(0.0, -112.0, WIDTH, 16.0, 10.0, [9, 23, 34, 230]);

    if game.screen == Screen::Playing {
        let hint = if let Some(aim) = game.aim {
            if let Some(v) = core::launch_velocity(aim.drag) {
                let power = v.length() / core::MAX_SPEED;
                frame.rect(105.0, -112.0, 70.0, 4.0, 12.0, [44, 68, 76, 255]);
                frame.rect(70.0 + 35.0 * power, -112.0, 70.0 * power, 4.0, 13.0, GOLD);
                "RELEASE TO JUMP"
            } else {
                "PULL DOWN TO JUMP"
            }
        } else if pond.frog.support == Support::Air {
            if nearest.is_some() {
                "CLICK ANYWHERE TO GRAB!"
            } else {
                "FIND A LANDING OR A RING"
            }
        } else if matches!(pond.frog.support, Support::Grip(_)) {
            "HOLDING! DRAG TO JUMP"
        } else {
            "DRAG BACK. RELEASE. RISE."
        };
        frame.text(
            hint,
            -149.0,
            -112.0,
            1.0,
            if nearest.is_some() { AQUA } else { WHITE },
            false,
        );
        frame.text("<", -151.0, 0.0, 1.0, MUTED, true);
        frame.text(">", 151.0, 0.0, 1.0, MUTED, true);
    } else {
        frame.panel();
        match game.screen {
            Screen::Title => {
                frame.text("FROG CLIMB", 0.0, 63.0, 3.0, GREEN, true);
                frame.text("DRAG. RELEASE. RISE.", 0.0, 40.0, 1.0, GOLD, true);
                frame.image(art.frogs[0].clone(), 0.0, 8.0, 25.0, 3.0, WHITE);
                frame.text("PULL DOWN TO AIM YOUR JUMP", 0.0, -27.0, 1.0, WHITE, true);
                frame.text("CLICK NEAR A RING TO GRAB", 0.0, -40.0, 1.0, AQUA, true);
                frame.text(
                    "THE LEFT AND RIGHT SIDES LOOP",
                    0.0,
                    -53.0,
                    1.0,
                    MUTED,
                    true,
                );
                frame.text("CLICK OR ENTER TO START", 0.0, -73.0, 1.0, GOLD, true);
            }
            Screen::Over => {
                frame.text("SPLASH!", 0.0, 60.0, 3.0, AQUA, true);
                frame.text(
                    &format!("SCORE {}", pond.score()),
                    0.0,
                    27.0,
                    2.0,
                    WHITE,
                    true,
                );
                frame.text(&format!("BEST {}", game.best), 0.0, 3.0, 2.0, GOLD, true);
                frame.text(
                    &format!(
                        "HEIGHT {} / COLLECTED {}",
                        pond.max_height as u32, pond.collected
                    ),
                    0.0,
                    -23.0,
                    1.0,
                    MUTED,
                    true,
                );
                frame.text("CLICK OR R TO TRY AGAIN", 0.0, -57.0, 1.0, GREEN, true);
            }
            Screen::Paused => {
                frame.text("RESTING", 0.0, 42.0, 3.0, GREEN, true);
                frame.image(art.frogs[2].clone(), 0.0, 0.0, 25.0, 3.0, WHITE);
                frame.text("CLICK OR P TO CONTINUE", 0.0, -49.0, 1.0, GOLD, true);
            }
            Screen::Playing => unreachable!(),
        }
    }
    // Reuse sprite entities; generate no per-frame textures or asset handles.
    let count = frame.sprites.len();
    for (i, bundle) in frame.sprites.into_iter().enumerate() {
        if let Some(&entity) = pool.0.get(i) {
            commands.entity(entity).insert(bundle);
        } else {
            pool.0.push(commands.spawn(bundle).id());
        }
    }
    for entity in pool.0.drain(count..) {
        commands.entity(entity).despawn();
    }
}
