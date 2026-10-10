// Polygon-masked 2D material: a tinted (optionally textured) quad whose fragments are
// discarded outside a polygon given in world space. Mirrors the editor's canvas clip.

#import bevy_sprite::mesh2d_vertex_output::VertexOutput

struct MaskParams {
    tint: vec4<f32>,
    // Atlas cell as normalised uv: min.xy, max.xy.
    uv_rect: vec4<f32>,
    // x: textured, y: flip_x, z: polygon vertex count (0 = no mask).
    flags: vec4<u32>,
    // x: vignette on, y: inner radius ratio, z: outer radius ratio (in uv-ellipse units).
    vignette: vec4<f32>,
    // Second profile for the beat pulse: x: inner, y: outer, z: mix toward it (0..1).
    vignette2: vec4<f32>,
    // Two vertices per vec4, world space.
    points: array<vec4<f32>, 16>,
};

@group(#{MATERIAL_BIND_GROUP}) @binding(0) var<uniform> params: MaskParams;
@group(#{MATERIAL_BIND_GROUP}) @binding(1) var tex: texture_2d<f32>;
@group(#{MATERIAL_BIND_GROUP}) @binding(2) var samp: sampler;

fn point_at(i: u32) -> vec2<f32> {
    let v = params.points[i / 2u];
    if (i % 2u == 0u) {
        return v.xy;
    }
    return v.zw;
}

// Even-odd point-in-polygon test, the same as polygon::contains on the CPU.
fn inside(p: vec2<f32>, n: u32) -> bool {
    var c = false;
    var j = n - 1u;
    for (var i = 0u; i < n; i = i + 1u) {
        let a = point_at(i);
        let b = point_at(j);
        if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) {
            c = !c;
        }
        j = i;
    }
    return c;
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    var uv = in.uv;
    if (params.flags.y == 1u) {
        uv.x = 1.0 - uv.x;
    }
    // Sample before any discard so the sample stays in uniform control flow.
    let texel = textureSample(tex, samp, mix(params.uv_rect.xy, params.uv_rect.zw, uv));
    var color = params.tint;
    if (params.flags.x == 1u) {
        color = color * texel;
    }
    if (params.vignette.x > 0.5) {
        // Distance from the quad centre, 1.0 at the inscribed ellipse; the corners are darkest.
        let d = length((in.uv - vec2<f32>(0.5, 0.5)) * 2.0);
        // Blend the two profiles' alpha: where both agree (centre, outer edge) nothing changes;
        // only the ring between the small and the large ellipse fades.
        let a1 = smoothstep(params.vignette.y, params.vignette.z, d);
        let a2 = smoothstep(params.vignette2.x, params.vignette2.y, d);
        color.a = color.a * mix(a1, a2, params.vignette2.z);
    }
    let n = params.flags.z;
    if (n >= 3u && !inside(in.world_position.xy, n)) {
        discard;
    }
    if (color.a <= 0.002) {
        discard;
    }
    return color;
}
