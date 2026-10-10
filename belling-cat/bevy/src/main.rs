use belling_cat_comic::{
    art::{ArtPlugin, PAPER},
    balloon::BalloonPlugin,
    cut::{CutPlugin, VIEW},
    dissolve::DissolvePlugin,
    ink::InkPlugin,
    player::PlayerPlugin,
    scene_file::SceneFilePlugin,
    scenes::{SceneDriverPlugin, loader::SceneLoaderPlugin},
};
use bevy::{asset::AssetMetaCheck, prelude::*, window::WindowResolution};

/// The scene to play, relative to `assets/`. Edit it with the VS Code Cut Editor.
const SCENE_PATH: &str = "scenes/council.scene.json";

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
        // Reload the scene when the editor saves it (native only).
        #[cfg(not(target_arch = "wasm32"))]
        watch_for_changes_override: Some(true),
        ..default()
    };

    App::new()
        .add_plugins(DefaultPlugins.set(assets).set(WindowPlugin {
            primary_window: Some(Window {
                title: "Belling the Cat — A story between the lines".into(),
                resolution: WindowResolution::new(VIEW.x as u32, VIEW.y as u32),
                canvas: Some("#bevy-canvas".into()),
                fit_canvas_to_parent: true,
                prevent_default_event_handling: true,
                ..default()
            }),
            ..default()
        }))
        .insert_resource(ClearColor(PAPER))
        .add_plugins((
            ArtPlugin,
            SceneFilePlugin,
            DissolvePlugin,
            CutPlugin,
            BalloonPlugin,
            PlayerPlugin,
            SceneDriverPlugin,
            InkPlugin,
            SceneLoaderPlugin { path: scene_path() },
        ))
        .add_systems(Update, screenshot_on_f12)
        .run();
}

/// `belling-cat-comic.exe scenes/other.scene.json` plays another scene (relative to `assets/`);
/// without an argument the default scene above is used.
fn scene_path() -> &'static str {
    #[cfg(not(target_arch = "wasm32"))]
    if let Some(arg) = std::env::args().nth(1) {
        return Box::leak(arg.into_boxed_str());
    }
    SCENE_PATH
}

/// F12 saves the current frame to `verification/` (ignored by Git) for visual checks.
#[cfg(not(target_arch = "wasm32"))]
fn screenshot_on_f12(
    mut commands: Commands,
    keys: Res<ButtonInput<KeyCode>>,
    mut count: Local<u32>,
) {
    use bevy::render::view::screenshot::{Screenshot, save_to_disk};
    if keys.just_pressed(KeyCode::F12) {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/verification");
        let _ = std::fs::create_dir_all(dir);
        *count += 1;
        let path = format!("{dir}/shot-{:03}.png", *count);
        commands
            .spawn(Screenshot::primary_window())
            .observe(save_to_disk(path));
    }
}

#[cfg(target_arch = "wasm32")]
fn screenshot_on_f12() {}
