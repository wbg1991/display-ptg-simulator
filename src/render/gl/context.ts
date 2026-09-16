export function createGl2(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "low-power",
  });
  if (!gl) {
    throw new Error(
      "WebGL2 is not available in this WebView. The pattern renderer requires it - try updating your OS WebView2/WebKit runtime.",
    );
  }
  return gl;
}
