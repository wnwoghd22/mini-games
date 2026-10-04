use belling_cat_comic::{animation::PencilAnimation, story::*};
use bevy::{
    asset::AssetMetaCheck, camera::ScalingMode, prelude::*, text::TextBounds,
    window::WindowResolution,
};

const PAPER: Color = Color::srgb(0.91, 0.875, 0.80);
const INK: Color = Color::srgb(0.12, 0.105, 0.09);
const PANEL_SIZE: Vec2 = Vec2::new(570.0, 760.0);
const PANEL_Y: f32 = -20.0;
const MOUSE_SIZE: f32 = 142.0;
const BALLOON: Vec2 = Vec2::new(PANEL_DISTANCE + 30.0, 194.0);

#[derive(Resource)]
struct Art {
    panels: Handle<Image>,
    mouse: Handle<Image>,
    font: Handle<Font>,
}

#[derive(Resource, Default)]
struct Ready(bool);

#[derive(Resource, Default, Deref, DerefMut)]
struct ComicStory(Story);

#[derive(Resource, Default, Deref, DerefMut)]
struct ComicAnimation(PencilAnimation);

#[derive(Component)]
struct ComicCamera;
#[derive(Component)]
struct Background(usize);
#[derive(Component)]
struct MouseLayer(bool);
#[derive(Component)]
struct Balloon;
#[derive(Component)]
struct DialogueText;
#[derive(Component)]
struct DialogueHint;
#[derive(Component)]
struct BellHint;
#[derive(Component)]
struct Footer;
#[derive(Component)]
struct FollowCamera(Vec2);

fn main() {
    #[cfg(not(target_arch = "wasm32"))]
    if !std::path::Path::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/assets/fonts/AnimeAceBB.ttf"
    ))
    .exists()
    {
        eprintln!(
            "Anime Ace BB is missing. Put your local font at assets/fonts/AnimeAceBB.ttf. See README.md."
        );
        std::process::exit(1);
    }

    let assets = AssetPlugin {
        meta_check: AssetMetaCheck::Never,
        file_path: {
            #[cfg(not(target_arch = "wasm32"))]
            let path = concat!(env!("CARGO_MANIFEST_DIR"), "/assets");
            #[cfg(target_arch = "wasm32")]
            let path = "assets";
            path.into()
        },
        ..default()
    };

    App::new()
        .add_plugins(DefaultPlugins.set(assets).set(WindowPlugin {
            primary_window: Some(Window {
                title: "Belling the Cat — A story between the lines".into(),
                resolution: WindowResolution::new(1080, 940),
                canvas: Some("#bevy-canvas".into()),
                fit_canvas_to_parent: true,
                prevent_default_event_handling: true,
                ..default()
            }),
            ..default()
        }))
        .insert_resource(ClearColor(PAPER))
        .init_resource::<Ready>()
        .init_resource::<ComicStory>()
        .init_resource::<ComicAnimation>()
        .add_systems(Startup, setup)
        .add_systems(
            Update,
            (
                wait_for_art,
                update_story.run_if(art_ready),
                update_camera,
                update_sprites.run_if(art_ready),
                update_text,
                draw_ink.run_if(art_ready),
            )
                .chain(),
        )
        .run();
}

fn art_ready(ready: Res<Ready>) -> bool {
    ready.0
}

fn text(commands: &mut Commands, art: &Art, content: &str, size: f32, position: Vec2) -> Entity {
    commands
        .spawn((
            Text2d::new(content),
            TextFont {
                font: art.font.clone().into(),
                font_size: FontSize::Px(size),
                ..default()
            },
            TextColor(INK),
            TextLayout::justify(Justify::Center),
            Transform::from_translation(position.extend(12.0)),
        ))
        .id()
}

fn setup(
    mut commands: Commands,
    server: Res<AssetServer>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
) {
    let art = Art {
        panels: server.load("art/panels.png"),
        mouse: server.load("art/mouse-poses.png"),
        font: server.load("fonts/AnimeAceBB.ttf"),
    };
    commands.spawn((
        Camera2d,
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: ScalingMode::AutoMin {
                min_width: 1080.0,
                min_height: 940.0,
            },
            ..OrthographicProjection::default_2d()
        }),
        ComicCamera,
    ));

    for (index, center) in [0.0, PANEL_DISTANCE].into_iter().enumerate() {
        // Slightly irregular double ink contours are drawn separately over these panels.
        commands.spawn((
            Sprite::from_color(INK, PANEL_SIZE + Vec2::splat(8.0)),
            Transform::from_xyz(center, PANEL_Y, -2.0),
        ));
        commands.spawn((
            Sprite {
                image: art.panels.clone(),
                custom_size: Some(PANEL_SIZE),
                ..default()
            },
            Transform::from_xyz(center, PANEL_Y, -1.0),
            Visibility::Hidden,
            Background(index),
        ));
        commands.spawn((
            Sprite::from_color(PAPER, Vec2::new(172.0, 34.0)),
            Transform::from_xyz(center - 186.0, 334.0, 1.0),
        ));
        text(
            &mut commands,
            &art,
            if index == 0 {
                "01 / THE KITCHEN"
            } else {
                "02 / THE SLEEPER"
            },
            13.0,
            Vec2::new(center - 186.0, 334.0),
        );
    }

    let heading = text(
        &mut commands,
        &art,
        "BELLING THE CAT",
        27.0,
        Vec2::new(0.0, 433.0),
    );
    commands
        .entity(heading)
        .insert(FollowCamera(Vec2::new(0.0, 433.0)));
    // The title and controls belong to the page, so they travel with the camera.
    let title = text(
        &mut commands,
        &art,
        "A STORY BETWEEN THE LINES",
        10.0,
        Vec2::new(0.0, 397.0),
    );
    commands
        .entity(title)
        .insert(FollowCamera(Vec2::new(0.0, 397.0)));
    let footer = text(&mut commands, &art, "", 13.0, Vec2::new(0.0, -438.0));
    commands
        .entity(footer)
        .insert((Footer, FollowCamera(Vec2::new(0.0, -438.0))));

    for outgoing in [true, false] {
        commands.spawn((
            Sprite {
                image: art.mouse.clone(),
                custom_size: Some(Vec2::splat(MOUSE_SIZE)),
                ..default()
            },
            Transform::from_xyz(-170.0, FLOOR_Y + 56.0, if outgoing { 3.0 } else { 4.0 }),
            MouseLayer(outgoing),
            Visibility::Hidden,
        ));
    }

    // A pale body keeps the small interactable legible against the hatched floor.
    commands.spawn((
        Mesh2d(meshes.add(Ellipse::new(18.0, 20.0))),
        MeshMaterial2d(materials.add(Color::srgb(0.88, 0.845, 0.77))),
        Transform::from_xyz(BELL_X, FLOOR_Y + 19.0, 2.0),
    ));
    let hint = text(
        &mut commands,
        &art,
        "Z / INSPECT",
        13.0,
        Vec2::new(BELL_X, FLOOR_Y + 86.0),
    );
    commands.entity(hint).insert((BellHint, Visibility::Hidden));

    let white = materials.add(Color::srgb(0.98, 0.965, 0.925));
    commands.spawn((
        Mesh2d(meshes.add(Ellipse::new(233.0, 124.0))),
        MeshMaterial2d(white.clone()),
        Transform::from_translation(BALLOON.extend(6.0)),
        Balloon,
        Visibility::Hidden,
    ));
    commands.spawn((
        Mesh2d(meshes.add(Triangle2d::new(
            Vec2::new(-149.0, -90.0),
            Vec2::new(-72.0, -115.0),
            Vec2::new(-150.0, -175.0),
        ))),
        MeshMaterial2d(white),
        Transform::from_translation(BALLOON.extend(5.0)),
        Balloon,
        Visibility::Hidden,
    ));
    let dialogue = text(
        &mut commands,
        &art,
        "",
        22.0,
        BALLOON + Vec2::new(0.0, 14.0),
    );
    commands.entity(dialogue).insert((
        DialogueText,
        TextBounds::from(Vec2::new(370.0, 150.0)),
        Visibility::Hidden,
    ));
    let hint = text(
        &mut commands,
        &art,
        "",
        10.0,
        BALLOON + Vec2::new(0.0, -76.0),
    );
    commands
        .entity(hint)
        .insert((DialogueHint, Visibility::Hidden));
    commands.insert_resource(art);
}

fn wait_for_art(
    art: Res<Art>,
    images: Res<Assets<Image>>,
    fonts: Res<Assets<Font>>,
    mut ready: ResMut<Ready>,
    mut backgrounds: Query<(&Background, &mut Sprite, &mut Visibility)>,
) {
    if ready.0 {
        return;
    }
    if let Some(image) = images.get(&art.panels)
        && images.contains(&art.mouse)
        && fonts.contains(&art.font)
    {
        let half_width = image.width() as f32 / 2.0;
        for (background, mut sprite, mut visibility) in &mut backgrounds {
            sprite.rect = Some(Rect::from_corners(
                Vec2::new(background.0 as f32 * half_width, 0.0),
                Vec2::new(
                    (background.0 + 1) as f32 * half_width,
                    image.height() as f32,
                ),
            ));
            *visibility = Visibility::Visible;
        }
        ready.0 = true;
    }
}

fn update_story(
    keys: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut story: ResMut<ComicStory>,
    mut animation: ResMut<ComicAnimation>,
) {
    if keys.just_pressed(KeyCode::KeyR) {
        story.0 = Story::default();
        animation.0 = PencilAnimation::default();
        return;
    }
    let right = keys.pressed(KeyCode::ArrowRight) || keys.pressed(KeyCode::KeyD);
    let left = keys.pressed(KeyCode::ArrowLeft) || keys.pressed(KeyCode::KeyA);
    let input = InputFrame {
        axis: i32::from(right) as f32 - i32::from(left) as f32,
        jump: keys.just_pressed(KeyCode::Space) || keys.just_pressed(KeyCode::ArrowUp),
        interact: keys.just_pressed(KeyCode::KeyZ),
    };
    // Use substeps for movement; a slow renderer still completes the slide in 0.9s.
    let mut remaining = time.delta_secs().min(0.25);
    let mut step_input = input;
    while remaining > 0.0 {
        let dt = remaining.min(1.0 / 120.0);
        story.tick(dt, step_input);
        animation.tick(dt, story.walking, !story.grounded(), story.facing_left);
        step_input.interact = false;
        step_input.jump = false;
        remaining -= dt;
    }
}

fn update_camera(
    story: Res<ComicStory>,
    mut camera: Single<&mut Transform, (With<ComicCamera>, Without<FollowCamera>)>,
    mut page_text: Query<(&FollowCamera, &mut Transform), Without<ComicCamera>>,
) {
    camera.translation.x = story.camera_x();
    for (offset, mut transform) in &mut page_text {
        transform.translation.x = story.camera_x() + offset.0.x;
        transform.translation.y = offset.0.y;
    }
}

fn update_sprites(
    art: Res<Art>,
    images: Res<Assets<Image>>,
    story: Res<ComicStory>,
    animation: Res<ComicAnimation>,
    mut layers: Query<(&MouseLayer, &mut Sprite, &mut Transform, &mut Visibility)>,
) {
    let Some(image) = images.get(&art.mouse) else {
        return;
    };
    let cell = Vec2::new(image.width() as f32 / 2.0, image.height() as f32 / 2.0);
    for (layer, mut sprite, mut transform, mut visibility) in &mut layers {
        let pose = if layer.0 {
            animation.outgoing
        } else {
            animation.incoming
        };
        let origin = Vec2::new((pose.frame % 2) as f32, (pose.frame / 2) as f32) * cell;
        sprite.rect = Some(Rect::from_corners(origin, origin + cell));
        sprite.flip_x = pose.left;
        sprite.color = Color::WHITE.with_alpha(animation.alpha(layer.0));
        transform.translation.x = story.position.x;
        transform.translation.y = story.position.y + 56.0;
        *visibility = Visibility::Visible;
    }
}

// Explicit component exclusions let Bevy prove that each mutable query is disjoint.
#[allow(clippy::type_complexity)]
fn update_text(
    ready: Res<Ready>,
    story: Res<ComicStory>,
    mut balloons: Query<
        &mut Visibility,
        (
            With<Balloon>,
            Without<DialogueText>,
            Without<DialogueHint>,
            Without<BellHint>,
        ),
    >,
    mut dialogue: Single<
        (&mut Text2d, &mut Visibility),
        (
            With<DialogueText>,
            Without<DialogueHint>,
            Without<BellHint>,
            Without<Balloon>,
        ),
    >,
    mut next: Single<
        (&mut Text2d, &mut Visibility),
        (
            With<DialogueHint>,
            Without<DialogueText>,
            Without<BellHint>,
            Without<Balloon>,
        ),
    >,
    mut bell: Single<
        &mut Visibility,
        (
            With<BellHint>,
            Without<DialogueText>,
            Without<DialogueHint>,
            Without<Balloon>,
        ),
    >,
    mut footer: Single<&mut Text2d, (With<Footer>, Without<DialogueText>, Without<DialogueHint>)>,
) {
    let talking = story.phase == Phase::Talking;
    let visibility = if talking {
        Visibility::Visible
    } else {
        Visibility::Hidden
    };
    for mut balloon in &mut balloons {
        *balloon = visibility;
    }
    dialogue.0.0 = story.visible_text();
    *dialogue.1 = visibility;
    next.0.0 = if story.line_finished() {
        if story.line + 1 == DIALOGUE.len() {
            "Z / RETURN"
        } else {
            "Z / NEXT"
        }
    } else {
        "Z / REVEAL"
    }
    .into();
    *next.1 = visibility;
    **bell = if ready.0 && story.phase == Phase::Exploring && story.near_bell() {
        Visibility::Visible
    } else {
        Visibility::Hidden
    };
    footer.0 = if !ready.0 {
        "LOADING THE PAGE..."
    } else {
        match story.phase {
            Phase::Exploring => "ARROWS / A D  MOVE    SPACE  JUMP    Z  INSPECT    R  RESTART",
            Phase::SlidingIn | Phase::SlidingOut => "BETWEEN THE PANELS...",
            Phase::Talking => "Z  REVEAL / NEXT / RETURN    R  RESTART",
        }
    }
    .into();
}

fn draw_ink(mut gizmos: Gizmos, story: Res<ComicStory>) {
    for center in [0.0, PANEL_DISTANCE] {
        let x = center - PANEL_SIZE.x / 2.0;
        let y = PANEL_Y - PANEL_SIZE.y / 2.0;
        gizmos.linestrip_2d(
            [
                Vec2::new(x - 5.0, y + 2.0),
                Vec2::new(x - 3.0, y + PANEL_SIZE.y + 5.0),
                Vec2::new(x + PANEL_SIZE.x + 5.0, y + PANEL_SIZE.y + 3.0),
                Vec2::new(x + PANEL_SIZE.x + 3.0, y - 5.0),
                Vec2::new(x - 5.0, y + 2.0),
            ],
            INK.with_alpha(0.55),
        );
    }

    let bell = Vec2::new(BELL_X, FLOOR_Y + 3.0);
    let outline = [
        (-21.0, 1.0),
        (-16.0, 11.0),
        (-13.0, 29.0),
        (-7.0, 39.0),
        (3.0, 42.0),
        (13.0, 33.0),
        (16.0, 13.0),
        (22.0, 2.0),
        (-21.0, 1.0),
    ];
    gizmos.linestrip_2d(outline.map(|(x, y)| bell + Vec2::new(x, y)), INK);
    gizmos.linestrip_2d(
        outline.map(|(x, y)| bell + Vec2::new(x + 1.2, y - 1.3)),
        INK.with_alpha(0.4),
    );
    gizmos.ellipse_2d(
        Isometry2d::from_translation(bell + Vec2::new(0.0, 45.0)),
        Vec2::new(5.0, 7.0),
        INK,
    );
    gizmos.ellipse_2d(
        Isometry2d::from_translation(bell + Vec2::new(1.0, -2.0)),
        Vec2::new(4.0, 4.0),
        INK,
    );
    for i in 0..5 {
        let y = i as f32 * 4.0;
        gizmos.line_2d(
            bell + Vec2::new(6.0, 10.0 + y),
            bell + Vec2::new(13.0, 14.0 + y),
            INK.with_alpha(0.5),
        );
    }
    if story.phase == Phase::Exploring && story.near_bell() {
        for dx in [-20.0, 0.0, 20.0] {
            gizmos.line_2d(
                bell + Vec2::new(dx, 58.0),
                bell + Vec2::new(dx * 1.3, 67.0),
                INK,
            );
        }
    }

    if story.phase == Phase::Talking {
        // Keep a gap in the oval for the hand-drawn balloon tail.
        let start = 4.36_f32;
        let end = 10.30_f32;
        for pass in 0..2 {
            let points = (0..90).map(|i| {
                let a = start + (end - start) * i as f32 / 89.0;
                let wobble = (a * 7.0).sin() * 1.4;
                BALLOON
                    + Vec2::new(
                        a.cos() * (233.0 + wobble + pass as f32),
                        a.sin() * (124.0 + wobble),
                    )
            });
            gizmos.linestrip_2d(points, INK.with_alpha(if pass == 0 { 1.0 } else { 0.4 }));
        }
        gizmos.linestrip_2d(
            [
                BALLOON + Vec2::new(-148.0, -96.0),
                BALLOON + Vec2::new(-150.0, -175.0),
                BALLOON + Vec2::new(-83.0, -116.0),
            ],
            INK,
        );
    }
}
