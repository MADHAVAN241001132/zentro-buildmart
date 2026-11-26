/**
 * Overlay geometry for the room visualizer. Positions are percentages of the room photograph, so the overlay
 * keeps its place when the photograph is shown at any size. Pure functions, no framework imports.
 */

export const OVERLAY_LIMITS = {
  minSize: 4,
  maxSize: 100,
  minOpacity: 0.2,
  maxOpacity: 1,
  minTilesAcross: 1,
  maxTilesAcross: 20,
} as const;

export interface Placement {
  /** Top-left corner, as a percentage of the photograph's width and height. */
  x: number;
  y: number;
  /** Size, as a percentage of the photograph's width and height. */
  width: number;
  height: number;
  /** Rotation in degrees, clockwise. */
  rotation: number;
  opacity: number;
  /** Repeated tile pattern when true; a single enlarged image when false. */
  repeat: boolean;
  /** How many tiles fit across the overlay when repeating. */
  tilesAcross: number;
}

export const DEFAULT_PLACEMENT: Placement = {
  x: 20,
  y: 20,
  width: 40,
  height: 40,
  rotation: 0,
  opacity: 0.85,
  repeat: true,
  tilesAcross: 4,
};

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Keeps the overlay inside the photograph and its size inside the limits. */
export function clampPlacement(p: Placement): Placement {
  const width = clamp(p.width, OVERLAY_LIMITS.minSize, OVERLAY_LIMITS.maxSize);
  const height = clamp(p.height, OVERLAY_LIMITS.minSize, OVERLAY_LIMITS.maxSize);
  return {
    x: clamp(p.x, 0, 100 - width),
    y: clamp(p.y, 0, 100 - height),
    width,
    height,
    rotation: normaliseAngle(p.rotation),
    opacity: clamp(p.opacity, OVERLAY_LIMITS.minOpacity, OVERLAY_LIMITS.maxOpacity),
    repeat: Boolean(p.repeat),
    tilesAcross: Math.round(clamp(p.tilesAcross, OVERLAY_LIMITS.minTilesAcross, OVERLAY_LIMITS.maxTilesAcross)),
  };
}

/** Moves by a percentage delta, staying inside the photograph. */
export function movePlacement(p: Placement, dxPercent: number, dyPercent: number): Placement {
  return clampPlacement({ ...p, x: p.x + dxPercent, y: p.y + dyPercent });
}

/** Resizes by a percentage delta from the bottom-right corner. Optional aspect ratio keeps tile proportions. */
export function resizePlacement(p: Placement, dwPercent: number, dhPercent: number, aspect: number | null = null): Placement {
  const width = p.width + dwPercent;
  let height = p.height + dhPercent;
  if (aspect && aspect > 0) {
    height = width * aspect;
  }
  return clampPlacement({ ...p, width, height });
}

/** Rotation in the range (-180, 180]. */
export function normaliseAngle(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  let angle = ((degrees % 360) + 360) % 360;
  if (angle > 180) angle -= 360;
  return angle;
}

/** Height over width for a tile size label such as "600 x 600" or "600x300 mm". Defaults to a square. */
export function aspectOfSizeLabel(label: string | null): number {
  if (!label) return 1;
  const match = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i.exec(label);
  if (!match) return 1;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (!(a > 0) || !(b > 0)) return 1;
  return b / a;
}

/** CSS background-size that places `tilesAcross` tiles across the overlay width. */
export function tileBackgroundSize(tilesAcross: number): string {
  const n = Math.round(clamp(tilesAcross, OVERLAY_LIMITS.minTilesAcross, OVERLAY_LIMITS.maxTilesAcross));
  return `${(100 / n).toFixed(3)}% auto`;
}

/** Before-and-after split, as the percentage of the frame shown with the product on its right side. */
export function clampSplit(value: number): number {
  return clamp(value, 0, 100);
}
