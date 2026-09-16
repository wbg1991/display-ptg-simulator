/**
 * Pattern shaders, GLSL ES 3.00 (WebGL2). Kept as plain TS string exports
 * rather than separate .frag files so the build needs no extra Vite plugin.
 *
 * Every fragment shader receives `uActiveRes` (the display's active pixel
 * dimensions) and computes its own pixel coordinate from `vUv * uActiveRes`,
 * so patterns are defined in *active pixel space*, not canvas/CSS space -
 * zoom and letterboxing never distort e.g. a checkerboard's cell size.
 */

/** Fullscreen triangle, no vertex buffer needed (uses gl_VertexID). */
export const VERTEX_SRC = `#version 300 es
out vec2 vUv;
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

const PREAMBLE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uActiveRes;
`;

/** 8 standard SMPTE-order color bars (White/Yellow/Cyan/Green/Magenta/Red/Blue/Black). */
const COLOR_BAR = `${PREAMBLE}
const int N = 8;
const vec3 COLORS[8] = vec3[8](
  vec3(1.0, 1.0, 1.0),
  vec3(1.0, 1.0, 0.0),
  vec3(0.0, 1.0, 1.0),
  vec3(0.0, 1.0, 0.0),
  vec3(1.0, 0.0, 1.0),
  vec3(1.0, 0.0, 0.0),
  vec3(0.0, 0.0, 1.0),
  vec3(0.0, 0.0, 0.0)
);
void main() {
  float x = clamp(vUv.x, 0.0, 0.999999);
  int idx = int(x * float(N));
  fragColor = vec4(COLORS[idx], 1.0);
}`;

/** Checkerboard with a configurable cell size in active pixels. */
const CHECKERBOARD = `${PREAMBLE}
uniform float uGridPx;
void main() {
  vec2 px = vUv * uActiveRes;
  vec2 cell = floor(px / max(uGridPx, 1.0));
  float parity = mod(cell.x + cell.y, 2.0);
  fragColor = vec4(vec3(parity < 0.5 ? 1.0 : 0.0), 1.0);
}`;

/**
 * Smooth grayscale ramp quantized to `uLevels` steps (256 for 8-bit, 1024
 * for 10-bit) to make banding/step visibility comparable. This quantizes
 * the *pattern value*, not the actual framebuffer - the WebView still
 * composites at 8-bit/channel, so a "10-bit" ramp here simulates the step
 * count a real 10-bit panel would show, not a genuine higher-precision
 * output.
 */
const GRAYSCALE_RAMP = `${PREAMBLE}
uniform float uLevels;
void main() {
  float raw = clamp(vUv.x, 0.0, 1.0);
  float q = floor(raw * uLevels) / max(uLevels - 1.0, 1.0);
  fragColor = vec4(vec3(q), 1.0);
}`;

/** A box sweeping horizontally at uSpeedPxPerSec, driven by the panel's committed virtual time. */
const MOVING_OBJECT = `${PREAMBLE}
uniform float uTime;
uniform float uSpeedPxPerSec;
void main() {
  vec2 px = vUv * uActiveRes;
  float period = uActiveRes.x + 120.0;
  float objX = mod(uTime * uSpeedPxPerSec, period) - 60.0;
  float boxW = 60.0;
  float boxH = min(uActiveRes.y * 0.5, 240.0);
  float top = (uActiveRes.y - boxH) * 0.5;

  bool inBox = px.x > objX && px.x < objX + boxW && px.y > top && px.y < top + boxH;

  // Faint reference grid so motion (and stutter) reads clearly against a static backdrop.
  float gridPx = 80.0;
  float lineX = step(gridPx - 1.5, mod(px.x, gridPx));
  float lineY = step(gridPx - 1.5, mod(px.y, gridPx));
  vec3 bg = mix(vec3(0.04), vec3(0.10), max(lineX, lineY));

  fragColor = vec4(inBox ? vec3(1.0, 0.55, 0.08) : bg, 1.0);
}`;

export const FRAGMENT_SRC = {
  colorBar: COLOR_BAR,
  checkerboard: CHECKERBOARD,
  grayscaleRamp: GRAYSCALE_RAMP,
  movingObject: MOVING_OBJECT,
} as const;
