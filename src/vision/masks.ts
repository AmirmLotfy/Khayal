import { MASK_TTL_MS, type CollisionMaskFrame } from "./types";

/** The centered cover crop shared by camera capture, mask, and display geometry. */
export function coverCrop(width: number, height: number, aspect = 16 / 9) {
  if (!(width > 0 && height > 0 && aspect > 0))
    throw new Error("Invalid camera dimensions");
  const cropWidth = Math.min(width, height * aspect);
  const cropHeight = cropWidth / aspect;
  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

export function mirrorGrid(
  source: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (source.length !== width * height)
    throw new Error("Grid dimensions do not match");
  const output = new Uint8Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++)
      output[y * width + x] = source[y * width + width - 1 - x];
  }
  return output;
}

export function isMaskFresh(
  frame: Pick<CollisionMaskFrame, "timestamp"> | null | undefined,
  nowMs: number,
  ttlMs = MASK_TTL_MS,
): boolean {
  if (!frame || !Number.isFinite(frame.timestamp) || !Number.isFinite(nowMs))
    return false;
  const age = nowMs - frame.timestamp;
  return age >= 0 && age <= ttlMs;
}

/** All values use normalized display coordinates; explicit axes preserve 16:9 circles. */
export interface NormalizedCircle {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
}

export function circleIntersectsMask(
  frame: CollisionMaskFrame | null | undefined,
  circle: NormalizedCircle,
  nowMs: number,
  kind: "motion" | "occupancy" = "motion",
): boolean {
  if (!frame || !isMaskFresh(frame, nowMs)) return false;
  const { x, y, radiusX, radiusY } = circle;
  if (
    ![x, y, radiusX, radiusY].every(Number.isFinite) ||
    radiusX <= 0 ||
    radiusY <= 0
  )
    return false;
  const { gridWidth: width, gridHeight: height } = frame;
  const grid = frame[kind];
  if (!(width > 0 && height > 0) || grid.length !== width * height)
    return false;
  const minX = Math.max(0, Math.floor((x - radiusX) * width));
  const maxX = Math.min(width - 1, Math.floor((x + radiusX) * width));
  const minY = Math.max(0, Math.floor((y - radiusY) * height));
  const maxY = Math.min(height - 1, Math.floor((y + radiusY) * height));
  for (let row = minY; row <= maxY; row++) {
    for (let col = minX; col <= maxX; col++) {
      if (!grid[row * width + col]) continue;
      const nearestX = Math.max(col / width, Math.min(x, (col + 1) / width));
      const nearestY = Math.max(row / height, Math.min(y, (row + 1) / height));
      if (
        ((nearestX - x) / radiusX) ** 2 + ((nearestY - y) / radiusY) ** 2 <=
        1
      )
        return true;
    }
  }
  return false;
}

/** Persistent binary state with confidence hysteresis; output buffers are caller-owned. */
export class MaskProcessor {
  private previous: Uint8Array;
  private current: Uint8Array;
  private gridCounts: Uint16Array;
  private warmed = false;
  private lastTimestamp = -Infinity;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly gridWidth: number,
    readonly gridHeight: number,
    readonly enterConfidence = 0.65,
    readonly exitConfidence = 0.4,
  ) {
    this.previous = new Uint8Array(width * height);
    this.current = new Uint8Array(width * height);
    this.gridCounts = new Uint16Array(gridWidth * gridHeight);
  }

  reset() {
    this.previous.fill(0);
    this.current.fill(0);
    this.warmed = false;
    this.lastTimestamp = -Infinity;
  }

  process(
    confidence: Float32Array,
    sourceWidth: number,
    sourceHeight: number,
    rgba: Uint8ClampedArray,
    occupancy: Uint8Array,
    motion: Uint8Array,
    timestamp: number,
  ) {
    if (
      confidence.length !== sourceWidth * sourceHeight ||
      sourceWidth <= 0 ||
      sourceHeight <= 0
    )
      throw new Error("Invalid confidence mask");
    if (
      rgba.length !== this.width * this.height * 4 ||
      occupancy.length !== this.gridWidth * this.gridHeight ||
      motion.length !== occupancy.length
    )
      throw new Error("Invalid output buffers");
    // A long gap cannot imply a fresh entering edge. Re-arm on the next mask.
    if (timestamp - this.lastTimestamp > MASK_TTL_MS) {
      this.previous.fill(0);
      this.warmed = false;
    }
    occupancy.fill(0);
    motion.fill(0);
    const gridCounts = this.gridCounts;
    gridCounts.fill(0);
    for (let y = 0; y < this.height; y++) {
      const sy = Math.min(
        sourceHeight - 1,
        Math.floor((y * sourceHeight) / this.height),
      );
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x;
        const sx = Math.min(
          sourceWidth - 1,
          Math.floor((x * sourceWidth) / this.width),
        );
        const value = confidence[sy * sourceWidth + sx];
        const present =
          Number.isFinite(value) &&
          value >=
            (this.previous[i] ? this.exitConfidence : this.enterConfidence);
        this.current[i] = present ? 1 : 0;
        rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255;
        rgba[i * 4 + 3] = present ? 255 : 0;
        if (present)
          gridCounts[
            Math.floor((y * this.gridHeight) / this.height) * this.gridWidth +
              Math.floor((x * this.gridWidth) / this.width)
          ]++;
      }
    }
    const cellPixels = (this.width * this.height) / occupancy.length;
    for (let i = 0; i < occupancy.length; i++)
      occupancy[i] =
        gridCounts[i] >= Math.max(1, Math.ceil(cellPixels * 0.15)) ? 1 : 0;
    if (this.warmed) {
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const i = y * this.width + x;
          if (!this.current[i] || this.previous[i]) continue;
          const boundary =
            x === 0 ||
            y === 0 ||
            x === this.width - 1 ||
            y === this.height - 1 ||
            !this.current[i - 1] ||
            !this.current[i + 1] ||
            !this.current[i - this.width] ||
            !this.current[i + this.width];
          if (boundary)
            motion[
              Math.floor((y * this.gridHeight) / this.height) * this.gridWidth +
                Math.floor((x * this.gridWidth) / this.width)
            ] = 1;
        }
      }
    }
    [this.previous, this.current] = [this.current, this.previous];
    this.warmed = true;
    this.lastTimestamp = timestamp;
  }
}
