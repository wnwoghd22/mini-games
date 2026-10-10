//! `*.scene.json` data model (1:1 with `schema/scene.schema.json`, see FORMAT.md) and the
//! asset loaders for scene and dialogue files.

use crate::dialogue::Dialogue;
use bevy::{
    asset::{AssetLoader, LoadContext, io::Reader},
    prelude::*,
};
use serde::Deserialize;

#[derive(Asset, TypePath, Debug, Clone, Deserialize)]
pub struct SceneFile {
    pub version: u32,
    #[serde(default)]
    pub dialogue: Option<String>,
    pub cuts: Vec<CutDef>,
    pub player: PlayerDef,
    #[serde(default)]
    pub flow: Vec<TriggerDef>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CutDef {
    pub id: String,
    #[serde(default)]
    pub label: Option<String>,
    pub polygon: Vec<[f32; 2]>,
    #[serde(default)]
    pub fill: Option<String>,
    #[serde(default)]
    pub floor_y: Option<f32>,
    #[serde(default)]
    pub walk: Option<[f32; 2]>,
    #[serde(default)]
    pub children: Vec<ChildDef>,
}

impl CutDef {
    pub fn points(&self) -> Vec<Vec2> {
        self.polygon.iter().map(|p| Vec2::new(p[0], p[1])).collect()
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ChildDef {
    Sprite(SpriteDef),
    Balloon(BalloonDef),
    Text(TextDef),
    Shape(ShapeDef),
}

impl ChildDef {
    pub fn id(&self) -> &str {
        match self {
            ChildDef::Sprite(c) => &c.id,
            ChildDef::Balloon(c) => &c.id,
            ChildDef::Text(c) => &c.id,
            ChildDef::Shape(c) => &c.id,
        }
    }

    pub fn pos(&self) -> Vec2 {
        let p = match self {
            ChildDef::Sprite(c) => c.pos,
            ChildDef::Balloon(c) => c.pos,
            ChildDef::Text(c) => c.pos,
            ChildDef::Shape(c) => c.pos,
        };
        Vec2::new(p[0], p[1])
    }

    pub fn z(&self) -> f32 {
        match self {
            ChildDef::Sprite(c) => c.z,
            ChildDef::Balloon(c) => c.z,
            ChildDef::Text(c) => c.z,
            ChildDef::Shape(c) => c.z,
        }
        .unwrap_or(1.0)
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpriteDef {
    pub id: String,
    pub pos: [f32; 2],
    #[serde(default)]
    pub z: Option<f32>,
    #[serde(default = "default_true")]
    pub clip: bool,
    pub size: [f32; 2],
    pub frames: Vec<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub flip: bool,
    #[serde(default)]
    pub tint: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BalloonDef {
    pub id: String,
    pub pos: [f32; 2],
    #[serde(default)]
    pub z: Option<f32>,
    #[serde(default = "default_true")]
    pub clip: bool,
    pub size: [f32; 2],
    #[serde(default)]
    pub tail: Option<[f32; 2]>,
    #[serde(default)]
    pub kind: Option<String>,
    pub line: String,
    #[serde(default)]
    pub initially: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TextDef {
    pub id: String,
    pub pos: [f32; 2],
    #[serde(default)]
    pub z: Option<f32>,
    #[serde(default = "default_true")]
    pub clip: bool,
    pub text: String,
    #[serde(default)]
    pub size: Option<f32>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub r#box: Option<[f32; 2]>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ShapeDef {
    pub id: String,
    pub pos: [f32; 2],
    #[serde(default)]
    pub z: Option<f32>,
    #[serde(default = "default_true")]
    pub clip: bool,
    pub shape: String,
    pub size: [f32; 2],
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub alpha: Option<f32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlayerDef {
    pub cut: String,
    pub x: f32,
    #[serde(default)]
    pub size: Option<[f32; 2]>,
    pub frames: PlayerFrames,
    #[serde(default = "default_true")]
    pub clip: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlayerFrames {
    pub idle: String,
    pub walk: Vec<String>,
    pub jump: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct TriggerDef {
    pub on: TriggerOn,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub range: Option<f32>,
    #[serde(default)]
    pub when: Option<When>,
    #[serde(default = "default_true")]
    pub once: bool,
    pub steps: Vec<StepDef>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TriggerOn {
    Z,
    Near,
    RightEdge,
    LeftEdge,
    Enter,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum When {
    Always,
    FlowDone,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub enum StepDef {
    #[serde(rename = "focus")]
    Focus(String),
    #[serde(rename = "say")]
    Say(String),
    #[serde(rename = "path")]
    Path(Vec<KeyframeDef>),
    #[serde(rename = "wait")]
    Wait(f32),
    #[serde(rename = "player")]
    Player(PlayerMove),
    #[serde(rename = "return")]
    Return(bool),
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct PlayerMove {
    pub cut: String,
    pub x: f32,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
pub struct KeyframeDef {
    pub x: f32,
    pub y: f32,
    pub zoom: f32,
    pub t: f32,
    #[serde(default)]
    pub ease: Option<Ease>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Ease {
    #[default]
    Smooth,
    Linear,
}

/// Parses `#rrggbb` or a palette name (`ink`, `paper`, `dark`).
pub fn parse_color(text: &str, fallback: Color) -> Color {
    match text {
        "ink" => crate::art::INK,
        "paper" => crate::art::PAPER,
        "dark" => crate::art::DARK_PAPER,
        hex => {
            let hex = hex.trim_start_matches('#');
            if hex.len() == 6
                && let Ok(v) = u32::from_str_radix(hex, 16)
            {
                Color::srgb_u8((v >> 16) as u8, (v >> 8) as u8, v as u8)
            } else {
                fallback
            }
        }
    }
}

#[derive(Debug)]
pub struct LoadError(pub String);

impl std::fmt::Display for LoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for LoadError {}

#[derive(Default, TypePath)]
pub struct SceneFileLoader;

impl AssetLoader for SceneFileLoader {
    type Asset = SceneFile;
    type Settings = ();
    type Error = LoadError;

    async fn load(
        &self,
        reader: &mut dyn Reader,
        _settings: &(),
        _ctx: &mut LoadContext<'_>,
    ) -> Result<SceneFile, LoadError> {
        let mut bytes = Vec::new();
        reader
            .read_to_end(&mut bytes)
            .await
            .map_err(|e| LoadError(e.to_string()))?;
        serde_json::from_slice(&bytes).map_err(|e| LoadError(format!("scene json: {e}")))
    }

    fn extensions(&self) -> &[&str] {
        &["scene.json"]
    }
}

#[derive(Default, TypePath)]
pub struct DialogueLoader;

impl AssetLoader for DialogueLoader {
    type Asset = Dialogue;
    type Settings = ();
    type Error = LoadError;

    async fn load(
        &self,
        reader: &mut dyn Reader,
        _settings: &(),
        _ctx: &mut LoadContext<'_>,
    ) -> Result<Dialogue, LoadError> {
        let mut bytes = Vec::new();
        reader
            .read_to_end(&mut bytes)
            .await
            .map_err(|e| LoadError(e.to_string()))?;
        let text = String::from_utf8(bytes).map_err(|e| LoadError(e.to_string()))?;
        Ok(Dialogue::parse(&text))
    }

    fn extensions(&self) -> &[&str] {
        &["dialogue.txt"]
    }
}

pub struct SceneFilePlugin;

impl Plugin for SceneFilePlugin {
    fn build(&self, app: &mut App) {
        app.init_asset::<SceneFile>()
            .init_asset::<Dialogue>()
            .register_asset_loader(SceneFileLoader)
            .register_asset_loader(DialogueLoader);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_example_scene() {
        let text = include_str!("../assets/scenes/council.scene.json");
        let scene: SceneFile = serde_json::from_str(text).expect("example scene parses");
        assert_eq!(scene.version, 1);
        assert!(scene.cuts.iter().any(|c| c.id == "council"));
        let council = scene.cuts.iter().find(|c| c.id == "council").unwrap();
        assert!(council.children.iter().any(|c| c.id() == "candle"));
        assert_eq!(scene.flow[0].on, TriggerOn::Z);
        assert!(matches!(scene.flow[0].steps.last(), Some(StepDef::Return(true))));
        assert_eq!(parse_color("#ff0000", Color::BLACK), Color::srgb_u8(255, 0, 0));
    }
}
