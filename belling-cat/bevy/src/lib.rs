//! Belling the Cat — a comic told in panels ("cuts"), built from `*.scene.json` files.
//!
//! Module map:
//! - `scene_file` the scene/dialogue file formats and their asset loaders
//! - `dialogue`   the `*.dialogue.txt` parser
//! - `polygon`    ear clipping, point tests and meshes for polygon cuts
//! - `art`        asset handles, the sprite-atlas table, generated placeholder textures
//! - `dissolve`   the shared-beat cross-dissolve animation (`CrossDissolveTick` + `CrossDissolvable`)
//! - `mask`       the polygon-masked 2D material behind `clip: true`
//! - `cut`        polygon panels on the page and the camera that focuses them
//! - `balloon`    speech balloons that stay on the page once shown
//! - `player`     input and side-view movement of the mouse
//! - `script`     engine-free flow: triggers and steps from the scene file
//! - `ink`        gizmo outlines and page text (footer hints)
//! - `scenes`     loading a scene file into entities, the flow driver, restart and hot reload

pub mod art;
pub mod balloon;
pub mod cut;
pub mod dialogue;
pub mod dissolve;
pub mod ink;
pub mod mask;
pub mod player;
pub mod polygon;
pub mod scene_file;
pub mod scenes;
pub mod script;
