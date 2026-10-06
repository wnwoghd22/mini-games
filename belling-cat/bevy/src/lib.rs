//! Belling the Cat — a comic told in panels ("cuts").
//!
//! Module map:
//! - `art`      asset handles, loading, atlas cell rectangles, generated placeholder textures
//! - `dissolve` the shared-beat cross-dissolve animation (`CrossDissolveTick` + `CrossDissolvable`)
//! - `cut`      panels on the page and the camera that focuses them
//! - `balloon`  speech balloons that stay on the page once shown
//! - `player`   input and side-view movement of the mouse
//! - `script`   engine-free scene progression (which cut to focus, which line to speak)
//! - `ink`      gizmo outlines and page text (footer hints)
//! - `scenes`   concrete scenes; `scenes::meeting_room` is the first one

pub mod art;
pub mod balloon;
pub mod cut;
pub mod dissolve;
pub mod ink;
pub mod player;
pub mod scenes;
pub mod script;
