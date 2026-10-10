//! Asset handles, loading, the sprite-atlas table and generated placeholder textures.
//!
//! Scene files refer to sprite frames as `"atlas:index"`. The atlas table below names each
//! atlas and says where it comes from: a PNG in `assets/art/` or an image rasterised here
//! until the drawing exists. Keep it in sync with `editor/media/atlases.ts`.

use crate::dissolve::Frame;
use bevy::{
    asset::RenderAssetUsages,
    platform::collections::HashMap,
    prelude::*,
    render::render_resource::{Extent3d, TextureDimension, TextureFormat},
};

pub const PAPER: Color = Color::srgb(0.91, 0.875, 0.80);
pub const INK: Color = Color::srgb(0.12, 0.105, 0.09);
pub const DARK_PAPER: Color = Color::srgb(0.16, 0.14, 0.12);

/// Optional drawn candle strip: 3 equal cells side by side, RGBA, flame only differs.
pub const CANDLE_ART: Option<&str> = None;
/// Optional drawn table: a single RGBA image.
pub const TABLE_ART: Option<&str> = None;

pub enum AtlasSource {
    /// One image split into `cols` × `rows` equal cells.
    Sheet {
        image: Handle<Image>,
        cols: usize,
        rows: usize,
    },
    /// One image per frame (generated placeholders).
    Separate(Vec<Handle<Image>>),
}

#[derive(Resource)]
pub struct Art {
    pub font: Handle<Font>,
    pub atlases: HashMap<&'static str, AtlasSource>,
}

impl Art {
    /// Resolves `"mouse:3"` into a drawable frame, once the images are loaded.
    pub fn frame(&self, spec: &str, images: &Assets<Image>) -> Option<Frame> {
        let (name, index) = spec.split_once(':')?;
        let index: usize = index.parse().ok()?;
        match self.atlases.get(name)? {
            AtlasSource::Sheet { image, cols, rows } => {
                let img = images.get(image)?;
                if index >= cols * rows {
                    return None;
                }
                Some(Frame {
                    image: image.clone(),
                    rect: Some(cell_rect(img, *cols, *rows, index)),
                })
            }
            AtlasSource::Separate(handles) => Some(Frame {
                image: handles.get(index)?.clone(),
                rect: None,
            }),
        }
    }

    /// Frames for a list of specs; unknown specs are skipped with a warning.
    pub fn frames(&self, specs: &[String], images: &Assets<Image>) -> Vec<Frame> {
        specs
            .iter()
            .filter_map(|s| {
                let f = self.frame(s, images);
                if f.is_none() {
                    warn!("unknown sprite frame {s:?}");
                }
                f
            })
            .collect()
    }

    fn handles(&self) -> impl Iterator<Item = &Handle<Image>> {
        self.atlases.values().flat_map(|a| match a {
            AtlasSource::Sheet { image, .. } => std::slice::from_ref(image).iter(),
            AtlasSource::Separate(h) => h.iter(),
        })
    }
}

#[derive(Resource, Default)]
pub struct Ready(pub bool);

pub fn art_ready(ready: Res<Ready>) -> bool {
    ready.0
}

pub struct ArtPlugin;

impl Plugin for ArtPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Ready>()
            .add_systems(PreStartup, load_art)
            .add_systems(Update, wait_for_art.run_if(|r: Res<Ready>| !r.0));
    }
}

fn load_art(mut commands: Commands, server: Res<AssetServer>, mut images: ResMut<Assets<Image>>) {
    let mut atlases: HashMap<&'static str, AtlasSource> = HashMap::new();
    atlases.insert(
        "mouse",
        AtlasSource::Sheet {
            image: server.load("art/mouse-poses.png"),
            cols: 2,
            rows: 2,
        },
    );
    atlases.insert(
        "walk",
        AtlasSource::Sheet {
            image: server.load("art/mouse-walk-poses.png"),
            cols: 2,
            rows: 1,
        },
    );
    atlases.insert(
        "candle",
        match CANDLE_ART {
            Some(path) => AtlasSource::Sheet {
                image: server.load(path),
                cols: 3,
                rows: 1,
            },
            None => AtlasSource::Separate(placeholder_candle().into_iter().map(|i| images.add(i)).collect()),
        },
    );
    atlases.insert(
        "table",
        match TABLE_ART {
            Some(path) => AtlasSource::Sheet {
                image: server.load(path),
                cols: 1,
                rows: 1,
            },
            None => AtlasSource::Separate(vec![images.add(placeholder_table())]),
        },
    );
    commands.insert_resource(Art {
        font: server.load("fonts/AnimeAceBB.ttf"),
        atlases,
    });
}

fn wait_for_art(
    art: Res<Art>,
    images: Res<Assets<Image>>,
    fonts: Res<Assets<Font>>,
    mut ready: ResMut<Ready>,
) {
    if fonts.contains(&art.font) && art.handles().all(|h| images.contains(h)) {
        ready.0 = true;
    }
}

/// Pixel rectangle of cell `index` (row-major) in a `columns`×`rows` atlas.
pub fn cell_rect(image: &Image, columns: usize, rows: usize, index: usize) -> Rect {
    let cell = Vec2::new(
        image.width() as f32 / columns as f32,
        image.height() as f32 / rows as f32,
    );
    let origin = Vec2::new((index % columns) as f32, (index / columns) as f32) * cell;
    Rect::from_corners(origin, origin + cell)
}

fn raster(width: u32, height: u32, paint: impl Fn(f32, f32) -> Option<[u8; 4]>) -> Image {
    let mut data = vec![0u8; (width * height * 4) as usize];
    for y in 0..height {
        for x in 0..width {
            if let Some(px) = paint(x as f32 + 0.5, y as f32 + 0.5) {
                let i = ((y * width + x) * 4) as usize;
                data[i..i + 4].copy_from_slice(&px);
            }
        }
    }
    Image::new(
        Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::RENDER_WORLD | RenderAssetUsages::MAIN_WORLD,
    )
}

fn inside_ellipse(x: f32, y: f32, cx: f32, cy: f32, rx: f32, ry: f32) -> bool {
    let dx = (x - cx) / rx;
    let dy = (y - cy) / ry;
    dx * dx + dy * dy <= 1.0
}

const INK_PX: [u8; 4] = [31, 27, 23, 255];
const CREAM_PX: [u8; 4] = [232, 223, 204, 255];

/// A 48×96 candle in three flame poses (lean left, upright, lean right).
pub fn placeholder_candle() -> Vec<Image> {
    [(-4.0, 0.0), (0.0, -4.0), (4.0, 1.0)]
        .into_iter()
        .map(|(lean, lift)| {
            raster(48, 96, move |x, y| {
                let fx = 24.0 + lean;
                let fy = 26.0 + lift;
                if inside_ellipse(x, y, fx, fy + 2.0, 4.0, 8.0) {
                    return Some([255, 236, 150, 255]);
                }
                if inside_ellipse(x, y, fx, fy, 7.0, 14.0) {
                    return Some([236, 150, 60, 255]);
                }
                if inside_ellipse(x, y, fx, fy, 8.5, 15.5) {
                    return Some(INK_PX);
                }
                if (23.0..25.0).contains(&x) && (38.0..44.0).contains(&y) {
                    return Some(INK_PX);
                }
                if (16.0..32.0).contains(&x) && (44.0..94.0).contains(&y) {
                    let edge = !(17.5..=30.5).contains(&x) || !(45.5..=92.5).contains(&y);
                    return Some(if edge { INK_PX } else { CREAM_PX });
                }
                None
            })
        })
        .collect()
}

/// A 220×100 side-view table: oval top and two legs.
pub fn placeholder_table() -> Image {
    raster(220, 100, |x, y| {
        if inside_ellipse(x, y, 110.0, 20.0, 110.0, 16.0) {
            let rim = !inside_ellipse(x, y, 110.0, 20.0, 107.0, 13.5);
            return Some(if rim { INK_PX } else { [96, 78, 60, 255] });
        }
        for leg in [34.0, 186.0] {
            if (leg - 7.0..leg + 7.0).contains(&x) && (24.0..100.0).contains(&y) {
                let edge = (x - leg).abs() > 5.5;
                return Some(if edge { INK_PX } else { [74, 60, 46, 255] });
            }
        }
        None
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candle_poses_differ_only_in_the_flame() {
        let candle = placeholder_candle();
        assert_eq!(candle.len(), 3);
        let body = |img: &Image| img.data.as_ref().unwrap()[48 * 4 * 50..].to_vec();
        assert_eq!(body(&candle[0]), body(&candle[1]));
        assert_ne!(candle[0].data, candle[2].data);
    }

    #[test]
    fn cell_rect_splits_an_atlas_evenly() {
        let img = raster(100, 50, |_, _| None);
        assert_eq!(
            cell_rect(&img, 2, 1, 1),
            Rect::from_corners(Vec2::new(50.0, 0.0), Vec2::new(100.0, 50.0))
        );
        assert_eq!(
            cell_rect(&img, 2, 2, 3),
            Rect::from_corners(Vec2::new(50.0, 25.0), Vec2::new(100.0, 50.0))
        );
    }
}
