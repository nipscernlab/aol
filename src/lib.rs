use wasm_bindgen::prelude::*;
use wasm_bindgen::Clamped;

/// Simple alpha composite: overlay -> base at position (pos_x, pos_y).
/// All buffers are RGBA, row-major, 8-bit per channel.
#[wasm_bindgen]
pub fn composite_rgba(
    mut base: Clamped<Vec<u8>>, base_w: u32, base_h: u32,
    overlay: Clamped<Vec<u8>>, ov_w: u32, ov_h: u32,
    pos_x: u32, pos_y: u32
) -> Clamped<Vec<u8>> {
    let base_w = base_w as usize;
    let base_h = base_h as usize;
    let ov_w = ov_w as usize;
    let ov_h = ov_h as usize;

    let base_buf = &mut base.0;
    let ov_buf = &overlay.0;

    for oy in 0..ov_h {
        for ox in 0..ov_w {
            let dest_x = pos_x as isize + ox as isize;
            let dest_y = pos_y as isize + oy as isize;
            if dest_x < 0 || dest_y < 0 { continue; }
            let dx = dest_x as usize;
            let dy = dest_y as usize;
            if dx >= base_w || dy >= base_h { continue; }

            let ov_idx = (oy * ov_w + ox) * 4;
            let b_idx = (dy * base_w + dx) * 4;

            let oa = ov_buf[ov_idx + 3] as f32 / 255.0;
            if oa <= 0.0 { continue; }

            let inv = 1.0 - oa;

            for c in 0..3 {
                let o_c = ov_buf[ov_idx + c] as f32;
                let b_c = base_buf[b_idx + c] as f32;
                let out_c = (o_c * oa + b_c * inv).round();
                base_buf[b_idx + c] = out_c.clamp(0.0, 255.0) as u8;
            }

            // new alpha (assume simple max coverage)
            let ba = base_buf[b_idx + 3] as f32 / 255.0;
            let out_a = (oa + ba * inv).clamp(0.0, 1.0);
            base_buf[b_idx + 3] = (out_a * 255.0).round() as u8;
        }
    }

    Clamped(base_buf.to_vec())
}
