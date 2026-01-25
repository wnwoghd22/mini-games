use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Serialize_repr, Deserialize_repr)]
#[repr(u8)]
pub enum TileType {
    Normal = 0,
    Bonus = 1,
    Conditional = 2,
    Teleport = 3,
    Lock = 4,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TileMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub required_face: Option<u8>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed_faces: Option<Vec<u8>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub bonus_points: Option<i32>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub destination: Option<Destination>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub pair_id: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_key: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_tiles: Option<Vec<Position>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Destination {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tile {
    pub x: i32,
    pub y: i32,
    pub tile_type: TileType,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<TileMetadata>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Chunk {
    pub start_y: i32,
    pub end_y: i32,
    pub tiles: Vec<Tile>,
    pub difficulty: f32,
}
