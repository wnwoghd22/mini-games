//! [`MaskMaterial`]: a 2D material that draws a tinted, optionally textured quad or polygon and
//! discards everything outside a world-space polygon (the cut the thing belongs to). This is
//! how `clip: true` children stay inside their cut at runtime, matching the editor's canvas
//! clip. Text is never masked (its bounds are limited instead; see FORMAT.md).

use bevy::{
    prelude::*,
    render::render_resource::{AsBindGroup, ShaderType},
    shader::ShaderRef,
    sprite_render::{AlphaMode2d, Material2d, Material2dPlugin},
};

/// Vertices the uniform can hold (two per `vec4`).
pub const MAX_MASK_POINTS: usize = 32;

#[derive(ShaderType, Clone, Copy, Debug, PartialEq)]
pub struct MaskParams {
    pub tint: Vec4,
    /// Atlas cell as normalised uv: `min.xy`, `max.xy`.
    pub uv_rect: Vec4,
    /// x: textured, y: flip_x, z: polygon vertex count (0 = no mask).
    pub flags: UVec4,
    /// x: vignette on, y: inner radius ratio, z: outer radius ratio.
    pub vignette: Vec4,
    /// Second vignette profile: x: inner, y: outer, z: mix toward it (0 = first profile only).
    pub vignette2: Vec4,
    pub points: [Vec4; MAX_MASK_POINTS / 2],
}

impl Default for MaskParams {
    fn default() -> Self {
        Self {
            tint: Vec4::ONE,
            uv_rect: Vec4::new(0.0, 0.0, 1.0, 1.0),
            flags: UVec4::ZERO,
            vignette: Vec4::ZERO,
            vignette2: Vec4::ZERO,
            points: [Vec4::ZERO; MAX_MASK_POINTS / 2],
        }
    }
}

#[derive(Asset, TypePath, AsBindGroup, Clone, Debug, Default)]
pub struct MaskMaterial {
    #[uniform(0)]
    pub params: MaskParams,
    #[texture(1)]
    #[sampler(2)]
    pub texture: Option<Handle<Image>>,
}

impl MaskMaterial {
    /// A flat colour, masked by `mask` when given.
    pub fn color(color: Color, mask: Option<&[Vec2]>) -> Self {
        let mut m = Self::default();
        m.set_tint(color);
        m.set_mask(mask);
        m
    }

    pub fn set_tint(&mut self, color: Color) {
        self.params.tint = color.to_linear().to_vec4();
    }

    pub fn tint_alpha(&self) -> f32 {
        self.params.tint.w
    }

    /// Shows `image` cropped to the normalised `uv` rect; `None` draws the flat tint.
    pub fn set_texture(&mut self, image: Option<Handle<Image>>, uv: Rect) {
        self.params.flags.x = u32::from(image.is_some());
        self.params.uv_rect = Vec4::new(uv.min.x, uv.min.y, uv.max.x, uv.max.y);
        self.texture = image;
    }

    /// Fades the tint in from radius ratio `inner` (transparent centre) to `outer`.
    pub fn set_vignette(&mut self, inner: f32, outer: f32) {
        self.params.vignette = Vec4::new(1.0, inner.clamp(0.0, 1.0), outer.max(inner + 0.01), 0.0);
    }

    /// A second vignette profile the fragment alpha is blended toward by `mix` (0..1). Blending
    /// the two alpha fields keeps the centre and the outer edge steady; only the ring between
    /// the two ellipses changes brightness.
    pub fn set_vignette_mix(&mut self, inner: f32, outer: f32, mix: f32) {
        self.params.vignette2 = Vec4::new(inner.clamp(0.0, 1.0), outer.max(inner + 0.01), mix.clamp(0.0, 1.0), 0.0);
    }

    pub fn set_flip_x(&mut self, flip: bool) {
        self.params.flags.y = u32::from(flip);
    }

    /// Masks to a world-space polygon; `None` or fewer than 3 points disables the mask.
    /// Polygons with more than [`MAX_MASK_POINTS`] vertices are truncated with a warning.
    pub fn set_mask(&mut self, mask: Option<&[Vec2]>) {
        let points = mask.unwrap_or(&[]);
        if points.len() > MAX_MASK_POINTS {
            warn!(
                "mask polygon has {} vertices; only the first {MAX_MASK_POINTS} are used",
                points.len()
            );
        }
        let n = points.len().min(MAX_MASK_POINTS);
        self.params.points = [Vec4::ZERO; MAX_MASK_POINTS / 2];
        for (i, p) in points.iter().take(n).enumerate() {
            let slot = &mut self.params.points[i / 2];
            if i % 2 == 0 {
                slot.x = p.x;
                slot.y = p.y;
            } else {
                slot.z = p.x;
                slot.w = p.y;
            }
        }
        self.params.flags.z = if n >= 3 { n as u32 } else { 0 };
    }

    pub fn mask_count(&self) -> u32 {
        self.params.flags.z
    }
}

impl Material2d for MaskMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/mask.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

pub struct MaskPlugin;

impl Plugin for MaskPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(Material2dPlugin::<MaskMaterial>::default());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mask_points_pack_two_per_vec4() {
        let mut m = MaskMaterial::default();
        m.set_mask(Some(&[
            Vec2::new(1.0, 2.0),
            Vec2::new(3.0, 4.0),
            Vec2::new(5.0, 6.0),
        ]));
        assert_eq!(m.mask_count(), 3);
        assert_eq!(m.params.points[0], Vec4::new(1.0, 2.0, 3.0, 4.0));
        assert_eq!(m.params.points[1], Vec4::new(5.0, 6.0, 0.0, 0.0));
        m.set_mask(Some(&[Vec2::ZERO, Vec2::ONE]));
        assert_eq!(m.mask_count(), 0, "a degenerate polygon disables the mask");
        m.set_mask(None);
        assert_eq!(m.mask_count(), 0);
    }

    #[test]
    fn texture_and_flip_flags() {
        let mut m = MaskMaterial::default();
        assert_eq!(m.params.flags, UVec4::ZERO);
        m.set_texture(Some(Handle::default()), Rect::new(0.0, 0.5, 0.5, 1.0));
        m.set_flip_x(true);
        assert_eq!(m.params.flags.x, 1);
        assert_eq!(m.params.flags.y, 1);
        assert_eq!(m.params.uv_rect, Vec4::new(0.0, 0.5, 0.5, 1.0));
        m.set_texture(None, Rect::new(0.0, 0.0, 1.0, 1.0));
        assert_eq!(m.params.flags.x, 0);
    }
}
