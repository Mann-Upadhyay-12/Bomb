// Offscreen and work canvas utilities

let cachedCanvas = null;
let cachedCtx = null;

export function getWorkCanvas() {
  if (!cachedCanvas) {
    cachedCanvas = document.getElementById('workCanvas');
    if (!cachedCanvas) {
      cachedCanvas = document.createElement('canvas');
      cachedCanvas.id = 'workCanvas';
      cachedCanvas.className = 'work';
      document.body.appendChild(cachedCanvas);
    }
  }
  return cachedCanvas;
}

export function getWorkContext() {
  const canvas = getWorkCanvas();
  if (!cachedCtx || cachedCtx.canvas !== canvas) {
    cachedCtx = canvas.getContext('2d', { willReadFrequently: true });
  }
  return cachedCtx;
}
