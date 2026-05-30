import {
  DRAW_DEFAULT_FONT_SIZE, DRAW_HIT_TEST_THRESHOLD, DRAW_TEXT_HIT_DIVISOR,
  DRAW_TEXT_LINE_HEIGHT, DRAW_TEXT_WIDTH_FACTOR,
} from './constants.js';

// --- Hit Testing & Path Offset Utilities ---
// These are pure functions with no circular dependencies.

// Distance from point (px, py) to line segment (x1,y1)-(x2,y2)
export const distToSegment = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
};

// Hit-test a normalized point (x, y) against a path to determine if the click is "on" it.
export const hitTestPath = (path, x, y, threshold = DRAW_HIT_TEST_THRESHOLD) => {
  if (path.type === "text") {
    const fontSize = (path.fontSize || DRAW_DEFAULT_FONT_SIZE) / DRAW_TEXT_HIT_DIVISOR;
    const lines = path.text.split("\n");
    const width = Math.max(0.05, lines.reduce((max, l) => Math.max(max, l.length * fontSize * DRAW_TEXT_WIDTH_FACTOR), 0));
    const height = lines.length * fontSize * DRAW_TEXT_LINE_HEIGHT;
    return (
      x >= path.position.x - threshold &&
      x <= path.position.x + width + threshold &&
      y >= path.position.y - threshold &&
      y <= path.position.y + height + threshold
    );
  }

  if (path.type === "dot") {
    const dx = x - path.position.x;
    const dy = y - path.position.y;
    return Math.sqrt(dx * dx + dy * dy) < threshold * 2;
  }

  if (path.type === "arrow" || path.type === "line") {
    return distToSegment(x, y, path.from.x, path.from.y, path.to.x, path.to.y) < threshold;
  }

  if (path.type === "rect" || path.type === "rectstroke" || path.type === "oval" || path.type === "ovalfill") {
    const minX = Math.min(path.from.x, path.to.x);
    const maxX = Math.max(path.from.x, path.to.x);
    const minY = Math.min(path.from.y, path.to.y);
    const maxY = Math.max(path.from.y, path.to.y);

    if (path.type === "rect" || path.type === "ovalfill") {
      return x >= minX - threshold && x <= maxX + threshold && y >= minY - threshold && y <= maxY + threshold;
    }
    const inside = x >= minX - threshold && x <= maxX + threshold && y >= minY - threshold && y <= maxY + threshold;
    const deepInside = x >= minX + threshold && x <= maxX - threshold && y >= minY + threshold && y <= maxY - threshold;
    return inside && !deepInside;
  }

  if (path.type === "eraser" || path.type === "freehand") {
    if (!path.points || path.points.length < 2) {
      if (path.points && path.points.length === 1) {
        const dx = x - path.points[0].x;
        const dy = y - path.points[0].y;
        return Math.sqrt(dx * dx + dy * dy) < threshold;
      }
      return false;
    }
    for (let i = 1; i < path.points.length; i++) {
      if (distToSegment(x, y, path.points[i - 1].x, path.points[i - 1].y, path.points[i].x, path.points[i].y) < threshold) {
        return true;
      }
    }
    return false;
  }

  return false;
};

// Offset all coordinates of a path by (dx, dy) in normalized space
export const offsetPath = (path, dx, dy) => {
  if (path.type === "text" || path.type === "dot") {
    path.position.x += dx;
    path.position.y += dy;
  } else if (path.type === "arrow" || path.type === "line" || path.type === "rect" || path.type === "rectstroke" || path.type === "oval" || path.type === "ovalfill") {
    path.from.x += dx;
    path.from.y += dy;
    path.to.x += dx;
    path.to.y += dy;
  } else if (path.points && path.points.length > 0) {
    for (const pt of path.points) {
      pt.x += dx;
      pt.y += dy;
    }
  }
};
